const { isEnabled } = require('./lib/shared/features');
const { codeEnvVersion } = require('./lib/shared/qrEnv');
const { fileInFolder } = require('./lib/shared/providerData');
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { createServer } = require('./lib/shared/server');
const { atomic, read, insert } = require('./lib/shared/transaction');
const { eventFields, signupId, signupOrderId, checkinCode, eventView } = require('./lib/shared/eventData');
const { activateEventSignup, releaseEventSignup, refundEventSignup } = require('./lib/shared/eventFlow');
const { createPayFlow } = require('./lib/shared/payFlow');
const { createNotifier } = require('./lib/shared/notify');
const { checkOrderContent } = require('./lib/shared/contentSafety');
const { requestMediaCheck, visibleImages } = require('./lib/shared/ugc');
const { orderNo } = require('./lib/shared/ids');
const { totalFee } = require('./lib/shared/paymentState');
const { createEventCancellationWorker } = require('./lib/shared/eventCancellation');
const { ensure, integer, text } = require('./lib/shared/validate');
const { requireRole } = require('./lib/shared/auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const { db, command } = server;
const payments = createPayFlow(cloud, server);
const notify = createNotifier(cloud, server);
const cancellation = createEventCancellationWorker(server, payments);

function viewFor(event, user, signup = null) {
  const result = eventView({ ...event, images: visibleImages(event, user.openid, event.ownerOpenid) }, signup);
  if (!user.roles.includes('admin')) result.sponsors = (result.sponsors || []).map(({ name, amount, note }) => ({ name, amount, note }));
  return result;
}

async function enabled(communityId) { return server.feature('events', communityId); }

function creationId(requestId, openid) {
  text(requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(requestId), '请求编号不正确');
  return 'ev_' + crypto.createHash('sha256').update(openid + ':' + requestId).digest('hex').slice(0, 40);
}

function reviewPending(item) {
  return !!item.reviewRequestedAt && (!item.reviewedAt || new Date(item.reviewRequestedAt) > new Date(item.reviewedAt));
}

function creationResult(item) {
  return { eventId: item._id, status: item.status, reviewRequired: reviewPending(item) };
}

async function lookupCreation(event, { user, openid }) {
  requireRole(user, ['admin', 'property', 'merchant']);
  const item = await server.get('events', creationId(event.requestId, openid));
  if (!item) return { eventId: null };
  ensure(item.ownerOpenid === openid, '无权读取该提交结果', 'E_FORBIDDEN');
  return creationResult(item);
}

async function currentOrganizer(transaction, user) {
  const current = await read(transaction, 'users', user._id);
  requireRole(current, ['admin', 'property', 'merchant']);
  ensure(current.openid === user.openid && !current.blocked &&
    ['roles', 'communityId', 'merchantId'].every(key => JSON.stringify(current[key] || null) === JSON.stringify(user[key] || null)),
  '活动管理身份已变化，请重新读取', 'E_FORBIDDEN');
}

async function list(event, { user }) {
  requireRole(user, ['resident', 'admin', 'property', 'merchant']);
  if (!event.communityId && !user.communityId) await server.featureEntry('events', user);
  const communityId = text(event.communityId || user.communityId, '小区');
  if (!user.roles.includes('admin')) ensure(communityId === user.communityId, '无权查看其他小区活动', 'E_FORBIDDEN');
  await enabled(communityId);
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const filter = { status: 'published', communityIds: command.in([communityId]) };
  if (!user.roles.includes('admin')) filter.moderationHidden = command.neq(true);
  const rows = await db.collection('events').where(filter)
    .orderBy('startAt', 'asc').skip(offset).limit(20).get();
  const ids = rows.data.map(item => signupId(item._id, user.openid));
  const signups = await Promise.all(ids.map(async id => read(db, 'signups', id)));
  return { list: rows.data.map((item, index) => viewFor(item, user, signups[index])), hasMore: rows.data.length === 20 };
}

async function detail(event, { user }) {
  text(event.eventId, '活动');
  const item = await server.get('events', event.eventId);
  ensure(item && item.communityIds.includes(user.communityId) &&
    (!item.moderationHidden || item.ownerOpenid === user.openid || user.roles.includes('admin')) &&
    (item.status !== 'draft' || item.ownerOpenid === user.openid || user.roles.includes('admin')),
    '活动不存在', 'E_FORBIDDEN');
  let signup = await read(db, 'signups', signupId(item._id, user.openid));
  const [settings, community] = await Promise.all([server.config(), server.get('communities', user.communityId)]);
  const featureEnabled = isEnabled('events', settings, community);
  const envVersion = codeEnvVersion();
  if (!signup) ensure(featureEnabled, '该功能暂未开放', 'E_FEATURE_OFF');
  if (featureEnabled && signup && signup.status === 'signed' &&
      (!signup.checkinQrFileId || signup.checkinQrEnvVersion !== envVersion)) {
    try {
      const qr = await cloud.openapi.wxacode.getUnlimited({ scene: 'e=' + signup.checkinCode,
        page: 'events/detail/detail', checkPath: false, envVersion, width: 430 });
      ensure(qr && qr.buffer, '签到码生成失败', 'E_INTERNAL');
      const file = await cloud.uploadFile({ cloudPath: 'events/checkin/' + signup._id + '/' + envVersion + '-' + Date.now() + '.png', fileContent: qr.buffer });
      await db.collection('signups').where({ _id: signup._id, status: 'signed',
        checkinQrFileId: signup.checkinQrFileId || null })
        .update({ data: { checkinQrFileId: file.fileID, checkinQrEnvVersion: envVersion, updatedAt: new Date() } });
      signup = await server.get('signups', signup._id);
    } catch (error) { console.error('活动签到码生成失败', signup._id, error.code || 'E_INTERNAL'); }
  }
  if (featureEnabled && signup && signup.status === 'signed' && signup.checkinQrFileId) {
    const urls = await cloud.getTempFileURL({ fileList: [signup.checkinQrFileId] });
    signup = { ...signup, checkinQrUrl: urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL || null };
  }
  const result = viewFor(item, user, signup);
  return { ...result, featureEnabled, canSignup: featureEnabled && result.canSignup };
}

async function create(event, { user, openid }) {
  requireRole(user, ['admin', 'property', 'merchant']);
  const id = event.requestId === undefined ? 'ev_' + crypto.randomBytes(16).toString('hex') : creationId(event.requestId, openid);
  const prior = await server.get('events', id);
  let organizerType, organizerId;
  if (user.roles.includes('admin')) { organizerType = 'platform'; organizerId = null; }
  else if (user.roles.includes('property')) { organizerType = 'property'; organizerId = user.communityId; }
  else { organizerType = 'merchant'; organizerId = user.merchantId; ensure(organizerId, '商家账号未关联商家'); }
  const fields = eventFields({ ...event, organizerType, organizerId, status: 'draft' }, prior ? new Date(0) : new Date());
  const creationHash = crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  const match = item => {
    ensure(item.ownerOpenid === openid && item.creationHash === creationHash, '请求编号已用于不同的活动资料', 'E_CONFLICT');
    return creationResult(item);
  };
  if (prior) return match(prior);
  fields.images.forEach(file => fileInFolder(file, 'events/' + user._id));
  ensure(organizerType === 'platform' || fields.sponsors.length === 0, '赞助信息由平台管理员录入', 'E_FORBIDDEN');
  ensure(fields.communityIds.length === 1 || fields.sponsors.length === 0, '跨小区赞助的账目归属尚未配置', 'E_INVALID_PARAM');
  if (organizerType !== 'platform') ensure(fields.communityIds.length === 1 && fields.communityIds[0] === user.communityId,
    '只能在所属小区创建活动', 'E_FORBIDDEN');
  if (organizerType === 'merchant') ensure(fields.type === 'interest', '商家只能创建兴趣活动', 'E_FORBIDDEN');
  if (!user.roles.includes('admin') || fields.sponsors.some(item => item.amount > 0)) {
    for (const communityId of fields.communityIds) await enabled(communityId);
  }
  await checkOrderContent(cloud, openid, '', { desc: fields.title + ' ' + fields.desc }, (await server.config()).blacklist);
  const now = new Date();
  const eventRecord = { ...fields, _id: id, creationHash, ownerOpenid: openid, signupCount: 0, reservedCount: 0,
    moderationHidden: false, moderationApprovedFileIds: [], moderationPendingFileIds: fields.images.slice(), createdAt: now, updatedAt: now };
  const result = await atomic(db, async transaction => {
    const existing = await read(transaction, 'events', id);
    if (existing) return { ...match(existing), duplicate: true };
    await currentOrganizer(transaction, user);
    await insert(transaction, 'events', eventRecord);
    for (let index = 0; index < fields.sponsors.length; index++) {
      const sponsor = fields.sponsors[index];
      if (!sponsor.amount) continue;
      await insert(transaction, 'ledger', { _id: 'sponsor_' + id + '_' + index, refType: 'sponsorship', refId: id,
        communityId: fields.communityIds[0], providerId: null, merchantId: sponsor.merchantId,
        amounts: { provider: 0, property: 0, platform: sponsor.amount, goods: 0, merchant: 0 },
        settled: { provider: true, property: true, merchant: true },
        settlementIds: { provider: null, property: null, merchant: null }, createdAt: now });
    }
    return creationResult(eventRecord);
  });
  if (!result.duplicate) for (const fileId of fields.images) await requestMediaCheck(cloud, db, { fileId, targetType: 'event', targetId: id,
    authorOpenid: openid, communityId: fields.communityIds[0] });
  return result;
}

async function update(event, { user, openid }) {
  requireRole(user, ['admin', 'property', 'merchant']); text(event.eventId, '活动');
  const current = await server.get('events', event.eventId);
  ensure(current && current.status === 'draft', '只有草稿活动可以修改');
  ensure(user.roles.includes('admin') || current.ownerOpenid === openid, '无权修改该活动', 'E_FORBIDDEN');
  const fields = eventFields({ ...current, ...event, organizerType: current.organizerType,
    organizerId: current.organizerId, status: 'draft' });
  if (!user.roles.includes('admin')) ensure(fields.communityIds.length === 1 && fields.communityIds[0] === user.communityId &&
    fields.sponsors.length === 0, '只能管理所属小区活动，赞助信息由平台管理员录入', 'E_FORBIDDEN');
  if (current.organizerType === 'merchant') ensure(fields.type === 'interest', '商家只能创建兴趣活动', 'E_FORBIDDEN');
  if (!user.roles.includes('admin')) for (const communityId of fields.communityIds) await enabled(communityId);
  await checkOrderContent(cloud, openid, '', { desc: fields.title + ' ' + fields.desc }, (await server.config()).blacklist);
  const imagesChanged = JSON.stringify(current.images || []) !== JSON.stringify(fields.images);
  const mediaOwnerOpenid = imagesChanged ? openid : current.mediaOwnerOpenid || current.ownerOpenid;
  const mediaOwner = imagesChanged ? user : await server.one('users', { openid: mediaOwnerOpenid });
  ensure(mediaOwner, '图片归属无法确认，请重新上传');
  fields.images.forEach(file => fileInFolder(file, 'events/' + mediaOwner._id));
  await atomic(db, async transaction => {
    const fresh = await read(transaction, 'events', current._id);
    ensure(fresh && fresh.status === 'draft' && fresh.ownerOpenid === current.ownerOpenid, '活动状态已变化', 'E_CONFLICT');
    await transaction.collection('events').doc(fresh._id).update({ data: { ...fields, mediaOwnerOpenid,
      reviewRequestedAt: null, moderationApprovedFileIds: imagesChanged ? [] : fresh.moderationApprovedFileIds || [],
      moderationPendingFileIds: imagesChanged ? fields.images.slice() : fresh.moderationPendingFileIds || [], updatedAt: new Date() } });
  });
  if (imagesChanged) for (const fileId of fields.images) await requestMediaCheck(cloud, db, { fileId, targetType: 'event',
    targetId: current._id, authorOpenid: current.ownerOpenid, communityId: fields.communityIds[0] });
  return { eventId: current._id, status: 'draft' };
}

async function publish(event, { user, openid }) {
  requireRole(user, ['admin', 'property', 'merchant']);
  text(event.eventId, '活动');
  const initial = await server.get('events', event.eventId);
  ensure(initial && (user.roles.includes('admin') || initial.ownerOpenid === openid && initial.communityIds.includes(user.communityId)), '无权发布该活动', 'E_FORBIDDEN');
  if (initial.status === 'published' || initial.status === 'draft' && reviewPending(initial) && !user.roles.includes('admin')) return creationResult(initial);
  ensure(initial.status === 'draft', '活动不存在或已发布', 'E_CONFLICT');
  for (const communityId of initial.communityIds) await enabled(communityId);
  return atomic(db, async transaction => {
    const item = await read(transaction, 'events', event.eventId);
    await currentOrganizer(transaction, user);
    ensure(item, '活动不存在', 'E_CONFLICT');
    const isAdmin = user.roles.includes('admin');
    ensure(isAdmin || item.ownerOpenid === openid && item.communityIds.includes(user.communityId), '无权发布该活动', 'E_FORBIDDEN');
    ensure(isAdmin || item.organizerType === (user.roles.includes('merchant') ? 'merchant' : 'property'), '无权发布该活动', 'E_FORBIDDEN');
    if (item.status === 'published' || item.status === 'draft' && reviewPending(item) && !isAdmin) return creationResult(item);
    ensure(item.status === 'draft', '活动不存在或已发布', 'E_CONFLICT');
    if (!isAdmin) {
      await transaction.collection('events').doc(item._id).update({ data: { reviewRequestedAt: new Date(), updatedAt: new Date() } });
      return { eventId: item._id, status: 'draft', reviewRequired: true };
    }
    ensure(item.moderationPendingFileIds.length === 0, '活动图片仍在审核中');
    await transaction.collection('events').doc(item._id).update({ data: { status: 'published', publishedAt: new Date(), reviewedBy: openid, updatedAt: new Date() } });
    return { eventId: item._id, status: 'published' };
  });
}

async function review(event, { user, openid }) {
  requireRole(user, ['admin']);
  text(event.eventId, '活动');
  ensure(typeof event.approved === 'boolean', '请选择审核结果');
  const initial = await server.get('events', event.eventId);
  ensure(initial && initial.status === 'draft', '活动不存在或状态已变化', 'E_CONFLICT');
  for (const communityId of initial.communityIds) await enabled(communityId);
  return atomic(db, async transaction => {
    const item = await read(transaction, 'events', event.eventId);
    ensure(item && item.status === 'draft', '活动不存在或状态已变化', 'E_CONFLICT');
    if (event.approved) ensure(item.moderationPendingFileIds.length === 0, '活动图片仍在审核中');
    const status = event.approved ? 'published' : 'draft';
    await transaction.collection('events').doc(item._id).update({ data: { status, reviewNote: typeof event.note === 'string' ? event.note.slice(0, 200) : '',
      reviewedBy: openid, reviewedAt: new Date(), publishedAt: event.approved ? new Date() : null, updatedAt: new Date() } });
    return { eventId: item._id, status };
  });
}

async function signup(event, { user, openid }) {
  requireRole(user, ['resident']);
  text(event.eventId, '活动');
  const item = await server.get('events', event.eventId);
  ensure(item && item.status === 'published' && item.communityIds.includes(user.communityId), '活动不存在或暂不可报名');
  await enabled(user.communityId);
  const id = signupId(item._id, openid);
  const existing = await server.get('signups', id);
  if (existing && ['signed', 'checked_in'].includes(existing.status)) return { signupId: id, status: existing.status, duplicate: true };
  if (existing && existing.status === 'pending_pay') {
    const pendingOrder = await server.get('orders', existing.orderId);
    ensure(pendingOrder && pendingOrder.status === 'pending_pay', '报名订单状态异常，请联系客服', 'E_CONFIG');
    const payment = await payments.prepare(pendingOrder);
    return { signupId: id, orderId: pendingOrder._id, status: 'pending_pay', duplicate: true, ...payment };
  }
  const code = existing && existing.checkinCode || checkinCode();
  const now = new Date();
  ensure(item.signupDeadline > now && item.startAt > now, '活动报名已截止');
  const newOrderId = signupOrderId();
  const order = await atomic(db, async transaction => {
    const current = await read(transaction, 'events', item._id);
    ensure(current && current.status === 'published' && current.signupDeadline > now, '活动报名已截止', 'E_CONFLICT');
    const prior = await read(transaction, 'signups', id);
    ensure(!prior || ['cancelled', 'refunded'].includes(prior.status), '已经报名该活动', 'E_CONFLICT');
    const reserved = current.reservedCount || 0, count = current.signupCount || 0;
    ensure(count + reserved < current.capacity, '活动名额已满');
    const signupDoc = { _id: id, eventId: item._id, openid, people: 1, orderId: null,
      status: item.fee > 0 ? 'pending_pay' : 'signed', checkinCode: code, reminderSentAt: null, createdAt: now, updatedAt: now };
    let createdOrder = null;
    if (item.fee > 0) {
      const config = await read(transaction, 'config', 'global');
      ensure(config && ['mock', 'wechat'].includes(config.payMode), '支付配置不正确', 'E_CONFIG');
      const paymentMode = config.payMode;
      const orderNoValue = orderNo(now);
      createdOrder = { _id: newOrderId, orderNo: orderNoValue, kind: 'event_signup', serviceCode: 'event_signup',
        eventId: item._id, eventTitle: item.title, signupId: id, communityId: user.communityId, userId: user._id,
        userOpenid: openid, status: 'pending_pay', pricing: { listPrice: item.fee, discount: 0, payAmount: item.fee,
          goodsCap: 0, goodsActual: 0, freeByMembership: false }, payment: { mode: paymentMode, outTradeNo: orderNoValue,
          transactionId: null, paidAt: null }, refunds: [], timeline: [{ status: 'pending_pay', at: now, by: openid }],
        createdAt: now, updatedAt: now };
      signupDoc.orderId = newOrderId;
      await insert(transaction, 'orders', createdOrder);
      await transaction.collection('events').doc(item._id).update({ data: { reservedCount: reserved + 1, updatedAt: now } });
    } else {
      await transaction.collection('events').doc(item._id).update({ data: { signupCount: count + 1, updatedAt: now } });
    }
    if (prior) {
      const { _id, ...patch } = signupDoc;
      await transaction.collection('signups').doc(id).update({ data: patch });
    } else await insert(transaction, 'signups', signupDoc);
    return createdOrder;
  });
  if (!order) return { signupId: id, status: 'signed', checkinCode: code };
  const payment = await payments.prepare(order);
  return { signupId: id, orderId: order._id, status: 'pending_pay', ...payment };
}

async function cancelSignup(event, { openid }) {
  text(event.eventId, '活动');
  const id = signupId(event.eventId, openid);
  const signupItem = await server.get('signups', id);
  ensure(signupItem && ['pending_pay', 'signed'].includes(signupItem.status), '报名记录不存在或已结束');
  const item = await server.get('events', event.eventId);
  ensure(item && new Date() < item.signupDeadline, '报名截止后不能取消');
  if (signupItem.status === 'pending_pay') {
    const order = await server.get('orders', signupItem.orderId);
    ensure(order && order.userOpenid === openid, '报名订单不存在', 'E_CONFIG');
    await payments.closeUnpaid(order, openid);
    return { signupId: id, status: 'cancelled' };
  }
  const order = signupItem.orderId ? await server.get('orders', signupItem.orderId) : null;
  if (order && order.payment.paidAt && order.pricing.payAmount > 0) {
    await payments.requestRefund(order, totalFee(order), '活动截止前取消报名', { key: 'event_cancel_' + id,
      to: 'cancelled', actor: openid, afterWrite: (transaction, current) => refundEventSignup(transaction, current, new Date()) });
  } else {
    await atomic(db, async transaction => {
      const current = await read(transaction, 'signups', id);
      ensure(current && current.status === 'signed', '报名状态已变化', 'E_CONFLICT');
      const currentEvent = await read(transaction, 'events', item._id);
      await transaction.collection('signups').doc(id).update({ data: { status: 'cancelled', cancelledAt: new Date() } });
      await transaction.collection('events').doc(item._id).update({ data: { signupCount: Math.max(0, (currentEvent.signupCount || 0) - 1) } });
    });
  }
  return { signupId: id, status: 'cancelled' };
}

function managesActivity(user, item) {
  return item && (user.roles.includes('admin') || (item.ownerOpenid === user.openid &&
    user.communityId && Array.isArray(item.communityIds) && item.communityIds.includes(user.communityId)));
}

async function checkin(event, { user }) {
  requireRole(user, ['admin', 'property', 'merchant']);
  text(event.eventId, '活动'); text(event.checkinCode, '签到码');
  const item = await server.get('events', event.eventId);
  ensure(managesActivity(user, item), '无权为该活动签到', 'E_FORBIDDEN');
  await enabled(item.communityIds[0]);
  ensure(item.status === 'published', '活动未发布或已结束，不能签到', 'E_CONFLICT');
  const signupItem = await server.one('signups', { eventId: item._id, checkinCode: event.checkinCode });
  ensure(signupItem && signupItem.status === 'signed', '签到码无效或已签到', 'E_CONFLICT');
  return atomic(db, async transaction => {
    const currentEvent = await read(transaction, 'events', item._id);
    const operator = await read(transaction, 'users', user._id);
    requireRole(operator, ['admin', 'property', 'merchant']);
    ensure(operator.openid === user.openid && managesActivity(operator, currentEvent), '无权为该活动签到', 'E_FORBIDDEN');
    ensure(currentEvent.status === 'published', '活动状态已变化，不能签到', 'E_CONFLICT');
    const current = await read(transaction, 'signups', signupItem._id);
    ensure(current && current.eventId === item._id && current.checkinCode === event.checkinCode && current.status === 'signed',
      '签到码无效或报名状态已变化', 'E_CONFLICT');
    const revision = integer(currentEvent.checkinRevision === undefined ? 0 : currentEvent.checkinRevision,
      '签到版本', 0, Number.MAX_SAFE_INTEGER - 1);
    // Both check-in and cancellation write this event document, so they cannot commit from conflicting snapshots.
    await transaction.collection('events').doc(item._id).update({ data: { checkinRevision: revision + 1 } });
    await transaction.collection('signups').doc(current._id).update({ data: { status: 'checked_in', checkedInAt: new Date() } });
    return { signupId: current._id, status: 'checked_in' };
  });
}

async function listSignups(event, { user }) {
  requireRole(user, ['admin', 'property', 'merchant']); text(event.eventId, '活动');
  const item = await server.get('events', event.eventId);
  ensure(managesActivity(user, item), '无权查看报名名单', 'E_FORBIDDEN');
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const rows = await db.collection('signups').where({ eventId: item._id, status: command.in(['signed', 'checked_in']) })
    .orderBy('createdAt', 'asc').skip(offset).limit(50).get();
  return { list: rows.data.map(row => ({ signupId: row._id, people: row.people, status: row.status,
    checkinCode: row.checkinCode, createdAt: row.createdAt })), hasMore: rows.data.length === 50 };
}

async function templates(event, { user }) {
  await enabled(user.communityId);
  const config = await server.config();
  return { eventReminder: config.templateIds && config.templateIds.eventReminder || '' };
}

async function adminList(event, { user }) {
  requireRole(user, ['admin', 'property', 'merchant']);
  const communityId = text(event.communityId || user.communityId, '小区');
  if (!user.roles.includes('admin')) ensure(communityId === user.communityId, '无权查看其他小区活动', 'E_FORBIDDEN');
  if (!user.roles.includes('admin')) await enabled(communityId);
  const filter = { communityIds: command.in([communityId]) };
  if (!user.roles.includes('admin')) filter.ownerOpenid = user.openid;
  if (event.status) { ensure(['draft', 'published', 'ended', 'cancelled'].includes(event.status), '活动状态不正确'); filter.status = event.status; }
  const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
  const rows = await db.collection('events').where(filter).orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  const list = await Promise.all(rows.data.map(async item => {
    const jobId = item.cancelRefundJobId || ('event_cancel_' + item._id);
    const job = item.status === 'cancelled' ? await server.get('eventCancelJobs', jobId) : null;
    return { ...viewFor(item, user), reviewRequested: Boolean(item.reviewRequestedAt), cancelRefund: job ? {
      status: job.status, totalCount: job.totalCount || 0, completedCount: job.completedCount || 0,
      failedCount: job.failedCount || 0, retryCount: job.retryCount || 0
    } : null };
  }));
  return { list,
    hasMore: rows.data.length === 20 };
}

async function cancelEvent(event, { user, openid }) {
  requireRole(user, ['admin', 'property', 'merchant']); text(event.eventId, '活动');
  const item = await server.get('events', event.eventId);
  ensure(item && ['published', 'cancelled'].includes(item.status) &&
    (user.roles.includes('admin') || item.ownerOpenid === openid && item.communityIds.includes(user.communityId)), '无权取消该活动', 'E_FORBIDDEN');
  const now = new Date(), jobId = 'event_cancel_' + item._id;
  await atomic(db, async transaction => {
    const current = await read(transaction, 'events', item._id);
    ensure(current && ['published', 'cancelled'].includes(current.status) &&
      (user.roles.includes('admin') || current.ownerOpenid === openid && current.communityIds.includes(user.communityId)), '活动状态已变化', 'E_CONFLICT');
    const existing = await read(transaction, 'eventCancelJobs', jobId);
    if (!existing) await insert(transaction, 'eventCancelJobs', { _id: jobId, eventId: item._id,
      status: 'queued', scanCursor: null, scanComplete: false, completedCount: 0, failedCount: 0,
      retryCount: 0, createdAt: now, updatedAt: now });
    if (current.status === 'published') await transaction.collection('events').doc(item._id).update({ data: {
      status: 'cancelled', cancelledAt: now, cancelRefundJobId: jobId, updatedAt: now
    } });
    else if (!current.cancelRefundJobId) await transaction.collection('events').doc(item._id).update({ data: { cancelRefundJobId: jobId, updatedAt: now } });
  });
  const count = await db.collection('signups').where({ eventId: item._id, status: command.in(['pending_pay', 'signed']) }).count();
  const totalCount = count.total || 0;
  await atomic(db, async transaction => {
    const job = await read(transaction, 'eventCancelJobs', jobId);
    if (job && job.totalCount === undefined) await transaction.collection('eventCancelJobs').doc(jobId).update({ data: {
      totalCount, updatedAt: new Date()
    } });
  });
  const progress = await server.get('eventCancelJobs', jobId);
  return { eventId: item._id, status: 'cancelled', cancelRefund: {
    jobId, totalCount: progress && progress.totalCount !== undefined ? progress.totalCount : totalCount,
    status: progress && progress.status || 'queued'
  } };
}

async function retryCancellation(event, { user, openid }) {
  requireRole(user, ['admin', 'property', 'merchant']); text(event.eventId, '活动');
  const item = await server.get('events', event.eventId);
  ensure(item && item.status === 'cancelled' &&
    (user.roles.includes('admin') || item.ownerOpenid === openid && item.communityIds.includes(user.communityId)), '无权重试该活动退款', 'E_FORBIDDEN');
  return cancellation.retryFailed(item._id);
}

exports.main = server.entry({ list, detail, create, lookupCreation, update, publish, review, adminList, signup, cancelSignup, checkin, listSignups,
  templates, cancelEvent, retryCancellation },
  ['resident', 'admin', 'property', 'merchant'], 'event');
