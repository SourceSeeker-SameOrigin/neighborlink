const { ensure, integer, text } = require('./validate');
const { totalFee } = require('./paymentState');

function refundParts(refund) {
  const goods = refund.goodsAmount === undefined && refund.key === 'goods_difference'
    ? refund.amount : (refund.goodsAmount || 0);
  const service = refund.serviceAmount === undefined ? refund.amount - goods : refund.serviceAmount;
  return { goods, service };
}

function refundTotals(order) {
  return order.refunds.reduce((sum, refund) => {
    const { goods, service } = refundParts(refund);
    integer(goods, '已申请商品退款');
    integer(service, '已申请服务退款');
    ensure(goods + service === refund.amount, '退款分项记录不一致', 'E_CONFIG');
    sum.service += service;
    sum.goods += goods;
    if (refund.key !== 'goods_difference') sum.goodsAfterPurchase += goods;
    return sum;
  }, { service: 0, goods: 0, goodsAfterPurchase: 0 });
}

function reserveRefund(order, amount, reason, key, now, parts) {
  integer(amount, '退款金额', 1);
  text(reason, '退款原因', 200);
  text(key, '退款业务编号', 100);
  ensure(order.payment.paidAt, '未支付订单不能退款', 'E_BAD_STATE');
  const existing = order.refunds.find(refund => refund.key === key);
  if (existing) {
    ensure(existing.amount === amount, '该退款请求金额已变更', 'E_CONFLICT');
    if (parts) ensure(existing.serviceAmount === parts.service && existing.goodsAmount === parts.goods,
      '该退款请求分项金额已变更', 'E_CONFLICT');
    return { refund: existing, refunds: order.refunds, repeated: true };
  }
  const used = refundTotals(order);
  ensure(amount <= totalFee(order) - used.service - used.goods, '退款金额超过剩余可退金额');
  if (!parts) {
    if (key === 'goods_difference') parts = { service: 0, goods: amount };
    else if (!order.pricing.goodsCap) parts = { service: amount, goods: 0 };
    else {
      ensure(['cancel', 'admin_cancel'].includes(key) && amount === totalFee(order) - used.service - used.goods,
        '请分别填写服务费退款与商品款退款');
      parts = { service: order.pricing.payAmount - used.service, goods: order.pricing.goodsCap - used.goods };
    }
  }
  integer(parts.service, '服务费退款', 0, order.pricing.payAmount - used.service);
  integer(parts.goods, '商品款退款', 0, order.pricing.goodsCap - used.goods);
  ensure(parts.service + parts.goods === amount, '退款分项合计与总额不一致');
  const refund = { outRefundNo: order.orderNo + 'R' + (order.refunds.length + 1), amount,
    serviceAmount: parts.service, goodsAmount: parts.goods, reason, key,
    status: order.payment.mode === 'mock' ? 'success' : 'processing', at: now, dispatchedAt: null };
  return { refund, refunds: [...order.refunds, refund], repeated: false };
}

function refundResult(order, outRefundNo, amount, status) {
  ensure(['processing', 'success', 'failed'].includes(status), '退款状态不正确');
  const target = order.refunds.find(item => item.outRefundNo === outRefundNo);
  ensure(target && target.amount === amount, '退款记录或金额不一致', 'E_PAYMENT');
  // 成功是不可逆终态，迟到或重复回调不能把成功降级。
  if (target.status === 'success') return order.refunds;
  return order.refunds.map(item => item.outRefundNo === outRefundNo ? { ...item, status } : item);
}

function field(response, camel, snake) {
  // wx-server-sdk 转换 _字母，但保留 _数字（例如 outRefundNo_0）。
  const sdkKey = snake.replace(/_[a-z]/g, match => match[1].toUpperCase());
  return response[camel] ?? response[sdkKey] ?? response[snake];
}
function success(response) {
  return response && field(response, 'returnCode', 'return_code') === 'SUCCESS' && field(response, 'resultCode', 'result_code') === 'SUCCESS';
}
function verifiedPayment(order, response, subMchId) {
  ensure(success(response) && field(response, 'tradeState', 'trade_state') === 'SUCCESS', '微信尚未确认支付成功', 'E_PAYMENT');
  ensure(field(response, 'outTradeNo', 'out_trade_no') === order.orderNo &&
    String(field(response, 'subMchId', 'sub_mch_id')) === subMchId, '微信支付订单信息不一致', 'E_PAYMENT');
  const amount = Number(field(response, 'totalFee', 'total_fee'));
  integer(amount, '微信支付金额');
  ensure(amount === totalFee(order), '微信支付金额不一致', 'E_PAYMENT');
  return { mode: 'wechat', amount, transactionId: field(response, 'transactionId', 'transaction_id') };
}

function verifiedRefund(order, refund, response, subMchId) {
  ensure(success(response) && field(response, 'outTradeNo', 'out_trade_no') === order.orderNo &&
    String(field(response, 'subMchId', 'sub_mch_id')) === subMchId &&
    Number(field(response, 'totalFee', 'total_fee')) === totalFee(order), '微信退款订单信息不一致', 'E_PAYMENT');
  const count = integer(Number(field(response, 'refundCount', 'refund_count')), '退款笔数', 1, 100);
  for (let i = 0; i < count; i++) {
    if (field(response, 'outRefundNo' + i, 'out_refund_no_' + i) !== refund.outRefundNo) continue;
    ensure(Number(field(response, 'refundFee' + i, 'refund_fee_' + i)) === refund.amount, '微信退款金额不一致', 'E_PAYMENT');
    const status = field(response, 'refundStatus' + i, 'refund_status_' + i);
    ensure(['SUCCESS', 'PROCESSING', 'REFUNDCLOSE', 'CHANGE'].includes(status), '微信退款状态待确认', 'E_PAYMENT');
    return status === 'SUCCESS' ? 'success' : status === 'PROCESSING' ? 'processing' : 'failed';
  }
  ensure(false, '微信退款记录尚未确认', 'E_PAYMENT');
}

module.exports = { reserveRefund, refundResult, refundTotals, refundParts, field, success, verifiedPayment, verifiedRefund };
