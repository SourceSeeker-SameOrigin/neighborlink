const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { createServer } = require('./lib/shared/server');
const { atomic, read, insert } = require('./lib/shared/transaction');
const { newIdleItem, validateItem, idleBlacklist, MODES, commission, releaseReservation } = require('./lib/shared/idleData');
const { ensure, integer, text } = require('./lib/shared/validate');
const { isEnabled } = require('./lib/shared/features');
const { ensureCanPublish, checkText, visibleImages, report: reportData, reportOutcome,
  requestMediaCheck } = require('./lib/shared/ugc');
const { fileInFolder } = require('./lib/shared/providerData');
const { maskPhone } = require('./lib/shared/money');
const { newOrder, transitionPatch } = require('./lib/shared/orderData');
const { orderNo } = require('./lib/shared/ids');
const { createPayFlow } = require('./lib/shared/payFlow');
const { conditionalTransition } = require('./lib/shared/orderStore');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const { db, command } = server;
const payments = createPayFlow(cloud, server);

function offset(event) { return integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000); }
function itemId(openid, requestId) {
  return 'id_' + crypto.createHash('sha256').update(openid + ':' + requestId).digest('hex').slice(0, 36);
}
async function context(user, checkFeature = true) {
  if (checkFeature && !user.communityId) await server.feature('idle');
  ensure(user.communityId, '请先绑定小区门牌');
  const community = await server.get('communities', user.communityId);
  ensure(community && community.status === 'active', '小区暂不可用');
  if (checkFeature) await server.feature('idle', community._id);
  return community;
}
async function canView(item, community) {
  if (item.communityId === community._id) return true;
  if (item.scope !== 'federation' || !community.federationGroupId ||
      !isEnabled('federation', await server.config(), community)) return false;
  const source = await server.get('communities', item.communityId);
  return Boolean(source && source.federationGroupId === community.federationGroupId &&
    isEnabled('federation', await server.config(), source) && isEnabled('idle', await server.config(), source));
}
function view(item, openid, sourceCommunityName = '', sellerPhone = null) {
  return { _id: item._id, communityId: item.communityId, scope: item.scope, sourceCommunityName,
    title: item.title, desc: item.desc, images: visibleImages(item, openid, item.sellerOpenid),
    category: item.category, condition: item.condition, price: item.price, negotiable: item.negotiable,
    tradeMode: item.tradeMode, status: item.status, createdAt: item.createdAt, seller: item.sellerOpenid === openid,
    moderationHidden: item.sellerOpenid === openid && item.moderationHidden === true, sellerPhone };
}
async function list(event, { user, openid }) {
  const community = await context(user);
  const scope = event.scope || 'community';
  ensure(['community', 'federation'].includes(scope), '内容范围不正确');
  let communityIds = [community._id];
  let names = new Map([[community._id, community.name || '']]);
  if (scope === 'federation') {
    await server.feature('federation', community._id);
    ensure(community.federationGroupId, '本小区尚未加入联合社区');
    const all = await server.all('communities', { federationGroupId: community.federationGroupId, status: 'active' });
    const config = await server.config();
    const enabled = all.filter(item => isEnabled('federation', config, item) && isEnabled('idle', config, item));
    communityIds = enabled.map(item => item._id);
    names = new Map(enabled.map(item => [item._id, item.name || '']));
  }
  const filter = { communityId: command.in(communityIds), scope, status: 'on_sale' };
  const result = await db.collection('idleItems').where(filter).orderBy('createdAt', 'desc')
    .skip(offset(event)).limit(20).get();
  const rows = result.data.filter(item => !item.moderationHidden || item.sellerOpenid === openid)
    .map(item => view(item, openid, item.communityId === community._id ? '' : names.get(item.communityId) || ''));
  return { list: rows, hasMore: result.data.length === 20 };
}
async function detail(event, { user, openid }) {
  const community = await context(user, false);
  const id = text(event.itemId, '闲置商品');
  const item = await server.get('idleItems', id);
  ensure(item && await canView(item, community), '内容不存在或不在可见范围', 'E_FORBIDDEN');
  ensure(item.status !== 'removed' || item.sellerOpenid === openid, '商品已下架', 'E_FORBIDDEN');
  ensure(!item.moderationHidden || item.sellerOpenid === openid || user.roles.includes('admin'), '内容正在审核中', 'E_FORBIDDEN');
  await server.feature('idle', item.communityId);
  const source = item.communityId === community._id ? community : await server.get('communities', item.communityId);
  const seller = await server.one('users', { openid: item.sellerOpenid });
  const config = await server.config();
  const chatEnabled = isEnabled('chat', config, community) && isEnabled('chat', config, source);
  const phone = item.sellerOpenid === openid || item.tradeMode === 'escrow' || chatEnabled ? null : maskPhone(seller && seller.phone);
  return { item: view(item, openid, source && source.name || '', phone) };
}
async function contact(event, { user, openid }) {
  const community = await context(user, false);
  const id = text(event.itemId, '闲置商品');
  const item = await server.get('idleItems', id);
  ensure(item && await canView(item, community) && item.sellerOpenid !== openid, '商品不存在或不能联系自己', 'E_FORBIDDEN');
  ensure(!item.moderationHidden, '内容正在审核中', 'E_FORBIDDEN');
  await server.feature('idle', item.communityId);
  ensure(item.status === 'on_sale' && item.tradeMode === 'offline', '该商品当前不能联系', 'E_BAD_STATE');
  const sellerCommunity = await server.get('communities', item.communityId);
  const config = await server.config();
  ensure(!isEnabled('chat', config, community) || !isEnabled('chat', config, sellerCommunity), '请使用站内聊天联系卖家', 'E_FEATURE_OFF');
  const seller = await server.one('users', { openid: item.sellerOpenid });
  ensure(seller && /^1\d{10}$/.test(seller.phone || ''), '卖家暂未提供可用手机号');
  return { phone: seller.phone };
}
async function create(event, { user, openid }) {
  const community = await context(user);
  ensureCanPublish(user);
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  ensure(event.communityId === community._id, '请选择已绑定小区');
  const scope = event.scope || event.item && event.item.scope || 'community';
  ensure(['community', 'federation'].includes(scope), '内容范围不正确');
  if (scope === 'federation') {
    await server.feature('federation', community._id);
    ensure(community.federationGroupId, '本小区尚未加入联合社区');
  }
  const config = await server.config();
  const blacklist = idleBlacklist(config);
  const input = { ...event, ...(event.item || {}) };
  input.title = await checkText(cloud, input.title, { blacklist, type: 'idle', openid });
  input.desc = await checkText(cloud, input.desc, { blacklist, type: 'idle', openid });
  ensure(MODES.includes(input.tradeMode || 'offline'), '交易方式不正确');
  if (input.tradeMode === 'escrow') {
    await server.feature('idleEscrow', community._id);
    ensure(scope === 'community', '担保交易仅支持本小区');
  }
  if (scope === 'federation') ensure(input.tradeMode !== 'escrow', '担保交易仅支持本小区');
  const normalized = validateItem(input, blacklist);
  const images = normalized.images;
  images.forEach(fileId => fileInFolder(fileId, 'idle/' + user._id));
  const id = itemId(openid, event.requestId);
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ ...normalized, scope })).digest('hex');
  const item = await atomic(db, async transaction => {
    const existing = await read(transaction, 'idleItems', id);
    if (existing) {
      ensure(existing.sellerOpenid === openid && existing.requestHash === requestHash, '请求编号已用于其他内容', 'E_CONFLICT');
      return existing;
    }
    const currentCommunity = await read(transaction, 'communities', community._id);
    if (normalized.tradeMode === 'escrow') ensure(isEnabled('idleEscrow', config, currentCommunity), '担保交易暂未开放', 'E_FEATURE_OFF');
    const value = newIdleItem({ id, user, community, input: { ...normalized, scope }, config });
    value.requestHash = requestHash;
    value.federationGroupId = scope === 'federation' ? community.federationGroupId : null;
    await insert(transaction, 'idleItems', value);
    return value;
  });
  const imageWarnings = [];
  for (const fileId of images) {
    try { await requestMediaCheck(cloud, db, { fileId, targetType: 'idle', targetId: item._id,
      authorOpenid: openid, communityId: community._id }); }
    catch (_) { imageWarnings.push(fileId); }
  }
  return { itemId: item._id, status: item.status, imageWarnings };
}
async function lookupRequest(event, { user, openid }) {
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  const item = await server.get('idleItems', itemId(openid, event.requestId));
  if (!item) return { itemId: null };
  ensure(item.sellerOpenid === openid && item.communityId === user.communityId,
    '无权查看此发布结果', 'E_FORBIDDEN');
  return { itemId: item._id };
}
async function update(event, { user, openid }) {
  const community = await context(user, false);
  ensureCanPublish(user);
  const id = text(event.itemId, '闲置商品');
  const item = await server.get('idleItems', id);
  ensure(item && item.communityId === community._id && item.sellerOpenid === openid, '无权修改此商品', 'E_FORBIDDEN');
  await server.feature('idle', item.communityId);
  ensure(item.status === 'on_sale', '该商品当前不能编辑', 'E_BAD_STATE');
  const config = await server.config();
  const input = { ...event.item, scope: event.item && event.item.scope || item.scope };
  input.title = await checkText(cloud, input.title, { blacklist: idleBlacklist(config), type: 'idle', openid });
  input.desc = await checkText(cloud, input.desc, { blacklist: idleBlacklist(config), type: 'idle', openid });
  const normalized = validateItem(input, idleBlacklist(config));
  if (normalized.tradeMode === 'escrow') {
    await server.feature('idleEscrow', community._id);
    ensure(normalized.scope !== 'federation', '担保交易仅支持本小区');
  }
  if (normalized.scope === 'federation') {
    await server.feature('federation', community._id);
    ensure(community.federationGroupId && normalized.tradeMode !== 'escrow', '联合社区内容仅支持信息交易');
  }
  normalized.scope = input.scope;
  const images = normalized.images;
  images.forEach(fileId => fileInFolder(fileId, 'idle/' + user._id));
  await atomic(db, async transaction => {
    const current = await read(transaction, 'idleItems', item._id);
    ensure(current && current.sellerOpenid === openid && current.status === 'on_sale', '商品状态已变化，请刷新', 'E_CONFLICT');
    if (normalized.tradeMode === 'escrow') {
      const currentCommunity = await read(transaction, 'communities', community._id);
      ensure(isEnabled('idleEscrow', await read(transaction, 'config', 'global'), currentCommunity), '担保交易暂未开放', 'E_FEATURE_OFF');
    }
    await transaction.collection('idleItems').doc(item._id).update({ data: { ...normalized,
      federationGroupId: normalized.scope === 'federation' ? community.federationGroupId : null, updatedAt: new Date() } });
  });
  for (const fileId of images) {
    if ((item.moderationApprovedFileIds || []).includes(fileId) || (item.moderationPendingFileIds || []).includes(fileId)) continue;
    try { await requestMediaCheck(cloud, db, { fileId, targetType: 'idle', targetId: item._id,
      authorOpenid: openid, communityId: community._id }); } catch (_) { /* retry by resubmitting the item */ }
  }
  return { itemId: item._id, status: 'on_sale' };
}
async function changeStatus(event, { user, openid }, status) {
  const community = await context(user, false);
  const id = text(event.itemId, '闲置商品');
  return atomic(db, async transaction => {
    const item = await read(transaction, 'idleItems', id);
    ensure(item && item.communityId === community._id && item.sellerOpenid === openid, '无权操作此商品', 'E_FORBIDDEN');
  await server.feature('idle', item.communityId);
    ensure(item.status === 'on_sale', '商品状态已变化，请刷新', 'E_CONFLICT');
    ensure(status !== 'sold' || item.tradeMode === 'offline', '担保交易须通过订单完成', 'E_BAD_STATE');
    await transaction.collection('idleItems').doc(id).update({ data: { status, updatedAt: new Date() } });
    return { itemId: id, status };
  });
}

async function buy(event, { user, openid }) {
  const community = await context(user, false);
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  const itemIdValue = text(event.itemId, '闲置商品');
  const item = await server.get('idleItems', itemIdValue);
  ensure(item && item.communityId === community._id && item.scope === 'community' && item.tradeMode === 'escrow',
    '该商品不支持本小区担保交易', 'E_FORBIDDEN');
  await server.feature('idle', item.communityId);
  await server.feature('idleEscrow', community._id);
  ensure(item.sellerOpenid !== openid, '不能购买自己发布的商品', 'E_FORBIDDEN');
  ensure(item.status === 'on_sale' && !item.moderationHidden, '商品已被购买或暂不可交易', 'E_BAD_STATE');
  const [building, config] = await Promise.all([server.get('buildings', user.buildingId), server.config()]);
  const buyer = await server.get('users', user._id);
  ensure(buyer && buyer.communityId === community._id, '请先绑定本小区门牌');
  const commissionRate = config.idleCommissionRate === undefined ? 0 : config.idleCommissionRate;
  const commissionFen = commission(item.price, commissionRate);
  const id = 'ip_' + crypto.createHash('sha256').update(openid + ':' + event.requestId).digest('hex').slice(0, 36);
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ itemId: item._id, price: item.price,
    commissionRate, communityId: community._id })).digest('hex');
  const order = await atomic(db, async transaction => {
    const previous = await read(transaction, 'orders', id);
    if (previous) {
      ensure(previous.userOpenid === openid && previous.requestHash === requestHash, '请求编号已用于其他订单', 'E_CONFLICT');
      return previous;
    }
    const current = await read(transaction, 'idleItems', item._id);
    ensure(current && current.status === 'on_sale' && current.tradeMode === 'escrow' && !current.moderationHidden &&
      current.sellerOpenid === item.sellerOpenid && current.price === item.price && current.communityId === community._id,
    '商品状态已变化，请刷新后重试', 'E_CONFLICT');
    const currentBuyer = await read(transaction, 'users', buyer._id);
    ensure(currentBuyer && currentBuyer.openid === openid && currentBuyer.communityId === community._id && !currentBuyer.blocked,
      '住户资料已变化，请刷新后重试', 'E_CONFLICT');
    const currentCommunity = await read(transaction, 'communities', community._id);
    const currentConfig = await read(transaction, 'config', 'global');
    ensure(currentConfig && currentConfig.payMode === config.payMode &&
      (currentConfig.idleCommissionRate === undefined ? 0 : currentConfig.idleCommissionRate) === commissionRate,
    '佣金或支付配置已变化，请刷新后重试', 'E_CONFLICT');
    ensure(isEnabled('idleEscrow', currentConfig, currentCommunity), '担保交易暂未开放', 'E_FEATURE_OFF');
    const currentBuilding = await read(transaction, 'buildings', building._id);
    const now = new Date();
    const purchase = newOrder({ id, orderNo: orderNo(now), user: currentBuyer, community: currentCommunity,
      building: currentBuilding, serviceCode: 'idle', detail: { itemId: item._id, title: item.title,
        category: item.category, condition: item.condition, images: visibleImages(item, openid, item.sellerOpenid) },
      note: '', slot: null, pricing: { listPrice: item.price, discount: 0, payAmount: item.price,
        goodsCap: 0, freeByMembership: false }, now, detailAlreadyClean: true });
    purchase.kind = 'idle_purchase';
    purchase.source = 'idle';
    purchase.sellerOpenid = item.sellerOpenid;
    purchase.sellerUserId = item.sellerUserId;
    purchase.idleItemId = item._id;
    purchase.idleSnapshot = { price: item.price, commissionRate, commissionFen, sellerAmount: item.price - commissionFen };
    purchase.requestHash = requestHash;
    purchase.payment.mode = config.payMode;
    await transaction.collection('idleItems').doc(item._id).update({ data: { status: 'reserved', purchaseOrderId: id, updatedAt: now } });
    await insert(transaction, 'orders', purchase);
    await transaction.collection('users').doc(currentBuyer._id).update({ data: { orderRevision: (currentBuyer.orderRevision || 0) + 1 } });
    return purchase;
  });
  try { return await payments.prepare(order); }
  catch (error) { return { orderId: order._id, paymentError: error.code || 'E_PAYMENT' }; }
}

async function sales(event, { openid, user }) {
  const pageOffset = offset(event);
  const result = await db.collection('orders').where({ kind: 'idle_purchase', sellerOpenid: openid })
    .orderBy('createdAt', 'desc').orderBy('_id', 'desc').skip(pageOffset).limit(20).get();
  return { list: result.data.map(order => ({ _id: order._id, orderNo: order.orderNo, itemId: order.idleItemId,
    title: order.detail.title, price: order.pricing.payAmount, status: order.status, createdAt: order.createdAt,
    deliveredAt: order.deliveredAt, delivery: order.idleDelivery || null })), hasMore: result.data.length === 20 };
}

async function earnings(event, { user, openid }) {
  const community = await context(user);
  const config = await server.config();
  const rows = await server.all('ledger', { sellerOpenid: openid, communityId: community._id });
  const cutoff = new Date(Date.now() - integer(config.complaintWindowHours, '投诉时限', 0, 720, 'E_CONFIG') * 3600000);
  const unpaid = rows.filter(row => row.settled && row.settled.seller === false);
  const available = unpaid.filter(row => row.createdAt <= cutoff && !(row.settlementIds && row.settlementIds.seller) && !row.payoutId);
  const remaining = row => Math.max(0, (row.amounts.seller || 0) - (row.paidAmounts && row.paidAmounts.seller || 0));
  const availableAmount = available.reduce((sum, row) => sum + remaining(row), 0);
  return { pending: unpaid.reduce((sum, row) => sum + remaining(row), 0),
    settled: rows.reduce((sum, row) => sum + (row.settled && row.settled.seller === true ? row.amounts.seller || 0 :
      row.paidAmounts && row.paidAmounts.seller || 0), 0),
    available: availableAmount,
    canWithdraw: isEnabled('autoPayout', config, community) && availableAmount >= 1000,
    payoutEnabled: isEnabled('autoPayout', config, community), manualSettlement: !isEnabled('autoPayout', config, community) };
}

async function acceptSale(event, { openid }) {
  const id = text(event.orderId, '担保订单');
  const order = await server.get('orders', id);
  ensure(order && order.kind === 'idle_purchase' && order.sellerOpenid === openid, '担保订单不存在', 'E_FORBIDDEN');
  await server.feature('idle', order.communityId);
  await server.feature('idleEscrow', order.communityId);
  return conditionalTransition(server, order, 'accepted', openid, { sellerAcceptedAt: new Date() }, {}, '订单状态已变化，请刷新');
}

async function deliverSale(event, { user, openid }) {
  const id = text(event.orderId, '担保订单');
  const order = await server.get('orders', id);
  ensure(order && order.kind === 'idle_purchase' && order.sellerOpenid === openid, '担保订单不存在', 'E_FORBIDDEN');
  await server.feature('idle', order.communityId);
  await server.feature('idleEscrow', order.communityId);
  ensure(order.status === 'accepted' || order.status === 'delivered',
    '请先确认接单，再提交交付凭证', 'E_BAD_STATE');
  const photos = Array.isArray(event.photos) ? [...new Set(event.photos)] : [];
  ensure(photos.length >= 1 && photos.length <= 3, '请上传 1—3 张交付凭证');
  photos.forEach(fileId => fileInFolder(fileId, 'idle-delivery/' + order._id));
  const note = event.note === undefined ? '' : event.note;
  ensure(typeof note === 'string' && [...note].length <= 300, '交付说明不能超过 300 字');
  return atomic(db, async transaction => {
    const current = await read(transaction, 'orders', order._id);
    ensure(current && current.kind === 'idle_purchase' && current.sellerOpenid === openid,
      '订单状态已变化，请刷新后重试', 'E_CONFLICT');
    if (current.status === 'delivered') {
      const delivery = current.idleDelivery || {};
      ensure(Array.isArray(delivery.photos) && delivery.photos.length === photos.length &&
        delivery.photos.every((fileId, index) => fileId === photos[index]) && delivery.note === note.trim(),
      '交付凭证已提交，请刷新订单', 'E_CONFLICT');
      return { orderId: current._id, status: 'delivered' };
    }
    ensure(current.status === 'accepted', '订单状态已变化，请刷新后重试', 'E_CONFLICT');
    const now = new Date();
    const patch = { ...transitionPatch(current, 'delivered', openid, now), deliveredAt: now,
      idleDelivery: { photos, note: note.trim(), at: now } };
    await transaction.collection('orders').doc(current._id).update({ data: patch });
    return { orderId: current._id, status: 'delivered' };
  });
}
async function mine(event, { user, openid }) {
  const community = await context(user);
  const result = await db.collection('idleItems').where({ sellerOpenid: openid, communityId: community._id })
    .orderBy('createdAt', 'desc').orderBy('_id', 'desc').skip(offset(event)).limit(20).get();
  return { list: result.data.map(item => view(item, openid)), hasMore: result.data.length === 20 };
}
async function report(event, { user, openid }) {
  const community = await context(user, false);
  const id = text(event.itemId, '举报内容');
  const item = await server.get('idleItems', id);
  ensure(item && await canView(item, community), '内容不存在或不在可见范围');
  await server.feature('idle', item.communityId);
  ensure(item.sellerOpenid !== openid, '不能举报自己的内容');
  const reportId = 'r_' + crypto.createHash('sha256').update('idle:' + item._id + ':' + openid).digest('hex').slice(0, 36);
  const record = reportData('idle', item._id, openid, event.reason || '不当内容', event.text || '');
  return atomic(db, async transaction => {
    if (await read(transaction, 'reports', reportId)) return { reportId, duplicate: true };
    const current = await read(transaction, 'idleItems', item._id);
    ensure(current, '内容已删除', 'E_CONFLICT');
    const reporters = [...new Set([...(current.reporterOpenids || []), openid])].slice(0, 3);
    const hidden = reportOutcome(reporters.map(reporterOpenid => ({ reporterOpenid }))).hide;
    await insert(transaction, 'reports', { _id: reportId, ...record, communityId: item.communityId });
    await transaction.collection('idleItems').doc(item._id).update({ data: { reporterOpenids: reporters,
      ...(hidden ? { moderationHidden: true } : {}) } });
    return { reportId, duplicate: false, hidden };
  });
}

exports.main = server.entry({ list, detail, contact, create, lookupRequest, update, mine, report, buy, sales, earnings, acceptSale, deliverSale,
  markSold: (event, contextValue) => changeStatus(event, contextValue, 'sold'),
  remove: (event, contextValue) => changeStatus(event, contextValue, 'removed') }, ['resident', 'admin', 'property'], 'idle');
