const cloud = require('wx-server-sdk');
const { createServer } = require('./lib/shared/server');
const { createPayFlow } = require('./lib/shared/payFlow');
const { success, field } = require('./lib/shared/refundState');
const { paidPatch } = require('./lib/shared/paymentState');
const { ensure, text } = require('./lib/shared/validate');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const payments = createPayFlow(cloud, server);
exports.main = async (event = {}) => {
  try {
    ensure(!cloud.getWXContext().OPENID, '不接受客户端支付回调', 'E_FORBIDDEN');
    ensure(success(event), '支付回调未成功', 'E_PAYMENT');
    const outTradeNo = field(event, 'outTradeNo', 'out_trade_no');
    text(outTradeNo, '订单号', 32);
    const order = await server.one('orders', { orderNo: outTradeNo });
    ensure(order && order.payment.mode === 'wechat', '支付订单不存在', 'E_PAYMENT');
    const callback = { mode: 'wechat', amount: Number(field(event, 'totalFee', 'total_fee')),
      transactionId: field(event, 'transactionId', 'transaction_id') };
    const patch = paidPatch(order, callback, new Date());
    if (!patch) {
      await payments.dispatchEventRefund(order);
      return { errcode: 0, errmsg: '' };
    }
    const verified = await payments.verifyPaid(order);
    ensure(verified.transactionId === callback.transactionId, '支付流水不一致', 'E_PAYMENT');
    await payments.onPaid(order, verified);
    return { errcode: 0, errmsg: '' };
  } catch (error) {
    console.error('支付回调未处理', error.code || 'E_INTERNAL');
    return { errcode: 1, errmsg: '支付结果待核实，请重试' };
  }
};
