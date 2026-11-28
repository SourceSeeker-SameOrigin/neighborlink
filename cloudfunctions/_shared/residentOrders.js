const { requireOrderFeatures } = require('./orderFeatures');
const { ensure, text } = require('./validate');
const { atomic, read } = require('./transaction');
const { complaint, rating } = require('./orderLifecycle');
const { conditionalTransition } = require('./orderStore');
const { createLedgerFlow } = require('./ledgerFlow');
const { ensureSafeResult } = require('./contentSafety');

function residentOrderActions(cloud, server) {
  const ledger = createLedgerFlow(server);
  async function own(event, openid) {
    text(event.orderId, '订单');
    const order = await server.get('orders', event.orderId);
    ensure(order && order.userOpenid === openid, '无权操作该订单', 'E_FORBIDDEN');
    return order;
  }
  async function safeText(value, openid) {
    if (value) ensureSafeResult(await cloud.openapi.security.msgSecCheck({ openid, version: 2, scene: 2, content: value }));
  }
  async function confirm(event, { openid }) {
    const order = await own(event, openid);
    await requireOrderFeatures(server, order);
    await ledger.complete(order, openid);
    return { orderId: order._id, status: 'completed' };
  }
  async function rate(event, { openid }) {
    const order = await own(event, openid);
    const value = rating(event, order, new Date());
    await safeText(value.text, openid);
    await atomic(server.db, async transaction => {
      const current = await read(transaction, 'orders', order._id);
      rating(event, current, new Date());
      if (current.kind === 'merchant') {
        const merchant = await read(transaction, 'merchants', current.merchantId);
        ensure(merchant, '商家资料不存在', 'E_CONFIG');
        await transaction.collection('orders').doc(order._id).update({ data: { rating: value, updatedAt: new Date() } });
        await transaction.collection('merchants').doc(merchant._id).update({ data: {
          ratingSum: (merchant.ratingSum || 0) + value.score, ratingCount: (merchant.ratingCount || 0) + 1 } });
        return;
      }
      const provider = await read(transaction, 'providers', current.providerId);
      ensure(provider, '服务员资料不存在', 'E_CONFIG');
      await transaction.collection('orders').doc(order._id).update({ data: { rating: value, updatedAt: new Date() } });
      await transaction.collection('providers').doc(provider._id).update({ data: {
        'stats.ratingSum': (provider.stats.ratingSum || 0) + value.score,
        'stats.ratingCount': (provider.stats.ratingCount || 0) + 1 } });
    });
    return { rating: value };
  }
  async function complain(event, { openid }) {
    const order = await own(event, openid);
    const config = await server.config();
    const value = complaint(event, order, new Date(), config.complaintWindowHours);
    await safeText(value.text, openid);
    // 内容检查返回后再次校验期限。
    complaint(event, order, new Date(), config.complaintWindowHours);
    return conditionalTransition(server, order, 'disputed', openid, { complaint: value });
  }
  return { confirm, rate, complain };
}
module.exports = { residentOrderActions };
