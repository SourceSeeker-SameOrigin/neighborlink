// Uses the real page and cloud handlers with two residents in an isolated database.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function scenario(kind, timing) {
  const now = Date.now();
  const eventId = 'example';
  const db = fixture({ local: true, global: true, allowWrites: true, mockPay: true, records: {
    events: [{ _id: eventId, title: '合成活动', ownerOpenid: 'author', communityIds: ['c'],
      capacity: 3, status: 'published', fee: kind === 'free' ? 0 : 500,
      signupDeadline: new Date(now + 3600000), startAt: new Date(now + 7200000),
      endAt: new Date(now + 10800000) }]
  } });
  db.data.config[0].payMode = 'mock';
  const first = db.data.users[0];
  const second = { ...first, openid: 'second', _id: 'second' };
  db.data.users.push(second);
  if (kind === 'resume') {
    db.setActor(first.openid);
    assert.ok((await db.call('event', 'signup', { eventId })).ok);
  }

  let releaseReply, received, reason, confirm;
  const reached = new Promise(resolve => { received = resolve; });
  const isReport = kind === 'report';
  const write = isReport ? 'report' : 'signup';
  const env = runtime(async (name, action, input) => {
    db.setActor(env.app.globalData.user.openid);
    if (action === 'signup' && timing === 'refresh-before-commit') {
      received();
      await new Promise(resolve => { releaseReply = resolve; });
    }
    const result = await db.call(name, action, input);
    assert.ok(result.ok, result.message);
    if (action === 'signup' && timing === 'lost-reply') throw Error('合成响应丢失');
    if (action === 'templates' && timing === 'templates') env.app.globalData.user = second;
    if (action === write && timing.startsWith('late')) {
      received();
      await new Promise(resolve => { releaseReply = resolve; });
      if (timing === 'late-error') throw Error('合成响应丢失');
    }
    return result.data;
  }, { payment: { pay: (...args) => env.load('miniprogram/utils/payment.js').pay(...args) } });
  const toasts = [];
  env.wx.showToast = o => toasts.push(o.title);
  env.wx.showActionSheet = o => {
    if (timing === 'reason') env.app.globalData.user = second;
    reason = o;
    o.success({ tapIndex: 2 });
  };
  env.wx.showModal = o => {
    if (timing === 'confirm') env.app.globalData.user = second;
    confirm = o;
    if (timing !== 'reload' && timing !== 'hidden') o.success({ confirm: isReport, content: '合成说明' });
  };
  env.app.globalData.user = first;
  const p = env.instance('miniprogram/events/detail/detail.js');
  p.onLoad({ id: eventId });
  await p.onShow();
  assert.equal(p.detailUserId, first._id);
  if (timing === 'before' || timing === 'fresh') env.app.globalData.user = second;
  if (timing === 'fresh') await p.load();
  const pending = isReport ? p.reportContent() : p.signup();
  if (timing === 'reload' || timing === 'hidden') {
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(confirm);
    if (timing === 'reload') await p.load();
    else p.onHide();
    confirm.success({ confirm: true });
  }
  if (timing === 'refresh-before-commit') {
    await reached;
    const refresh = p.load();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(p.data.loading, true);
    assert.equal(p.data.item, null);
    releaseReply();
    await Promise.all([pending, refresh]);
    assert.equal(p.data.item.mySignup.status, kind === 'free' ? 'signed' : 'pending_pay');
    assert.deepEqual(toasts, []);
    assert.ok(!confirm);
  } else if (timing.startsWith('late')) {
    await reached;
    env.app.globalData.user = second;
    await p.load();
    const writes = [];
    const set = p.setData.bind(p);
    p.setData = patch => { writes.push(patch); set(patch); };
    releaseReply();
    await pending;
    assert.deepEqual(writes, []);
    assert.deepEqual(toasts, []);
    assert.equal(p.data.error, '');
  } else await pending;

  const accepted = ['same', 'fresh', 'late-ok', 'late-error', 'refresh-before-commit', 'lost-reply'].includes(timing);
  assert.equal(env.requests.filter(r => r[1] === write).length, Number(accepted));
  assert.equal((db.data.reports || []).length, Number(isReport && accepted));
  assert.equal((db.data.orders || []).length, Number(kind === 'resume') +
    Number(!isReport && kind !== 'free' && accepted && !(kind === 'resume' && timing !== 'fresh')));
  assert.equal((db.data.signups || []).some(r => r.openid === second.openid), !isReport && timing === 'fresh');
  assert.equal((db.data.events[0].reporterOpenids || []).includes(second.openid), isReport && timing === 'fresh');
  if (timing === 'lost-reply') {
    assert.equal(p.data.item.mySignup.status, kind === 'free' ? 'signed' : 'pending_pay');
    assert.ok(!confirm);
  }
  if (timing === 'before') assert.ok(!reason && !confirm);
  if (timing === 'templates' || timing === 'before') assert.equal(p.detailUserId, second._id);
  if (timing !== 'hidden') assert.equal(p.data.busy, false);
  return { kind, timing, writes: Number(accepted) };
}

(async () => {
  for (const kind of ['free', 'paid', 'resume', 'report']) {
    const stages = kind === 'report' ? ['same','before','reason','confirm','reload','hidden','fresh'] :
      ['same','before','templates','fresh','refresh-before-commit','lost-reply'];
    for (const timing of [...stages, 'late-ok', 'late-error']) console.log(JSON.stringify(await scenario(kind, timing)));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
