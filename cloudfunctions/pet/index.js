const cloud = require('wx-server-sdk');
const { createServer } = require('./lib/shared/server');
const { atomic, read, sameSnapshot } = require('./lib/shared/transaction');
const { requireApprovedProvider } = require('./lib/shared/auth');
const { ensure, text } = require('./lib/shared/validate');
const { transitionPatch } = require('./lib/shared/orderData');
const { createPayFlow } = require('./lib/shared/payFlow');
const { createNotifier } = require('./lib/shared/notify');
const { revealAllowed, cleanVisitResult, revealSecret, visitId } = require('./lib/shared/petFlow');
const { ymd, parseDate } = require('./lib/shared/time');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const payments = createPayFlow(cloud, server);
const notify = createNotifier(cloud, server);
const now = () => new Date();

async function assignedOrder(event, openid) {
  text(event.orderId, '订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.serviceCode === 'pet', '喂宠订单不存在');
  const provider = await server.one('providers', { openid });
  requireApprovedProvider(provider, 2);
  ensure(order.providerId === provider._id && order.providerOpenid === openid, '无权操作该订单', 'E_FORBIDDEN');
  await server.feature('pet', order.communityId);
  return { order, provider };
}
async function child(event, order) {
  text(event.visitId, '上门任务');
  const visit = await server.get('visits', event.visitId);
  ensure(visit && visit.parentOrderId === order._id, '上门任务不存在');
  return visit;
}
const scheduleError = '上门记录与已购排期不一致，请联系管理员核对';

async function visitSchedule(order) {
  const { dates, visitsPerDay } = order.detail || {};
  const hasDates = Array.isArray(dates) && dates.length >= 1 && dates.length <= 15 &&
    new Set(dates).size === dates.length && [1, 2].includes(visitsPerDay);
  if (dates != null && visitsPerDay != null) ensure(hasDates, scheduleError, 'E_CONFIG');
  const prices = order.petVisitPrices ?? [];
  ensure(Array.isArray(prices), scheduleError, 'E_CONFIG');
  let slots = prices;
  if (!prices.length || (hasDates && prices.length < dates.length * visitsPerDay)) {
    ensure(hasDates, scheduleError, 'E_CONFIG');
    // Older orders can have a visit ID different from the current deterministic ID.
    const rows = await server.db.collection('visits').where({ parentOrderId: order._id }).limit(31).get();
    slots = rows.data.map(v => ({ id: v._id, date: v.date, seq: v.seq, amount: v.price }));
    ensure(prices.every(p => p && slots.some(v => v.date === p.date && v.seq === p.seq && v.amount === p.amount)),
      scheduleError, 'E_CONFIG');
  }
  ensure(slots.length >= 1 && slots.length <= 30, scheduleError, 'E_CONFIG');
  const schedule = slots.map(slot => {
    ensure(slot && [1, 2].includes(slot.seq) && Number.isSafeInteger(slot.amount) && slot.amount > 0,
      scheduleError, 'E_CONFIG');
    parseDate(slot.date);
    return { date: slot.date, seq: slot.seq, price: slot.amount,
      id: slot.id || visitId(order._id, slot.date, slot.seq) };
  });
  const keys = new Set(schedule.map(v => v.date + '/' + v.seq));
  ensure(keys.size === schedule.length && new Set(schedule.map(v => v.id)).size === schedule.length,
    scheduleError, 'E_CONFIG');
  if (hasDates) {
    ensure(schedule.length === dates.length * visitsPerDay && schedule.every(v => dates.includes(v.date) &&
      v.seq <= visitsPerDay), scheduleError, 'E_CONFIG');
  }
  return schedule;
}

function checkAssignment(current, order, provider) {
  sameSnapshot(current, order, ['communityId', 'serviceCode', 'petVisitPrices', 'detail']);
  ensure(current.status === 'in_service', '订单状态已变化，请刷新后重试', 'E_CONFLICT');
  ensure(current.providerId === provider._id && current.providerOpenid === provider.openid,
    '无权操作该订单', 'E_FORBIDDEN');
}

async function settleVisit(transaction, order, provider, visit, schedule, patch) {
  const current = await read(transaction, 'orders', order._id);
  checkAssignment(current, order, provider);
  const account = await read(transaction, 'providers', provider._id);
  requireApprovedProvider(account, 2);
  ensure(account.openid === provider.openid, '服务员身份已变化', 'E_FORBIDDEN');
  const rows = await Promise.all(schedule.map(slot => read(transaction, 'visits', slot.id)));
  let target;
  let pending = 0;
  rows.forEach((row, i) => {
    const slot = schedule[i];
    ensure(row && row.parentOrderId === order._id && row.date === slot.date && row.seq === slot.seq &&
      row.price === slot.price && ['pending', 'done', 'missed'].includes(row.status), scheduleError, 'E_CONFIG');
    if (row._id === visit._id) target = row;
    if (row.status === 'pending') pending++;
  });
  ensure(target, scheduleError, 'E_CONFIG');
  ensure(target.status === 'pending', '该次上门已处理', 'E_CONFLICT');
  ensure(target.date === ymd(now()), '只能在服务日期处理本次上门', 'E_FORBIDDEN');
  ensure(target.price === visit.price, scheduleError, 'E_CONFIG');
  const delivered = pending === 1;
  await transaction.collection('visits').doc(target._id).update({ data: patch });
  // Every visit writes the same parent so concurrent submissions cannot both miss the last visit.
  const at = now();
  const progress = { petPendingVisits: pending - 1, updatedAt: at };
  if (delivered) Object.assign(progress, transitionPatch(current, 'delivered', provider.openid, at), { deliveredAt: at });
  await transaction.collection('orders').doc(order._id).update({ data: progress });
  return delivered;
}

async function revealEntry(event, { openid }) {
  const { order, provider } = await assignedOrder(event, openid);
  const visit = await child(event, order);
  revealAllowed(order, visit, provider, openid, now());
  const secret = await server.get('secrets', 's_' + order._id);
  ensure(secret, '门锁信息已删除或未设置');
  const password = revealSecret(secret, process.env.SECRET_KEY);
  await server.db.collection('auditLogs').add({ data: { action: 'pet_entry_reveal', actorOpenid: openid,
    orderId: order._id, visitId: visit._id, at: now() } });
  return { entry: password };
}

async function listVisits(event, { openid, user }) {
  text(event.orderId, '订单');
  const order = await server.get('orders', event.orderId);
  ensure(order && order.serviceCode === 'pet', '喂宠订单不存在');
  const provider = await server.one('providers', { openid });
  const resident = order.userOpenid === openid;
  const assigned = provider && order.providerId === provider._id && order.providerOpenid === openid;
  ensure(resident || assigned || user.roles.includes('admin'), '无权查看上门记录', 'E_FORBIDDEN');
  const result = await server.db.collection('visits').where({ parentOrderId: order._id }).orderBy('date', 'asc').orderBy('seq', 'asc').get();
  const list = result.data.map(item => ({ _id: item._id, date: item.date, seq: item.seq, status: item.status,
    photos: item.photos || [], videoFileId: item.videoFileId || '', doneAt: item.doneAt || null }));
  return { list, status: order.status, entryMode: order.detail.entry };
}

async function markDone(event, { openid }) {
  const { order, provider } = await assignedOrder(event, openid);
  ensure(order.status === 'in_service', '请先开始服务');
  const visit = await child(event, order);
  ensure(visit.status === 'pending', '该次上门已处理', 'E_CONFLICT');
  ensure(visit.date === ymd(now()), '只能在服务日期提交本次上门结果', 'E_FORBIDDEN');
  const { photos, videoFileId } = cleanVisitResult(event, order);
  const schedule = await visitSchedule(order);
  const delivered = await atomic(server.db, transaction => settleVisit(transaction, order, provider, visit, schedule,
    { status: 'done', photos, videoFileId, doneAt: now(), providerId: provider._id }));
  if (delivered) await notify.resident('delivered', { ...order, status: 'delivered' });
  return { visitId: visit._id, status: 'done', parentStatus: delivered ? 'delivered' : 'in_service' };
}

async function markMissed(event, { openid }) {
  const { order, provider } = await assignedOrder(event, openid);
  ensure(order.status === 'in_service', '订单未进入服务中');
  const visit = await child(event, order);
  ensure(visit.status === 'pending', '该次上门已处理', 'E_CONFLICT');
  ensure(visit.date === ymd(now()), '只能在服务日期标记本次上门漏次', 'E_FORBIDDEN');
  const reason = text(event.reason || '未完成本次上门服务', '漏次原因', 200).trim();
  const parts = { service: visit.price, goods: 0 };
  const schedule = await visitSchedule(order);
  let delivered;
  const recordMissed = async transaction => {
    delivered = await settleVisit(transaction, order, provider, visit, schedule,
      { status: 'missed', missedAt: now(), reason, providerId: provider._id });
  };
  const result = await payments.requestRefund(order, visit.price, '喂宠服务漏次退款：' + reason,
    { key: 'pet_visit_' + visit._id, actor: openid, parts, validateCurrent: current => checkAssignment(current, order, provider), afterWrite: recordMissed });
  const refund = result.refunds.find(item => item.key === 'pet_visit_' + visit._id);
  // An existing refund skips afterWrite. Repair an older pending visit without reserving a second refund.
  if (refund && delivered === undefined) {
    await atomic(server.db, async transaction => {
      const current = await read(transaction, 'visits', visit._id);
      if (current && current.status === 'pending') await recordMissed(transaction);
    });
  }
  if (delivered) await notify.resident('delivered', { ...order, status: 'delivered' });
  return { visitId: visit._id, status: 'missed', refundStatus: refund.status };
}

exports.main = server.entry({ listVisits, revealEntry, markDone, markMissed }, ['resident','admin','provider'], 'pet');
