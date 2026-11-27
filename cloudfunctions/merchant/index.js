const { orderEnabled } = require('./lib/shared/orderFeatures');
const { fileInFolder } = require('./lib/shared/providerData');
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { createServer } = require('./lib/shared/server');
const { requireRole, requireCommunityAccess } = require('./lib/shared/auth');
const { ensure, integer, text } = require('./lib/shared/validate');
const { application, service, visibleMerchant, visibleService, merchantOrderView, CATEGORY_NAMES,
  locksmithStartCheck, requireLocksmithCheck } = require('./lib/shared/merchant');
const { atomic, read, insert, sameSnapshot } = require('./lib/shared/transaction');
const { orderNo } = require('./lib/shared/ids');
const { addressSnapshot, transitionPatch } = require('./lib/shared/orderData');
const { totalFee } = require('./lib/shared/paymentState');
const { createPayFlow } = require('./lib/shared/payFlow');
const { checkOrderContent } = require('./lib/shared/contentSafety');
const { requestMediaCheck } = require('./lib/shared/ugc');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const { db, command } = server;
const payments = createPayFlow(cloud, server);

async function assertEnabled(communityId) {
  const result = await server.feature('merchants', communityId);
  return result.community;
}

async function apply(event, { user, openid }) {
  requireRole(user, ['resident']);
  const communityId = event.communityId || user.communityId;
  if (communityId) requireCommunityAccess(user, communityId);
  const { community } = await server.featureEntry('merchants', user, communityId);
  fileInFolder(event.licenseFileId, 'merchants/' + user._id + '/license');
  const fields = application({ ...event, phone: event.phone || user.phone }, { ...user, openid }, community);
  const id = 'm_' + crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32);
  const existing = await server.get('merchants', id);
  ensure(!existing || ['rejected', 'suspended'].includes(existing.status), '商家申请已提交，请等待审核', 'E_BAD_STATE');
  const now = new Date();
  const data = { ...(existing || {}), ...fields, _id: id, createdAt: existing ? existing.createdAt : now, updatedAt: now };
  if (existing) await db.collection('merchants').doc(id).set({ data: Object.fromEntries(Object.entries(data).filter(([key]) => key !== '_id')) });
  else await db.collection('merchants').add({ data });
  return { merchantId: id, status: 'pending' };
}

async function mine(openid, checkFeature = true) {
  const merchant = await server.one('merchants', { staffOpenids: command.in([openid]) });
  ensure(merchant && merchant.status === 'approved', '商家账号尚未通过审核', 'E_FORBIDDEN');
  if (checkFeature) await assertEnabled(merchant.communityIds[0]);
  return merchant;
}

async function myApplication(event, { openid }) {
  const user = await server.user(openid);
  const merchant = await server.one('merchants', { staffOpenids: command.in([openid]) });
  await server.featureEntry('merchants', user, merchant ? merchant.communityIds[0] : user.communityId);
  return { merchant: merchant ? { _id: merchant._id, name: merchant.name, category: merchant.category,
    status: merchant.status, reviewNote: merchant.reviewNote || '', communityIds: merchant.communityIds } : null };
}

async function residentPage(query, sortField, offset, present) {
  query = query.orderBy(sortField, 'asc').orderBy('_id', 'asc');
  if (offset === undefined) {
    const rows = await query.limit(100).get();
    return { list: rows.data.map(present) };
  }
  const start = integer(offset, '分页位置');
  const rows = await query.skip(start).limit(21).get();
  const list = rows.data.slice(0, 20).map(present);
  return { list, nextOffset: start + list.length, hasMore: rows.data.length > 20 };
}

async function listForCommunity(event, { user }) {
  requireRole(user, ['resident', 'admin']);
  if (!event.communityId && !user.communityId) await server.featureEntry('merchants', user);
  const communityId = text(event.communityId, '小区');
  requireCommunityAccess(user, communityId);
  await assertEnabled(communityId);
  const query = db.collection('merchants').where({ status: 'approved', communityIds: command.in([communityId]),
    moderationHidden: command.neq(true) });
  return residentPage(query, 'name', event.offset, visibleMerchant);
}

async function servicesForMerchant(event, { user }) {
  requireRole(user, ['resident', 'admin']);
  text(event.merchantId, '商家');
  const merchant = await server.get('merchants', event.merchantId);
  ensure(merchant && merchant.status === 'approved' && !merchant.moderationHidden, '商家不存在或暂不可用');
  const communityId = text(event.communityId || user.communityId || merchant.communityIds[0], '小区');
  requireCommunityAccess(user, communityId);
  ensure(merchant.communityIds.includes(communityId), '商家不属于当前小区');
  await assertEnabled(communityId);
  const query = db.collection('merchantServices').where({ merchantId: merchant._id, status: 'on' });
  const page = await residentPage(query, 'title', event.offset, item => visibleService(item, user.openid));
  return { merchant: visibleMerchant(merchant), ...page };
}

async function adminList(event, { user }) {
  requireRole(user, ['admin']);
  const filter = {};
  if (event.status) {
    ensure(['pending', 'approved', 'rejected', 'suspended'].includes(event.status), '审核状态不正确');
    filter.status = event.status;
  }
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const rows = await db.collection('merchants').where(filter).orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  return { list: rows.data.map(item => ({ ...item, categoryName: CATEGORY_NAMES[item.category] || '其他' })), hasMore: rows.data.length === 20 };
}

async function review(event, { user, openid }) {
  requireRole(user, ['admin']);
  text(event.merchantId, '商家');
  ensure(typeof event.approved === 'boolean', '请选择审核结果');
  const merchant = await server.get('merchants', event.merchantId);
  ensure(merchant && merchant.status === 'pending', '申请不存在或已处理', 'E_CONFLICT');
  const noteValue = event.note === undefined ? '' : event.note;
  ensure(typeof noteValue === 'string' && [...noteValue].length <= 200, '审核说明不能超过 200 字');
  const note = noteValue.trim();
  const status = event.approved ? 'approved' : 'rejected';
  const now = new Date();
  const applicantOpenid = merchant.staffOpenids && merchant.staffOpenids[0];
  ensure(applicantOpenid, '商家申请人资料缺失', 'E_CONFIG');
  const applicant = await server.one('users', { openid: applicantOpenid });
  ensure(applicant, '商家申请人账号不存在', 'E_CONFIG');
  await atomic(db, async transaction => {
    const current = await read(transaction, 'merchants', merchant._id);
    ensure(current && current.status === 'pending', '申请已被其他管理员处理', 'E_CONFLICT');
    ensure(current.staffOpenids && current.staffOpenids[0] === applicantOpenid, '申请人已变更，请刷新后重试', 'E_CONFLICT');
    const account = await read(transaction, 'users', applicant._id);
    ensure(account && account.openid === applicantOpenid, '申请人账号已变更，请刷新后重试', 'E_CONFLICT');
    await transaction.collection('merchants').doc(current._id).update({ data: { status, reviewNote: note,
      reviewedBy: openid, reviewedAt: now, updatedAt: now } });
    await transaction.collection('users').doc(account._id).update({ data: { roles: [...new Set([...(account.roles || ['resident']),
      ...(event.approved ? ['merchant'] : [])])], ...(event.approved ? { merchantId: current._id } : {}), updatedAt: now } });
  });
  return { merchantId: merchant._id, status };
}

async function upsertService(event, { openid }) {
  let replayId = null, requestHash = null;
  if (!event.serviceId && event.requestId) {
    text(event.requestId, '请求编号', 80);
    ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
    replayId = 'ms_' + crypto.createHash('sha256').update(openid + ':' + event.requestId).digest('hex').slice(0, 36);
    requestHash = crypto.createHash('sha256').update(JSON.stringify({ communityId: event.communityId || '',
      fields: service(event) })).digest('hex');
    const replay = await server.get('merchantServices', replayId);
    if (replay) {
      ensure(replay.ownerOpenid === openid && replay.requestHash === requestHash,
        '请求编号已用于其他服务', 'E_CONFLICT');
      return { serviceId: replay._id, replayed: true };
    }
  }
  const merchant = await mine(openid);
  const communityId = text(event.communityId || merchant.communityIds[0], '小区');
  ensure(merchant.communityIds.includes(communityId), '无权管理该小区的商家服务', 'E_FORBIDDEN');
  await assertEnabled(communityId);
  const fields = service(event);
  const actor = await server.user(openid);
  fields.images.forEach(file => fileInFolder(file, 'merchant-services/' + actor._id));
  ensure(fields.status === 'off', '新服务需先由管理员审核上架');
  await checkOrderContent(cloud, openid, '', { desc: fields.title + ' ' + fields.desc }, (await server.config()).blacklist);
  if (event.serviceId) {
    text(event.serviceId, '服务');
    const current = await server.get('merchantServices', event.serviceId);
    ensure(current && current.merchantId === merchant._id, '无权修改该服务', 'E_FORBIDDEN');
    const result = await db.collection('merchantServices').where({ _id: current._id, merchantId: merchant._id })
      .update({ data: { ...fields, communityId, ownerOpenid: openid,
        moderationApprovedFileIds: [], moderationPendingFileIds: fields.images.slice(), updatedAt: new Date() } });
    ensure(result.stats.updated === 1, '服务状态已变化，请刷新', 'E_CONFLICT');
    for (const fileId of fields.images) await requestMediaCheck(cloud, db, { fileId, targetType: 'merchantService',
      targetId: current._id, authorOpenid: openid, communityId });
    return { serviceId: current._id };
  }
  const record = { ...fields, merchantId: merchant._id,
    communityId, ownerOpenid: openid, moderationApprovedFileIds: [], moderationPendingFileIds: fields.images.slice(),
    ...(replayId ? { requestHash } : {}), createdAt: new Date(), updatedAt: new Date() };
  const result = replayId ? await atomic(db, async transaction => {
    const existing = await read(transaction, 'merchantServices', replayId);
    if (existing) {
      ensure(existing.ownerOpenid === openid && existing.requestHash === requestHash,
        '请求编号已用于其他服务', 'E_CONFLICT');
      return { _id: replayId, replayed: true };
    }
    await insert(transaction, 'merchantServices', { _id: replayId, ...record });
    return { _id: replayId };
  }) : await db.collection('merchantServices').add({ data: record });
  if (result.replayed) return { serviceId: result._id, replayed: true };
  for (const fileId of fields.images) await requestMediaCheck(cloud, db, { fileId, targetType: 'merchantService',
    targetId: result._id, authorOpenid: openid, communityId });
  return { serviceId: result._id };
}

async function lookupService(event, { openid }) {
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  const id = 'ms_' + crypto.createHash('sha256').update(openid + ':' + event.requestId).digest('hex').slice(0, 36);
  const item = await server.get('merchantServices', id);
  return { serviceId: item && item.ownerOpenid === openid ? id : null };
}

async function myServices(event, { openid }) {
  const merchant = await mine(openid);
  const query = db.collection('merchantServices').where({ merchantId: merchant._id })
    .orderBy('createdAt', 'desc').orderBy('_id', 'desc');
  if (event.offset === undefined) {
    const rows = await query.limit(100).get();
    return { merchant: visibleMerchant(merchant), list: rows.data.map(item => visibleService(item, openid)) };
  }
  const offset = integer(event.offset, '分页位置');
  const rows = await query.skip(offset).limit(21).get();
  const list = rows.data.slice(0, 20).map(item => visibleService(item, openid));
  return { merchant: visibleMerchant(merchant), list, nextOffset: offset + list.length, hasMore: rows.data.length > 20 };
}

function bookingId(event, openid) {
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  text(event.serviceId, '服务');
  return 'mo_' + crypto.createHash('sha256').update(openid + ':' + event.requestId).digest('hex').slice(0, 40);
}

async function lookupBooking(event, { user, openid }) {
  requireRole(user, ['resident']);
  const id = bookingId(event, openid);
  const order = await server.get('orders', id);
  if (!order) return { orderId: null };
  ensure(order.kind === 'merchant' && order.userOpenid === openid && order.detail?.serviceId === event.serviceId,
    '请求编号与本次预约不匹配', 'E_CONFLICT');
  return { orderId: order._id };
}

async function createBooking(event, { user, openid }) {
  requireRole(user, ['resident']);
  const id = bookingId(event, openid);
  const serviceItem = await server.get('merchantServices', event.serviceId);
  ensure(serviceItem && serviceItem.status === 'on', '该服务暂不可预约');
  const merchant = await server.get('merchants', serviceItem.merchantId);
  ensure(merchant && merchant.status === 'approved' && !merchant.moderationHidden && merchant.communityIds.includes(user.communityId), '商家暂不可用');
  await assertEnabled(user.communityId);
  const community = await server.get('communities', user.communityId);
  ensure(community && community.status === 'active', '小区暂不可用');
  const buildingId = event.addressId ? (user.addresses || []).find(item => item.id === event.addressId)?.buildingId : user.buildingId;
  const selectedAddress = event.addressId ? (user.addresses || []).find(item => item.id === event.addressId) : null;
  const building = await server.get('buildings', buildingId);
  const address = addressSnapshot(user, community, building, selectedAddress);
  const requirementValue = event.requirement === undefined ? '' : event.requirement;
  ensure(typeof requirementValue === 'string' && [...requirementValue].length <= 500, '预约需求不能超过 500 字');
  const requirement = requirementValue.trim();
  await checkOrderContent(cloud, openid, requirement, { desc: serviceItem.title + ' ' + serviceItem.desc }, (await server.config()).blacklist);
  const now = new Date();
  const config = await server.config();
  const result = await atomic(db, async transaction => {
    const existing = await read(transaction, 'orders', id);
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({ serviceId: serviceItem._id,
      communityId: community._id, addressId: event.addressId || null, requirement })).digest('hex');
    if (existing) {
      ensure(existing.userOpenid === openid && existing.requestHash === requestHash, '请求编号已用于其他预约', 'E_CONFLICT');
      return existing;
    }
    const currentUser = await read(transaction, 'users', user._id);
    sameSnapshot(currentUser, user, ['communityId', 'buildingId', 'unit', 'room', 'phone', 'blocked', 'addresses']);
    ensure(currentUser.communityId === community._id && !currentUser.blocked, '预约地址或账号状态已变化', 'E_CONFLICT');
    const currentService = await read(transaction, 'merchantServices', serviceItem._id);
    sameSnapshot(currentService, serviceItem, ['merchantId', 'title', 'desc', 'priceType', 'price', 'unit', 'status']);
    const currentMerchant = await read(transaction, 'merchants', merchant._id);
    sameSnapshot(currentMerchant, merchant, ['status', 'communityIds', 'commissionRate', 'category']);
    ensure(currentMerchant.status === 'approved' && !currentMerchant.moderationHidden && currentService.status === 'on', '商家服务状态已变化，请重试', 'E_CONFLICT');
    const currentCommunity = await read(transaction, 'communities', community._id);
    sameSnapshot(currentCommunity, community, ['status', 'rates', 'features']);
    ensure(currentCommunity.status === 'active', '小区暂不可用');
    const currentBuilding = await read(transaction, 'buildings', building._id);
    sameSnapshot(currentBuilding, building, ['communityId', 'name', 'units']);
    const pricing = { listPrice: currentService.priceType === 'fixed' ? currentService.price : 0,
      discount: 0, payAmount: currentService.priceType === 'fixed' ? currentService.price : 0, goodsCap: 0,
      goodsActual: 0, freeByMembership: false };
    const order = { _id: id, orderNo: orderNo(now), kind: 'merchant', serviceCode: 'merchant', planCode: null,
      merchantId: currentMerchant._id, communityId: community._id, buildingId: building._id,
      address: { ...address, ...(selectedAddress ? { contactName: selectedAddress.contactName || '', contactPhone: selectedAddress.contactPhone } : {}) },
      userOpenid: openid, userPhone: selectedAddress ? selectedAddress.contactPhone : currentUser.phone, minLevel: 0,
      detail: { title: currentService.title, desc: currentService.desc, category: currentMerchant.category,
        merchantName: currentMerchant.name, serviceId: currentService._id, priceType: currentService.priceType, unit: currentService.unit },
      note: requirement, slot: null, pricing, status: currentService.priceType === 'quote' ? 'pending_quote' : 'pending_pay',
      source: 'user', providerOpenid: null, providerId: null, photos: [], rating: null, complaint: null,
      payment: { mode: currentService.priceType === 'quote' ? null : config.payMode, outTradeNo: orderNo(now),
        transactionId: null, paidAt: null }, refunds: [], rateSnapshot: currentCommunity.rates,
      merchantRateSnapshot: currentMerchant.commissionRate, timeline: [{ status: currentService.priceType === 'quote' ? 'pending_quote' : 'pending_pay', at: now, by: openid }],
      createdAt: now, updatedAt: now, alertedAt: null, alertPriority: 0, acceptedAt: null, deliveredAt: null, completedAt: null };
    order.payment.outTradeNo = order.orderNo;
    order.requestHash = requestHash;
    await insert(transaction, 'orders', order);
    return order;
  });
  if (result.status === 'pending_quote') return { orderId: result._id, status: result.status };
  try { return await payments.prepare(result); }
  catch (error) { return { orderId: result._id, paymentError: error.code || 'E_PAYMENT' }; }
}

async function quoteBooking(event, { openid }) {
  text(event.orderId, '预约订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.kind === 'merchant', '预约订单不存在');
  const merchant = await mine(openid, false);
  ensure(order.merchantId === merchant._id, '无权报价此订单', 'E_FORBIDDEN');
  await assertEnabled(order.communityId);
  ensure(order.status === 'pending_quote', '该预约不在待报价状态', 'E_BAD_STATE');
  const amount = integer(event.amount, '报价金额', 1, 100000000);
  const detailValue = event.detail === undefined ? '' : event.detail;
  ensure(typeof detailValue === 'string' && [...detailValue].length <= 300, '报价说明不能超过 300 字');
  const detail = detailValue.trim();
  await checkOrderContent(cloud, order.userOpenid, detail, {}, (await server.config()).blacklist);
  const now = new Date();
  const result = await atomic(db, async transaction => {
    const current = await read(transaction, 'orders', order._id);
    ensure(current && current.kind === 'merchant' && current.merchantId === merchant._id && current.status === 'pending_quote',
      '报价状态已变化，请刷新', 'E_CONFLICT');
    const patch = { ...transitionPatch(current, 'pending_pay', openid, now), pricing: { ...current.pricing,
      listPrice: amount, payAmount: amount, discount: 0 }, quote: { amount, detail, by: openid, at: now },
      payment: { ...current.payment, mode: (await read(transaction, 'config', 'global')).payMode } };
    await transaction.collection('orders').doc(current._id).update({ data: patch });
    return { ...current, ...patch };
  });
  return { orderId: result._id, status: result.status };
}

async function merchantOrders(event, { openid }) {
  const merchant = await mine(openid, false);
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const rows = await db.collection('orders').where({ kind: 'merchant', merchantId: merchant._id })
    .orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  const config = await server.config();
  const communities = new Map(await Promise.all([...new Set(rows.data.map(order => order.communityId))]
    .map(async id => [id, await server.get('communities', id)])));
  return { list: rows.data.map(order => ({ ...merchantOrderView(order),
    featureEnabled: orderEnabled(order, config, communities.get(order.communityId)) })),
    hasMore: rows.data.length === 20 };
}

async function merchantTransition(event, { openid }) {
  text(event.orderId, '预约订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.kind === 'merchant', '预约订单不存在');
  const merchant = await mine(openid, false);
  ensure(order.merchantId === merchant._id, '无权操作此预约', 'E_FORBIDDEN');
  await assertEnabled(order.communityId);
  const target = event.actionName === 'accept' ? 'accepted' : event.actionName === 'start' ? 'in_service' : null;
  ensure(target && (target === 'accepted' ? order.status === 'paid' : order.status === 'accepted'), '预约状态不支持此操作', 'E_BAD_STATE');
  return require('./lib/shared/orderStore').conditionalTransition(server, order, target, openid,
    target === 'accepted' ? { acceptedAt: new Date(), merchantOpenid: openid }
      : locksmithStartCheck(order, event.identityConfirmed, openid), { merchantId: merchant._id });
}

async function completeBooking(event, { openid }) {
  text(event.orderId, '预约订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.kind === 'merchant', '预约订单不存在');
  const merchant = await mine(openid, false);
  ensure(order.merchantId === merchant._id, '无权操作此预约', 'E_FORBIDDEN');
  await assertEnabled(order.communityId);
  ensure(order.status === 'in_service', '请先接单并开始服务', 'E_BAD_STATE');
  requireLocksmithCheck(order);
  ensure(Array.isArray(event.photos) && event.photos.length >= 1 && event.photos.length <= 3 &&
    event.photos.every(file => typeof file === 'string' && file.startsWith('cloud://')), '请上传 1—3 张服务完成照片');
  event.photos.forEach(file => fileInFolder(file, 'merchant-orders/' + order._id));
  const patch = { photos: event.photos, deliveredAt: new Date() };
  return require('./lib/shared/orderStore').conditionalTransition(server, order, 'delivered', openid, patch, { merchantId: merchant._id });
}

async function setServiceStatus(event, { user }) {
  requireRole(user, ['admin']);
  text(event.serviceId, '服务');
  ensure(['on', 'off'].includes(event.status), '服务状态不正确');
  const item = await server.get('merchantServices', event.serviceId);
  ensure(item, '服务不存在');
  const merchant = await server.get('merchants', item.merchantId);
  ensure(merchant && merchant.status === 'approved', '商家尚未通过审核');
  if (event.status === 'on') ensure(!(item.moderationPendingFileIds || []).length &&
    (item.images || []).every(image => (item.moderationApprovedFileIds || []).includes(image)), '服务图片尚未通过安全审核', 'E_CONTENT_CHECK');
  await db.collection('merchantServices').doc(item._id).update({ data: { status: event.status, updatedAt: new Date() } });
  return { serviceId: item._id, status: event.status };
}

async function adminServices(event, { user }) {
  requireRole(user, ['admin']);
  text(event.merchantId, '商家');
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const rows = await db.collection('merchantServices').where({ merchantId: event.merchantId })
    .orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  return { list: rows.data.map(visibleService), hasMore: rows.data.length === 20 };
}

exports.main = server.entry({ apply, myApplication, listForCommunity, servicesForMerchant, adminList, review,
  upsertService, lookupService, myServices, setServiceStatus, adminServices, lookupBooking, createBooking, quoteBooking, merchantOrders, merchantTransition,
  completeBooking }, ['resident', 'merchant', 'admin'], 'merchant');
