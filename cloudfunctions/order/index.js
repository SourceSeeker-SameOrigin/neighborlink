const { orderEnabled, requireOrderFeatures } = require('./lib/shared/orderFeatures');
const cloud = require('wx-server-sdk');
const { createServer } = require('./lib/shared/server');
const { createOrderContext } = require('./lib/shared/orderContext');
const { STATUS_GROUPS, listView, transitionPatch } = require('./lib/shared/orderData');
const { orderView } = require('./lib/shared/views');
const { ensure, integer, text } = require('./lib/shared/validate');
const { createOrderWriter, requestOrderId } = require('./lib/shared/orderWrite');
const { checkOrderContent } = require('./lib/shared/contentSafety');
const { totalFee } = require('./lib/shared/paymentState');
const { requireRole } = require('./lib/shared/auth');
const { createPayFlow } = require('./lib/shared/payFlow');
const { payConfig } = require('./lib/shared/payConfig');
const { residentOrderActions } = require('./lib/shared/residentOrders');
const { complaintAllowed } = require('./lib/shared/orderLifecycle');
const { createNotifier } = require('./lib/shared/notify');
const { publicTemplates } = require('./lib/shared/notificationData');
const { isEnabled } = require('./lib/shared/features');
const { parseWindow } = require('./lib/shared/time');
const { atomic, read } = require('./lib/shared/transaction');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const server = createServer(cloud);
const context = createOrderContext(server);
const writer = createOrderWriter(server);
const payments = createPayFlow(cloud, server);
const notify = createNotifier(cloud, server);

function mockEnabled(config) {
  ensure(config.payMode === 'mock', '模拟支付未开启，请联系管理员', 'E_CONFIG');
  payConfig('mock');
}

async function lookupRequest(event, { user }) {
  requireRole(user, ['resident']);
  const order = await server.get('orders', requestOrderId(event, user));
  return { orderId: order && order.kind === 'service' && order.userOpenid === user.openid ? order._id : null };
}

async function createNew(event, user) {
  const result = await context(event, user, { creating: true });
  if (result.pricing.payAmount + result.pricing.goodsCap > 0) payConfig(result.config.payMode);
  await checkOrderContent(cloud, user.openid, result.note, result.detail, result.config.blacklist);
  return writer.create(event, user, result);
}

async function create(event, { user }) {
  requireRole(user, ['resident']);
  let order = await writer.findReplay(event, user);
  if (!order) {
    try { order = await createNew(event, user); }
    catch (error) {
      // 同编号的并发请求可能在本次报价或事务期间完成并锁券。
      order = await writer.findReplay(event, user);
      if (!order) throw error;
    }
  }
  if (order.createdNow && order.status === 'paid') await notify.newTask(order);
  try {
    if (!order.createdNow && order.status === 'pending_pay') await requireOrderFeatures(server, order);
    return await payments.prepare(order);
  }
  catch (error) {
    // 已建单后统一返回订单编号，网络失败也可在详情页重试，避免再次下单。
    return { orderId: order._id, paymentError: error.code || 'E_PAYMENT' };
  }
}

async function mockPay(event, { user }) {
  requireRole(user, ['resident']);
  text(event.orderId, '订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.userOpenid === user.openid, '无权操作该订单', 'E_FORBIDDEN');
  await requireOrderFeatures(server, order);
  mockEnabled(await server.config());
  ensure(order.payment.mode === 'mock', '该订单不支持模拟支付', 'E_FORBIDDEN');
  const paid = await payments.onPaid(order, { mode: 'mock', amount: totalFee(order), transactionId: 'mock_' + order._id });
  return { orderId: paid._id, status: paid.status };
}

async function quote(event, { user }) {
  const result = await context(event, user, { metadata: event.metadata === true });
  return { pricing: result.pricing, slots: result.slots, onDutyCount: result.onDutyCount,
    hasTrashMembership: result.hasTrashMembership, couponOptions: result.couponOptions || [],
    pointsBalance: result.pointsBalance || 0, couponsEnabled: result.couponsEnabled === true,
    pointsEnabled: result.pointsEnabled === true, validationMessage: result.validationMessage || '' };
}

async function subscriptionTemplates(event, { user }) {
  requireRole(user, ['resident']);
  return publicTemplates(await server.config());
}

async function subscribeVisitReport(event, { openid }) {
  text(event.orderId, '订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.userOpenid === openid && order.serviceCode === 'visit', '无权操作该探访订单', 'E_FORBIDDEN');
  await server.feature('elder', order.communityId);
  return atomic(server.db, async transaction => {
    const current = await read(transaction, 'orders', order._id);
    ensure(current && current.userOpenid === openid && current.serviceCode === 'visit', '无权操作该探访订单', 'E_FORBIDDEN');
    ensure(['paid', 'accepted', 'in_service'].includes(current.status) && !current.visitReport,
      '该探访任务已完成或状态已变化，请在订单详情查看报告', 'E_BAD_STATE');
    if (current.visitReportNotifyAuthorizedAt) return { authorized: true, alreadyAuthorized: true };
    await transaction.collection('orders').doc(current._id).update({ data: { visitReportNotifyAuthorizedAt: new Date() } });
    return { authorized: true, alreadyAuthorized: false };
  });
}

async function listMine(event, { openid }) {
  const group = event.group || 'ongoing';
  ensure(Object.prototype.hasOwnProperty.call(STATUS_GROUPS, group), '订单分组不正确');
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const command = server.command;
  const stateFilter = group === 'ongoing' ? command.or([
    { kind: command.neq('membership_purchase'), status: command.in(STATUS_GROUPS.ongoing) },
    { kind: 'membership_purchase', status: 'pending_pay' }
  ]) : group === 'done' ? command.or([{ status: command.in(STATUS_GROUPS.done) },
    { kind: 'membership_purchase', status: 'paid' }]) : { status: command.in(STATUS_GROUPS.aftersale) };
  const rows = await server.db.collection('orders').where(command.and([{ userOpenid: openid }, stateFilter]))
    .orderBy('createdAt', 'desc').orderBy('_id', 'desc').skip(offset).limit(20).get();
  return { list: rows.data.map(listView), hasMore: rows.data.length === 20 };
}

async function detail(event, { user }) {
  text(event.orderId, '订单');
  const order = await server.get('orders', event.orderId);
  ensure(order, '订单不存在');
  const [provider, config, community] = await Promise.all([server.get('providers', order.providerId), server.config(),
    server.get('communities', order.communityId)]);
  const result = orderView(order, user, provider, config, new Date());
  result.featureEnabled = orderEnabled(order, config, community);
  result.canPay = result.canPay && result.featureEnabled;
  result.chatEnabled = isEnabled('chat', config, community) && Boolean(order.providerOpenid) &&
    ['accepted', 'in_service', 'delivered', 'disputed', 'completed'].includes(order.status);
  result.canChat = result.chatEnabled && (order.userOpenid === user.openid || order.providerOpenid === user.openid);
  result.canShareLocation = result.featureEnabled && order.providerOpenid === user.openid && ['accepted', 'in_service'].includes(order.status) &&
    isEnabled('location', config, community);
  result.canConfirm = result.featureEnabled && order.userOpenid === user.openid && order.status === 'delivered';
  result.canRate = order.userOpenid === user.openid && order.status === 'completed' && !order.rating;
  result.canComplain = order.userOpenid === user.openid && complaintAllowed(order, new Date(), config.complaintWindowHours);
  if (order.userOpenid === user.openid && ['accepted','in_service'].includes(order.status) && provider &&
      provider.lastLocation && provider.lastLocation.orderId === order._id && isEnabled('location', config, community)) {
    const point = provider.lastLocation;
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.at) result.providerLocation = {
      latitude: point.lat, longitude: point.lng, at: point.at,
      minutesAgo: Math.max(0, Math.floor((Date.now() - new Date(point.at).getTime()) / 60000))
    };
  }
  if (result.canPay) result.paymentOptions = { mode: order.payment.mode };
  return result;
}

async function retryPayment(event, { openid }) {
  text(event.orderId, '订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.userOpenid === openid, '无权操作该订单', 'E_FORBIDDEN');
  await requireOrderFeatures(server, order);
  if (order.taskPostId) {
    const now = new Date();
    const post = await server.get('posts', order.taskPostId);
    ensure(post && !post.moderationHidden && post.status === 'open' && post.expireAt > now,
      '悬赏任务已关闭或隐藏，无法继续支付', 'E_BAD_STATE');
    ensure(order.slot && parseWindow(order.slot).endAt > now, '悬赏服务时段已结束，无法继续支付', 'E_BAD_STATE');
  }
  return payments.prepare(order);
}

async function cancel(event, { openid }) {
  text(event.orderId, '订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.userOpenid === openid, '无权操作该订单', 'E_FORBIDDEN');
  ensure(order.kind !== 'event_signup', '活动报名请在活动详情中取消，以同步更新名额', 'E_FORBIDDEN');
  ensure(order.kind !== 'membership_purchase' || order.status === 'pending_pay', '月卡不支持自行退款，请联系客服', 'E_BAD_STATE');
  ensure(['pending_quote', 'pending_pay', 'paid'].includes(order.status), '订单已接单或已结束，无法自行取消', 'E_BAD_STATE');
  if (order.status === 'pending_quote') {
    const result = await server.db.collection('orders').where({ _id: order._id, kind: 'merchant', status: 'pending_quote' })
      .update({ data: transitionPatch(order, 'closed', openid, new Date()) });
    ensure(result.stats.updated === 1, '订单状态已变化，请刷新后重试', 'E_CONFLICT');
    return { orderId: order._id, status: 'closed' };
  }
  if (order.status === 'pending_quote') {
    const result = await server.db.collection('orders').where({ _id: order._id, kind: 'merchant', status: 'pending_quote' })
      .update({ data: transitionPatch(order, 'closed', openid, new Date()) });
    ensure(result.stats.updated === 1, '订单状态已变化，请刷新后重试', 'E_CONFLICT');
    return { orderId: order._id, status: 'closed' };
  }
  if (order.status === 'pending_pay') {
    await payments.closeUnpaid(order, openid);
    return { orderId: order._id, status: 'closed' };
  }
  const now = new Date();
  const patch = transitionPatch(order, 'cancelled', openid, now);
  const total = order.pricing.payAmount + order.pricing.goodsCap;
  if (total > 0) {
    await payments.requestRefund(order, total, '住户取消订单', { key: 'cancel', to: 'cancelled', actor: openid });
    return { orderId: order._id, status: 'cancelled' };
  }
  const result = await server.db.collection('orders').where({ _id: order._id, status: order.status })
    .update({ data: patch });
  ensure(result.stats.updated === 1, '订单状态已变化，请刷新后重试', 'E_CONFLICT');
  return { orderId: order._id, status: patch.status };
}

exports.main = server.entry({ quote, create, lookupRequest, mockPay, listMine, detail, cancel, retryPayment, subscriptionTemplates, subscribeVisitReport,
  ...residentOrderActions(cloud, server) }, ['resident', 'admin', 'property'], 'order');
