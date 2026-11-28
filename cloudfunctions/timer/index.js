const cloud = require('wx-server-sdk');
const { createServer } = require('./lib/shared/server');
const { createPayFlow } = require('./lib/shared/payFlow');
const { createLedgerFlow } = require('./lib/shared/ledgerFlow');
const { ensure, integer } = require('./lib/shared/validate');
const { createMembershipTasks } = require('./lib/shared/membershipFlow');
const { createEventCancellationWorker } = require('./lib/shared/eventCancellation');
const { createNotifier } = require('./lib/shared/notify');
const { createPayoutFlow } = require('./lib/shared/payoutFlow');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const payments = createPayFlow(cloud, server);
const ledger = createLedgerFlow(server);
const notify = createNotifier(cloud, server);
const payout = createPayoutFlow(cloud, server);
const eventCancellation = createEventCancellationWorker(server, payments);
const { db, command } = server;

exports.main = async (event = {}) => {
  ensure(!cloud.getWXContext().OPENID && event.Type === 'Timer' && event.TriggerName === 'every5min', '仅允许定时触发', 'E_FORBIDDEN');
  const config = await server.config();
  const now = new Date();
  const results = {};
  async function run(name, filter, action) {
    results[name] = { done: 0, failed: 0 };
    try {
      const rows = await server.all('orders', filter());
      for (const row of rows) {
        try { await action(row); results[name].done++; }
        catch (error) { results[name].failed++; console.error(name, row._id, error.code || 'E_INTERNAL'); }
      }
    } catch (error) { results[name].failed++; console.error(name, error.code || 'E_INTERNAL'); }
  }
  await run('closeUnpaid', () => ({ status: 'pending_pay', createdAt: command.lte(new Date(now - integer(config.payTimeoutMinutes, '支付超时', 1) * 60000)) }),
    order => payments.closeUnpaid(order, 'system'));
  await run('unaccepted', () => ({ kind: 'service', status: 'paid', alertedAt: null,
    'payment.paidAt': command.lte(new Date(now - integer(config.acceptAlertMinutes, '告警时限', 1) * 60000)) }), async order => {
    const updated = await db.collection('orders').where({ _id: order._id, status: 'paid', alertedAt: null })
      .update({ data: { alertedAt: now, alertPriority: 1 } });
    if (updated.stats.updated === 1) await notify.unaccepted({ ...order, alertedAt: now });
  });
  await run('autoConfirm', () => ({ kind: command.neq('idle_purchase'), status: 'delivered',
    deliveredAt: command.lte(new Date(now - integer(config.autoConfirmHours, '自动确认时限', 1) * 3600000)) }),
    order => ledger.complete(order, 'system'));
  await run('idleAutoConfirm', () => ({ kind: 'idle_purchase', status: 'delivered',
    deliveredAt: command.lte(new Date(now - 72 * 3600000)) }), order => ledger.complete(order, 'system'));
  await run('refundRecovery', () => ({ 'refunds.status': command.in(['processing', 'failed']) }), async order => {
    for (const refund of order.refunds.filter(item => item.status !== 'success' && order.payment.mode === 'wechat')) {
      try {
        const retryEventRefund = order.kind === 'event_signup' && refund.key === 'event_auto_refund_' + order._id &&
          refund.status === 'failed';
        if (!refund.dispatchedAt && (refund.status === 'processing' || retryEventRefund)) {
          await payments.dispatchRefund(order, refund);
        } else await payments.setRefundResult(order._id, refund, await payments.verifyRefund(order, refund));
      } catch (error) { console.error('退款核对待重试', order._id, error.code || 'E_PAYMENT'); }
    }
  });
  try {
    const conversations = await server.all('conversations', { type: 'order', closedAt: null,
      closeAt: command.lte(now) });
    results.closeChats = { done: 0, failed: 0 };
    for (const conversation of conversations) {
      try {
        const result = await db.collection('conversations').where({ _id: conversation._id, closedAt: null })
          .update({ data: { closedAt: now, updatedAt: now } });
        if (result.stats.updated) results.closeChats.done++;
      } catch (error) { results.closeChats.failed++; console.error('聊天会话关闭失败', conversation._id, error.code || 'E_INTERNAL'); }
    }
  } catch (error) { results.closeChats = { failed: true }; console.error('聊天会话查询失败', error.code || 'E_INTERNAL'); }
  try {
    const expiredPosts = await server.all('posts', { type: command.in(['ask', 'carry']), status: 'open', expireAt: command.lte(now) });
    results.closeBoardPosts = { done: 0, failed: 0 };
    for (const post of expiredPosts) {
      try {
        const result = await db.collection('posts').where({ _id: post._id, status: 'open' })
          .update({ data: { status: 'closed', updatedAt: now } });
        if (result.stats.updated) results.closeBoardPosts.done++;
      } catch (error) { results.closeBoardPosts.failed++; console.error('需求帖到期关闭失败', post._id, error.code || 'E_INTERNAL'); }
    }
  } catch (error) { results.closeBoardPosts = { failed: true }; console.error('需求帖到期查询失败', error.code || 'E_INTERNAL'); }
  try {
    const cards = await server.all('memberships', { status: 'active', serviceCode: command.in(['trash','visit','vacant']), startAt: command.lte(now), endAt: command.gt(now) });
    results.membershipTasks = { created: 0, failed: 0 };
    const tasks = createMembershipTasks(server);
    for (const card of cards) {
      try { if (await tasks.generate(card, now)) results.membershipTasks.created++; }
      catch (error) { results.membershipTasks.failed++; console.error('月卡任务生成失败', card._id, error.code || 'E_INTERNAL'); }
    }
  } catch (error) { results.membershipTasks = { failed: true }; console.error('月卡任务查询失败', error.code || 'E_INTERNAL'); }
  try {
    const expiredVacantCards = await server.all('memberships', { status: 'active', serviceCode: 'vacant', endAt: command.lte(now) });
    results.expireMemberships = await db.collection('memberships').where({ status: 'active', endAt: command.lte(now) })
      .update({ data: { status: 'expired' } });
    results.expireVacantSecrets = { removed: 0, failed: 0 };
    for (const card of expiredVacantCards) {
      try {
        const result = await db.collection('secrets').doc('s_' + card._id).remove();
        if (result.stats && result.stats.removed) results.expireVacantSecrets.removed++;
      } catch (error) { results.expireVacantSecrets.failed++; console.error('空置房门锁密文清理失败', card._id, error.code || 'E_INTERNAL'); }
    }
  } catch (error) { results.expireMemberships = { failed: true }; console.error('月卡到期处理失败', error.code || 'E_INTERNAL'); }
  try { results.payouts = await payout.runPending(); }
  catch (error) { results.payouts = { failed: true }; console.error('提现查单任务失败', error.code || 'E_PAYOUT'); }
  try {
    results.endEvents = await db.collection('events').where({ status: 'published', endAt: command.lte(now) })
      .update({ data: { status: 'ended', updatedAt: now } });
  } catch (error) { results.endEvents = { failed: true }; console.error('活动结束状态更新失败', error.code || 'E_INTERNAL'); }
  try {
    await eventCancellation.run(now);
    results.eventCancellation = { ok: true };
  } catch (error) {
    results.eventCancellation = { failed: true };
    console.error('活动取消退款任务扫描失败', error.code || 'E_INTERNAL');
  }
  try {
    const from = new Date(now.getTime() + 115 * 60000), to = new Date(now.getTime() + 125 * 60000);
    const upcoming = await server.all('events', { status: 'published', startAt: command.gte(from).and(command.lt(to)) });
    results.eventReminders = { sent: 0, failed: 0 };
    for (const activity of upcoming) {
      try { await server.feature('events', activity.communityIds[0]); }
      catch (error) {
        if (error.code === 'E_FEATURE_OFF') continue;
        throw error;
      }
      const signups = await server.all('signups', { eventId: activity._id, status: 'signed', reminderSentAt: null });
      for (const signup of signups) {
        try {
          const result = await notify.eventReminder(signup.openid, activity);
          if (result.sent) {
            const updated = await db.collection('signups').where({ _id: signup._id, reminderSentAt: null })
              .update({ data: { reminderSentAt: now } });
            if (updated.stats.updated) results.eventReminders.sent++;
          } else results.eventReminders.failed++;
        } catch (error) { results.eventReminders.failed++; console.error('活动提醒发送失败', signup._id, error.code || 'E_NOTIFY'); }
      }
    }
  } catch (error) { results.eventReminders = { failed: true }; console.error('活动提醒扫描失败', error.code || 'E_INTERNAL'); }
  return { ok: true, data: results };
};
