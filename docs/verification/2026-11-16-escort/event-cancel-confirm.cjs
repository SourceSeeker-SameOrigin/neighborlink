const assert = require('node:assert/strict');
const path = require('node:path');
const {
  fixture
} = require(path.resolve('docs/verification/2026-11-09-remediation/cloud-fixture.cjs'));
const {
  runtime
} = require(path.resolve('docs/verification/2026-11-09-remediation/page-fixture.cjs'));
async function check(kind, step) {
  const now = Date.now();
  const db = fixture({
    local: true,
    global: true,
    allowWrites: true,
    mockPay: true,
    records: {
      events: [{
        _id: 'e',
        title: '测试活动',
        status: 'published',
        communityIds: ['c'],
        capacity: 2,
        fee: kind === 'free' ? 0 : 500,
        signupDeadline: new Date(now + 3600000),
        startAt: new Date(now + 7200000),
        endAt: new Date(now + 10800000)
      }]
    }
  });
  db.data.config[0].payMode = 'mock';
  const users = [db.data.users[0], {
    ...db.data.users[0],
    _id: 'second',
    openid: 'second'
  }];
  db.data.users.push(users[1]);
  const ids = [];
  for (const user of users) {
    db.setActor(user.openid);
    const signup = await db.call('event', 'signup', {
      eventId: 'e'
    });
    assert.ok(signup.ok, signup.message);
    ids.push(signup.data.signupId);
    if (kind === 'paid') {
      const paid = await db.call('order', 'mockPay', {
        orderId: signup.data.orderId
      });
      assert.ok(paid.ok, paid.message);
    }
  }
  let releaseReply;
  const env = runtime(async (name, action, input) => {
    db.setActor(env.app.globalData.user.openid);
    const reply = await db.call(name, action, input);
    if (action === 'cancelSignup' && step.startsWith('late-')) {
      await new Promise(resolve => {
        releaseReply = resolve;
      });
      if (step.includes('failure')) throw Error('合成迟到错误');
    }
    if (!reply.ok) throw Error(reply.message);
    return reply.data;
  });
  env.app.globalData.user = users[0];
  const page = env.instance('miniprogram/events/detail/detail.js');
  page.onLoad({
    id: 'e'
  });
  await page.onShow();
  assert.ok(page.data.actions.canCancel);
  let modal;
  env.wx.showModal = o => {
    modal = o;
  };
  const pending = page.cancelSignup();
  assert.ok(modal);
  if (step === 'hidden') page.onHide();
  if (step === 'unloaded') page.onUnload();
  if (step === 'return') {
    page.onHide();
    await page.onShow();
  }
  if (step === 'reload') await page.load();
  if (step === 'identity') env.app.globalData.user = users[1];
  if (step === 'deadline') page.data.item.signupDeadline = now - 1;
  modal.success({
    confirm: step !== 'dismiss'
  });
  let staleWrites = 0,
    extraReads = 0;
  if (step.startsWith('late-')) {
    while (!releaseReply) await new Promise(resolve => setImmediate(resolve));
    page.onHide();
    if (step.endsWith('return')) await page.onShow();else page.onUnload();
    const before = env.requests.length;
    const setData = page.setData.bind(page);
    page.setData = patch => {
      staleWrites++;
      setData(patch);
    };
    releaseReply();
    await pending;
    extraReads = env.requests.length - before;
  } else await pending;
  const states = ids.map(id => db.data.signups.find(s => s._id === id).status);
  const refunds = (db.data.orders || []).map(o => (o.refunds || []).filter(r => r.status === 'success').reduce((s, r) => s + r.amount, 0));
  const calls = env.requests.filter(r => r[1] === 'cancelSignup').length;
  const initial = kind === 'pending' ? 'pending_pay' : 'signed';
  const final = kind === 'paid' ? 'refunded' : 'cancelled';
  const submitted = step === 'confirm' || step.startsWith('late-');
  const expected = submitted ? [final, initial] : [initial, initial];
  const pass = calls === (submitted ? 1 : 0) && states.every((s, i) => s === expected[i]) && staleWrites === 0 && extraReads === 0;
  assert.ok(pass, JSON.stringify({
    kind,
    step,
    calls,
    states,
    expected,
    staleWrites,
    extraReads
  }));
  if (kind === 'paid') assert.deepEqual(refunds, [submitted ? 500 : 0, 0]);
  return {
    kind,
    step,
    calls,
    states,
    successfulRefundsFen: refunds,
    pass
  };
}
(async () => {
  for (const kind of ['free', 'pending', 'paid']) for (const step of ['confirm', 'dismiss', 'hidden', 'unloaded', 'return', 'deadline', 'reload', 'identity', 'late-success-return', 'late-failure-unload', 'late-success-unload', 'late-failure-return']) console.log(JSON.stringify(await check(kind, step)));
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
