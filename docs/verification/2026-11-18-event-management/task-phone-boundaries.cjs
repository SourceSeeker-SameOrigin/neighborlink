// Diagnostic only: real page with synthetic tasks; no phone or cloud calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('assert');
const results = [];
async function test(name, fn) {
  try { results.push({ name, pass: true, observed: await fn() }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
async function fixture() {
  const order = { _id: 'synthetic-a', serviceCode: 'visit', status: 'in_service',
    featureEnabled: true, canCallResident: true, userPhone: 'synthetic-phone',
    detail: {}, pricing: {}, slot: {} };
  const calls = [];
  let readError = false;
  const env = runtime(async (name, action) => {
    if (action !== 'detail') throw Error('Business writes forbidden');
    if (readError) throw Error('合成任务读取失败');
    return JSON.parse(JSON.stringify(order));
  });
  env.app.globalData.user = { _id: 'synthetic-provider-a' };
  env.wx.makePhoneCall = options => calls.push(options);
  const page = env.instance('miniprogram/provider/task/task.js');
  page.onLoad({ id: order._id });
  await page.onShow();
  page.visitAttention({ detail: { value: true } });
  return { env, page, order, calls, failRead: () => { readError = true; } };
}
async function change(f, boundary) {
  if (boundary === 'hidden') f.page.onHide();
  if (boundary === 'unloaded') f.page.onUnload();
  if (boundary === 'refreshed') await f.page.load();
  if (boundary === 'changed-user') {
    f.env.app.globalData.user = { _id: 'synthetic-provider-b' };
    await f.page.load();
    f.page.visitAttention({ detail: { value: true } });
  }
  if (boundary === 'changed-order') {
    f.order._id = 'synthetic-b'; f.page.orderId = f.order._id;
    await f.page.load();
    f.page.visitAttention({ detail: { value: true } });
  }
  if (boundary === 'attention-reset') {
    f.page.visitAttention({ detail: { value: false } });
    f.page.visitAttention({ detail: { value: true } });
  }
}
(async () => {
  for (const boundary of ['ready', 'hidden', 'unloaded', 'refreshed', 'changed-user', 'changed-order', 'attention-reset']) {
    await test('phone-result-' + boundary, async () => {
      const f = await fixture(); f.page.callResident(); assert.equal(f.calls.length, 1);
      await change(f, boundary);
      f.calls[0].success();
      const confirmed = f.page.data.attentionCallConfirmed;
      assert.equal(confirmed, boundary === 'ready', 'old call marked current report notified=' + confirmed);
      return { confirmed };
    });
  }
  for (const boundary of ['ready', 'hidden', 'unloaded', 'identity-changed-without-refresh', 'order-changed-without-refresh']) {
    await test('phone-start-' + boundary, async () => {
      const f = await fixture();
      if (boundary === 'identity-changed-without-refresh') f.env.app.globalData.user = { _id: 'synthetic-provider-b' };
      else if (boundary === 'order-changed-without-refresh') f.page.orderId = 'synthetic-b';
      else await change(f, boundary);
      await f.page.callResident();
      assert.equal(f.calls.length, boundary === 'ready' ? 1 : 0, 'phone API calls=' + f.calls.length);
      return { calls: f.calls.length };
    });
  }
  for (const timing of ['before-return', 'after-return']) {
    for (const outcome of ['success', 'cancel', 'failure']) {
      for (const boundary of ['same', 'changed-user', 'changed-order', 'permission-revoked', 'phone-changed', 'read-failed']) {
        await test('phone-system-return-' + timing + '-' + outcome + '-' + boundary, async () => {
          const f = await fixture(); f.page.callResident(); f.page.onHide();
          const callback = () => outcome === 'success' ? f.calls[0].success() :
            f.calls[0].fail({ errMsg: outcome === 'cancel' ? 'makePhoneCall:fail cancel' : 'synthetic failure' });
          if (timing === 'before-return') callback();
          assert.equal(f.page.data.attentionCallConfirmed, false);
          if (boundary === 'changed-user') f.env.app.globalData.user = { _id: 'synthetic-provider-b' };
          if (boundary === 'changed-order') { f.order._id = 'synthetic-b'; f.page.orderId = f.order._id; }
          if (boundary === 'permission-revoked') f.order.canCallResident = false;
          if (boundary === 'phone-changed') f.order.userPhone = 'synthetic-new-phone';
          if (boundary === 'read-failed') f.failRead();
          await f.page.onShow();
          if (timing === 'after-return') callback();
          assert.equal(f.page.data.attentionCallConfirmed, boundary === 'same' && outcome === 'success');
          assert.equal(f.page.data.callingResident, false);
          if (boundary === 'same') assert.equal(Boolean(f.page.data.error), outcome === 'failure');
          return { confirmed: f.page.data.attentionCallConfirmed, calling: f.page.data.callingResident };
        });
      }
    }
  }
  await test('phone-duplicate-and-old-result-does-not-release-new-call', async () => {
    const f = await fixture(); f.page.callResident(); f.page.callResident(); assert.equal(f.calls.length, 1);
    await f.page.load(); f.page.callResident(); assert.equal(f.calls.length, 2);
    f.calls[0].success(); assert.equal(f.page.data.callingResident, true); assert.equal(f.page.data.attentionCallConfirmed, false);
    f.calls[1].fail({ errMsg: 'cancel' }); assert.equal(f.page.data.callingResident, false);
  });
  await test('phone-sync-failure-unlocks-retry', async () => {
    const f = await fixture(); f.env.wx.makePhoneCall = () => { throw Error('synthetic failure'); };
    f.page.callResident(); assert.equal(f.page.data.callingResident, false); assert.ok(f.page.data.error);
  });
  await test('phone-normal-nonvisit-does-not-confirm-visit', async () => {
    const f = await fixture(); f.order.serviceCode = 'trash'; await f.page.load();
    f.page.callResident(); f.calls[0].success(); assert.equal(f.page.data.attentionCallConfirmed, false);
    assert.equal(f.page.data.callingResident, false);
  });
  for (const kind of ['missing-phone', 'permission-denied']) await test('phone-start-' + kind, async () => {
    const f = await fixture();
    if (kind === 'missing-phone') f.order.userPhone = '';
    else f.order.canCallResident = false;
    await f.page.load(); f.page.callResident(); assert.equal(f.calls.length, 0);
  });
  await test('phone-return-waits-for-current-detail', async () => {
    const f = await fixture(); f.page.callResident(); f.page.onHide();
    let resolve;
    f.env.app.ensureSession = () => new Promise(r => { resolve = r; });
    const showing = f.page.onShow(); f.calls[0].success();
    assert.equal(f.page.data.loading, true); assert.equal(f.page.data.attentionCallConfirmed, false);
    resolve(f.env.app.globalData.user); await showing;
    assert.equal(f.page.data.attentionCallConfirmed, true); assert.equal(f.page.data.callingResident, false);
  });
  console.log(JSON.stringify({ scope: 'Actual page, synthetic calls only; no real phone, cloud writes or reports',
    pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results }, null, 2));
  if (results.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
