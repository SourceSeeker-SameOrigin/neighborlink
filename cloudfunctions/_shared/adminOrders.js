const { requireOrderFeatures } = require('./orderFeatures');
const { ensure, text, integer } = require('./validate');
const { requireRole, requireCommunityAccess } = require('./auth');
const { canWork } = require('./providerData');
const { listView } = require('./orderData');
const { conditionalTransition } = require('./orderStore');
const { createPayFlow } = require('./payFlow');
const { createNotifier } = require('./notify');
const { totalFee } = require('./paymentState');
const { atomic, read, insert } = require('./transaction');
const { transitionPatch } = require('./orderData');
const { complaintResolution } = require('./orderLifecycle');
const { refundTotals } = require('./refundState');
const { createLedgerFlow } = require('./ledgerFlow');
const { splitMembershipSale } = require('./split');
const { ledgerDelta } = require('./orderLifecycle');
const { ensureOrderConversation } = require('./chatFlow');
const { refundEventSignup } = require('./eventFlow');
const { parseDate, addDays } = require('./time');
const { subsidyCsv } = require('./subsidyExport');

function adminOrderActions(cloud, server) {
  const payments = createPayFlow(cloud, server);
  const notify = createNotifier(cloud, server);
  const ledger = createLedgerFlow(server);
  async function managed(event, user) {
    requireRole(user, ['admin']);
    text(event.orderId, '订单');
    const order = await server.get('orders', event.orderId);
    ensure(order, '订单不存在');
    return order;
  }
  async function listOrders(event, { user }) {
    requireRole(user, ['admin', 'property']);
    const filter = {};
    const communityId = user.roles.includes('admin') ? event.communityId : user.communityId;
    if (communityId) { requireCommunityAccess(user, communityId); filter.communityId = communityId; }
    else ensure(user.roles.includes('admin'), '请先设置物业所属小区', 'E_FORBIDDEN');
    if (event.status) {
      ensure(['pending_quote', 'pending_pay', 'paid', 'accepted', 'in_service', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled', 'closed'].includes(event.status), '订单状态不正确');
      filter.status = event.status;
    }
    const offset = integer(event.offset === undefined ? 0 : event.offset, '分页位置', 0, 100000);
    const result = await server.db.collection('orders').where(filter).orderBy('alertPriority', 'desc').orderBy('createdAt', 'desc').skip(offset).limit(20).get();
    return { list: result.data.map(order => ({ ...listView(order), alerted: Boolean(order.alertedAt && order.status === 'paid'),
      attentionAlert: Boolean(order.serviceCode === 'visit' && order.visitReport && order.visitReport.attention) })),
      hasMore: result.data.length === 20, readOnly: !user.roles.includes('admin') };
  }
  async function exportSubsidyOrders(event, { user }) {
    requireRole(user, ['admin']);
    const from = parseDate(event.from);
    const toDay = parseDate(event.to);
    const to = addDays(toDay, 1);
    ensure(to > from && to - from <= 366 * 86400000, '导出期间必须在一年以内');
    const filter = { serviceCode: server.command.in(['meal', 'visit', 'escort']),
      createdAt: server.command.gte(from).and(server.command.lt(to)) };
    const rows = [];
    let page;
    do {
      page = await server.db.collection('orders').where(filter).orderBy('createdAt', 'asc')
        .skip(rows.length).limit(100).get();
      rows.push(...page.data);
      ensure(rows.length <= 5000, '记录超过 5000 条，请缩短导出期间');
    } while (page.data.length === 100);
    const file = await cloud.uploadFile({ cloudPath: 'exports/subsidy/' + Date.now() + '.csv', fileContent: Buffer.from(subsidyCsv(rows), 'utf8') });
    const result = await cloud.getTempFileURL({ fileList: [file.fileID] });
    return { fileId: file.fileID, tempFileURL: result.fileList[0].tempFileURL, count: rows.length };
  }
  async function assign(event, { user, openid }) {
    const order = await managed(event, user);
    await requireOrderFeatures(server, order);
    text(event.providerId, '服务员');
    const provider = await server.get('providers', event.providerId);
    canWork(provider, new Date(), order.minLevel);
    ensure(!order.requiredCert || (provider.certs || []).includes(order.requiredCert), '服务员缺少该任务要求的资质', 'E_FORBIDDEN');
    ensure(order.kind === 'service' && provider.communityId === order.communityId, '请选择本小区服务员');
    ensure(order.status === 'paid', '仅待接单订单可指派', 'E_BAD_STATE');
    const result = await conditionalTransition(server, order, 'accepted', openid, { providerId: provider._id,
      providerOpenid: provider.openid, acceptedAt: new Date() });
    await notify.resident('accepted', { ...order, status: 'accepted', providerId: provider._id,
      providerOpenid: provider.openid });
    try {
      await server.feature('chat', order.communityId);
      await ensureOrderConversation(server, { ...order, status: 'accepted', providerOpenid: provider.openid });
    } catch (error) { if (error.code !== 'E_FEATURE_OFF') console.error('指派订单会话创建待重试', order._id, error.code || 'E_INTERNAL'); }
    return result;
  }
  async function forceCancel(event, { user, openid }) {
    const order = await managed(event, user);
    ensure(order.kind !== 'membership_purchase' || order.status === 'pending_pay', '已开卡订单请使用月卡作废功能');
    ensure(['pending_quote', 'pending_pay', 'paid', 'accepted', 'in_service'].includes(order.status), '当前状态不能强制取消', 'E_BAD_STATE');
    if (order.status === 'pending_pay') { await payments.closeUnpaid(order, openid); return { status: 'closed' }; }
    const amount = totalFee(order) - order.refunds.reduce((sum, item) => sum + item.amount, 0);
    if (amount > 0) await payments.requestRefund(order, amount, '管理员取消订单', { key: 'admin_cancel', to: 'cancelled', actor: openid,
      ...(order.kind === 'event_signup' ? { afterWrite: (transaction, current) => refundEventSignup(transaction, current, new Date()) } : {}) });
    else await conditionalTransition(server, order, 'cancelled', openid);
    return { status: 'cancelled' };
  }
  async function retryRefund(event, { user }) {
    const order = await managed(event, user);
    text(event.outRefundNo, '退款号');
    const refund = order.refunds.find(item => item.outRefundNo === event.outRefundNo);
    ensure(refund, '退款记录不存在');
    if (refund.status !== 'success') await payments.dispatchRefund(order, refund);
    const fresh = await server.get('orders', order._id);
    return { refunds: fresh.refunds.map(({ outRefundNo, amount, reason, status, at }) => ({ outRefundNo, amount, reason, status, at })) };
  }
  async function resolveComplaint(event, { user, openid }) {
    const order = await managed(event, user);
    const resolution = complaintResolution(event, order, openid, new Date());
    const complaint = { ...order.complaint, resolution };
    async function bookResult(transaction, resultingOrder) {
      const totals = refundTotals(resultingOrder);
      await ledger.book(transaction, resultingOrder, { serviceRefund: totals.service,
        goodsRefund: totals.goodsAfterPurchase, providerLiable: resolution.providerLiable });
    }
    if (resolution.refundAmount > 0) {
      await payments.requestRefund(order, resolution.refundAmount, '投诉处理退款', {
        key: 'complaint_' + new Date(order.complaint.at).getTime(), to: 'refunded', actor: openid,
        parts: { service: resolution.serviceRefundAmount, goods: resolution.goodsRefundAmount },
        validateCurrent(current) {
          complaintResolution(event, current, openid, new Date());
          ensure(new Date(current.complaint.at).getTime() === new Date(order.complaint.at).getTime(),
            '投诉记录已变化，请刷新', 'E_CONFLICT');
        },
        patch: { complaint }, afterWrite: bookResult });
      return { status: 'refunded' };
    }
    await atomic(server.db, async transaction => {
      const current = await read(transaction, 'orders', order._id);
      complaintResolution(event, current, openid, new Date());
      ensure(new Date(current.complaint.at).getTime() === new Date(order.complaint.at).getTime(), '投诉记录已变化，请刷新', 'E_CONFLICT');
      await bookResult(transaction, current);
      if (!current.completedAt && current.providerId) {
        const provider = await read(transaction, 'providers', current.providerId);
        ensure(provider, '服务员资料不存在', 'E_CONFIG');
        await transaction.collection('providers').doc(provider._id).update({ data: { 'stats.completed': (provider.stats.completed || 0) + 1 } });
      }
      await transaction.collection('orders').doc(order._id).update({ data: {
        ...transitionPatch(current, 'completed', openid, new Date()), complaint,
        completedAt: current.completedAt || new Date() } });
    });
    return { status: 'completed' };
  }
  async function voidMembership(event, { user, openid }) {
    const order = await managed(event, user);
    ensure(order.kind === 'membership_purchase' && order.status === 'paid' && order.membershipId,
      '只有已开卡且未作废的购买订单可执行此操作', 'E_BAD_STATE');
    const amount = integer(event.refundAmount, '月卡退款', 0, order.pricing.payAmount);
    const note = text(event.note, '作废说明', 200).trim();
    const pendingTasks = await server.all('orders', { membershipId: order.membershipId, source: 'membership', status: 'paid' });
    async function revoke(transaction, current) {
      const card = await read(transaction, 'memberships', current.membershipId);
      ensure(card, '月卡不存在', 'E_CONFIG');
      await transaction.collection('memberships').doc(card._id).update({ data: { status: 'refunded' } });
      for (const id of new Set([...pendingTasks.map(task => task._id), ...(card.lastTaskId ? [card.lastTaskId] : [])])) {
        const task = await read(transaction, 'orders', id);
        if (task && task.status === 'paid') await transaction.collection('orders').doc(task._id)
          .update({ data: transitionPatch(task, 'cancelled', openid, new Date()) });
      }
      if (amount > 0) {
        const original = { gross: current.pricing.payAmount, ...splitMembershipSale(current.pricing.payAmount, current.rateSnapshot) };
        const after = { gross: current.pricing.payAmount - amount, ...splitMembershipSale(current.pricing.payAmount - amount, current.rateSnapshot) };
        await insert(transaction, 'ledger', { _id: 'membership_refund_' + current._id,
          refType: 'membership_sale', refId: current._id, communityId: current.communityId, providerId: null,
          amounts: ledgerDelta(after, original), settled: { provider: false, property: false },
          settlementIds: { provider: null, property: null }, createdAt: new Date() });
      }
    }
    if (amount > 0) await payments.requestRefund(order, amount, note, { key: 'membership_void',
      to: 'cancelled', actor: openid, patch: { membershipVoided: true }, afterWrite: revoke });
    else await atomic(server.db, async transaction => {
      const current = await read(transaction, 'orders', order._id);
      ensure(current.status === 'paid', '月卡订单状态已变化', 'E_CONFLICT');
      await revoke(transaction, current);
      await transaction.collection('orders').doc(order._id).update({ data: {
        ...transitionPatch(current, 'cancelled', openid, new Date()), membershipVoided: true } });
    });
    return { status: 'cancelled' };
  }
  return { listOrders, exportSubsidyOrders, assign, forceCancel, retryRefund, resolveComplaint, voidMembership };
}
module.exports = { adminOrderActions };
