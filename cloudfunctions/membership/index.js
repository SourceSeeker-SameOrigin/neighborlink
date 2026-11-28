const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { createServer } = require('./lib/shared/server');
const { atomic, read, insert, sameSnapshot } = require('./lib/shared/transaction');
const { cardPlan, purchaseOrder } = require('./lib/shared/membershipData');
const { orderNo, membershipTaskId } = require('./lib/shared/ids');
const { ymd } = require('./lib/shared/time');
const { transitionPatch, addressSnapshot } = require('./lib/shared/orderData');
const { ensure, text } = require('./lib/shared/validate');
const { encryptSecret } = require('./lib/shared/crypto');
const { cleanEntry } = require('./lib/shared/vacant');
const { isEnabled } = require('./lib/shared/features');
const { createPayFlow } = require('./lib/shared/payFlow');
const { payConfig } = require('./lib/shared/payConfig');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const payments = createPayFlow(cloud, server);

async function plans(event, { user, openid }) {
  const selectedAddress = event.addressId ? (user.addresses || []).find(item => item.id === event.addressId) : null;
  ensure(!event.addressId || selectedAddress, '请选择已保存的服务地址');
  const community = await server.get('communities', selectedAddress ? selectedAddress.communityId : user.communityId);
  ensure(community && community.status === 'active', '请先绑定有效小区');
  const history = await server.all('memberships', { userOpenid: openid, communityId: community._id });
  const config = await server.config();
  return { list: community.cardPlans.filter(item => (item.serviceCode !== 'visit' || isEnabled('elder', config, community)) &&
    (item.serviceCode !== 'vacant' || isEnabled('vacantHome', config, community))).map(item => {
    const plan = cardPlan(community, item.code);
    const first = !history.some(card => card.planCode === plan.code);
    return { ...plan, first, payAmount: first ? plan.firstPeriodPrice : plan.price };
  }), communityId: community._id };
}

async function mine(event, { openid }) {
  const rows = await server.all('memberships', { userOpenid: openid });
  const today = ymd(new Date());
  return { list: rows.sort((a, b) => b.endAt - a.endAt).map(card => ({ _id: card._id, communityId: card.communityId,
    name: card.planCode === 'trash_monthly' ? '垃圾月卡' : card.planCode === 'visit_monthly' ? '独居探访月卡' :
      card.planCode === 'vacant_monthly' ? '空置房巡检月卡' : '快递月卡', planCode: card.planCode,
    serviceCode: card.serviceCode, slot: card.slot, slotText: { morning: '早班', afternoon: '中班', evening: '晚班' }[card.slot] || '', startAt: card.startAt, endAt: card.endAt,
    visitAddressText: card.visitAddress ? [card.visitAddress.buildingName, card.visitAddress.unit, card.visitAddress.room].filter(Boolean).join(' ') : '',
    status: card.status === 'active' && card.endAt <= new Date() ? 'expired' : card.status,
    skippedToday: card.skipDates.includes(today), purchaseOrderId: card.purchaseOrderId })) };
}

async function buy(event, { user, openid }) {
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  const selectedAddress = event.addressId ? (user.addresses || []).find(item => item.id === event.addressId) : null;
  ensure(!event.addressId || selectedAddress, '请选择已保存的服务地址');
  const communityId = selectedAddress ? selectedAddress.communityId : user.communityId;
  const buildingId = selectedAddress ? selectedAddress.buildingId : user.buildingId;
  const [community, building, config, history] = await Promise.all([
    server.get('communities', communityId), server.get('buildings', buildingId), server.config(),
    server.all('memberships', { userOpenid: openid, communityId })
  ]);
  addressSnapshot(user, community, building, selectedAddress);
  const plan = cardPlan(community, event.planCode);
  if (plan.serviceCode === 'visit') await server.feature('elder', community._id);
  let entry = 'key_handover';
  let encryptedEntry = null;
  if (plan.serviceCode === 'vacant') {
    await server.feature('vacantHome', community._id);
    const cleanedEntry = cleanEntry(event);
    entry = cleanedEntry.entry;
    if (cleanedEntry.password) encryptedEntry = encryptSecret(cleanedEntry.password, process.env.SECRET_KEY);
  }
  ensure(!['trash','visit'].includes(plan.serviceCode) || ['morning', 'afternoon', 'evening'].includes(event.slot), '请选择上门时段');
  ensure(event.slot !== 'afternoon' || (Array.isArray(community.dutyWindows) && community.dutyWindows.length >= 3),
    '中班需要先配置三段上门时段', 'E_CONFIG');
  const first = !history.some(card => card.planCode === plan.code);
  if ((first ? plan.firstPeriodPrice : plan.price) > 0) payConfig(config.payMode);
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ planCode: plan.code,
    communityId: community._id, addressId: selectedAddress && selectedAddress.id || null,
    slot: event.slot || null, entry, entryPasswordHash: plan.serviceCode === 'vacant' && event.entry === 'password'
      ? crypto.createHash('sha256').update(event.entryPassword).digest('hex') : null })).digest('hex');
  const id = 'mp_' + crypto.createHash('sha256').update(openid + ':' + event.requestId).digest('hex').slice(0, 40);
  const order = await atomic(server.db, async transaction => {
    const previous = await read(transaction, 'orders', id);
    if (previous) {
      ensure(previous.userOpenid === openid && previous.planCode === plan.code && previous.communityId === community._id &&
        previous.addressId === (selectedAddress && selectedAddress.id || null) && previous.requestHash === requestHash,
        '请求编号已用于其他月卡订单', 'E_CONFLICT');
      return previous;
    }
    const currentUser = await read(transaction, 'users', user._id);
    sameSnapshot(currentUser, user, ['orderRevision', 'communityId', 'buildingId', 'unit', 'room', 'phone', 'blocked', 'addresses']);
    const currentCommunity = await read(transaction, 'communities', community._id);
    sameSnapshot(currentCommunity, community, ['status', 'cardPlans', 'rates', 'dutyWindows', 'features']);
    const { nextMembershipRevision } = require('./lib/shared/membershipRevision');
    await transaction.collection('communities').doc(community._id).update({data:{membershipRevision:nextMembershipRevision(currentCommunity)}});
    const currentBuilding = await read(transaction, 'buildings', building._id);
    sameSnapshot(currentBuilding, building, ['communityId', 'name', 'units']);
    const now = new Date();
    const created = purchaseOrder({ id, orderNo: orderNo(now), user: currentUser, community: currentCommunity,
      building: currentBuilding, plan, first, slot: event.slot, now, payMode: config.payMode, selectedAddress, entry });
    created.requestHash = requestHash;
    await insert(transaction, 'orders', created);
    if (encryptedEntry) await insert(transaction, 'secrets', { _id: 's_' + created._id, orderId: created._id,
      ...encryptedEntry, createdAt: now });
    await transaction.collection('users').doc(user._id).update({ data: { orderRevision: (currentUser.orderRevision || 0) + 1 } });
    return created;
  });
  if (order.pricing.payAmount === 0 && !order.payment.paidAt) {
    await payments.onPaid(order, { mode: 'free', amount: 0, transactionId: 'free_' + id });
    return { orderId: id, free: true };
  }
  try { return await payments.prepare(order); }
  catch (error) { return { orderId: id, paymentError: error.code || 'E_PAYMENT' }; }
}

async function lookupBuy(event, { openid }) {
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  const id = 'mp_' + crypto.createHash('sha256').update(openid + ':' + event.requestId).digest('hex').slice(0, 40);
  const order = await server.get('orders', id);
  if (!order) return { orderId: null };
  ensure(order.userOpenid === openid && order.kind === 'membership_purchase', '无权查看该月卡订单', 'E_FORBIDDEN');
  return { orderId: order._id, planCode: order.planCode, communityId: order.communityId,
    addressId: order.addressId || null, slot: order.detail?.slot || null,
    entry: order.detail?.entry || null, status: order.status };
}

async function skipToday(event, { openid }) {
  text(event.membershipId, '月卡');
  return atomic(server.db, async transaction => {
    const card = await read(transaction, 'memberships', event.membershipId);
    const now = new Date(), date = ymd(now);
    ensure(card && card.userOpenid === openid && card.serviceCode === 'trash', '无权操作该月卡', 'E_FORBIDDEN');
    ensure(card.status === 'active' && card.startAt <= now && card.endAt > now, '月卡当前无效', 'E_BAD_STATE');
    const id = card.lastGeneratedDate === date ? card.lastTaskId : membershipTaskId(card._id, date, card.slot);
    const task = await read(transaction, 'orders', id);
    if (task) {
      ensure(['paid', 'cancelled'].includes(task.status), '服务员已接单，今天不能再跳过', 'E_BAD_STATE');
      if (task.status === 'paid') await transaction.collection('orders').doc(id).update({ data: transitionPatch(task, 'cancelled', openid, now) });
    }
    await transaction.collection('memberships').doc(card._id).update({ data: { skipDates: [...new Set([...card.skipDates, date])] } });
    return { date, skipped: true };
  });
}
exports.main = server.entry({ plans, buy, lookupBuy, mine, skipToday }, ['resident']);
