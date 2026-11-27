const { checkText: checkBlacklist } = require('./blacklist');
const { ensure, text } = require('./validate');

const TYPES = Object.freeze(['post','comment','idle','event','message','merchant','merchantService','notice','ad']);
const SCENES = Object.freeze({ post: 3, comment: 3, idle: 1, event: 1, message: 4, merchant: 1, merchantService: 1, notice: 1, ad: 1 });
const MEDIA_COLLECTIONS = Object.freeze({ post: 'posts', idle: 'idleItems', event: 'events', message: 'messages',
  merchant: 'merchants', merchantService: 'merchantServices', notice: 'notices', ad: 'ads' });
function mediaCollection(type) { return MEDIA_COLLECTIONS[type] || null; }
function validateUgc(value, max = 500) { text(value, '内容', max); return value.trim(); }
function ensureCanPublish(user, now = new Date()) {
  ensure(user && user.blocked !== true, '账号暂不可用，请联系管理员', 'E_FORBIDDEN');
  ensure(!user.mutedUntil || new Date(user.mutedUntil) <= now, '账号禁言中，暂时不能发布内容', 'E_FORBIDDEN');
}
function localUgc(value, blacklist) {
  ensure(!checkBlacklist(value, blacklist), '内容包含暂不允许发布的信息', 'E_BLOCKED');
  return value;
}
function contentInCommunity(targetType, target, communityId) {
  return ['event','merchant','ad'].includes(targetType)
    ? Array.isArray(target && target.communityIds) && target.communityIds.includes(communityId)
    : Boolean(target && target.communityId === communityId);
}
async function checkText(cloud, value, { blacklist, type, scene = SCENES[type], openid }) {
  const content = localUgc(validateUgc(value, 2000), blacklist);
  ensure(TYPES.includes(type) && [1, 2, 3, 4].includes(scene), '内容安全场景不正确', 'E_CONFIG');
  text(openid, '用户');
  let result;
  try {
    result = await cloud.openapi.security.msgSecCheck({ content, version: 2, scene, openid });
  } catch (_) {
    ensure(false, '内容审核暂不可用，请稍后重试', 'E_CONTENT_CHECK');
  }
  const decision = result && result.result && result.result.suggest;
  ensure(decision === 'pass', '内容未通过安全审核，请修改后重试', 'E_BLOCKED');
  return content;
}
async function requestMediaCheck(cloud, db, { fileId, targetType, targetId, authorOpenid, communityId }) {
  ensure(TYPES.includes(targetType) && targetType !== 'comment', '图片审核对象不正确', 'E_INVALID_PARAM');
  text(fileId, '图片'); text(targetId, '内容'); text(authorOpenid, '作者'); text(communityId, '小区');
  const record = { fileId, targetType, targetId, authorOpenid, communityId, status: 'pending', createdAt: new Date() };
  const collection = mediaCollection(targetType);
  const targetResult = await db.collection(collection).doc(targetId).get();
  const target = targetResult.data;
  const owner = target && (target.authorOpenid || target.sellerOpenid || target.ownerOpenid || target.openid || target.from || target.createdBy);
  ensure(target && contentInCommunity(targetType, target, communityId) && owner === authorOpenid, '图片所属内容不存在', 'E_CONFLICT');
  const pending = [...new Set([...(target.moderationPendingFileIds || []), fileId])];
  await db.collection(collection).doc(targetId).update({ data: { moderationPendingFileIds: pending,
    ...(targetType === 'message' ? { status: 'pending' } : {}) } });
  try {
    const files = await cloud.getTempFileURL({ fileList: [fileId] });
    const mediaUrl = files.fileList && files.fileList[0] && files.fileList[0].tempFileURL;
    ensure(typeof mediaUrl === 'string' && mediaUrl.startsWith('https://'), '图片暂不可审核，请稍后重试', 'E_CONTENT_CHECK');
    const result = await cloud.openapi.security.mediaCheckAsync({ media_url: mediaUrl, media_type: 2,
      version: 2, scene: [3, 4].includes(SCENES[targetType]) ? SCENES[targetType] : 1, openid: authorOpenid });
    const traceId = result && (result.trace_id || result.traceId);
    text(traceId, '审核编号');
    await db.collection('mediaChecks').doc(traceId).set({ data: record });
    return { traceId, status: 'pending' };
  } catch (error) {
    await db.collection(collection).doc(targetId).update({ data: { moderationPendingFileIds: pending.filter(id => id !== fileId),
      ...(targetType === 'message' ? { status: 'ok' } : {}) } });
    throw error;
  }
}
function visibleImages(target, viewerOpenid, ownerOpenid) {
  const images = Array.isArray(target.images) ? target.images : [];
  if (viewerOpenid === ownerOpenid) return images;
  const approved = new Set(target.moderationApprovedFileIds || []);
  return images.filter(image => approved.has(typeof image === 'string' ? image : image.fileId));
}
function report(targetType, targetId, reporterOpenid, reason, content, now = new Date()) {
  ensure(TYPES.includes(targetType) && targetType !== 'merchantService', '举报对象不正确');
  text(targetId, '举报内容'); text(reporterOpenid, '举报人'); text(reason, '举报原因', 80);
  ensure(typeof content === 'string' && [...content].length <= 500, '举报说明不能超过 500 字');
  return { targetType, targetId, reporterOpenid, reason: reason.trim(), text: content.trim(), status: 'pending',
    handledBy: null, handledAt: null, createdAt: now };
}
function reportOutcome(reports) {
  const reporters = new Set(reports.map(item => item.reporterOpenid));
  return { hide: reporters.size >= 3, uniqueReporters: reporters.size };
}
function mediaStatus(status) {
  ensure(['pass','risky','review'].includes(status), '图片审核结果不正确', 'E_INVALID_PARAM');
  return status === 'pass' ? 'ok' : status === 'risky' ? 'blocked' : 'pending';
}
module.exports = { TYPES, SCENES, MEDIA_COLLECTIONS, mediaCollection, validateUgc, ensureCanPublish, localUgc, contentInCommunity, checkText, requestMediaCheck, visibleImages, report, reportOutcome, mediaStatus };
