const { atomic, read, insert } = require('./transaction');
const { accounting, ledgerDelta } = require('./orderLifecycle');
const { transitionPatch } = require('./orderData');
const { ensure } = require('./validate');
const { referralAward } = require('./paymentState');
const { orderConversationId } = require('./chatData');
const { isEnabled } = require('./features');
const { findReferralCandidates, awardReferralCoupons } = require('./couponFlow');
const { removePetSecret } = require('./petFlow');

function createLedgerFlow(server) {
  async function book(transaction, order, accountingInput = {}) {
    const target = order.serviceCode === 'recycle' ? { gross: 0,
      provider: order.recycleResult && order.recycleResult.providerPayoutFen || 0,
      property: 0, platform: 0, goods: 0 } : accounting(order, accountingInput);
    const delta = ledgerDelta(target, order.bookedAmounts);
    const version = (order.ledgerVersion || 0) + 1;
    const now = new Date();
    if (!order.bookedAmounts || Object.values(delta).some(value => value !== 0)) {
      await insert(transaction, 'ledger', { _id: 'order_' + order._id + '_' + version,
        refType: order.kind === 'idle_purchase' ? 'idle_sale' : order.kind === 'merchant' ? 'merchant_order' : 'order', refId: order._id,
        communityId: order.communityId, providerId: order.providerId || null, merchantId: order.merchantId || null,
        sellerOpenid: order.sellerOpenid || null, sellerUserId: order.sellerUserId || null,
        amounts: delta, settled: { provider: false, property: false, seller: false, merchant: false },
        settlementIds: { provider: null, property: null, seller: null, merchant: null }, createdAt: now });
    }
    await transaction.collection('orders').doc(order._id).update({ data: { bookedAmounts: target, ledgerVersion: version } });
  }

  async function complete(order, actor) {
    const config = await server.config();
    const candidates = await findReferralCandidates(server, order, config.features && config.features.coupons);
    return atomic(server.db, async transaction => {
      const current = await read(transaction, 'orders', order._id);
      ensure(current, '订单不存在');
      if (current.status === 'completed' && current.bookedAmounts) return current;
      ensure(current.status === 'delivered', '订单状态已变化，无法确认', 'E_CONFLICT');
      const now = new Date();
      const patch = { ...transitionPatch(current, 'completed', actor, now), completedAt: current.completedAt || now };
      await book(transaction, current);
      if (current.serviceCode === 'pet') await removePetSecret(transaction, current);
      if (current.kind === 'idle_purchase') {
        const item = await read(transaction, 'idleItems', current.idleItemId);
        ensure(item && item.sellerOpenid === current.sellerOpenid && item.purchaseOrderId === current._id &&
          item.status === 'reserved', '闲置商品预留状态不一致，无法结算', 'E_CONFLICT');
        await transaction.collection('idleItems').doc(item._id).update({ data: { status: 'sold', updatedAt: now } });
      }
      const user = current.userId ? await read(transaction, 'users', current.userId) : null;
      if (user && user.source && user.source.referrerProviderId) {
        const referrer = await read(transaction, 'providers', user.source.referrerProviderId);
        const award = referralAward(current, user, referrer, config.referralBonus || 0);
        if (award && !(await read(transaction, 'ledger', award._id))) await insert(transaction, 'ledger', { ...award, createdAt: now });
        const settings = await read(transaction, 'config', 'global');
        ensure(settings, '请先初始化全局配置', 'E_CONFIG');
        await awardReferralCoupons(transaction, current, user, referrer, now,
          Boolean(settings.features && settings.features.coupons), candidates);
      }
      if (!current.completedAt && current.providerId) {
        const provider = await read(transaction, 'providers', current.providerId);
        ensure(provider, '订单服务员资料不存在', 'E_CONFIG');
        await transaction.collection('providers').doc(provider._id).update({ data: { 'stats.completed': (provider.stats.completed || 0) + 1 } });
      }
      const community = await read(transaction, 'communities', current.communityId);
      if (current.providerOpenid && isEnabled('chat', config, community)) {
        const conversationId = orderConversationId(current._id, current.providerOpenid);
        const conversation = await read(transaction, 'conversations', conversationId);
        if (conversation && !conversation.closedAt) {
          const closeAt = new Date(patch.completedAt.getTime() + Number(config.phoneVisibleHoursAfterDone) * 3600000);
          await transaction.collection('conversations').doc(conversationId).update({ data: {
            closeAt, ...(closeAt <= now ? { closedAt: now } : {}), updatedAt: now
          } });
        }
      }
      await transaction.collection('orders').doc(current._id).update({ data: patch });
      return { ...current, ...patch };
    });
  }
  return { book, complete };
}
module.exports = { createLedgerFlow };
