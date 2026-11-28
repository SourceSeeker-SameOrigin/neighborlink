const { PAGE_SIZE, MAX_ATTEMPTS, retryDelay, taskId } = require('../eventCancellation');
const { createEventCancellationWorker } = require('../eventCancellation');
const { fixture } = require('../../../docs/verification/2026-11-09-remediation/cloud-fixture.cjs');

test('活动取消任务分页与重试有界且稳定', () => {
  expect(PAGE_SIZE).toBe(50);
  expect(MAX_ATTEMPTS).toBe(8);
  expect(taskId('signup_1')).toBe('event_cancel_task_signup_1');
  expect(retryDelay(1)).toBe(5 * 60 * 1000);
  expect(retryDelay(2)).toBe(10 * 60 * 1000);
  expect(retryDelay(20)).toBe(6 * 60 * 60 * 1000);
});

// The fixture is a local in-memory database; run the real worker, without cloud or payment calls.
function scenario({ event = {}, signup = {}, orders = [] } = {}) {
  const now = new Date('2026-11-09T15:00:00Z');
  const f = fixture({ allowWrites: true, records: {
    events: [{ _id: 'e', fee: 0, status: 'cancelled', signupCount: 1, reservedCount: 0, ...event }],
    signups: [{ _id: 's', eventId: 'e', orderId: null, status: 'signed', ...signup }], orders,
    eventCancelJobs: [{ _id: 'event_cancel_e', eventId: 'e', status: 'queued', scanComplete: true, totalCount: 1, createdAt: now }],
    eventCancelTasks: [{ _id: 'event_cancel_task_s', jobId: 'event_cancel_e', eventId: 'e', signupId: 's', status: 'pending', attempts: 0, createdAt: now }]
  } });
  const payments = { requestRefund: jest.fn(), closeUnpaid: jest.fn(), dispatchRefund: jest.fn() };
  const worker = createEventCancellationWorker({ db: f.db, command: f.db.command,
    get: async (table, id) => (await f.db.collection(table).doc(id).get()).data }, payments);
  return { ...f, now, worker, payments, task: () => f.data.eventCancelTasks[0] };
}

test('无订单的免费报名取消并扣减人数，不调用支付', async () => {
  const f = scenario(); await f.worker.run(f.now);
  expect(f.data.signups[0].status).toBe('cancelled'); expect(f.data.events[0].signupCount).toBe(0);
  expect(f.task().status).toBe('completed'); expect(f.data.eventCancelJobs[0].status).toBe('completed');
  for (const call of Object.values(f.payments)) expect(call).not.toHaveBeenCalled();
});

test('重复任务和已取消免费报名不重复扣减', async () => {
  const f = scenario({ event: { signupCount: 3 } }); await f.worker.run(f.now);
  f.task().status = 'pending'; f.data.eventCancelJobs[0].status = 'queued'; await f.worker.run(f.now);
  expect(f.data.events[0].signupCount).toBe(2); expect(f.task().status).toBe('completed');
});

test.each([
  [{ fee: 100 }, {}, 'E_CONFIG'], [{ status: 'published' }, {}, 'E_CONFIG'],
  [{}, { status: 'pending_pay' }, 'E_CONFLICT'], [{}, { eventId: 'other' }, 'E_CONFIG'],
  [{}, { orderId: 'missing_order' }, 'E_CONFIG']
])('异常数据不能当成免费报名取消 %j %j', async (event, signup, code) => {
  const f = scenario({ event, signup }); const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await f.worker.run(f.now); expect(f.task()).toMatchObject({ status: 'retry', lastErrorCode: code });
    expect(f.data.events[0].signupCount).toBe(1); expect(f.data.signups[0].status).toBe(signup.status || 'signed');
    for (const call of Object.values(f.payments)) expect(call).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

test('免费取消事务后半段失败回滚报名及人数，重试后成功', async () => {
  const f = scenario(), original = f.db.runTransaction;
  f.db.runTransaction = work => original(async tx => {
    const value = await work(tx);
    if (f.data.signups[0].status === 'cancelled') throw Object.assign(Error('synthetic conflict'), { code: 'DATABASE_TRANSACTION_CONFLICT' });
    return value;
  });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try { await f.worker.run(f.now); } finally { log.mockRestore(); }
  expect(f.task()).toMatchObject({ status: 'retry', lastErrorCode: 'E_CONFLICT' });
  expect(f.data.signups[0].status).toBe('signed'); expect(f.data.events[0].signupCount).toBe(1);
  f.db.runTransaction = original; await f.worker.run(new Date(f.now.getTime() + 6 * 60000));
  expect(f.task().status).toBe('completed'); expect(f.data.events[0].signupCount).toBe(0);
});

test('有付款订单仍走原退款流程，不直接取消报名或扣减人数', async () => {
  const f = scenario({ event: { fee: 100 }, signup: { orderId: 'o' }, orders: [{ _id: 'o', status: 'paid',
    payment: { paidAt: new Date() }, pricing: { payAmount: 100, goodsCap: 0 }, refunds: [] }] });
  await f.worker.run(f.now); expect(f.payments.requestRefund).toHaveBeenCalledTimes(1);
  expect(f.payments.requestRefund.mock.calls[0][1]).toBe(100);
  expect(f.data.signups[0].status).toBe('signed'); expect(f.data.events[0].signupCount).toBe(1);
});
