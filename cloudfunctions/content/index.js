const { reportAccess, contentOwner } = require('./lib/shared/reportAccess');
const { fileInFolder } = require('./lib/shared/providerData');
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { createServer } = require('./lib/shared/server');
const { report: reportData, reportOutcome, contentInCommunity } = require('./lib/shared/ugc');
const { atomic, read, insert } = require('./lib/shared/transaction');
const { confirmAdReceived } = require('./lib/shared/adRevenue');
const { requireRole } = require('./lib/shared/auth');
const { ensure, text, integer } = require('./lib/shared/validate');
const { checkText, ensureCanPublish, requestMediaCheck } = require('./lib/shared/ugc');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const COLLECTIONS = { post: 'posts', comment: 'comments', idle: 'idleItems', event: 'events', message: 'messages', merchant: 'merchants' };

async function updateMessagePreview(transaction, message, hidden) {
  const conversation = await read(transaction, 'conversations', message.convId);
  if (!conversation) return;
  const lastId = conversation._id + '_' + String(conversation.messageSeq || 0).padStart(12, '0');
  if (lastId !== message._id) return;
  const preview = hidden ? '消息已隐藏，等待审核' : message.type === 'text' ? message.content.slice(0, 100) : message.status === 'ok' ? '[图片]' : message.status === 'pending' ? '图片审核中' : '图片未通过审核';
  await transaction.collection('conversations').doc(conversation._id).update({ data: { lastMessage: preview } });
}

async function report(event, { user, openid }) {
  const collection = COLLECTIONS[event.targetType];
  ensure(collection, '暂不支持举报该内容');
  text(event.targetId, '举报内容');
  const target = await server.get(collection, event.targetId);
  const communityId = await reportAccess(event.targetType, target, { user, openid }, server);
  const id = 'r_' + crypto.createHash('sha256').update(event.targetType + ':' + event.targetId + ':' + openid).digest('hex').slice(0, 36);
  const record = reportData(event.targetType, event.targetId, openid, event.reason, event.text || '');
  return atomic(server.db, async transaction => {
    const existing = await read(transaction, 'reports', id);
    if (existing) return { reportId: id, duplicate: true, hidden: Boolean(target.moderationHidden) };
    const current = await read(transaction, collection, event.targetId);
    ensure(current && contentOwner(current) === contentOwner(target), '内容已删除或归属变化', 'E_CONFLICT');
    // 只需记录达到隐藏门槛的三名不同举报人，避免高频举报无限扩大文档。
    const reporters = [...new Set([...(current.reporterOpenids || []), openid])].slice(0, 3);
    const hidden = reportOutcome(reporters.map(reporterOpenid => ({ reporterOpenid }))).hide;
    await insert(transaction, 'reports', { _id: id, ...record, communityId });
    await transaction.collection(collection).doc(event.targetId).update({ data: { reporterOpenids: reporters,
      ...(hidden ? { moderationHidden: true } : {}) } });
    if (hidden && event.targetType === 'message') await updateMessagePreview(transaction, current, true);
    return { reportId: id, duplicate: false, hidden };
  });
}

async function listReports(event, { user }) {
  requireRole(user, ['admin']);
  const status = event.status || 'pending';
  ensure(['pending','upheld','dismissed'].includes(status), '审核状态不正确');
  const offset = integer(event.offset || 0, '分页位置', 0, 100000);
  const result = await server.db.collection('reports').where({ status }).orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  const list = await Promise.all(result.data.map(async item => {
    const collection = COLLECTIONS[item.targetType];
    const target = collection ? await server.get(collection, item.targetId) : null;
    const authorOpenid = contentOwner(target);
    const author = authorOpenid ? await server.one('users', { openid: authorOpenid }) : null;
    return { _id: item._id, targetType: item.targetType, targetId: item.targetId, communityId: item.communityId,
      reason: item.reason, text: item.text, status: item.status, createdAt: item.createdAt,
      hidden: Boolean(target && target.moderationHidden), authorUserId: author && author._id || null };
  }));
  return { list, hasMore: result.data.length === 20 };
}

async function resolveReport(event, { user, openid }) {
  requireRole(user, ['admin']); text(event.reportId, '举报记录');
  ensure(['upheld','dismissed'].includes(event.status), '请选择成立或驳回');
  return atomic(server.db, async transaction => {
    const item = await read(transaction, 'reports', event.reportId);
    ensure(item && item.status === 'pending', '举报已处理或不存在', 'E_CONFLICT');
    await transaction.collection('reports').doc(item._id).update({ data: { status: event.status, handledBy: openid,
      handledAt: new Date(), note: typeof event.note === 'string' ? event.note.slice(0,200) : '' } });
    return { reportId: item._id, status: event.status };
  });
}

async function moderateUser(event, { user }) {
  requireRole(user, ['admin']); text(event.userId, '用户');
  ensure(['mute','block','unmute','unblock'].includes(event.operation), '管理操作不正确');
  const target = await server.get('users', event.userId);
  ensure(target, '用户不存在');
  if (event.operation === 'mute') {
    const hours = integer(event.hours, '禁言时长', 1, 8760);
    await server.db.collection('users').doc(target._id).update({ data: { mutedUntil: new Date(Date.now() + hours*3600000) } });
  } else if (event.operation === 'unmute') await server.db.collection('users').doc(target._id).update({ data: { mutedUntil: null } });
  else await server.db.collection('users').doc(target._id).update({ data: { blocked: event.operation === 'block' } });
  return { userId: target._id, operation: event.operation };
}

async function moderateContent(event, { user }) {
  requireRole(user, ['admin']);
  const collection = COLLECTIONS[event.targetType];
  ensure(collection && typeof event.hidden === 'boolean', '内容管理操作不正确');
  text(event.targetId, '内容'); text(event.communityId, '小区');
  return atomic(server.db, async transaction => {
    const target = await read(transaction, collection, event.targetId);
    ensure(target && contentInCommunity(event.targetType, target, event.communityId), '内容不存在或不属于该小区', 'E_CONFLICT');
    await transaction.collection(collection).doc(target._id).update({ data: { moderationHidden: event.hidden,
      ...(event.targetType === 'comment' ? { status: event.hidden ? 'hidden' : 'ok' } : {}),
      moderatedAt: new Date() } });
    if (event.targetType === 'message') await updateMessagePreview(transaction, target, event.hidden);
    return { targetId: target._id, hidden: event.hidden };
  });
}

const AD_PATHS = new Set(['/shops/list/list', '/shops/detail/detail', '/events/list/list', '/events/detail/detail']);
function dateValue(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  ensure(Number.isFinite(date.getTime()), label + '格式不正确');
  return date;
}
function mayResumeMediaReview(user) {
  return user.blocked !== true && (!user.mutedUntil || new Date(user.mutedUntil) <= new Date());
}
function safeTarget(target) {
  ensure(target && ['merchant','event','page'].includes(target.type), '广告链接类型不正确');
  if (target.type === 'page') {
    ensure(typeof target.path === 'string' && AD_PATHS.has(target.path) && !/[?#]|\.\.|\\/.test(target.path), '广告只能链接到商家或活动页面');
    return { type: 'page', path: target.path };
  }
  text(target.id, '广告目标');
  return { type: target.type, id: target.id };
}
async function scanVisible(queryAt, eligible, wanted) {
  const found = [];
  const batchSize = 50;
  const maxBatches = 10;
  for (let batch = 0; batch < maxBatches && found.length < wanted; batch += 1) {
    const rows = (await queryAt(batch * batchSize, batchSize)).data || [];
    found.push(...rows.filter(eligible).slice(0, wanted - found.length));
    if (rows.length < batchSize) break;
  }
  return found;
}
async function contentForSlot(event, { user }, slot = 'home_banner') {
  if (!user.communityId && !user.roles.includes('admin')) return { notice: null, notices: [], ads: [] };
  text(event.communityId, '小区');
  ensure(user.roles.includes('admin') || user.communityId === event.communityId, '无权查看其他小区公告', 'E_FORBIDDEN');
  const community = await server.get('communities', event.communityId);
  ensure(community && community.status === 'active', '小区不存在或已停用');
  const settings = await server.config();
  const features = settings.features || {};
  const communityFeatures = community.features || {};
  const isFeatureOn = key => Object.prototype.hasOwnProperty.call(communityFeatures, key) ? communityFeatures[key] === true : features[key] === true;
  const now = new Date();
  const [notices, ads] = await Promise.all([
    slot === 'home_banner' && isFeatureOn('notices') ? scanVisible((offset, size) => server.db.collection('notices')
      .where({ communityId: community._id, status: 'live' }).orderBy('pinnedAt', 'desc')
      .orderBy('createdAt', 'desc').orderBy('_id', 'desc').skip(offset).limit(size).get(),
    item => item.moderationHidden !== true && (!item.endAt || new Date(item.endAt) > now), 100) : [],
    isFeatureOn('ads') ? scanVisible((offset, size) => server.db.collection('ads').where({ status: 'live', slot,
      communityIds: server.command.in([community._id]), startAt: server.command.lte(now), endAt: server.command.gt(now) })
      .orderBy('startAt', 'asc').orderBy('_id', 'asc').skip(offset).limit(size).get(),
    item => item.moderationHidden !== true && (item.moderationApprovedFileIds || []).includes(item.imageFileId), 3) : []
  ]);
  const list = notices.map(item => ({ _id: item._id, title: item.title, body: item.body,
    imageFileId: item.imageFileId && (item.moderationApprovedFileIds || []).includes(item.imageFileId) ? item.imageFileId : '',
    pinned: item.pinned === true, createdAt: item.createdAt }));
  return { notice: list.find(item => item.pinned) || list[0] || null, notices: list, ads: ads.map(({ _id, title, imageFileId, target }) => ({ _id, title, imageFileId, target })) };
}

async function homeContent(event, context) { return contentForSlot(event, context); }
async function adsForSlot(event, { user }) {
  ensure(['board_top','shops_top'].includes(event.slot), '广告位不正确');
  if (!user.communityId && !user.roles.includes('admin')) await server.featureEntry('ads',user);
  const communityId = text(event.communityId, '小区');
  ensure(user.roles.includes('admin') || user.communityId === communityId, '无权查看其他小区广告', 'E_FORBIDDEN');
  await server.feature(event.slot === 'board_top' ? 'board' : 'merchants',communityId);
  await server.feature('ads',communityId);
  const result = await contentForSlot(event, { user }, event.slot);
  return { ads: result.ads };
}

async function adEvent(event, { user, openid }) {
  text(event.adId, '广告'); text(event.communityId, '小区');
  ensure(user.roles.includes('admin') || user.communityId === event.communityId, '无权访问该小区广告', 'E_FORBIDDEN');
  ensure(['ad_view','ad_click'].includes(event.type), '广告行为不正确');
  const ad = await server.get('ads', event.adId);
  const now = new Date();
  ensure(ad && ad.status === 'live' && ad.communityIds.includes(event.communityId) &&
    new Date(ad.startAt) <= now && new Date(ad.endAt) > now &&
    (ad.moderationApprovedFileIds || []).includes(ad.imageFileId) && ad.moderationHidden !== true, '广告已失效', 'E_FORBIDDEN');
  await server.feature('ads', event.communityId);
  if (ad.slot === 'board_top' || ad.slot === 'shops_top') await server.feature(ad.slot === 'board_top' ? 'board' : 'merchants', event.communityId);
  await server.db.collection('events').add({ data: { type: event.type, adId: ad._id, communityId: event.communityId, openid, at: now } });
  return { recorded: true };
}

async function listNotices(event, { user }) {
  if (!event.communityId && !user.communityId) await server.featureEntry('notices', user);
  text(event.communityId, '小区');
  ensure(user.roles.includes('admin') || user.communityId === event.communityId, '无权查看其他小区公告', 'E_FORBIDDEN');
  const community = await server.get('communities', event.communityId);
  ensure(community && community.status === 'active', '小区不存在或已停用');
  if (!user.roles.includes('admin')) await server.feature('notices', community._id);
  const offset = integer(event.offset || 0, '分页位置', 0, 100000);
  const result = await server.db.collection('notices').where({ communityId: community._id, status: 'live' }).orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  const now = Date.now();
  const list = result.data.filter(item => item.moderationHidden !== true && (!item.endAt || new Date(item.endAt).getTime() > now)).map(item => ({
    _id: item._id, communityId: item.communityId, title: item.title, body: item.body,
    imageFileId: item.imageFileId && (item.moderationApprovedFileIds || []).includes(item.imageFileId) ? item.imageFileId : '',
    pinned: item.pinned === true, createdAt: item.createdAt, endAt: item.endAt }));
  return { list, hasMore: result.data.length === 20, nextOffset: offset + result.data.length };
}

async function resumeMediaReview(collection, id, fileId, authorOpenid, communityId, targetType) {
  if (!fileId) return;
  const claimed = await atomic(server.db, async transaction => {
    const item = await read(transaction, collection, id);
    if (!item || item.imageFileId !== fileId ||
      (item.moderationPendingFileIds || []).includes(fileId) ||
      (item.moderationApprovedFileIds || []).includes(fileId)) return false;
    await transaction.collection(collection).doc(id).update({ data: {
      moderationPendingFileIds: [...new Set([...(item.moderationPendingFileIds || []), fileId])] } });
    return true;
  });
  if (claimed) await requestMediaCheck(cloud, server.db,
    { fileId, targetType, targetId: id, authorOpenid, communityId });
}

async function saveNotice(event, { user, openid }) {
  requireRole(user, ['property','admin']);
  text(event.communityId, '小区'); text(event.title, '公告标题', 80); text(event.body, '公告正文', 2000);
  const endAt = dateValue(event.endAt, '有效期');
  const imageFileId = typeof event.imageFileId === 'string' ? event.imageFileId.slice(0, 500) : '';
  let requestId = null, requestHash = null;
  if (!event.noticeId && event.requestId !== undefined) {
    requestId = text(event.requestId, '请求编号', 80);
    ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(requestId), '请求编号不正确');
    requestHash = crypto.createHash('sha256').update(JSON.stringify({ communityId: event.communityId,
      title: event.title.trim(), body: event.body.trim(), imageFileId, pinned: event.pinned === true,
      endAt: endAt.toISOString() })).digest('hex');
    const originalId = 'n_' + crypto.createHash('sha256').update(openid + ':' + requestId).digest('hex').slice(0, 36);
    const original = await server.get('notices', originalId);
    if (original) {
      ensure(original.createdBy === openid && original.requestHash === requestHash,
        '请求编号已用于其他公告', 'E_CONFLICT');
      ensure(user.roles.includes('admin') || original.communityId === user.communityId,
        '物业只能管理本小区公告', 'E_FORBIDDEN');
      if (mayResumeMediaReview(user)) await resumeMediaReview('notices', originalId, imageFileId, openid, original.communityId, 'notice');
      return { noticeId: originalId };
    }
  }
  ensureCanPublish(user);
  const community = await server.get('communities', event.communityId);
  ensure(community && community.status === 'active', '小区不存在或已停用');
  if (!user.roles.includes('admin')) ensure(user.communityId === community._id, '物业只能管理本小区公告', 'E_FORBIDDEN');
  if (!user.roles.includes('admin')) await server.feature('notices', community._id);
  const config = await server.config();
  const cleanTitle = await checkText(cloud, event.title, { blacklist: config.contentBlacklist || [], type: 'notice', openid });
  const cleanBody = await checkText(cloud, event.body, { blacklist: config.contentBlacklist || [], type: 'notice', openid });
  const now = new Date();
  ensure(endAt > now && endAt <= new Date(now.getTime() + 366 * 86400000), '公告有效期须在未来一年内');
  if (event.imageFileId) fileInFolder(event.imageFileId, 'notices/' + user._id);
  const record = { communityId: community._id, title: cleanTitle, body: cleanBody,
    imageFileId,
    pinned: event.pinned === true, pinnedAt: event.pinned === true ? now : null,
    status: 'live', endAt, createdAt: now, createdBy: openid };
  if (event.noticeId) {
    const old = await server.get('notices', event.noticeId);
    ensure(old && old.communityId === community._id, '公告不存在或不属于该小区');
    const result = await server.db.collection('notices').where({ _id: old._id, communityId: community._id, status: 'live' })
      .update({ data: { ...record, images: record.imageFileId ? [record.imageFileId] : [], updatedAt: now } });
    ensure(result.stats.updated === 1, '公告状态已变化，请刷新', 'E_CONFLICT');
    if (record.imageFileId && record.imageFileId !== old.imageFileId) await requestMediaCheck(cloud, server.db,
      { fileId: record.imageFileId, targetType: 'notice', targetId: old._id, authorOpenid: openid, communityId: community._id });
    return { noticeId: old._id };
  }
  const id = requestId ? 'n_' + crypto.createHash('sha256').update(openid + ':' + requestId).digest('hex').slice(0, 36) : null;
  const value = { ...record, images: record.imageFileId ? [record.imageFileId] : [],
    moderationPendingFileIds: record.imageFileId ? [record.imageFileId] : [],
    ...(requestHash ? { requestHash } : {}) };
  const result = id ? await atomic(server.db, async transaction => {
    const existing = await read(transaction, 'notices', id);
    if (existing) {
      ensure(existing.createdBy === openid && existing.requestHash === requestHash,
        '请求编号已用于其他公告', 'E_CONFLICT');
      return { _id: id, duplicate: true };
    }
    await insert(transaction, 'notices', { _id: id, ...value });
    return { _id: id };
  }) : await server.db.collection('notices').add({ data: value });
  if (record.imageFileId && !result.duplicate) await requestMediaCheck(cloud, server.db,
    { fileId: record.imageFileId, targetType: 'notice', targetId: result._id, authorOpenid: openid, communityId: community._id });
  if (result.duplicate) await resumeMediaReview('notices', result._id, imageFileId, openid, community._id, 'notice');
  return { noticeId: result._id };
}

async function lookupCreate(event, { user, openid }) {
  requireRole(user, ['property', 'admin']);
  ensure(['notice', 'ad'].includes(event.kind), '内容类型不正确');
  const requestId = text(event.requestId, '请求编号', 80);
  ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(requestId), '请求编号不正确');
  if (event.kind === 'ad') requireRole(user, ['admin']);
  const id = (event.kind === 'notice' ? 'n_' : 'ad_') +
    crypto.createHash('sha256').update(openid + ':' + requestId).digest('hex').slice(0, 36);
  const item = await server.get(event.kind === 'notice' ? 'notices' : 'ads', id);
  if (!item) return { recordId: null };
  ensure(item.createdBy === openid && (event.kind === 'ad' || user.roles.includes('admin') ||
    item.communityId === user.communityId), '无权查看此内容', 'E_FORBIDDEN');
  return { recordId: id };
}

async function endNotice(event, { user }) {
  requireRole(user, ['property','admin']); text(event.noticeId, '公告');
  const item = await server.get('notices', event.noticeId);
  ensure(item, '公告不存在');
  if (!user.roles.includes('admin')) ensure(user.communityId === item.communityId, '物业只能管理本小区公告', 'E_FORBIDDEN');
  if (!user.roles.includes('admin')) await server.feature('notices', item.communityId);
  const result = await server.db.collection('notices').where({ _id: item._id, communityId: item.communityId, status: 'live' })
    .update({ data: { status: 'ended', endedAt: new Date() } });
  ensure(result.stats.updated === 1, '公告状态已变化，请刷新', 'E_CONFLICT');
  return { noticeId: item._id };
}

async function listAds(event, { user }) {
  requireRole(user, ['admin']);
  const offset = integer(event.offset || 0, '分页位置', 0, 100000);
  const result = await server.db.collection('ads').orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  return { list: result.data.map(item => ({ ...item, priceYuan: (item.price / 100).toFixed(2) })), hasMore: result.data.length === 20 };
}

async function endAd(event, { user }) {
  requireRole(user, ['admin']); text(event.adId, '广告');
  const result = await server.db.collection('ads').where({ _id: event.adId, status: 'live' })
    .update({ data: { status: 'ended', endedAt: new Date(), updatedAt: new Date() } });
  ensure(result.stats.updated === 1, '广告状态已变化，请刷新', 'E_CONFLICT');
  return { adId: event.adId, status: 'ended' };
}

async function markAdReceived(event, { user, openid }) {
  requireRole(user, ['admin']); text(event.adId, '广告');
  const ad = await server.get('ads', event.adId);
  ensure(ad, '广告不存在');
  for (const id of ad.communityIds || []) await server.feature('ads', id);
  return atomic(server.db, transaction => confirmAdReceived(transaction, event.adId, openid, new Date()));
}

async function saveAd(event, { user, openid }) {
  requireRole(user, ['admin']); text(event.title, '广告标题', 80);
  ensure(['home_banner','board_top','shops_top'].includes(event.slot), '广告位不正确');
  const status = event.status === undefined ? 'draft' : event.status;
  ensure(['draft','live'].includes(status), '广告状态不正确');
  ensure(Array.isArray(event.communityIds) && event.communityIds.length > 0 && event.communityIds.length <= 100, '请选择投放小区');
  text(event.imageFileId, '广告图片', 500);
  const startAt = dateValue(event.startAt, '开始时间'); const endAt = dateValue(event.endAt, '结束时间');
  ensure(endAt > startAt, '广告结束时间必须晚于开始时间');
  const communityIds = [...new Set(event.communityIds.map(id => text(id, '小区 ID', 100)))];
  const target = safeTarget(event.target);
  const price = integer(event.price || 0, '广告金额', 0, 100000000);
  const advertiser = typeof event.advertiser === 'string' ? event.advertiser.slice(0, 100) : '';
  let requestId = null, requestHash = null;
  if (!event.adId && event.requestId !== undefined) {
    requestId = text(event.requestId, '请求编号', 80);
    ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(requestId), '请求编号不正确');
    requestHash = crypto.createHash('sha256').update(JSON.stringify({ slot: event.slot, title: event.title.trim(),
      imageFileId: event.imageFileId, target, communityIds,
      startAt: startAt.toISOString(), endAt: endAt.toISOString(), price,
      advertiser, status })).digest('hex');
    const originalId = 'ad_' + crypto.createHash('sha256').update(openid + ':' + requestId).digest('hex').slice(0, 36);
    const original = await server.get('ads', originalId);
    if (original) {
      ensure(original.createdBy === openid && original.requestHash === requestHash,
        '请求编号已用于其他广告', 'E_CONFLICT');
      if (mayResumeMediaReview(user)) await resumeMediaReview('ads', originalId, event.imageFileId, openid, original.communityIds[0], 'ad');
      return { adId: originalId };
    }
  }
  const config = await server.config();
  const title = await checkText(cloud, event.title, { blacklist: config.contentBlacklist || [], type: 'ad', openid });
  for (const id of communityIds) ensure(await server.get('communities', id), '投放小区不存在');
  const record = { slot: event.slot, title, imageFileId: event.imageFileId, target,
    communityIds, startAt, endAt, price, advertiser,
    images: [event.imageFileId], moderationPendingFileIds: [event.imageFileId], moderationApprovedFileIds: [],
    status, createdAt: new Date(), createdBy: openid };
  if (event.adId) {
    const old = await server.get('ads', event.adId); ensure(old, '广告不存在');
    ensure(!old.paymentReceivedAt || old.price === record.price, '广告款已确认收款，不能修改金额', 'E_CONFLICT');
    const changedImage = old.imageFileId !== record.imageFileId;
    const mediaOwnerOpenid = changedImage ? openid : old.mediaOwnerOpenid || old.createdBy;
    const owner = changedImage ? user : await server.one('users', { openid: mediaOwnerOpenid });
    ensure(owner, '图片归属无法确认，请重新上传');
    fileInFolder(record.imageFileId, 'ads/' + owner._id);
    record.mediaOwnerOpenid = mediaOwnerOpenid;
    await server.db.collection('ads').doc(old._id).update({ data: { ...record,
      createdAt: old.createdAt, createdBy: old.createdBy, moderationHidden: old.moderationHidden === true,
      moderationPendingFileIds: changedImage ? [record.imageFileId] : old.moderationPendingFileIds || [],
      moderationApprovedFileIds: changedImage ? [] : old.moderationApprovedFileIds || [], updatedAt: new Date() } });
    if (changedImage) await requestMediaCheck(cloud, server.db,
      { fileId: record.imageFileId, targetType: 'ad', targetId: old._id, authorOpenid: openid, communityId: communityIds[0] });
    return { adId: old._id };
  }
  fileInFolder(record.imageFileId, 'ads/' + user._id);
  const id = requestId ? 'ad_' + crypto.createHash('sha256').update(openid + ':' + requestId).digest('hex').slice(0, 36) : null;
  const result = id ? await atomic(server.db, async transaction => {
    const existing = await read(transaction, 'ads', id);
    if (existing) {
      ensure(existing.createdBy === openid && existing.requestHash === requestHash,
        '请求编号已用于其他广告', 'E_CONFLICT');
      return { _id: id, duplicate: true };
    }
    await insert(transaction, 'ads', { _id: id, ...record, requestHash });
    return { _id: id };
  }) : await server.db.collection('ads').add({ data: record });
  if (!result.duplicate) await requestMediaCheck(cloud, server.db,
    { fileId: record.imageFileId, targetType: 'ad', targetId: result._id, authorOpenid: openid, communityId: communityIds[0] });
  if (result.duplicate) await resumeMediaReview('ads', result._id, record.imageFileId, openid, communityIds[0], 'ad');
  return { adId: result._id };
}

exports.main = server.entry({ report, listReports, resolveReport, moderateUser, moderateContent,
  homeContent, adsForSlot, adEvent, listNotices, saveNotice, lookupCreate, endNotice, listAds, saveAd, endAd, markAdReceived }, ['resident','admin','property'], 'content');
