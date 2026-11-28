const { atomic, read } = require('./transaction');
const { ensure } = require('./validate');
const { totalFee } = require('./paymentState');
const { refundEventSignup, releaseEventSignup } = require('./eventFlow');

const PAGE_SIZE = 50;
const MAX_ATTEMPTS = 8;
const TASK_LEASE_MS = 2 * 60 * 1000;

function taskId(signupId) { return 'event_cancel_task_' + signupId; }

function retryDelay(attempt) {
  return Math.min(5 * 60 * 1000 * (2 ** Math.max(0, attempt - 1)), 6 * 60 * 60 * 1000);
}

function createEventCancellationWorker(server, payments) {
  const { db, command } = server;

  async function updateProgress(jobId, now) {
    const [completed, failed, pending, processing, retry, waiting] = await Promise.all([
      db.collection('eventCancelTasks').where({ jobId, status: 'completed' }).count(),
      db.collection('eventCancelTasks').where({ jobId, status: 'failed' }).count(),
      db.collection('eventCancelTasks').where({ jobId, status: 'pending' }).count(),
      db.collection('eventCancelTasks').where({ jobId, status: 'processing' }).count(),
      db.collection('eventCancelTasks').where({ jobId, status: 'retry' }).count(),
      db.collection('eventCancelTasks').where({ jobId, status: 'waiting' }).count()
    ]);
    const job = await server.get('eventCancelJobs', jobId);
    if (!job) return;
    const completedCount = completed.total || 0;
    const failedCount = failed.total || 0;
    const outstanding = (pending.total || 0) + (processing.total || 0) + (retry.total || 0) + (waiting.total || 0);
    const status = job.scanComplete && outstanding === 0 ? (failedCount ? 'attention' : 'completed') : 'processing';
    await db.collection('eventCancelJobs').doc(jobId).update({ data: {
      status, completedCount, failedCount, retryCount: retry.total || 0,
      updatedAt: now, leaseUntil: null, leaseToken: null
    } });
  }

  async function initializeTotal(jobId, totalCount, now) {
    await atomic(db, async transaction => {
      const current = await read(transaction, 'eventCancelJobs', jobId);
      if (current && current.totalCount === undefined) await transaction.collection('eventCancelJobs').doc(jobId).update({ data: {
        totalCount, updatedAt: now
      } });
    });
  }

  async function enqueuePage(job, now) {
    const filter = { eventId: job.eventId, status: command.in(['pending_pay', 'signed']) };
    if (job.scanCursor) filter._id = command.gt(job.scanCursor);
    const result = await db.collection('signups').where(filter).orderBy('_id', 'asc').limit(PAGE_SIZE).get();
    for (const signup of result.data) {
      const id = taskId(signup._id);
      const existing = await server.get('eventCancelTasks', id);
      if (!existing) await db.collection('eventCancelTasks').doc(id).set({ data: {
        eventId: job.eventId, jobId: job._id, signupId: signup._id, orderId: signup.orderId || null,
        status: 'pending', attempts: 0, createdAt: now, updatedAt: now
      } });
    }
    const scanComplete = result.data.length < PAGE_SIZE;
    await db.collection('eventCancelJobs').doc(job._id).update({ data: {
      scanCursor: result.data.length ? result.data[result.data.length - 1]._id : job.scanCursor || null,
      scanComplete, status: scanComplete ? 'processing' : 'queued', updatedAt: now
    } });
  }

  async function claimTask(task, now) {
    return atomic(db, async transaction => {
      const current = await read(transaction, 'eventCancelTasks', task._id);
      if (!current || ['completed', 'failed'].includes(current.status)) return null;
      if (current.status === 'processing' && current.leaseUntil && current.leaseUntil > now) return null;
      if (current.nextAt && current.nextAt > now) return null;
      const claimed = { ...current, status: 'processing',
        attempts: (current.attempts || 0) + (current.status === 'waiting' ? 0 : 1),
        leaseUntil: new Date(now.getTime() + TASK_LEASE_MS), updatedAt: now };
      const { _id, ...patch } = claimed;
      await transaction.collection('eventCancelTasks').doc(task._id).update({ data: patch });
      return claimed;
    });
  }

  async function closeFreeSignup(signup, now, withoutOrder = false) {
    await atomic(db, async transaction => {
      const current = await read(transaction, 'signups', signup._id);
      if (withoutOrder) ensure(current && current.eventId === signup.eventId, '报名记录已变化', 'E_CONFLICT');
      else if (!current || !['signed', 'pending_pay'].includes(current.status)) return;
      const event = await read(transaction, 'events', current.eventId);
      if (withoutOrder) {
        ensure(!current.orderId && event && event.fee === 0 && event.status === 'cancelled',
          '免费报名与活动状态不一致', 'E_CONFIG');
        ensure(['signed', 'cancelled'].includes(current.status), '免费报名状态待核对', 'E_CONFLICT');
      }
      if (!['signed', 'pending_pay'].includes(current.status)) return;
      await transaction.collection('signups').doc(current._id).update({ data: { status: 'cancelled', cancelledAt: now } });
      if (event) await transaction.collection('events').doc(event._id).update({ data: {
        signupCount: Math.max(0, (event.signupCount || 0) - (current.status === 'signed' ? 1 : 0)),
        reservedCount: Math.max(0, (event.reservedCount || 0) - (current.status === 'pending_pay' ? 1 : 0)),
        updatedAt: now
      } });
    });
  }

  async function perform(task, now) {
    const signup = await server.get('signups', task.signupId);
    if (!signup) throw Object.assign(new Error('报名记录不存在'), { code: 'E_NOT_FOUND' });
    ensure(signup.eventId === task.eventId, '报名不属于该活动', 'E_CONFIG');
    if (!signup.orderId) {
      await closeFreeSignup(signup, now, true);
      return 'completed';
    }
    let order = signup.orderId ? await server.get('orders', signup.orderId) : null;
    if (!order) throw Object.assign(new Error('报名订单不存在'), { code: 'E_CONFIG' });
    const key = 'event_cancel_' + signup._id;
    let refund = (order.refunds || []).find(item => item.key === key);
    const amount = totalFee(order);

    if (refund && refund.status === 'success') return 'completed';
    if (refund && refund.status === 'processing' && refund.dispatchedAt) {
      const verified = await payments.verifyRefund(order, refund);
      await payments.setRefundResult(order._id, refund, verified);
      order = await server.get('orders', order._id);
      refund = (order.refunds || []).find(item => item.key === key);
      if (refund && refund.status === 'success') return 'completed';
      if (refund && refund.status === 'processing') return 'waiting';
    }
    if (signup.status === 'cancelled' && (!refund || refund.status === 'success')) return 'completed';
    if (signup.status === 'pending_pay' && order.status === 'pending_pay') {
      await payments.closeUnpaid(order, 'system');
      return 'completed';
    }
    if (signup.status === 'pending_pay' && order.status === 'closed') {
      await atomic(db, transaction => releaseEventSignup(transaction, order, 'cancelled', now));
      return 'completed';
    }
    if (order.payment && order.payment.paidAt && amount > 0) {
      if (refund) await payments.dispatchRefund(order, refund);
      else await payments.requestRefund(order, amount, '活动取消全额退款', {
          key, to: 'cancelled', actor: 'system',
          afterWrite: (transaction, current) => refundEventSignup(transaction, current, now)
        });
      order = await server.get('orders', order._id);
      refund = (order.refunds || []).find(item => item.key === key);
      if (refund && refund.status === 'success') return 'completed';
      return refund && refund.status === 'processing' ? 'waiting' : 'retry';
    }
    if (amount === 0 && ['signed', 'pending_pay'].includes(signup.status)) {
      await closeFreeSignup(signup, now);
      return 'completed';
    }
    if (order.status === 'closed' && signup.status === 'cancelled') return 'completed';
    throw Object.assign(new Error('订单支付状态待核对'), { code: 'E_PAYMENT' });
  }

  async function processTask(task, now) {
    const claimed = await claimTask(task, now);
    if (!claimed) return;
    try {
      const result = await perform(claimed, now);
      const terminal = result === 'retry' && claimed.attempts >= MAX_ATTEMPTS;
      const status = terminal ? 'failed' : result;
      const nextAt = result === 'waiting' ? new Date(now.getTime() + 5 * 60 * 1000)
        : result === 'retry' && !terminal ? new Date(now.getTime() + retryDelay(claimed.attempts)) : null;
      await db.collection('eventCancelTasks').doc(claimed._id).update({ data: {
        status, nextAt, leaseUntil: null, lastErrorCode: terminal ? 'E_RETRY_LIMIT' : null, updatedAt: now
      } });
    } catch (error) {
      const terminal = claimed.attempts >= MAX_ATTEMPTS;
      await db.collection('eventCancelTasks').doc(claimed._id).update({ data: {
        status: terminal ? 'failed' : 'retry', nextAt: terminal ? null : new Date(now.getTime() + retryDelay(claimed.attempts)),
        leaseUntil: null, lastErrorCode: error.code || 'E_INTERNAL', updatedAt: now
      } });
      console.error('活动取消退款任务待重试', claimed._id, error.code || 'E_INTERNAL');
    }
  }

  async function processJob(job, now) {
    const leaseToken = `${now.getTime()}_${Math.random().toString(36).slice(2, 10)}`;
    const claimed = await atomic(db, async transaction => {
      const current = await read(transaction, 'eventCancelJobs', job._id);
      if (!current || ['completed', 'attention'].includes(current.status)) return null;
      if (current.leaseUntil && current.leaseUntil > now) return null;
      await transaction.collection('eventCancelJobs').doc(job._id).update({ data: {
        status: 'processing', leaseUntil: new Date(now.getTime() + 10 * 60 * 1000), leaseToken, updatedAt: now
      } });
      return current;
    });
    if (!claimed) return;
    let active = claimed;
    if (active.totalCount === undefined) {
      const count = await db.collection('signups').where({ eventId: active.eventId, status: command.in(['pending_pay', 'signed']) }).count();
      await initializeTotal(active._id, count.total || 0, now);
      active = { ...active, totalCount: count.total || 0 };
    }
    if (!active.scanComplete) await enqueuePage(active, now);
    const ready = await db.collection('eventCancelTasks').where({ jobId: active._id, status: 'pending' })
      .orderBy('createdAt', 'asc').limit(PAGE_SIZE).get();
    const retry = await db.collection('eventCancelTasks').where({ jobId: active._id,
      status: command.in(['retry', 'waiting']), nextAt: command.lte(now) }).orderBy('nextAt', 'asc').limit(PAGE_SIZE).get();
    const expired = await db.collection('eventCancelTasks').where({ jobId: active._id, status: 'processing',
      leaseUntil: command.lte(now) }).orderBy('updatedAt', 'asc').limit(PAGE_SIZE).get();
    const tasks = [...ready.data, ...retry.data, ...expired.data].slice(0, PAGE_SIZE);
    for (const task of tasks) await processTask(task, now);
    await updateProgress(active._id, now);
  }

  async function run(now = new Date()) {
    const jobs = await db.collection('eventCancelJobs').where({ status: command.in(['queued', 'processing']) })
      .orderBy('createdAt', 'asc').limit(5).get();
    for (const job of jobs.data) {
      try { await processJob(job, now); }
      catch (error) { console.error('活动取消任务处理失败', job._id, error.code || 'E_INTERNAL'); }
    }
  }

  async function retryFailed(eventId) {
    const jobId = 'event_cancel_' + eventId;
    const rows = await db.collection('eventCancelTasks').where({ jobId, status: 'failed' }).limit(100).get();
    for (const task of rows.data) await db.collection('eventCancelTasks').doc(task._id).update({ data: {
      status: 'retry', attempts: 0, nextAt: new Date(), lastErrorCode: null, updatedAt: new Date()
    } });
    if (rows.data.length) await db.collection('eventCancelJobs').doc(jobId).update({ data: { status: 'processing', updatedAt: new Date() } });
    return { eventId, retryCount: rows.data.length };
  }

  return { run, retryFailed };
}

module.exports = { PAGE_SIZE, MAX_ATTEMPTS, retryDelay, taskId, createEventCancellationWorker };
