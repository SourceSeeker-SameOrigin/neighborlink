const { requireLedgerFeatures } = require('./orderFeatures');
const { requireRole, requireCommunityAccess } = require('./auth');
const { ensure, text, integer } = require('./validate');
const { period, rowsForPayee, total, csv, settlementId, supplementSettlementId,
  validatePayee, validateSettlementNote } = require('./settlementData');
const { atomic, read, insert } = require('./transaction');
const { isEnabled } = require('./features');

function adminSettlementActions(cloud, server) {
  const { db, command } = server;
  async function scope(event, user) {
    validatePayee(event.payee);
    const date = period(event);
    let communityId = event.communityId;
    if (event.payee === 'property' && user.roles.includes('property')) communityId = user.communityId;
    text(communityId, '小区');
    if (event.payee === 'provider') requireRole(user, ['admin']);
    else if (event.payee === 'seller') requireRole(user, ['admin']);
    else requireRole(user, ['admin', 'property']);
    requireCommunityAccess(user, communityId);
    let provider = null;
    let seller = null;
    let merchant = null;
    if (event.payee === 'provider') {
      provider = await server.get('providers', event.providerId);
      ensure(provider && provider.communityId === communityId, '服务员不属于该小区');
    }
    if (event.payee === 'merchant') {
      requireRole(user, ['admin']);
      merchant = await server.get('merchants', event.merchantId);
      ensure(merchant && merchant.status === 'approved' && merchant.communityIds.includes(communityId), '商家不属于该小区');
    }
    if (event.payee === 'seller') {
      const config = await server.config();
      const community = await server.get('communities', communityId);
      ensure(!isEnabled('autoPayout', config, community), '自动打款已开启，请由卖家从收入页申请打款', 'E_BAD_STATE');
      if (event.sellerOpenid) {
        seller = await server.one('users', { openid: event.sellerOpenid });
        ensure(seller, '卖家账号不存在');
      }
    }
    return { ...date, communityId, provider, seller, merchant };
  }
  async function settlementPreview(event, { user }) {
    const data = await scope(event, user);
    const filter = { communityId: data.communityId, createdAt: command.gte(data.from).and(command.lt(data.to)) };
    const ledger = await server.all('ledger', filter);
    const rows = [];
    if (event.payee === 'property') {
      const eligible = rowsForPayee(ledger, 'property');
      if (eligible.length) rows.push({ payee: 'property', communityId: data.communityId, providerId: null,
        from: event.from, to: event.to, total: total(eligible, 'property'), ledgerIds: eligible.map(row => row._id), status: 'unsettled' });
    } else if (event.payee === 'provider') {
      const ids = event.providerId ? [event.providerId] : [...new Set(ledger.filter(row => row.providerId && row.settled.provider === false).map(row => row.providerId))];
      for (const id of ids) {
        const eligible = rowsForPayee(ledger, 'provider', id);
        if (eligible.length) rows.push({ payee: 'provider', communityId: data.communityId, providerId: id,
          from: event.from, to: event.to, total: total(eligible, 'provider'), ledgerIds: eligible.map(row => row._id), status: 'unsettled' });
      }
    } else if (event.payee === 'seller') {
      const ids = event.sellerOpenid ? [event.sellerOpenid] : [...new Set(ledger.filter(row => row.sellerOpenid && row.settled.seller === false).map(row => row.sellerOpenid))];
      for (const id of ids) {
        const eligible = rowsForPayee(ledger, 'seller', id);
        if (eligible.length) rows.push({ payee: 'seller', communityId: data.communityId, providerId: null,
          sellerOpenid: id, from: event.from, to: event.to, total: total(eligible, 'seller'),
          ledgerIds: eligible.map(row => row._id), status: 'unsettled' });
      }
    }
    if (event.payee === 'merchant') {
      const ids = event.merchantId ? [event.merchantId] : [...new Set(ledger.filter(row => row.merchantId && row.settled.merchant === false).map(row => row.merchantId))];
      for (const id of ids) { const eligible = rowsForPayee(ledger, 'merchant', id);
        if (eligible.length) rows.push({ payee: 'merchant', communityId: data.communityId, merchantId: id, from: event.from, to: event.to, total: total(eligible, 'merchant'), ledgerIds: eligible.map(row => row._id), status: 'unsettled' });
      }
    }
    for (const row of rows) {
      const baseId = settlementId(row.payee, row.communityId,
        row.providerId || row.merchantId || row.sellerOpenid, event.from, event.to);
      const base = await server.get('settlements', baseId);
      row.supplementOf = base ? baseId : null;
      row.originalTotal = base ? base.total : 0;
    }
    return { from: event.from, to: event.to, rows };
  }
  async function settlementCreate(event, { user, openid }) {
    requireRole(user, ['admin']);
    const data = await scope(event, user);
    const preview = await settlementPreview(event, { user });
    if (!preview.rows.length) {
      const existing = (await server.all('settlements', { communityId: data.communityId }))
        .filter(item => item.payee === event.payee && item.period?.from === event.from && item.period?.to === event.to &&
          (!event.providerId || item.providerId === event.providerId) &&
          (!event.merchantId || item.merchantId === event.merchantId) &&
          (!event.sellerOpenid || item.sellerOpenid === event.sellerOpenid))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) ||
          Number(Boolean(b.supplementOf)) - Number(Boolean(a.supplementOf)) || b._id.localeCompare(a._id));
      ensure(existing.length, '该期间没有待结算账目');
      return { settlements: existing.slice(0, 1) };
    }
    const results = [];
    for (const row of preview.rows) {
      const baseId = settlementId(row.payee, row.communityId, row.providerId || row.merchantId || row.sellerOpenid, event.from, event.to);
      const settlement = await atomic(db, async transaction => {
        const ids = [...row.ledgerIds].sort();
        const base = await read(transaction, 'settlements', baseId);
        const id = base ? supplementSettlementId(baseId, ids) : baseId;
        const existing = await read(transaction, 'settlements', id);
        if (existing) return existing;
        for (const ledgerId of ids) {
          const ledgerRow = await read(transaction, 'ledger', ledgerId);
          ensure(ledgerRow && ledgerRow.settled[row.payee] === false &&
            (row.payee !== 'provider' || ledgerRow.providerId === row.providerId) &&
            (row.payee !== 'seller' || ledgerRow.sellerOpenid === row.sellerOpenid) &&
            (row.payee !== 'merchant' || ledgerRow.merchantId === row.merchantId) &&
            !(ledgerRow.settlementIds && ledgerRow.settlementIds[row.payee]) && !ledgerRow.payoutId,
          '部分账目已结算，请刷新预览', 'E_CONFLICT');
          await requireLedgerFeatures((collection, id) => read(transaction, collection, id), ledgerRow);
          await transaction.collection('ledger').doc(ledgerId).update({ data: { ['settlementIds.' + row.payee]: id } });
        }
        const result = { _id: id, payee: row.payee, providerId: row.providerId, merchantId: row.merchantId || null,
          supplementOf: base ? baseId : null, sellerOpenid: row.sellerOpenid || null, communityId: row.communityId,
          period: data.period, ledgerIds: ids, total: row.total, status: 'draft', paidAt: null,
          note: validateSettlementNote(event.note), createdAt: new Date(), createdBy: openid };
        await insert(transaction, 'settlements', result);
        return result;
      });
      results.push(settlement);
    }
    return { settlements: results };
  }
  async function settlementMarkPaid(event, { user, openid }) {
    requireRole(user, ['admin']);
    text(event.settlementId, '结算单');
    const settlement = await server.get('settlements', event.settlementId);
    ensure(settlement, '结算单不存在');
    const paidAt = new Date();
    return atomic(db, async transaction => {
      const current = await read(transaction, 'settlements', settlement._id);
      ensure(current, '结算单不存在');
      if (current.status === 'paid') return { settlementId: current._id, status: 'paid' };
      ensure(current.status === 'draft', '结算单状态不正确', 'E_BAD_STATE');
      for (const ledgerId of current.ledgerIds) {
        const row = await read(transaction, 'ledger', ledgerId);
        const field = current.payee;
        const settlementField = 'settlementIds.' + field;
        ensure(row && row.settled[field] === false && row.settlementIds[field] === current._id,
          '账本与结算单不一致，请联系管理员', 'E_CONFLICT');
        await requireLedgerFeatures((collection, id) => read(transaction, collection, id), row);
        await transaction.collection('ledger').doc(row._id).update({ data: { ['settled.' + field]: true,
          [settlementField]: current._id } });
      }
      await transaction.collection('settlements').doc(current._id).update({ data: {
        status: 'paid', paidAt, note: validateSettlementNote(event.note || current.note), paidBy: openid } });
      return { settlementId: current._id, status: 'paid' };
    });
  }
  async function exportCsv(event, { user }) {
    const preview = await settlementPreview(event, { user });
    const body = csv(preview.rows);
    const file = await cloud.uploadFile({ cloudPath: 'exports/settlements/' + Date.now() + '.csv',
      fileContent: Buffer.from(body, 'utf8') });
    const result = await cloud.getTempFileURL({ fileList: [file.fileID] });
    return { fileId: file.fileID, tempFileURL: result.fileList[0].tempFileURL, count: preview.rows.length };
  }
  async function listSettlements(event, { user }) {
    requireRole(user, ['admin', 'property']);
    const filter = {};
    if (user.roles.includes('property')) { filter.communityId = user.communityId; filter.payee = 'property'; }
    else if (event.communityId) filter.communityId = event.communityId;
    const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
    const result = await db.collection('settlements').where(filter).orderBy('createdAt', 'desc').skip(offset).limit(20).get();
    return { list: result.data.map(({ _id, payee, providerId, merchantId, sellerOpenid,
      communityId, period: range, total: amount, status, paidAt, note, supplementOf }) => ({ _id, payee, providerId,
      merchantId, communityId, sellerOpenid, period: range, total: amount, status, paidAt, note,
      supplementOf: supplementOf || null })), hasMore: result.data.length === 20 };
  }
  return { settlementPreview, settlementCreate, settlementMarkPaid, exportCsv, listSettlements };
}

module.exports = { adminSettlementActions };
