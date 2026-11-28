const crypto = require('crypto');
const { atomic, read, insert } = require('./transaction');
const { totalFee, paidPatch, firstPaidChanges, paidOrderChanges } = require('./paymentState');
const { reserveRefund, refundResult, success, verifiedPayment, verifiedRefund, field } = require('./refundState');
const { payConfig } = require('./payConfig');
const { SERVICE_NAMES, transitionPatch } = require('./orderData');
const { ensure } = require('./validate');
const { activateMembership } = require('./membershipFlow');
const { createNotifier } = require('./notify');
const { markCouponUsed, releaseOrderDiscounts, finalizeRefundDiscounts } = require('./couponFlow');
const { releaseReservation } = require('./idleData');
const { activateEventSignup, releaseEventSignup } = require('./eventFlow');
const { createPetVisits, removePetSecret } = require('./petFlow');

function createPayFlow(cloud, server) {
  const { db } = server;
  const nonce = () => crypto.randomBytes(16).toString('hex');
  const notify = createNotifier(cloud, server);

  async function dispatchEventRefund(order) {
    if (order.kind !== 'event_signup') return;
    const refund = (order.refunds || []).find(item => item.key === 'event_auto_refund_' + order._id);
    if (refund && (refund.status === 'failed' || (refund.status === 'processing' && !refund.dispatchedAt))) {
      await dispatchRefund(order, refund);
    }
  }

  async function onPaid(order, payment) {
    const user = await server.one('users', { openid: order.userOpenid });
    ensure(user, '订单用户不存在', 'E_CONFIG');
    let changed = false;
    const result = await atomic(db, async transaction => {
      const current = await read(transaction, 'orders', order._id);
      ensure(current, '订单不存在');
      const now = new Date();
      const patch = paidPatch(current, payment, now);
      if (!patch) return current;
      if (current.kind === 'idle_purchase') {
        const item = await read(transaction, 'idleItems', current.idleItemId);
        ensure(item && item.sellerOpenid === current.sellerOpenid && item.purchaseOrderId === current._id &&
          item.status === 'reserved', '闲置商品预留状态不一致，支付待核对', 'E_CONFLICT');
      }
      const currentUser = await read(transaction, 'users', user._id);
      const first = firstPaidChanges(current, currentUser, now);
      const paidCount = paidOrderChanges(current, currentUser, now);
      if (first) await insert(transaction, 'events', first.event);
      if (paidCount && paidCount.secondEvent) await insert(transaction, 'events', paidCount.secondEvent);
      const membership = current.kind === 'membership_purchase' ? await activateMembership(transaction, current, currentUser, now) : null;
      if (membership) Object.assign(patch, membership.orderPatch);
      await markCouponUsed(transaction, current, now);
      const eventResult = await activateEventSignup(transaction, current, now);
      if (eventResult?.cancelled && totalFee(current) > 0) {
        const paid = { ...current, ...patch };
        const reserved = reserveRefund(paid, totalFee(paid), '活动报名已截止或活动已取消', 'event_auto_refund_' + paid._id, now);
        Object.assign(patch, transitionPatch(paid, 'cancelled', 'system', now), { refunds: reserved.refunds });
        if (reserved.refund.status === 'success') {
          await finalizeRefundDiscounts(transaction, { ...current, ...patch }, reserved.refunds, now, reserved.refund.outRefundNo);
        }
      }
      if (current.serviceCode === 'pet') await createPetVisits(transaction, { ...current, ...patch });
      await transaction.collection('users').doc(user._id).update({ data: {
        ...(first ? first.user : {}), ...(paidCount ? paidCount.user : {}), ...(membership ? membership.userPatch : {}),
        orderRevision: (currentUser.orderRevision || 0) + 1 } });
      await transaction.collection('orders').doc(order._id).update({ data: patch });
      changed = true;
      return { ...current, ...patch };
    });
    await dispatchEventRefund(result);
    if (changed && result.kind === 'service') await notify.newTask(result);
    return result;
  }

  async function prepare(order) {
    if (order.payment.paidAt) return { orderId: order._id, free: true };
    ensure(order.status === 'pending_pay', '订单已关闭或结束，无法支付', 'E_BAD_STATE');
    const config = await server.config();
    ensure(order.payment.mode === config.payMode, '支付模式已变更，请联系客服', 'E_CONFIG');
    const env = payConfig(config.payMode);
    if (config.payMode === 'mock') return { orderId: order._id, mock: true };
    const description = order.kind === 'event_signup' ? '活动报名' : SERVICE_NAMES[order.serviceCode] || '月卡';
    const response = await cloud.cloudPay.unifiedOrder({ body: '近邻帮-' + description,
      outTradeNo: order.orderNo, spbillCreateIp: '127.0.0.1', subMchId: env.subMchId,
      totalFee: totalFee(order), envId: env.envId, functionName: 'payCallback', nonceStr: nonce() });
    ensure(success(response) && response.payment, '支付暂不可用，请到订单页重试', 'E_PAYMENT');
    const { timeStamp, nonceStr, package: packageValue, signType, paySign } = response.payment;
    return { orderId: order._id, payment: { timeStamp: String(timeStamp), nonceStr, package: packageValue, signType, paySign } };
  }

  async function verifyPaid(order) {
    const env = payConfig('wechat');
    const result = await cloud.cloudPay.queryOrder({ subMchId: env.subMchId, outTradeNo: order.orderNo, nonceStr: nonce() });
    return verifiedPayment(order, result, env.subMchId);
  }

  async function setRefundResult(orderId, refund, status, dispatched = false) {
    return atomic(db, async transaction => {
      const order = await read(transaction, 'orders', orderId);
      ensure(order, '订单不存在');
      const refunds = refundResult(order, refund.outRefundNo, refund.amount, status).map(item =>
        item.outRefundNo === refund.outRefundNo && dispatched ? { ...item, dispatchedAt: new Date() } : item);
      await transaction.collection('orders').doc(orderId).update({ data: { refunds, updatedAt: new Date() } });
      if (status === 'success') {
        const alreadySuccessful = order.refunds.some(item => item.outRefundNo === refund.outRefundNo && item.status === 'success');
        if (!alreadySuccessful) await finalizeRefundDiscounts(transaction, order, refunds, new Date(), refund.outRefundNo);
        await releaseReservation(transaction, order);
      }
      return { ...order, refunds };
    });
  }

  async function dispatchRefund(order, refund) {
    if (refund.status === 'success') return;
    if (order.payment.mode === 'mock') {
      await setRefundResult(order._id, refund, 'success');
      return;
    }
    const env = payConfig('wechat');
    try {
      const result = await cloud.cloudPay.refund({ outTradeNo: order.orderNo, outRefundNo: refund.outRefundNo,
        totalFee: totalFee(order), refundFee: refund.amount, subMchId: env.subMchId, envId: env.envId,
        functionName: 'refundCallback', nonceStr: nonce() });
      ensure(success(result), '退款申请失败，请联系管理员重试', 'E_PAYMENT');
      await setRefundResult(order._id, refund, 'processing', true);
    } catch (error) {
      await setRefundResult(order._id, refund, 'failed');
      // 不记录原始微信响应或个人信息。订单保留相同退款号供重试，避免重复退钱。
      console.error('退款待重试', order._id, refund.outRefundNo, error.code || 'E_PAYMENT');
    }
  }

  async function requestRefund(order, amount, reason, options = {}) {
    payConfig(order.payment.mode);
    const result = await atomic(db, async transaction => {
      const current = await read(transaction, 'orders', order._id);
      ensure(current, '订单不存在');
      if (options.validateCurrent) options.validateCurrent(current);
      const reserved = reserveRefund(current, amount, reason, options.key || reason, new Date(), options.parts);
      if (reserved.repeated) return { order: current, refund: reserved.refund };
      ensure(current.status === order.status, '订单状态已变化，请刷新后重试', 'E_CONFLICT');
      const patch = { ...(options.patch || {}), refunds: reserved.refunds, updatedAt: new Date() };
      if (options.to) Object.assign(patch, transitionPatch(current, options.to, options.actor || 'system', new Date()));
      await transaction.collection('orders').doc(order._id).update({ data: patch });
      const resultingOrder = { ...current, ...patch };
      if (reserved.refund.status === 'success') await releaseReservation(transaction, resultingOrder);
      if (resultingOrder.serviceCode === 'pet' && resultingOrder.status === 'cancelled') await removePetSecret(transaction, resultingOrder);
      if (options.afterWrite) await options.afterWrite(transaction, resultingOrder);
      if (reserved.refund.status === 'success') {
        await finalizeRefundDiscounts(transaction, resultingOrder, reserved.refunds, new Date(), reserved.refund.outRefundNo);
      }
      return { order: resultingOrder, refund: reserved.refund };
    });
    await dispatchRefund(result.order, result.refund);
    return result.order;
  }

  async function verifyRefund(order, refund) {
    const env = payConfig('wechat');
    const result = await cloud.cloudPay.queryRefund({ subMchId: env.subMchId, outRefundNo: refund.outRefundNo, nonceStr: nonce() });
    return verifiedRefund(order, refund, result, env.subMchId);
  }

  async function closeUnpaid(order, actor) {
    if (order.payment.mode === 'wechat') {
      const env = payConfig('wechat');
      const result = await cloud.cloudPay.closeOrder({ subMchId: env.subMchId, outTradeNo: order.orderNo, nonceStr: nonce() });
      // 已关闭也可能来自前次网络响应丢失；其他错误不能把已支付订单关掉。
      if (!success(result)) {
        const checked = await cloud.cloudPay.queryOrder({ subMchId: env.subMchId, outTradeNo: order.orderNo, nonceStr: nonce() });
        ensure(success(checked) && field(checked, 'tradeState', 'trade_state') === 'CLOSED',
          '微信订单状态待确认，请稍后刷新', 'E_PAYMENT');
      }
    }
    const now = new Date();
    await atomic(db, async transaction => {
      const current = await read(transaction, 'orders', order._id);
      ensure(current && ['pending_pay', 'closed'].includes(current.status), '订单状态已变化，请刷新后重试', 'E_CONFLICT');
      if (current.status === 'pending_pay') {
        const user = await read(transaction, 'users', current.userId);
        ensure(user, '订单用户不存在', 'E_CONFIG');
        await releaseOrderDiscounts(transaction, current, user, new Date());
        await releaseEventSignup(transaction, current, 'cancelled', now);
        await transaction.collection('orders').doc(current._id).update({ data: transitionPatch(current, 'closed', actor, now) });
      }
      if (current.kind === 'idle_purchase') await releaseReservation(transaction, current);
      if (current.serviceCode === 'pet') await removePetSecret(transaction, current);
      if (current.kind === 'membership_purchase' && current.planCode === 'vacant_monthly') {
        const secret = await read(transaction, 'secrets', 's_' + current._id);
        if (secret) await transaction.collection('secrets').doc(secret._id).remove();
      }
    });
  }

  return { onPaid, dispatchEventRefund, prepare, verifyPaid, requestRefund, dispatchRefund, verifyRefund, setRefundResult, closeUnpaid };
}

module.exports = { createPayFlow };
