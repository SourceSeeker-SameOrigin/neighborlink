const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { createServer } = require('./lib/shared/server');
const { atomic, read, insert, sameSnapshot } = require('./lib/shared/transaction');
const { newPost, TYPES, SCOPES, validateTaskSlot } = require('./lib/shared/boardData');
const { newOrder } = require('./lib/shared/orderData');
const { orderNo } = require('./lib/shared/ids');
const { totalFee } = require('./lib/shared/paymentState');
const { createPayFlow } = require('./lib/shared/payFlow');
const { payConfig } = require('./lib/shared/payConfig');
const { parseWindow } = require('./lib/shared/time');
const { requireRole } = require('./lib/shared/auth');
const { ensure, text, integer } = require('./lib/shared/validate');
const { isEnabled } = require('./lib/shared/features');
const { ensureCanPublish, checkText, visibleImages, report: reportData, reportOutcome,
  requestMediaCheck } = require('./lib/shared/ugc');
const { fileInFolder } = require('./lib/shared/providerData');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const { db, command } = server;
const COLLECTIONS = { post: 'posts', comment: 'comments' };
const payments = createPayFlow(cloud, server);

function offset(event) { return integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000); }
function postId(openid, requestId) {
  return 'bp_' + crypto.createHash('sha256').update(openid + ':' + requestId).digest('hex').slice(0, 36);
}
function commentId(postIdValue, openid, requestId) {
  return 'bc_' + crypto.createHash('sha256').update(postIdValue + ':' + openid + ':' + requestId).digest('hex').slice(0, 36);
}

async function communityContext(user, checkFeature = true) {
  if (checkFeature && !user.communityId) await server.feature('board');
  ensure(user.communityId, '请先绑定小区门牌');
  const community = await server.get('communities', user.communityId);
  ensure(community && community.status === 'active', '小区暂不可用');
  if (checkFeature) await server.feature('board', community._id);
  return community;
}

async function canViewPost(post, community) {
  if (post.communityId === community._id) return true;
  if (post.scope !== 'federation' || !isEnabled('federation', await server.config(), community)) return false;
  const source = await server.get('communities', post.communityId);
  return Boolean(source && source.federationGroupId && source.federationGroupId === community.federationGroupId &&
    isEnabled('federation', await server.config(), source));
}

function postView(post, openid, detail = false, sourceCommunityName = '') {
  const isAuthor = post.authorOpenid === openid;
  return { _id: post._id, type: post.type, communityId: post.communityId, scope: post.scope,
    title: post.title, content: detail || post.type !== 'ask' ? post.content : post.content.slice(0, 120),
    carry: post.carry || null, reward: post.reward || null, needEnterHome: post.needEnterHome === true,
    slot: post.slot || null, ...(isAuthor && post.orderId ? { orderId: post.orderId } : {}),
    status: post.status, commentsCount: post.commentsCount || 0,
    images: visibleImages(post, openid, post.authorOpenid), createdAt: post.createdAt, expireAt: post.expireAt,
    sourceCommunityName,
    authorUserId: isAuthor ? post.authorUserId : null, isAuthor };
}

async function list(event, { user, openid }) {
  const community = await communityContext(user);
  const type = event.type || 'ask';
  ensure(TYPES.includes(type), '帖子类型不正确');
  if (type === 'carry') await server.feature('travelCarry', community._id);
  const scope = event.scope || 'community';
  ensure(SCOPES.includes(scope), '内容范围不正确');
  let communityIds = [community._id];
  let communityNames = new Map([[community._id, community.name || '']]);
  if (scope === 'federation') {
    await server.feature('federation', community._id);
    ensure(type !== 'task', '悬赏任务只能在本小区发布');
    ensure(community.federationGroupId, '本小区尚未加入联合社区');
    const all = await server.all('communities', { federationGroupId: community.federationGroupId, status: 'active' });
    const config = await server.config();
    const enabled = all.filter(item => isEnabled('federation', config, item));
    communityIds = enabled.map(item => item._id);
    communityNames = new Map(enabled.map(item => [item._id, item.name || '']));
  }
  const pageOffset = offset(event);
  const result = await db.collection('posts').where({ communityId: command.in(communityIds), scope,
    type, status: 'open', expireAt: command.gt(new Date()) }).orderBy('createdAt', 'desc')
    .skip(pageOffset).limit(20).get();
  const taskPosts = result.data.filter(post => post.type === 'task' && post.orderId);
  const taskOrders = taskPosts.length ? await db.collection('orders').where({ _id: command.in(taskPosts.map(post => post.orderId)) }).get() : { data: [] };
  const orderById = new Map(taskOrders.data.map(order => [order._id, order]));
  const rows = [];
  for (const post of result.data) {
    if (post.moderationHidden && post.authorOpenid !== openid) continue;
    if (post.type === 'task' && (!orderById.has(post.orderId) || orderById.get(post.orderId).status !== 'paid')) continue;
    rows.push(postView(post, openid, false, post.communityId === community._id ? '' : communityNames.get(post.communityId) || ''));
  }
  return { list: rows, hasMore: result.data.length === 20, nextOffset: pageOffset + result.data.length };
}

async function detail(event, { user, openid }) {
  const community = await communityContext(user, false);
  text(event.postId, '帖子');
  let post = await server.get('posts', event.postId);
  ensure(post && await canViewPost(post, community), '内容不存在或不在可见范围', 'E_FORBIDDEN');
  if (post.type === 'task') {
    const order = await server.get('orders', post.orderId);
    ensure(order && (order.userOpenid === openid || ['paid', 'accepted', 'in_service', 'delivered', 'completed', 'disputed'].includes(order.status)),
      '悬赏任务尚未支付或已关闭', 'E_FORBIDDEN');
    post = { ...post, status: taskPostStatus(order, post) };
  }
  ensure(!post.moderationHidden || post.authorOpenid === openid || user.roles.includes('admin'), '内容正在审核中', 'E_FORBIDDEN');
  await server.feature('board', post.communityId);
  if (post.status === 'open' && post.expireAt && post.expireAt <= new Date() && ['ask', 'carry'].includes(post.type)) {
    await db.collection('posts').where({ _id: post._id, status: 'open' })
      .update({ data: { status: 'closed', updatedAt: new Date() } });
    post = { ...post, status: 'closed' };
  }
  if (post.type === 'carry') await server.feature('travelCarry', community._id);
  const comments = await readVisibleComments(post._id, openid, 0, 100);
  const source = post.communityId === community._id ? null : await server.get('communities', post.communityId);
  return { post: postView(post, openid, true, source && source.name || ''), comments: comments.list,
    commentsNextOffset: comments.nextOffset, commentsHasMore: comments.hasMore };
}

async function readVisibleComments(postIdValue, openid, start, wanted) {
  const list = [];
  let nextOffset = start;
  let hasMore = false;
  for (let batch = 0; batch < 5 && list.length < wanted; batch += 1) {
    const size = wanted === 100 ? 100 : 20;
    const rows = (await db.collection('comments').where({ postId: postIdValue, status: 'ok' })
      .orderBy('createdAt', 'asc').orderBy('_id', 'asc').skip(nextOffset).limit(size).get()).data || [];
    let consumed = 0;
    for (const item of rows) {
      consumed += 1;
      if (item.moderationHidden !== true) list.push({ _id: item._id, content: item.content,
        createdAt: item.createdAt, mine: item.authorOpenid === openid });
      if (list.length === wanted) break;
    }
    nextOffset += consumed;
    hasMore = consumed < rows.length || rows.length === size;
    if (!hasMore) break;
  }
  return { list, nextOffset, hasMore };
}

async function listComments(event, { user, openid }) {
  const community = await communityContext(user, false);
  text(event.postId, '帖子');
  const post = await server.get('posts', event.postId);
  ensure(post && await canViewPost(post, community) &&
    (!post.moderationHidden || post.authorOpenid === openid || user.roles.includes('admin')),
  '内容不存在或不在可见范围', 'E_FORBIDDEN');
  await server.feature('board', post.communityId);
  if (post.type === 'carry') await server.feature('travelCarry', community._id);
  if (post.type === 'task') {
    const order = await server.get('orders', post.orderId);
    ensure(order && (order.userOpenid === openid ||
      ['paid', 'accepted', 'in_service', 'delivered', 'completed', 'disputed'].includes(order.status)),
    '悬赏任务尚未支付或已关闭', 'E_FORBIDDEN');
  }
  return readVisibleComments(post._id, openid, offset(event), 20);
}

async function create(event, { user, openid }) {
  const community = await communityContext(user);
  ensureCanPublish(user);
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  ensure(TYPES.includes(event.type), '帖子类型不正确');
  if (event.type === 'task') {
    requireRole(user, ['resident']);
    ensure(event.scope === 'community', '悬赏任务只能发布在本小区');
  }
  if (event.type === 'carry') await server.feature('travelCarry', community._id);
  ensure(event.communityId === community._id, '请选择已绑定小区');
  ensure(SCOPES.includes(event.scope), '内容范围不正确');
  if (event.scope === 'federation') {
    await server.feature('federation', community._id);
    ensure(event.type !== 'task' && community.federationGroupId, '悬赏任务只能发布在本小区');
  }
  const config = await server.config();
  const title = await checkText(cloud, event.title, { blacklist: config.blacklist || [], type: 'post', openid });
  const content = await checkText(cloud, event.content, { blacklist: config.blacklist || [], type: 'post', openid });
  if (event.type === 'carry' && event.carry && event.carry.destinationType === 'overseas') {
    await checkText(cloud, event.carry.destination, { blacklist: config.carryBlacklist || [], type: 'post', openid });
  }
  if (event.type === 'task') return createTask(event, { user, openid, community, config, title, content });
  const id = postId(openid, event.requestId);
  const input = { ...event, title, content, carryBlacklist: config.carryBlacklist || [] };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ type: input.type, scope: input.scope,
    title, content, carry: input.carry || null, images: input.images || [] })).digest('hex');
  const post = await atomic(db, async transaction => {
    const existing = await read(transaction, 'posts', id);
    if (existing) {
      ensure(existing.authorOpenid === openid && existing.requestHash === requestHash,
        '请求编号已用于其他内容', 'E_CONFLICT');
      return existing;
    }
    const value = newPost({ id, user, community, input });
    value.requestHash = requestHash;
    value.images.forEach(fileId => fileInFolder(fileId, 'board/' + user._id));
    await insert(transaction, 'posts', value);
    return value;
  });
  const imageWarnings = [];
  for (const fileId of post.images) {
    try { await requestMediaCheck(cloud, db, { fileId, targetType: 'post', targetId: post._id,
      authorOpenid: openid, communityId: community._id }); }
    catch (_) { imageWarnings.push(fileId); }
  }
  return { postId: post._id, status: post.status, imageWarnings };
}

async function lookupRequest(event, { user, openid }) {
  text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  const post = await server.get('posts', postId(openid, event.requestId));
  if (!post) return { postId: null, orderId: null };
  ensure(post.authorOpenid === openid && post.communityId === user.communityId,
    '无权查看此发布结果', 'E_FORBIDDEN');
  return { postId: post._id, orderId: post.orderId || null, type: post.type };
}

async function lookupComment(event, { user, openid }) {
  text(event.postId, '帖子'); text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  const existing = await server.get('comments', commentId(event.postId, openid, event.requestId));
  if (!existing) return { commentId: null };
  ensure(existing.authorOpenid === openid && existing.postId === event.postId &&
    existing.communityId === user.communityId, '无权查看此评论结果', 'E_FORBIDDEN');
  return { commentId: existing._id, status: existing.status };
}

function taskPostStatus(order, post = null) {
  if (post && post.expireAt <= new Date()) return 'closed';
  if (order.status === 'pending_pay') return 'pending_pay';
  if (order.status === 'paid') return 'open';
  if (['accepted', 'in_service', 'delivered', 'disputed'].includes(order.status)) return 'taken';
  if (order.status === 'completed') return 'done';
  return 'closed';
}

async function createTask(event, { user, openid, community, config, title, content }) {
  const reward = integer(event.reward, '悬赏金额', 300, Number.MAX_SAFE_INTEGER);
  payConfig(config.payMode);
  ensure(typeof event.needEnterHome === 'boolean', '请选择是否需要进入家中');
  ensure(Array.isArray(event.images || []), '图片列表不正确');
  const slot = validateTaskSlot(event.slot, community.dutyWindows, new Date());
  const building = await server.get('buildings', user.buildingId);
  ensure(building && building.communityId === community._id, '请重新绑定本小区门牌');
  const id = postId(openid, event.requestId);
  const orderId = 'o_' + crypto.createHash('sha256').update('board-task:' + id).digest('hex').slice(0, 40);
  const input = { ...event, type: 'task', scope: 'community', title, content, reward, slot, orderId };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ communityId: community._id,
    type: input.type, scope: input.scope,
    title, content, reward, needEnterHome: input.needEnterHome, slot, images: input.images || [] })).digest('hex');
  const saved = await atomic(db, async transaction => {
    const existing = await read(transaction, 'posts', id);
    if (existing) {
      ensure(existing.authorOpenid === openid && existing.requestHash === requestHash,
        '请求编号已用于其他内容', 'E_CONFLICT');
      const existingOrder = await read(transaction, 'orders', existing.orderId);
      ensure(existingOrder, '悬赏订单缺失，请联系管理员', 'E_CONFIG');
      return { post: existing, order: existingOrder };
    }
    const currentUser = await read(transaction, 'users', user._id);
    sameSnapshot(currentUser, user, ['orderRevision', 'communityId', 'buildingId', 'unit', 'room', 'phone', 'blocked', 'mutedUntil']);
    ensureCanPublish(currentUser, new Date());
    const currentCommunity = await read(transaction, 'communities', community._id);
    sameSnapshot(currentCommunity, community, ['status', 'features', 'dutyWindows', 'rates']);
    const currentConfig = await read(transaction, 'config', 'global');
    sameSnapshot(currentConfig, config, ['features', 'payMode', 'blacklist', 'carryBlacklist']);
    ensure(isEnabled('board', currentConfig, currentCommunity), '该功能暂未开放', 'E_FEATURE_OFF');
    const currentBuilding = await read(transaction, 'buildings', building._id);
    sameSnapshot(currentBuilding, building, ['communityId', 'name', 'units']);
    const now = new Date();
    validateTaskSlot(slot, currentCommunity.dutyWindows, now);
    const post = newPost({ id, user: currentUser, community: currentCommunity, input, now });
    post.requestHash = requestHash;
    post.images.forEach(fileId => fileInFolder(fileId, 'board/' + user._id));
    const order = newOrder({ id: orderId, orderNo: orderNo(now), user: currentUser, community: currentCommunity,
      building: currentBuilding, serviceCode: 'custom', detail: { title, desc: content, needEnterHome: input.needEnterHome },
      note: '', slot, pricing: { listPrice: reward, discount: 0, payAmount: reward, goodsCap: 0,
        goodsActual: 0, freeByMembership: false }, now, minLevel: input.needEnterHome ? 2 : 1, taskPostId: id });
    order.userId = currentUser._id;
    order.requestHash = requestHash;
    order.rateSnapshot = currentCommunity.rates;
    order.payment.mode = config.payMode;
    await insert(transaction, 'posts', post);
    await insert(transaction, 'orders', order);
    await transaction.collection('users').doc(user._id).update({ data: { orderRevision: (currentUser.orderRevision || 0) + 1 } });
    return { post, order };
  });
  const imageWarnings = [];
  for (const fileId of saved.post.images || []) {
    try { await requestMediaCheck(cloud, db, { fileId, targetType: 'post', targetId: saved.post._id,
      authorOpenid: openid, communityId: community._id }); }
    catch (_) { imageWarnings.push(fileId); }
  }
  const latestPost = await server.get('posts', saved.post._id);
  if (!latestPost || latestPost.moderationHidden || latestPost.expireAt <= new Date() ||
      parseWindow(saved.order.slot).endAt <= new Date()) {
    return { postId: saved.post._id, orderId: saved.order._id, paymentError: 'E_BAD_STATE', imageWarnings };
  }
  try {
    return { postId: saved.post._id, orderId: saved.order._id, payment: await payments.prepare(saved.order), imageWarnings };
  } catch (error) {
    return { postId: saved.post._id, orderId: saved.order._id, paymentError: error.code || 'E_PAYMENT', imageWarnings };
  }
}

async function comment(event, { user, openid }) {
  const community = await communityContext(user, false);
  text(event.postId, '帖子'); text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(event.requestId), '请求编号不正确');
  text(event.content, '评论内容', 2000);
  const id = commentId(event.postId, openid, event.requestId);
  const previous = await server.get('comments', id);
  if (previous) {
    ensure(previous.authorOpenid === openid && previous.postId === event.postId &&
      previous.communityId === community._id && previous.content === event.content.trim(),
    '请求编号已用于其他评论', 'E_CONFLICT');
    return { commentId: id, duplicate: true };
  }
  ensureCanPublish(user);
  const post = await server.get('posts', event.postId);
  ensure(post && post.status === 'open' && await canViewPost(post, community), '帖子已关闭或无权评论', 'E_FORBIDDEN');
  ensure(!post.moderationHidden, '内容正在审核中', 'E_FORBIDDEN');
  await server.feature('board', post.communityId);
  if (post.type === 'task') {
    const order = await server.get('orders', post.orderId);
    ensure(order && taskPostStatus(order, post) === 'open', '该悬赏任务当前不能评论', 'E_BAD_STATE');
  }
  const config = await server.config();
  const content = await checkText(cloud, event.content, { blacklist: config.blacklist || [], type: 'comment', openid });
  return atomic(db, async transaction => {
    const existing = await read(transaction, 'comments', id);
    if (existing) {
      ensure(existing.authorOpenid === openid && existing.content === content, '请求编号已用于其他评论', 'E_CONFLICT');
      return { commentId: id, duplicate: true };
    }
    const current = await read(transaction, 'posts', post._id);
    ensure(current && current.status === 'open' && !current.moderationHidden && current.expireAt > new Date(),
      '帖子已关闭、过期或隐藏', 'E_CONFLICT');
    if (current.type === 'task') {
      const order = await read(transaction, 'orders', current.orderId);
      ensure(order && taskPostStatus(order, current) === 'open', '该悬赏任务当前不能评论', 'E_CONFLICT');
    }
    await insert(transaction, 'comments', { _id: id, postId: post._id, communityId: post.communityId,
      authorOpenid: openid, content, status: 'ok', createdAt: new Date() });
    await transaction.collection('posts').doc(post._id).update({ data: { commentsCount: command.inc(1), updatedAt: new Date() } });
    return { commentId: id, duplicate: false };
  });
}

async function close(event, { user, openid }) {
  const community = await communityContext(user, false);
  text(event.postId, '帖子');
  const post = await server.get('posts', event.postId);
  ensure(post && post.communityId === community._id && post.authorOpenid === openid, '无权关闭此内容', 'E_FORBIDDEN');
  if (post.type !== 'task') await server.feature('board', post.communityId);
  if (post.type === 'task') {
    const order = await server.get('orders', post.orderId);
    ensure(order && order.userOpenid === openid && ['pending_pay', 'paid'].includes(order.status),
      '该悬赏任务当前不能关闭', 'E_BAD_STATE');
    if (order.status === 'pending_pay') await payments.closeUnpaid(order, openid);
    else await payments.requestRefund(order, totalFee(order), '住户关闭悬赏任务',
      { key: 'board_task_close', to: 'cancelled', actor: openid });
    return { postId: post._id, status: 'closed' };
  }
  return atomic(db, async transaction => {
    const post = await read(transaction, 'posts', event.postId);
    ensure(post && post.communityId === community._id && post.authorOpenid === openid, '无权关闭此内容', 'E_FORBIDDEN');
    ensure(['ask', 'carry'].includes(post.type) && post.status === 'open', '该内容当前不能关闭', 'E_BAD_STATE');
    await transaction.collection('posts').doc(post._id).update({ data: { status: 'closed', updatedAt: new Date() } });
    return { postId: post._id, status: 'closed' };
  });
}

async function report(event, { user, openid }) {
  const community = await communityContext(user, false);
  const targetType = event.targetType || 'post';
  ensure(['post', 'comment'].includes(targetType), '举报对象不正确');
  const collection = COLLECTIONS[targetType];
  text(event.targetId, '举报内容');
  const target = await server.get(collection, event.targetId);
  let parentPost = targetType === 'post' ? target : target && await server.get('posts', target.postId);
  ensure(target && parentPost && await canViewPost(parentPost, community), '内容不存在或不在可见范围', 'E_FORBIDDEN');
  await server.feature('board', parentPost.communityId);
  ensure(target.authorOpenid !== openid, '不能举报自己的内容');
  const id = 'r_' + crypto.createHash('sha256').update(targetType + ':' + target._id + ':' + openid).digest('hex').slice(0, 36);
  const record = reportData(targetType, target._id, openid, event.reason, event.text || '');
  return atomic(db, async transaction => {
    if (await read(transaction, 'reports', id)) return { reportId: id, duplicate: true };
    const current = await read(transaction, collection, target._id);
    ensure(current, '内容已删除', 'E_CONFLICT');
    const reporters = [...new Set([...(current.reporterOpenids || []), openid])].slice(0, 3);
    const hidden = reportOutcome(reporters.map(reporterOpenid => ({ reporterOpenid }))).hide;
    await insert(transaction, 'reports', { _id: id, ...record, communityId: target.communityId });
    await transaction.collection(collection).doc(target._id).update({ data: { reporterOpenids: reporters,
      ...(hidden ? targetType === 'post' ? { moderationHidden: true } : { status: 'hidden' } : {}) } });
    return { reportId: id, duplicate: false, hidden };
  });
}

exports.main = server.entry({ list, detail, listComments, create, lookupRequest, lookupComment, comment, close, report }, ['resident', 'admin', 'property'], 'board');
