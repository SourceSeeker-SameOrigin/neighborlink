const {
  fixture
} = require(process.cwd() + '/docs/verification/2026-11-09-remediation/cloud-fixture.cjs');
const assert = require('node:assert/strict');
async function scenario(mode, condition, fault) {
  const success = {
    returnCode: 'SUCCESS',
    resultCode: 'SUCCESS'
  };
  const now = Date.now();
  const db = fixture({
    local: true,
    global: true,
    allowWrites: true,
    paymentEnv: {
      ALLOW_MOCK_PAY: mode === 'mock' ? 'true' : 'false',
      ENV_ID: 'test',
      SUB_MCH_ID: 'test'
    },
    records: {
      events: [{
        _id: 'event',
        status: 'published',
        title: '合成样本',
        communityIds: ['c'],
        capacity: 1,
        fee: 500,
        signupDeadline: new Date(now + 3600000),
        startAt: new Date(now + 7200000),
        endAt: new Date(now + 10800000)
      }]
    }
  });
  const refundRequests = [];
  db.data.config[0].payMode = mode;
  db.cloud.cloudPay = {
    unifiedOrder: async () => ({
      ...success,
      payment: {
        package: 'prepay_id=test',
        paySign: 'test',
        nonceStr: 'test',
        timeStamp: '1',
        signType: 'RSA'
      }
    }),
    queryOrder: async ({
      outTradeNo
    }) => ({
      ...success,
      outTradeNo,
      tradeState: 'SUCCESS',
      subMchId: 'test',
      totalFee: 500,
      transactionId: 'test'
    }),
    refund: async r => {
      refundRequests.push(r.outRefundNo);
      if (fault === 'delivery' && refundRequests.length === 1) throw Error('合成退款响应丢失');
      return success;
    }
  };
  const result = await db.call('event', 'signup', {
    eventId: 'event'
  });
  assert.ok(result.ok, result.message);
  const event = db.data.events[0],
    order = db.data.orders[0];
  if (condition === 'deadline') event.signupDeadline = new Date(now - 1000);else event.status = 'cancelled';
  const run = db.db.runTransaction.bind(db.db);
  let calls = 0;
  db.db.runTransaction = async (...args) => {
    calls++;
    if (fault === 'commit' && calls === 1) return run(async tx => {
      await args[0](tx);
      throw Error('合成提交失败');
    });
    if (fault === 'ack' && calls === 2) throw Object.assign(Error('synthetic conflict'), {
      code: 'DATABASE_TRANSACTION_CONFLICT'
    });
    return run(...args);
  };
  const callback = db.load(process.env.QA104_CALLBACK_ENTRY || 'cloudfunctions/payCallback/index.js').main;
  if (mode === 'wechat') db.setActor('');
  const settle = () => mode === 'mock' ? db.load(process.env.QA104_ORDER_ENTRY || 'cloudfunctions/order/index.js').main({
    action: 'mockPay',
    orderId: order._id
  }) : callback({
    ...success,
    outTradeNo: order.orderNo,
    totalFee: 500,
    transactionId: 'test'
  });
  const responses = [];
  for (let i = 0; i < 3; i++) {
    const r = await settle();
    responses.push(mode === 'mock' ? r.ok : r.errcode === 0);
    if (i === 0 && fault === 'commit') {
      assert.equal(responses[0], false);
      assert.equal(db.data.orders[0].status, 'pending_pay');
      assert.equal(db.data.signups[0].status, 'pending_pay');
      assert.equal(db.data.events[0].reservedCount, 1);
      assert.equal(refundRequests.length, 0);
    }
    if (i === 0 && condition === 'deadline' && mode === 'wechat' && ['delivery', 'ack'].includes(fault)) {
      const current = db.data.orders[0];
      assert.equal(current.refunds.length, 1);
      assert.equal(current.refunds[0].status, 'failed');
      // Model the database's nested array predicate for this isolated timer invocation.
      Object.defineProperty(current, 'refunds.status', {
        configurable: true,
        get() {
          return this.refunds.map(r => r.status);
        }
      });
      const tick = await db.load(process.env.QA104_TIMER_ENTRY || 'cloudfunctions/timer/index.js').main({
        Type: 'Timer',
        TriggerName: 'every5min'
      });
      assert.equal(db.data.orders[0].refunds[0].status, 'processing', JSON.stringify(tick));
      assert.ok(db.data.orders[0].refunds[0].dispatchedAt);
    }
  }
  const actual = db.data.orders[0],
    rs = actual.refunds || [];
  assert.equal(actual.status, 'cancelled');
  assert.ok(actual.payment.paidAt);
  assert.equal(db.data.signups[0].status, 'cancelled');
  assert.equal(db.data.events[0].reservedCount, 0);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].amount, 500);
  assert.deepEqual(Array.from(actual.timeline.slice(-2), x => x.status), ['paid', 'cancelled']);
  if (mode === 'wechat') {
    assert.equal(refundRequests.length, ['ack', 'delivery'].includes(fault) ? 2 : 1);
    assert.equal(new Set(refundRequests).size, 1);
    assert.equal(refundRequests[0], rs[0].outRefundNo);
    const notification = {
      outTradeNo: actual.orderNo,
      outRefundNo: rs[0].outRefundNo
    };
    db.cloud.cloudPay.queryRefund = async () => ({
      ...success,
      ...notification,
      subMchId: 'test',
      totalFee: 500,
      refundCount: 1,
      outRefundNo0: notification.outRefundNo,
      refundFee0: 500,
      refundStatus0: 'SUCCESS'
    });
    const finish = db.load('cloudfunctions/refundCallback/index.js').main;
    assert.equal((await finish(notification)).errcode, 0);
    const final = JSON.stringify(db.data);
    assert.equal((await finish(notification)).errcode, 0);
    assert.equal(JSON.stringify(db.data), final);
    assert.equal(db.data.orders[0].refunds[0].status, 'success');
  } else assert.equal(rs[0].status, 'success');
  return {
    mode,
    condition,
    fault,
    responses,
    paid: !!actual.payment.paidAt,
    order: actual.status,
    signup: db.data.signups[0].status,
    reserved: db.data.events[0].reservedCount,
    refunds: rs.length,
    refundFen: rs.reduce((a, r) => a + r.amount, 0),
    refundRequests: refundRequests.length
  };
}
(async () => {
  for (const mode of ['mock', 'wechat']) for (const condition of ['deadline', 'cancelled']) for (const fault of mode === 'wechat' ? ['none', 'commit', 'ack', 'delivery'] : ['none', 'commit']) console.log(JSON.stringify(await scenario(mode, condition, fault)));
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
