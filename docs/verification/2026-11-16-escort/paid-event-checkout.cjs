// Synthetic CloudPay and client wallet; database and account state exist only in this process.
const assert = require('node:assert/strict');
const {
  fixture
} = require('../2026-11-09-remediation/cloud-fixture.cjs');
const {
  runtime
} = require('../2026-11-09-remediation/page-fixture.cjs');
async function scenario(mode, retry, stage) {
  const now = Date.now();
  const cloud = fixture({
    local: true,
    global: true,
    allowWrites: true,
    paymentEnv: {
      ALLOW_MOCK_PAY: mode === 'wechat' ? 'false' : 'true',
      ENV_ID: 'fixture',
      SUB_MCH_ID: 'fixture'
    },
    records: {
      events: [{
        _id: 'event',
        status: 'published',
        title: '合成活动',
        communityIds: ['c'],
        capacity: 1,
        fee: mode === 'free' ? 0 : 500,
        signupDeadline: new Date(now + 3600000),
        startAt: new Date(now + 7200000),
        endAt: new Date(now + 10800000)
      }]
    }
  });
  cloud.data.config[0].payMode = mode === 'wechat' ? 'wechat' : 'mock';
  cloud.cloud.cloudPay = {
    unifiedOrder: async o => {
      assert.equal(o.totalFee, 500);
      return {
        returnCode: 'SUCCESS',
        resultCode: 'SUCCESS',
        payment: {
          timeStamp: '1',
          nonceStr: 'sample',
          package: 'prepay_id=fixture',
          signType: 'RSA',
          paySign: 'sample'
        }
      };
    }
  };
  const input = {
    eventId: 'event'
  };
  if (retry) {
    const r = await cloud.call('event', 'signup', input);
    assert.equal(r.ok, true, r.message);
  }
  let page,
    modals = 0,
    cashier = 0,
    mockPay = 0,
    signups = 0;
  const env = runtime(async (name, action, params) => {
    const r = await cloud.call(name, action, params);
    if (!r.ok) throw Error(r.message);
    if (action === 'signup') {
      signups++;
      if (stage === 'hidden') page.onHide();
      if (stage === 'unloaded') page.onUnload();
    }
    if (action === 'mockPay') mockPay++;
    return r.data;
  }, {
    payment: {
      pay: (...args) => env.load('miniprogram/utils/payment.js').pay(...args)
    }
  });
  env.app.globalData.user = cloud.data.users[0];
  env.wx.showModal = async o => {
    modals++;
    if (stage === 'old-confirm') {
      page.onHide();
      await page.onShow();
    }
    if (stage === 'another-user') env.app.globalData.user = {
      ...env.app.globalData.user,
      _id: 'second'
    };
    o.success({
      confirm: stage !== 'visible'
    });
  };
  env.wx.requestPayment = async o => {
    cashier++;
    assert.equal(o.package, 'prepay_id=fixture');
    if (stage !== 'confirmed') return o.fail({
      errMsg: 'requestPayment:fail cancel'
    });
    const server = cloud.load('cloudfunctions/_shared/server.js').createServer(cloud.cloud);
    const flow = cloud.load('cloudfunctions/_shared/payFlow.js').createPayFlow(cloud.cloud, server);
    await flow.onPaid(cloud.data.orders[0], {
      amount: 500,
      mode: 'wechat',
      transactionId: 'fixture'
    });
    o.success({});
  };
  page = env.instance('miniprogram/events/detail/detail.js');
  page.onLoad({
    id: 'event'
  });
  await page.onShow();
  assert.equal(retry ? page.data.actions.canPay : page.data.actions.canJoin, true);
  await page.signup();
  assert.equal(signups, 1);
  const confirmed = stage === 'confirmed';
  assert.equal(cashier, mode === 'wechat' ? 1 : 0);
  assert.equal(mockPay, mode === 'mock' && confirmed ? 1 : 0);
  assert.equal(modals, mode === 'mock' && !['hidden', 'unloaded'].includes(stage) ? 1 : 0);
  assert.equal(cloud.data.signups.length, 1);
  assert.equal(cloud.data.signups[0].status, mode === 'free' || confirmed ? 'signed' : 'pending_pay');
  assert.equal(cloud.data.orders?.length || 0, mode === 'free' ? 0 : 1);
  if (mode !== 'free') assert.equal(cloud.data.orders[0].status, confirmed ? 'paid' : 'pending_pay');
  if (stage === 'visible' && mode !== 'free') {
    assert.ok(page.data.actions.canPay);
    const id = cloud.data.orders[0]._id;
    if (mode === 'mock') {
      env.wx.showModal = o => o.success({
        confirm: true
      });
      await page.signup();
      assert.equal(cloud.data.orders.length, 1);
      assert.equal(cloud.data.orders[0]._id, id);
      assert.equal(cloud.data.signups[0].status, 'signed');
    }
  }
  return {
    mode,
    entry: retry ? '续付' : '首次',
    stage,
    modals,
    cashier,
    mockPay,
    order: cloud.data.orders?.[0]?.status,
    signup: cloud.data.signups[0].status,
    error: page.data.error
  };
}
(async () => {
  for (const mode of ['wechat', 'mock', 'free']) for (const retry of mode === 'free' ? [false] : [false, true]) for (const stage of mode === 'mock' ? ['visible', 'confirmed', 'hidden', 'unloaded', 'old-confirm', 'another-user'] : mode === 'wechat' ? ['visible', 'confirmed'] : ['visible']) console.log(JSON.stringify(await scenario(mode, retry, stage)));
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
