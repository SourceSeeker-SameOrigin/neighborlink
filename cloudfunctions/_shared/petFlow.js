const { insert, read } = require('./transaction');
const { ensure, text, record } = require('./validate');
const { encryptSecret, decryptSecret } = require('./crypto');
const { ymd } = require('./time');

async function createPetVisits(transaction, order) {
  ensure(order && order.serviceCode === 'pet' && Array.isArray(order.petVisitPrices), '喂宠订单排期不存在', 'E_CONFIG');
  for (const item of order.petVisitPrices) {
    const id = visitId(order._id, item.date, item.seq);
    await insert(transaction, 'visits', { _id: id, parentOrderId: order._id, date: item.date, seq: item.seq,
      price: item.amount, status: 'pending', photos: [], videoFileId: null, doneAt: null, createdAt: order.createdAt });
  }
}
async function removePetSecret(transaction, order) {
  if (!order || order.serviceCode !== 'pet') return;
  const secret = await read(transaction, 'secrets', 's_' + order._id);
  if (secret) await transaction.collection('secrets').doc(secret._id).remove();
}
function visitId(orderId, date, seq) { return `v_${orderId}_${date.replace(/-/g, '')}_${seq}`; }
function revealAllowed(order, visit, provider, openid, now = new Date()) {
  ensure(order && order.serviceCode === 'pet' && order.providerId === provider._id && order.providerOpenid === openid,
    '只有该订单的接单服务员可查看门锁信息', 'E_FORBIDDEN');
  ensure(['accepted','in_service'].includes(order.status), '订单当前状态不可查看门锁信息', 'E_FORBIDDEN');
  ensure(visit && visit.parentOrderId === order._id && visit.status === 'pending', '上门子任务不存在或已完成');
  ensure(visit.date === ymd(now), '只允许在服务日期当天查看门锁信息', 'E_FORBIDDEN');
}
function cleanVisitResult(event, order) {
  record(event, '上门结果');
  const photos = Array.isArray(event.photos) ? event.photos : [];
  ensure(photos.length === 0 || photos.length >= 2, '请上传至少 2 张照片，或上传 1 段视频');
  ensure(photos.length <= 6 && new Set(photos).size === photos.length, '照片数量不正确');
  const videoFileId = event.videoFileId || null;
  ensure((videoFileId && photos.length === 0) || (!videoFileId && photos.length >= 2), '每次上门必须上传视频或至少 2 张照片');
  const folder = `pet/${order._id}/`;
  for (const file of photos) require('./providerData').fileInFolder(file, folder.replace(/\/$/, ''));
  if (videoFileId) require('./providerData').fileInFolder(videoFileId, folder.replace(/\/$/, ''));
  return { photos, videoFileId };
}
function revealSecret(secret, secretKey) { return decryptSecret(secret, secretKey); }
function encryptedSecret(password, secretKey) { return encryptSecret(password, secretKey); }
module.exports = { createPetVisits, removePetSecret, visitId, revealAllowed, cleanVisitResult, revealSecret, encryptedSecret };
