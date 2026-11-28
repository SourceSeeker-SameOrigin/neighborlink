const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
const { createServer } = require('./lib/shared/server');
const { publicUser, publicCommunity, providerSummary, parseScene, validateAddress, contactPhone } = require('./lib/shared/profile');
const { ensure, text } = require('./lib/shared/validate');
const { issueAutomatic } = require('./lib/shared/couponFlow');
const { atomic, read, insert } = require('./lib/shared/transaction');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const server = createServer(cloud);
const { db, command, one, get } = server;

async function login(_, { openid }) {
  let user = await one('users', { openid });
  let created = false;
  if (!user) {
    const id = 'u_' + crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32);
    const now = new Date();
    const document = { _id: id, openid, phone: '', roles: ['resident'], communityId: null,
      buildingId: null, unit: '', room: '', source: null, firstPaidAt: null, blocked: false,
      paidOrderCount: 0, firstPaidOrderId: null, addresses: [], pointsBalance: 0, couponCounts: {},
      mutedUntil: null, moderationNotices: [], createdAt: now, updatedAt: now };
    try {
      await db.collection('users').add({ data: document });
      user = document;
      created = true;
    } catch (error) {
      // 并发首次登录只创建一条；其余数据库异常保留给边界处理。
      user = await one('users', { openid });
      if (!user) throw error;
    }
  }
  ensure(!user.blocked, '账号暂不可用，请联系管理员', 'E_FORBIDDEN');
  if (created) {
    try { await server.feature('coupons', user.communityId); await issueAutomatic(server, openid, user.communityId || ''); }
    catch (error) { if (error.code !== 'E_FEATURE_OFF') throw error; }
  }
  const provider = await one('providers', { openid });
  const community = await get('communities', user.communityId);
  const building = await get('buildings', user.buildingId);
  const config = community ? await server.config() : null;
  return { profile: publicUser({ ...user, buildingName: building && building.name }), roles: user.roles,
    provider: providerSummary(provider), community: publicCommunity(community, config) };
}

async function bindPhone(event, { openid }) {
  const user = await server.user(openid);
  text(event.code, '手机号授权码');
  const result = await cloud.openapi.phonenumber.getPhoneNumber({ code: event.code });
  const phone = result.phoneInfo && result.phoneInfo.purePhoneNumber;
  ensure(typeof phone === 'string' && /^1\d{10}$/.test(phone), '未取得有效手机号，请重新授权');
  await db.collection('users').doc(user._id).update({ data: { phone, phoneSource: 'wechat', phoneVerified: true, updatedAt: new Date() } });
  return publicUser({ ...user, phone, phoneSource: 'wechat', phoneVerified: true });
}

async function setAddress(event, { openid }) {
  const actor = await server.user(openid);
  const bindEventId = 'bind_' + crypto.randomBytes(16).toString('hex');
  const profile = await atomic(db, async transaction => {
    const user = await read(transaction, 'users', actor._id);
    ensure(user && user.openid === openid && !user.blocked, '请先登录或联系管理员', 'E_FORBIDDEN');
    const phoneFields = contactPhone(event.phone, user);
    text(event.communityId, '小区');
    text(event.buildingId, '楼栋');
    const community = await read(transaction, 'communities', event.communityId);
    const building = await read(transaction, 'buildings', event.buildingId);
    const address = validateAddress(event, community, building);
    const addressId = 'addr_' + crypto.createHash('sha256').update([user._id, address.communityId, address.buildingId,
      address.unit, address.room].join(':')).digest('hex').slice(0, 16);
    const addresses = user.addresses || [];
    const savedAddress = { id: addressId, ...address, buildingName: building.name, contactName: event.contactName || '', contactPhone: event.contactPhone || phoneFields.phone,
      isDefault: true };
    ensure(typeof savedAddress.contactName === 'string' && [...savedAddress.contactName].length <= 30, '联系人姓名不能超过 30 字');
    ensure(/^1\d{10}$/.test(savedAddress.contactPhone), '请输入有效联系人手机号');
    const nextAddresses = [savedAddress, ...addresses.filter(item => item.id !== addressId).map(item => ({ ...item, isDefault: false }))].slice(0, 5);
    await transaction.collection('users').doc(user._id).update({ data: { ...address, ...phoneFields, addresses: nextAddresses, updatedAt: new Date() } });
    await insert(transaction, 'events', { _id: bindEventId, type: 'bind', openid, scene: user.source && user.source.scene || '',
      buildingId: address.buildingId, communityId: address.communityId,
      referrerProviderId: user.source && user.source.referrerProviderId || null, at: new Date() });
    return publicUser({ ...user, ...address, ...phoneFields, addresses: nextAddresses, buildingName: building.name });
  });
  // Binding is already committed. Coupon availability must not turn it into a false failure.
  let welcomeCouponStatus = 'complete';
  try { await server.feature('coupons', profile.communityId); await issueAutomatic(server, openid, profile.communityId); }
  catch (error) {
    welcomeCouponStatus = error.code === 'E_FEATURE_OFF' ? 'unavailable' : 'pending';
    if (welcomeCouponStatus === 'pending') console.error('Welcome coupon issuance pending after successful binding');
  }
  return { ...profile, welcomeCouponStatus };
}

async function retryWelcomeCoupons(_, { openid }) {
  const user = await server.user(openid);
  await server.featureEntry('coupons', user);
  ensure(user.buildingId, '请先绑定小区门牌');
  await issueAutomatic(server, openid, user.communityId);
  return { complete: true };
}

async function recordScene(event, { openid }) {
  const user = await server.user(openid);
  const parsed = parseScene(event.scene);
  ensure(parsed, '二维码内容不正确');
  const target = parsed.type === 'b' ? await one('buildings', { shortCode: parsed.code })
    : await one('providers', { referralCode: parsed.code, status: 'approved' });
  ensure(target, '二维码已失效');
  const community = await get('communities', target.communityId);
  ensure(community && community.status === 'active', '小区暂不可用');
  const source = { scene: parsed.scene, buildingId: parsed.type === 'b' ? target._id : null,
    referrerProviderId: parsed.type === 'r' ? target._id : null, firstSeenAt: new Date() };
  await db.collection('users').where({ _id: user._id, source: command.eq(null) })
    .update({ data: { source, updatedAt: new Date() } });
  await db.collection('events').add({ data: { type: 'scan', openid, scene: parsed.scene,
    buildingId: source.buildingId, communityId: target.communityId,
    referrerProviderId: source.referrerProviderId, at: new Date() } });
  return { recorded: true };
}

exports.main = server.entry({ login, bindPhone, setAddress, recordScene, retryWelcomeCoupons });
