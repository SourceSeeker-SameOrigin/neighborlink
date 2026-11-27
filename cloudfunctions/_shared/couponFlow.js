const crypto = require('crypto');
const { atomic, read, insert } = require('./transaction');
const { ensure, integer } = require('./validate');
const { couponId, couponDiscount } = require('./couponData');
const { refundParts } = require('./refundState');
const { addDays } = require('./time');

function communityMatches(template, communityId) {
  return template.communityIds === 'all' || template.communityIds.includes(communityId);
}

async function issueOne(server, { openid, templateId, mode, communityId, deterministic = false, claimRequestId }) {
  const suffix = claimRequestId ? 'claim_' + claimRequestId : deterministic ? mode : crypto.randomBytes(16).toString('hex');
  const id = couponId(openid, templateId, suffix);
  const actor = await server.one('users', { openid });
  ensure(actor, '用户不存在');
  return atomic(server.db, async transaction => {
    const existing = await read(transaction, 'coupons', id);
    if (existing) return { couponId: id, duplicate: true };
    const [user, template] = await Promise.all([read(transaction, 'users', actor._id), read(transaction, 'couponTemplates', templateId)]);
    ensure(user && template, '用户或优惠券模板不存在');
    ensure(template.status === 'active' && (mode === 'manual' || template.issueMode === mode), '该模板当前不可发放');
    ensure(communityMatches(template, communityId), '该优惠券不适用于所选小区');
    const issued = integer(template.issued || 0, '已发放数量', 0, template.totalLimit);
    ensure(issued < template.totalLimit, '该优惠券已领完');
    const counts = user.couponCounts || {};
    const count = integer(counts[templateId] || 0, '个人领取数量');
    ensure(count < template.perUserLimit, '已达到每人领取上限');
    const now = new Date();
    const coupon = { _id: id, templateId, openid, status: 'unused', validFrom: now,
      validTo: addDays(now, template.validDays), orderId: null, createdAt: now,
      ...(mode === 'manual' && claimRequestId ? { manualRequestId: claimRequestId } : {}) };
    await insert(transaction, 'coupons', coupon);
    await transaction.collection('couponTemplates').doc(templateId).update({ data: { issued: issued + 1, updatedAt: now } });
    await transaction.collection('users').doc(user._id).update({ data: { couponCounts: { ...counts, [templateId]: count + 1 } } });
    return { couponId: id, duplicate: false };
  });
}

async function issueAutomatic(server, openid, communityId) {
  const templates = await server.all('couponTemplates', { issueMode: 'auto_new_user', status: 'active' });
  const results = [];
  for (const template of templates) if (communityMatches(template, communityId || '')) {
    try { results.push(await issueOne(server, { openid, templateId: template._id, mode: 'auto_new_user',
      communityId: communityId || '', deterministic: true })); }
    catch (error) { if (error.code !== 'E_INVALID_PARAM') throw error; }
  }
  return results;
}

async function lockOrderDiscounts(transaction, order, user, now) {
  const couponIdValue = order.pricing.couponId;
  if (couponIdValue) {
    const coupon = await read(transaction, 'coupons', couponIdValue);
    ensure(coupon && coupon.openid === user.openid && coupon.status === 'unused' &&
      coupon.validFrom <= now && coupon.validTo > now, '优惠券已被使用或过期，请重新报价', 'E_CONFLICT');
    const template = await read(transaction, 'couponTemplates', coupon.templateId);
    const actualDiscount = Math.min(couponDiscount(template, { serviceCode: order.serviceCode,
      communityId: order.communityId, listPrice: order.pricing.listPrice }), Math.max(0, order.pricing.listPrice - 1));
    ensure(actualDiscount === order.pricing.couponDiscount, '优惠券规则已变化，请重新报价', 'E_CONFLICT');
    await transaction.collection('coupons').doc(coupon._id).update({ data: { status: 'locked', orderId: order._id } });
  }
  const points = integer(order.pricing.pointsRedeemed || 0, '抵扣积分');
  if (points) {
    ensure(integer(user.pointsBalance || 0, '积分余额') >= points, '积分余额已变化，请重新报价', 'E_CONFLICT');
    const ledgerId = 'points_redeem_' + order._id;
    ensure(!await read(transaction, 'pointsLedger', ledgerId), '积分抵扣记录已存在', 'E_CONFLICT');
    await insert(transaction, 'pointsLedger', { _id: ledgerId, openid: user.openid, delta: -points,
      reason: 'redeem', refId: order._id, balanceAfter: user.pointsBalance - points, createdAt: now });
  }
  return { pointsBalance: (user.pointsBalance || 0) - points };
}

async function markCouponUsed(transaction, order, now) {
  if (!order.pricing.couponId) return;
  const coupon = await read(transaction, 'coupons', order.pricing.couponId);
  ensure(coupon && coupon.status === 'locked' && coupon.orderId === order._id, '优惠券锁定状态不一致', 'E_CONFLICT');
  await transaction.collection('coupons').doc(coupon._id).update({ data: { status: 'used', usedAt: now } });
}

async function releaseOrderDiscounts(transaction, order, user, now) {
  await releaseCoupon(transaction, order, now);
  const points = integer(order.pricing.pointsRedeemed || 0, '抵扣积分');
  if (!points) return user.pointsBalance || 0;
  const ledgerId = 'points_restore_' + order._id;
  if (await read(transaction, 'pointsLedger', ledgerId)) return user.pointsBalance || 0;
  const nextBalance = (user.pointsBalance || 0) + points;
  await insert(transaction, 'pointsLedger', { _id: ledgerId, openid: user.openid, delta: points,
    reason: 'refund', refId: order._id, balanceAfter: nextBalance, createdAt: now });
  await transaction.collection('users').doc(user._id).update({ data: { pointsBalance: nextBalance } });
  return nextBalance;
}

async function restoreRefundedPoints(transaction, order, refunds, now, newRefundNo) {
  const points = integer(order.pricing.pointsRedeemed || 0, '抵扣积分');
  const serviceFee = integer(order.pricing.payAmount || 0, '服务费实付');
  if (!points || !serviceFee) return 0;
  const successful = refunds.filter(item => item.status === 'success')
    .slice().sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0) || a.outRefundNo.localeCompare(b.outRefundNo));
  if (!successful.length) return 0;
  const user = await read(transaction, 'users', order.userId);
  ensure(user, '订单用户不存在', 'E_CONFIG');
  let cumulativeServiceRefund = 0;
  let restored = 0;
  let totalAdded = 0;
  const unposted = [];
  // 先核对所有已入账的退款，再分配未入账的积分，以兼容逆序回调。
  for (const refund of successful) {
    const { service } = refundParts(refund);
    const ledgerId = 'points_restore_' + refund.outRefundNo;
    const existing = await read(transaction, 'pointsLedger', ledgerId);
    if (existing || (newRefundNo && refund.outRefundNo !== newRefundNo)) {
      cumulativeServiceRefund += service;
      if (existing) restored += Math.max(0, existing.delta || 0);
    } else {
      unposted.push({ refund, ledgerId, service });
    }
  }
  for (const { refund, ledgerId, service } of unposted) {
    cumulativeServiceRefund += service;
    const target = Math.floor(points * Math.min(cumulativeServiceRefund, serviceFee) / serviceFee);
    const delta = service > 0 ? Math.max(0, target - restored) : 0;
    const balance = integer(user.pointsBalance || 0, '积分余额') + delta;
    await insert(transaction, 'pointsLedger', { _id: ledgerId, openid: user.openid, delta,
      reason: 'refund', refId: order._id, refundId: refund.outRefundNo, balanceAfter: balance, createdAt: now });
    if (delta) {
      await transaction.collection('users').doc(user._id).update({ data: { pointsBalance: balance } });
      user.pointsBalance = balance;
      totalAdded += delta;
    }
    restored += delta;
  }
  return totalAdded;
}

function qualifiesForReferralCoupon(order, referredUser, provider) {
  return order.kind === 'service' && order.pricing.payAmount > 0 &&
    referredUser && referredUser.firstPaidOrderId === order._id &&
    provider && provider.openid && provider.communityId === order.communityId;
}

async function findReferralCandidates(server, order, enabled) {
  if (!enabled || !order.userId || order.status !== 'delivered' ||
      order.kind !== 'service' || order.pricing.payAmount <= 0) return null;
  const user = await server.get('users', order.userId);
  const providerId = user && user.source && user.source.referrerProviderId;
  if (!providerId || user.firstPaidOrderId !== order._id) return null;
  const provider = await server.get('providers', providerId);
  if (!qualifiesForReferralCoupon(order, user, provider)) return null;
  const recipient = await server.one('users', { openid: provider.openid });
  const templates = recipient ? await server.all('couponTemplates', { issueMode: 'referral', status: 'active' }) : [];
  return { providerId, openid: provider.openid, recipientId: recipient && recipient._id,
    templateIds: [...new Set(templates.filter(t => communityMatches(t, order.communityId)).map(t => t._id))] };
}

async function awardReferralCoupons(transaction, order, referredUser, referrerProvider, now, enabled, candidates) {
  if (!enabled || !qualifiesForReferralCoupon(order, referredUser, referrerProvider)) return 0;
  ensure(candidates && candidates.providerId === referrerProvider._id && candidates.openid === referrerProvider.openid,
    '推荐人资料已变化，请重试', 'E_CONFLICT');
  if (!candidates.recipientId) return 0;
  const user = await read(transaction, 'users', candidates.recipientId);
  ensure(user && user.openid === candidates.openid, '推荐人账号已变化，请重试', 'E_CONFLICT');
  const counts = user.couponCounts || {};
  let issuedCount = 0;
  for (const templateId of candidates.templateIds) {
    const template = await read(transaction, 'couponTemplates', templateId);
    if (!template || template.issueMode !== 'referral' || template.status !== 'active' ||
        !communityMatches(template, order.communityId)) continue;
    const count = counts[template._id] || 0;
    if (count >= template.perUserLimit || template.issued >= template.totalLimit) continue;
    const id = couponId(user.openid, template._id, order._id);
    if (await read(transaction, 'coupons', id)) continue;
    await insert(transaction, 'coupons', { _id: id, templateId: template._id, openid: user.openid,
      status: 'unused', validFrom: now, validTo: addDays(now, template.validDays), orderId: null,
      referralOrderId: order._id, createdAt: now });
    await transaction.collection('couponTemplates').doc(template._id).update({ data: {
      issued: (template.issued || 0) + 1, updatedAt: now
    } });
    counts[template._id] = count + 1;
    issuedCount++;
  }
  if (issuedCount) await transaction.collection('users').doc(user._id).update({ data: { couponCounts: counts } });
  return issuedCount;
}

async function finalizeRefundDiscounts(transaction, order, refunds, now, newRefundNo) {
  await restoreRefundedPoints(transaction, order, refunds, now, newRefundNo);
  let serviceRefunded = 0;
  let goodsRefunded = 0;
  for (const refund of refunds) {
    if (refund.status !== 'success') continue;
    const { service, goods } = refundParts(refund);
    serviceRefunded += service;
    goodsRefunded += goods;
  }
  if (serviceRefunded < order.pricing.payAmount || goodsRefunded < order.pricing.goodsCap) return false;
  if (order.pricing.couponId) {
    const coupon = await read(transaction, 'coupons', order.pricing.couponId);
    if (coupon && coupon.status === 'used' && coupon.orderId === order._id) {
      await transaction.collection('coupons').doc(coupon._id).update({ data: {
        status: coupon.validTo > now ? 'unused' : 'expired', orderId: null
      } });
    }
  }
  return true;
}

async function releaseCoupon(transaction, order, now) {
  if (!order.pricing.couponId) return;
  const coupon = await read(transaction, 'coupons', order.pricing.couponId);
  if (!coupon || coupon.status !== 'locked' || coupon.orderId !== order._id) return;
  await transaction.collection('coupons').doc(coupon._id).update({ data: {
    status: coupon.validTo > now ? 'unused' : 'expired', orderId: null
  } });
}

module.exports = { communityMatches, issueOne, issueAutomatic, lockOrderDiscounts, markCouponUsed,
  releaseCoupon, releaseOrderDiscounts, restoreRefundedPoints, findReferralCandidates, awardReferralCoupons, finalizeRefundDiscounts };
