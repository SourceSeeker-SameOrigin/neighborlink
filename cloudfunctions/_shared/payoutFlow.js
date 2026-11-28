const { requireLedgerFeatures } = require('./orderFeatures');
const https = require('https');
const crypto = require('crypto');
const { AppError } = require('./errors');
const { ensure, integer, text } = require('./validate');
const { atomic, read, insert, sameSnapshot } = require('./transaction');
const { ymd, parseDate } = require('./time');
const wxpay = require('./wxpayV3');
const { selectRows, payoutState, sellerPayoutSuccess, publicPayout, TERMINAL_STATES, communityAllocations } = require('./payout');
const { requireApprovedProvider } = require('./auth');

const REQUEST_TIMEOUT_MS = 10000;

function requestWx(config, method, path, bodyObject = null) {
  const body = bodyObject === null ? '' : JSON.stringify(bodyObject);
  const auth = wxpay.authorization({ method, path, body, config });
  const headers = { Accept: 'application/json', Authorization: auth.header,
    'Wechatpay-Serial': config.publicKeyId };
  if (bodyObject !== null) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  return new Promise((resolve, reject) => {
    const req = https.request(wxpay.HOST + path, { method, headers, timeout: REQUEST_TIMEOUT_MS }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 256 * 1024) req.destroy(new Error('response too large'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new AppError('E_PAYOUT', '微信支付暂未确认转账结果');
          error.httpStatus = response.statusCode;
          reject(error);
          return;
        }
        try {
          wxpay.verifyResponse(response.headers, raw, config.publicKey, config.publicKeyId);
          resolve({ statusCode: response.statusCode, data: raw ? JSON.parse(raw) : {} });
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', () => reject(new AppError('E_PAYOUT', '微信支付请求未确认，请稍后查询')));
    if (bodyObject !== null) req.write(body);
    req.end();
  });
}

function idFor(openid, requestId, payeeType = 'provider') {
  // Keep existing provider idempotency keys stable across the schema extension.
  const key = payeeType === 'provider' ? openid + ':' + requestId : openid + ':' + payeeType + ':' + requestId;
  return 'po_' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function createPayoutFlow(cloud, server) {
  const { db } = server;

  async function applyResponse(payoutId, data) {
    ensure(data && typeof data.out_bill_no === 'string' && typeof data.state === 'string',
      '微信支付转账响应内容不匹配', 'E_PAYOUT');
    const mapped = payoutState(data.state);
    const now = new Date();
    return atomic(db, async transaction => {
      const current = await read(transaction, 'payouts', payoutId);
      ensure(current, '提现记录不存在', 'E_CONFIG');
      ensure(data.out_bill_no === current.outBillNo, '微信支付商户单号不匹配', 'E_PAYOUT');
      if (TERMINAL_STATES.includes(current.state)) return current;
      if (TERMINAL_STATES.includes(mapped)) {
        for (const ledgerId of current.ledgerIds) {
          const row = await read(transaction, 'ledger', ledgerId);
          ensure(row && row.payoutId === current._id, '提现账本锁定状态不一致', 'E_CONFLICT');
          const payeeType = current.payeeType || 'provider';
          if (mapped !== 'success') await transaction.collection('ledger').doc(ledgerId).update({ data: { payoutId: null } });
          else if (payeeType === 'seller') {
            const allocation = current.ledgerAmounts && current.ledgerAmounts[ledgerId];
            ensure(Number.isSafeInteger(allocation) && allocation > 0, '卖家分笔打款金额与账本不一致', 'E_CONFLICT');
            await transaction.collection('ledger').doc(ledgerId).update({ data: sellerPayoutSuccess(row, allocation, now) });
          } else await transaction.collection('ledger').doc(ledgerId).update({ data: {
            settled: { ...row.settled, [payeeType]: true }, payoutId: current._id, payoutCompletedAt: now
          } });
        }
      }
      const result = { ...current, state: mapped, wxState: data.state,
        transferBillNo: data.transfer_bill_no || current.transferBillNo || null,
        packageInfo: data.package_info || null, failReason: mapped === 'failed' ? (data.fail_reason || '') : '', updatedAt: now };
      const { _id, ...patch } = result;
      await transaction.collection('payouts').doc(_id).update({ data: patch });
      return result;
    });
  }

  async function query(payout, config) {
    return requestWx(config, 'GET', wxpay.transferPath(payout.outBillNo));
  }

  async function dispatch(payout, config) {
    const response = await requestWx(config, 'POST', wxpay.CREATE_PATH, payout.requestBody);
    return applyResponse(payout._id, response.data);
  }

  async function reconcile(payout, config, now = new Date()) {
    if (TERMINAL_STATES.includes(payout.state)) return payout;
    try {
      const response = await query(payout, config);
      return applyResponse(payout._id, response.data);
    } catch (error) {
      if (error.httpStatus === 404 && payout.state === 'created' && now - payout.createdAt >= 60000) {
        try { return await dispatch(payout, config); }
        catch (_) { return payout; }
      }
      return payout;
    }
  }

  async function create(event, { openid, user }) {
    text(event.requestId, '请求编号', 80);
    ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
    const payeeType = event.payeeType || 'provider';
    ensure(['provider', 'seller'].includes(payeeType), '打款收款对象不正确');
    const provider = payeeType === 'provider' ? await server.one('providers', { openid }) : null;
    if (payeeType === 'provider') requireApprovedProvider(provider, 1);
    const payee = payeeType === 'provider' ? provider : user;
    ensure(payee && payee.openid === openid, '收款账户不存在', 'E_FORBIDDEN');
    const communityId = payeeType === 'provider' ? provider.communityId : user.communityId;
    if (payeeType === 'seller') ensure(user.roles.includes('resident') && !user.blocked, '仅有效住户卖家可以申请打款', 'E_FORBIDDEN');
    const { community } = await server.featureEntry('autoPayout', user, communityId);
    const config = wxpay.loadConfig();
    ensure(community && community.status === 'active', '服务小区暂不可用');
    const id = idFor(openid, event.requestId, payeeType);
    const existing = await server.get('payouts', id);
    if (existing) {
      ensure(existing.payeeOpenid === openid, '提现请求编号冲突', 'E_CONFLICT');
      return publicPayout(existing);
    }
    const global = await server.config();
    const cutoff = new Date(Date.now() - integer(global.complaintWindowHours, '投诉期', 0, 720, 'E_CONFIG') * 3600000);
    const ledgerRows = await server.all('ledger', payeeType === 'provider' ? { providerId: provider._id } : { sellerOpenid: openid });
    const available = ledgerRows.filter(row => row.createdAt <= cutoff && row.settled && row.settled[payeeType] === false &&
      !(row.settlementIds && row.settlementIds[payeeType]) && !row.payoutId);
    const selection = selectRows(available, payeeType);
    const now = new Date();
    const date = ymd(now);
    const payout = await atomic(db, async transaction => {
      const previous = await read(transaction, 'payouts', id);
      if (previous) {
        ensure(previous.payeeOpenid === openid, '提现请求编号冲突', 'E_CONFLICT');
        return previous;
      }
      const collection = payeeType === 'provider' ? 'providers' : 'users';
      const profileId = payeeType === 'provider' ? provider._id : user._id;
      const currentPayee = await read(transaction, collection, profileId);
      ensure(currentPayee && currentPayee.openid === openid && !currentPayee.blocked &&
        (payeeType !== 'provider' || currentPayee.status === 'approved'), '收款账户状态已变化，请重新登录', 'E_CONFLICT');
      const dailyCount = currentPayee.payoutDailyDate === date ? currentPayee.payoutDailyCount || 0 : 0;
      ensure(dailyCount < config.maxDailyCount, '今日提现次数已达上限', 'E_RATE_LIMIT');
      for (const snapshot of selection.rows) {
        const current = await read(transaction, 'ledger', snapshot._id);
        sameSnapshot(current, snapshot, ['communityId', 'amounts', 'paidAmounts']);
        ensure(current && current.settled[payeeType] === false &&
          (payeeType !== 'provider' || current.providerId === provider._id) &&
          (payeeType !== 'seller' || current.sellerOpenid === openid) &&
          !(current.settlementIds && current.settlementIds[payeeType]) && !current.payoutId,
        '部分收入已结算或锁定，请刷新后重试', 'E_CONFLICT');
        await requireLedgerFeatures((collection, id) => read(transaction, collection, id), current);
        await transaction.collection('ledger').doc(current._id).update({ data: { payoutId: id } });
      }
      const outBillNo = 'J' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(7).toString('hex').toUpperCase();
      const communityAmounts = communityAllocations(selection.rows, selection.allocations, selection.amount);
      const payoutCommunityIds = communityAmounts.map(item => item.communityId);
      const item = { _id: id, outBillNo, payeeType, communityId: payoutCommunityIds.length === 1 ? payoutCommunityIds[0] : null,
        communityIds: payoutCommunityIds, communityAmounts, providerId: provider && provider._id || null,
        sellerOpenid: payeeType === 'seller' ? openid : null, payeeOpenid: openid,
        amount: selection.amount, ledgerIds: selection.rows.map(row => row._id),
        ledgerAmounts: Object.fromEntries(selection.allocations.map(allocation => [allocation.ledgerId, allocation.amount])),
        state: 'created', wxState: null,
        mchId: config.mchId, appId: config.appId,
        transferBillNo: null, packageInfo: null, failReason: '', requestBody: null,
        createdAt: now, updatedAt: now };
      item.requestBody = wxpay.payoutBody({ ...item, _id: outBillNo }, currentPayee, config);
      await insert(transaction, 'payouts', item);
      await transaction.collection(collection).doc(profileId).update({ data: {
        payoutDailyDate: date, payoutDailyCount: dailyCount + 1, updatedAt: now
      } });
      return item;
    });
    let result = payout;
    try { result = await dispatch(payout, config); }
    catch (_) {
      // 不换单重试；首发响应不确定时先查单，timer也会继续对同一商户单号核对。
      result = await reconcile(payout, config);
    }
    return publicPayout(result);
  }

  async function get(event, { openid }) {
    const id = text(event.payoutId, '提现记录', 64);
    const payout = await server.get('payouts', id);
    ensure(payout && payout.payeeOpenid === openid, '提现记录不存在', 'E_FORBIDDEN');
    for (const id of payout.communityIds && payout.communityIds.length ? payout.communityIds : [payout.communityId]) await server.feature('autoPayout', id);
    const current = TERMINAL_STATES.includes(payout.state) ? payout : await reconcile(payout, wxpay.loadConfig());
    return publicPayout(current);
  }

  async function list(event, { openid }) {
    await server.featureEntry('autoPayout', await server.user(openid));
    const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
    const type = event.payeeType;
    ensure(type === undefined || ['provider', 'seller'].includes(type), '打款类型不正确');
    const rows = await db.collection('payouts').where({ payeeOpenid: openid, ...(type ? { payeeType: type } : {}) })
      .orderBy('createdAt', 'desc').orderBy('_id', 'desc')
      .skip(offset).limit(20).get();
    return { list: rows.data.map(publicPayout), hasMore: rows.data.length === 20,
      nextOffset: offset + rows.data.length };
  }

  async function runPending() {
    const rows = await server.all('payouts', { state: db.command.in(['created','processing','wait_user_confirm']) });
    if (!rows.length) return { checked: 0, failed: 0 };
    const config = wxpay.loadConfig();
    let failed = 0;
    for (const payout of rows) {
      try { await reconcile(payout, config); }
      catch (error) { failed++; console.error('提现查单失败', payout._id, error.code || 'E_PAYOUT'); }
    }
    return { checked: rows.length, failed };
  }

  return { create, get, list, runPending };
}

module.exports = { createPayoutFlow, requestWx, idFor };
