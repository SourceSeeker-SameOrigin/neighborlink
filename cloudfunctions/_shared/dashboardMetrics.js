const { ensure, integer } = require('./validate');
const { payoutCommunityAmounts } = require('./payout');

function extensionMetrics(orders, activities, payouts, communityIds = null) {
  ensure(Array.isArray(orders) && Array.isArray(activities) && Array.isArray(payouts), '看板数据不正确', 'E_CONFIG');
  const modules = new Map();
  let couponRedemptions = 0, pointsIssued = 0, pointsRedeemed = 0;
  for (const order of orders) {
    const key = order.serviceCode || order.kind || 'other';
    const item = modules.get(key) || { code: key, count: 0, paidCount: 0, paidAmount: 0 };
    item.count++;
    if (order.payment && order.payment.paidAt) {
      item.paidCount++;
      item.paidAmount += integer(order.pricing && order.pricing.payAmount || 0, '订单金额') +
        integer(order.pricing && order.pricing.goodsCap || 0, '商品预付金额');
      if (order.pricing && order.pricing.couponId) couponRedemptions++;
      pointsRedeemed += integer(order.pricing && order.pricing.pointsRedeemed || 0, '抵扣积分');
    }
    pointsIssued += integer(order.recycleResult && order.recycleResult.totalPoints || 0, '回收发放积分');
    modules.set(key, item);
  }
  const payoutStatus = {};
  for (const payout of payouts) {
    const amount = communityIds === null ? integer(payout.amount || 0, '打款金额') :
      payoutCommunityAmounts(payout).filter(item => communityIds.includes(item.communityId))
        .reduce((sum, item) => sum + item.amount, 0);
    if (!amount) continue;
    const status = payout.state || 'unknown';
    const item = payoutStatus[status] || { status, count: 0, amount: 0 };
    item.count++;
    item.amount += amount;
    payoutStatus[status] = item;
  }
  return { modules: [...modules.values()].sort((a, b) => a.code.localeCompare(b.code)),
    activitySignups: activities.reduce((sum, item) => sum + integer(item.signupCount || 0, '活动报名数'), 0),
    couponRedemptions, pointsIssued, pointsRedeemed, payoutStatus: Object.values(payoutStatus) };
}

function revenueMetrics(orders) {
  const totals = { paidOrders: 0, serviceFeeTurnover: 0, actualIncome: 0, goodsReceived: 0, goodsRefunded: 0, goodsNet: 0, refundTotal: 0 };
  for (const order of orders) {
    if (!order.payment || !order.payment.paidAt) continue;
    const service = integer(order.pricing.payAmount, '已付服务费');
    const goods = integer(order.pricing.goodsCap || 0, '已付商品款');
    const refunded = require('./refundState').refundTotals({ refunds: (order.refunds || []).filter(item => item.status === 'success') });
    ensure(refunded.service <= service && refunded.goods <= goods, '成功退款超过已付金额', 'E_CONFIG');
    totals.paidOrders++;
    totals.serviceFeeTurnover += service;
    totals.actualIncome += service - refunded.service;
    totals.goodsReceived += goods;
    totals.goodsRefunded += refunded.goods;
    totals.goodsNet += goods - refunded.goods;
    totals.refundTotal += refunded.service + refunded.goods;
  }
  return totals;
}
module.exports = { extensionMetrics, revenueMetrics };
