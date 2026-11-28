const { ensure, integer, text } = require('./validate');
const { requireApprovedProvider } = require('./auth');
const { maskPhone } = require('./money');
const { SERVICE_NAMES } = require('./orderData');
const { split } = require('./split');

function fileInFolder(fileId, folder, message = '请重新上传本次所需的照片') {
  const match = typeof fileId === 'string' && /^cloud:\/\/[^/?#]+\/([^?#]+)$/.exec(fileId);
  let path = '';
  try { if (match) path = decodeURIComponent(match[1]); } catch (_) {}
  ensure(path && path.startsWith(folder + '/') && !path.includes('\\') &&
    !path.split('/').some(part => !part || part === '.' || part === '..') && !/[\u0000-\u001f]/.test(path),
  message);
  return fileId;
}

function application(event, user, community) {
  ensure(community && community.status === 'active', '请选择有效服务小区');
  text(event.realName, '真实姓名', 30);
  ensure(typeof event.idLast4 === 'string' && /^\d{3}[\dXx]$/.test(event.idLast4), '请填写身份证后四位');
  integer(event.appliedLevel, '申请等级', 1, 2);
  ensure(event.agreed === true, '请先同意服务规范');
  ensure(/^1\d{10}$/.test(user.phone || ''), '请先填写联系电话');
  fileInFolder(event.kycFileId, 'kyc/' + user._id);
  fileInFolder(event.avatarFileId, 'providers/' + user._id);
  return { realName: event.realName.trim(), idLast4: event.idLast4.toUpperCase(), phone: user.phone,
    communityId: community._id, appliedLevel: event.appliedLevel, kycFileIds: [event.kycFileId],
    avatarFileId: event.avatarFileId || null };
}

function canWork(provider, now, minLevel = 1, requireDuty = false) {
  requireApprovedProvider(provider, minLevel);
  ensure(provider.insuranceUntil instanceof Date && provider.insuranceUntil > now,
    '保险已到期或未登记，请联系管理员', 'E_INSURANCE');
  if (requireDuty) ensure(provider.onDuty === true, '请先上线值班', 'E_BAD_STATE');
}

function canTake(order, provider, now) {
  canWork(provider, now, order.minLevel, true);
  ensure(order.kind === 'service' && order.communityId === provider.communityId, '无法接取该小区任务', 'E_FORBIDDEN');
  ensure(order.status === 'paid', '手慢了，单已被接走', 'E_CONFLICT');
  ensure(!(order.releasedProviderIds || []).includes(provider._id), '放弃的订单不能再次接取', 'E_FORBIDDEN');
  ensure(!order.requiredCert || (provider.certs || []).includes(order.requiredCert), '缺少该服务要求的资质', 'E_FORBIDDEN');
}

function delivery(event, order) {
  ensure(Array.isArray(event.photos) && event.photos.length >= 1 && event.photos.length <= 3, '请上传 1—3 张完成照片');
  ensure(new Set(event.photos).size === event.photos.length, '请勿重复选择同一照片');
  event.photos.forEach(file => fileInFolder(file, 'orders/' + order._id));
  const patch = { photos: event.photos.slice() };
  if (['buy','meal'].includes(order.serviceCode)) {
    patch.receiptPhoto = fileInFolder(event.receiptPhoto, 'orders/' + order._id);
    const goodsActual = integer(event.goodsActual, '商品实际金额', 0, order.pricing.goodsCap);
    patch.pricing = { ...order.pricing, goodsActual };
  }
  if (order.serviceCode === 'visit') {
    patch.visitReport = require('./services/elder').cleanVisitReport(event.visitReport);
  }
  return patch;
}

function providerView(provider, admin = false) {
  if (!provider) return null;
  const result = { _id: provider._id, realName: provider.realName, phone: maskPhone(provider.phone),
    communityId: provider.communityId, status: provider.status, appliedLevel: provider.appliedLevel,
    level: provider.level, onDuty: provider.onDuty, insuranceUntil: provider.insuranceUntil,
    avatarFileId: provider.avatarFileId || null, reviewNote: provider.reviewNote, stats: provider.stats,
    certs: provider.certs || [],
    referralCode: provider.referralCode, cleanupPending: Boolean(provider.kycFileIds && provider.kycFileIds.length && provider.status !== 'pending') };
  if (admin) { result.idLast4 = provider.idLast4; result.kycFileIds = provider.kycFileIds || []; }
  return result;
}

function hallView(order) {
  const amounts = split({ ...order.pricing, rates: order.rateSnapshot, source: order.source,
    membershipTaskPayout: order.membershipTaskPayout });
  return { _id: order._id, serviceCode: order.serviceCode, serviceName: SERVICE_NAMES[order.serviceCode],
    buildingName: order.address.buildingName, slot: order.slot, estimatedIncome: amounts.provider,
    ...(order.serviceCode === 'custom' ? { title: order.detail.title, desc: order.detail.desc,
      needEnterHome: order.detail.needEnterHome === true } : {}) };
}

module.exports = { fileInFolder, application, canWork, canTake, delivery, providerView, hallView };
