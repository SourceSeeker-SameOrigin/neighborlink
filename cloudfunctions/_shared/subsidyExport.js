const { csvCell } = require('./settlementData');
const { ymd, hm } = require('./time');

const HEADER = Object.freeze(['订单号', '小区ID', '服务代码', '订单状态', '创建时间', '完成时间',
  '服务费实付（分）', '餐费实际（分）', '退款合计（分）']);

function paidServiceFee(order) {
  const payment = order.payment || {};
  const history = Array.isArray(order.timeline) ? order.timeline : [];
  const recorded = payment.paidAt || payment.transactionId || history.some(entry => entry?.status === 'paid');
  if (recorded) {
    const fee = order.pricing?.payAmount;
    return Number.isSafeInteger(fee) && fee >= 0 ? fee : '';
  }
  if (['pending_pay', 'pending_quote'].includes(order.status)) return 0;
  if (order.status === 'closed' && (payment.paidAt === null ||
      history.some(entry => entry?.status === 'pending_pay' || entry?.status === 'pending_quote'))) return 0;
  return '';
}

function subsidyCsv(orders) {
  const rows = (orders || []).map(order => [order.orderNo, order.communityId, order.serviceCode, order.status,
    ymd(order.createdAt) + ' ' + hm(order.createdAt), order.completedAt ? ymd(order.completedAt) + ' ' + hm(order.completedAt) : '',
    paidServiceFee(order), order.pricing?.goodsActual || 0,
    (order.refunds || []).filter(item => item.status === 'success').reduce((sum, item) => sum + item.amount, 0)]);
  return '\uFEFF' + [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

module.exports = { HEADER, subsidyCsv };
