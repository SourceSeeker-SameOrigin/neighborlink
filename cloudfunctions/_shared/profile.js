const { text, ensure } = require('./validate');
const { maskPhone } = require('./money');
const { effectiveFeatures } = require('./features');

function publicCommunity(community, config) {
  if (!community) return null;
  const { locationGeo, ...view } = community;
  const enabledFeatures = effectiveFeatures(config, community);
  return { ...view, features: enabledFeatures, enabledFeatures, hotline: config.hotline };
}

function parseScene(scene) {
  if (typeof scene !== 'string' || !scene) return null;
  let decoded;
  try { decoded = decodeURIComponent(scene); } catch (_) { return null; }
  const match = /^([br])=([2-9A-HJ-NP-Z]{6})$/.exec(decoded);
  return match ? { type: match[1], code: match[2], scene: decoded } : null;
}

function publicUser(user) {
  return {
    _id: user._id, phone: maskPhone(user.phone), hasPhone: Boolean(user.phone), roles: user.roles,
    phoneSource: ['manual', 'wechat'].includes(user.phoneSource) ? user.phoneSource : 'unknown',
    phoneVerified: Boolean(user.phone && user.phoneSource === 'wechat' && user.phoneVerified === true),
    pointsBalance: user.pointsBalance || 0,
    communityId: user.communityId || null, buildingId: user.buildingId || null,
    buildingName: user.buildingName || '',
    unit: user.unit || '', room: user.room || '', firstPaidAt: user.firstPaidAt || null,
    source: user.source ? { scene: user.source.scene, buildingId: user.source.buildingId || null } : null,
    prefs: { doorDelivery: Boolean(user.prefs && user.prefs.doorDelivery) },
    moderationNotices: (user.moderationNotices || []).slice(-10),
    addresses: (user.addresses || []).slice(0, 5).map(item => ({ id: item.id, communityId: item.communityId,
      buildingId: item.buildingId, buildingName: item.buildingName || '', unit: item.unit, room: item.room,
      contactName: item.contactName || '', contactPhone: maskPhone(item.contactPhone), isDefault: item.isDefault === true }))
  };
}

function providerSummary(provider) {
  return provider ? { _id: provider._id, status: provider.status, level: provider.level,
    communityId: provider.communityId, onDuty: provider.onDuty, insuranceUntil: provider.insuranceUntil } : null;
}

function contactPhone(input, user) {
  if (input === undefined || input === '') {
    ensure(typeof user.phone === 'string' && /^1\d{10}$/.test(user.phone), '请填写有效联系电话');
    return { phone: user.phone, phoneSource: user.phoneSource || 'unknown', phoneVerified: user.phoneSource === 'wechat' && user.phoneVerified === true };
  }
  ensure(typeof input === 'string' && /^1\d{10}$/.test(input.trim()), '请输入11位有效联系电话');
  return { phone: input.trim(), phoneSource: 'manual', phoneVerified: false };
}

function validateAddress(input, community, building) {
  text(input.communityId, '小区');
  text(input.buildingId, '楼栋');
  text(input.unit, '单元', 30);
  text(input.room, '门牌号', 30);
  ensure(community && community._id === input.communityId && community.status === 'active', '该小区暂不可用');
  ensure(building && building._id === input.buildingId && building.communityId === community._id,
    '楼栋不属于所选小区');
  ensure(Array.isArray(building.units) && building.units.includes(input.unit), '请选择有效单元');
  ensure(input.privacyAgreed === true, '请先同意隐私政策和服务协议');
  return { communityId: community._id, buildingId: building._id, unit: input.unit, room: input.room.trim() };
}

module.exports = { parseScene, publicUser, publicCommunity, providerSummary, validateAddress, contactPhone };
