// Actual pages with synthetic identities and intercepted API calls only.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('assert');
const results = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const status = id => ({ provider: { _id: id, status: 'approved', onDuty: true }, todayCount: 1, todayIncome: 100 });
const task = id => ({ _id: id, pricing: { payAmount: 100, goodsCap: 0 }, slot: {}, createdAt: Date.now() });
function fixture(route) {
  let handler = async (n, a) => a === 'myStatus' ? status('provider-a') : { list: [task('task-a')], hasMore: false };
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'provider-a', roles: ['provider'] };
  const page = env.instance('miniprogram/provider/' + route + '/' + route + '.js');
  page.visible = true;
  return { env, page, use: fn => { handler = fn; } };
}
async function test(name, body) {
  let evidence;
  try { await body(value => { evidence = value; }); results.push({ name, pass: true, evidence }); }
  catch (error) { results.push({ name, pass: false, evidence, error: error.message }); }
}
(async () => {
  await test('workbench-normal-load', async record => {
    const f = fixture('workbench'); await f.page.load();
    record({ provider: f.page.data.provider._id, tasks: f.page.data.tasks.length });
    assert.equal(f.page.data.tasks.length, 1); assert.equal(f.page.data.loading, false);
  });
  await test('workbench-rejected-refresh-clears-previous-data', async record => {
    const f = fixture('workbench'); await f.page.load();
    f.use(async () => { throw Error('synthetic forbidden'); }); await f.page.load();
    record({ provider: f.page.data.provider?._id, tasks: f.page.data.tasks.length, error: f.page.data.error });
    assert.equal(f.page.data.provider, null); assert.equal(f.page.data.tasks.length, 0);
  });
  await test('workbench-latest-response-wins', async record => {
    const f = fixture('workbench'), wait = deferred(); let reads = 0;
    f.use(async (n, a) => a === 'myStatus' ? (++reads === 1 ? wait.promise : status('new-provider')) : { list: [], hasMore: false });
    const old = f.page.load(); await flush(); await f.page.load(); wait.resolve(status('old-provider')); await old;
    record({ provider: f.page.data.provider?._id }); assert.equal(f.page.data.provider._id, 'new-provider');
  });
  for (const leave of ['onHide', 'onUnload']) await test('workbench-late-read-' + leave, async record => {
    const f = fixture('workbench'), wait = deferred(); f.use(async () => wait.promise);
    const op = f.page.load(); await flush(); f.page[leave]?.();
    let updates = 0; const set = f.page.setData; f.page.setData = function(p) { updates++; set.call(this, p); };
    wait.resolve({ ...status('provider-a'), list: [], hasMore: false }); await op;
    record({ updates }); assert.equal(updates, 0);
  });
  for (const boundary of ['same-page', 'changed-user', 'hidden']) await test('workbench-duty-' + boundary, async record => {
    const f = fixture('workbench'); await f.page.load();
    if (boundary === 'changed-user') f.env.app.globalData.user = { _id: 'provider-b', roles: ['provider'] };
    if (boundary === 'hidden') { f.page.onHide?.(); f.page.visible = false; }
    await f.page.duty({ detail: { value: false } });
    const writes = f.env.requests.filter(r => r[1] === 'setDuty').length;
    record({ writes, currentUser: f.env.app.globalData.user._id }); assert.equal(writes, boundary === 'same-page' ? 1 : 0);
  });
  for (const boundary of ['same-page', 'changed-user', 'hidden', 'read-failed']) await test('hall-accept-' + boundary, async record => {
    const f = fixture('hall'); await f.page.load(true);
    if (boundary === 'changed-user') f.env.app.globalData.user = { _id: 'provider-b', roles: ['provider'] };
    if (boundary === 'hidden') f.page.onHide();
    if (boundary === 'read-failed') { f.use(async () => { throw Error('synthetic forbidden'); }); await f.page.load(true); }
    f.use(async (n, a, d) => a === 'accept' ? { orderId: d.orderId } : {});
    await f.page.accept({ currentTarget: { dataset: { id: 'task-a' } } }); await flush();
    const writes = f.env.requests.filter(r => r[1] === 'accept').length;
    record({ writes, navigation: f.env.navigation.length }); assert.equal(writes, boundary === 'same-page' ? 1 : 0);
  });
  for (const route of ['workbench', 'hall']) {
    const read = f => route === 'hall' ? f.page.load(true) : f.page.load();
    const act = f => route === 'hall' ? f.page.accept({ currentTarget: { dataset: { id: 'task-a' } } }) : f.page.duty({ detail: { value: false } });
    const action = route === 'hall' ? 'accept' : 'setDuty';
    for (const outcome of ['success', 'failure']) for (const boundary of ['hidden', 'unloaded', 'user', 'refreshed', 'returned']) {
      await test(route + '-sent-' + outcome + '-' + boundary, async record => {
        const f = fixture(route), wait = deferred(); await read(f);
        f.use(async (n, a) => a === action ? wait.promise : a === 'myStatus' ? status('provider-a') : { list: [task('task-a')], hasMore: false });
        const op = act(f); await flush();
        assert.equal(f.env.requests.filter(r => r[1] === action).length, 1);
        if (boundary === 'hidden') f.page.onHide();
        if (boundary === 'unloaded') f.page.onUnload();
        if (boundary === 'user') f.env.app.globalData.user = { _id: 'provider-b' };
        if (boundary === 'refreshed') await read(f);
        if (boundary === 'returned') { f.page.onHide(); await f.page.onShow(); }
        let updates = 0; const set = f.page.setData; f.page.setData = function(p) { updates++; set.call(this, p); };
        if (outcome === 'success') wait.resolve({ orderId: 'task-a' }); else wait.reject(Error('old failure'));
        await op; record({ updates, navigation: f.env.navigation.length });
        assert.equal(updates, 0); assert.equal(f.env.navigation.length, 0);
        const opts = f.env.requests.find(r => r[1] === action)[3];
        assert.equal(opts.isActive(), false); assert.equal(opts.redirectOnForbidden, false);
      });
    }
    await test(route + '-pagination-retries-same-offset', async record => {
      const f = fixture(route); let fail = true; const offsets = [];
      f.use(async (n, a, d) => {
        if (a === 'myStatus') return status('provider-a');
        offsets.push(d.offset || 0);
        if (!d.offset) return { list: [task('task-a')], hasMore: true };
        if (fail) { fail = false; throw Error('synthetic page failure'); }
        return { list: [task('task-b')], hasMore: false };
      });
      await read(f); await (route === 'hall' ? f.page.load() : f.page.more());
      assert.equal(f.page.data.tasks.length, 1); assert.equal(f.page.data.ready, false);
      await act(f); assert.equal(f.env.requests.filter(r => r[1] === action).length, 0);
      await f.page.retry();
      record({ offsets, count: f.page.data.tasks.length });
      assert.deepEqual(offsets, [0, 1, 1]); assert.equal(f.page.data.tasks.length, 2); assert.equal(f.page.data.ready, true);
    });
    await test(route + '-duplicate-action', async record => {
      const f = fixture(route), wait = deferred(); await read(f);
      f.use(async (n, a) => a === action ? wait.promise : a === 'myStatus' ? status('provider-a') : { list: [], hasMore: false });
      const first = act(f); await act(f); wait.resolve({ orderId: 'task-a' }); await first;
      const writes = f.env.requests.filter(r => r[1] === action).length;
      record({ writes }); assert.equal(writes, 1);
    });
    await test(route + '-pagination-forbidden-clears-data', async record => {
      const f = fixture(route);
      f.use(async (n, a, d) => {
        if (a === 'myStatus') return status('provider-a');
        if (d.offset) throw Object.assign(Error('synthetic forbidden'), { code: 'E_FORBIDDEN' });
        return { list: [task('task-a')], hasMore: true };
      });
      await read(f); await (route === 'hall' ? f.page.load() : f.page.more());
      record({ tasks: f.page.data.tasks.length, ready: f.page.data.ready, loading: f.page.data.loading });
      assert.equal(f.page.data.tasks.length, 0); assert.equal(f.page.data.ready, false); assert.equal(f.page.data.loading, false);
    });
    for (const boundary of ['hidden', 'returned', 'refreshed']) await test(route + '-late-page-' + boundary, async record => {
      const f = fixture(route), wait = deferred();
      f.use(async (n, a, d) => a === 'myStatus' ? status('provider-a') : d.offset ? wait.promise : { list: [task('task-a')], hasMore: true });
      await read(f); const op = route === 'hall' ? f.page.load() : f.page.more(); await flush();
      if (boundary === 'refreshed') await read(f);
      else { f.page.onHide(); if (boundary === 'returned') await f.page.onShow(); }
      const before = JSON.stringify(f.page.data); wait.resolve({ list: [task('old-page')], hasMore: false }); await op;
      record({ tasks: f.page.data.tasks.map(x => x._id) }); assert.equal(JSON.stringify(f.page.data), before);
    });
    await test(route + '-subscription-normal', async record => {
      const f = fixture(route); await read(f); let prompts = 0;
      f.env.wx.requestSubscribeMessage = o => { prompts++; o.success({ template: 'accept' }); };
      f.use(async (n, a) => a === 'subscriptionTemplates' ? { newTask: 'template' } : a === 'myStatus' ? status('provider-a') : a === 'accept' ? { orderId: 'task-a' } : { list: [], hasMore: false });
      await (route === 'hall' ? act(f) : f.page.duty({ detail: { value: true } }));
      record({ prompts, count: f.env.store.subscriptionReminderCount });
      assert.equal(prompts, 1); assert.equal(f.env.store.subscriptionReminderCount, 1);
    });
    for (const stage of ['templates', 'authorization']) await test(route + '-late-subscription-' + stage, async record => {
      const f = fixture(route), wait = deferred(); await read(f); let prompts = 0, dialog;
      f.env.wx.requestSubscribeMessage = o => { prompts++; dialog = o; };
      f.use(async (n, a) => a === 'subscriptionTemplates' ? (stage === 'templates' ? wait.promise : { newTask: 'template' }) : a === 'accept' ? { orderId: 'task-a' } : {});
      const op = route === 'hall' ? act(f) : f.page.duty({ detail: { value: true } }); await flush();
      f.page.onHide();
      if (stage === 'templates') wait.resolve({ newTask: 'template' }); else dialog.success({ template: 'accept' });
      await op; record({ prompts, count: f.env.store.subscriptionReminderCount || 0, navigation: f.env.navigation.length });
      assert.equal(prompts, stage === 'templates' ? 0 : 1); assert.equal(f.env.store.subscriptionReminderCount || 0, 0); assert.equal(f.env.navigation.length, 0);
    });
  }
  await test('subscriptions-legacy-caller-compatible', async record => {
    const env = runtime(async () => ({ newTask: 'template' })); let prompts = 0;
    env.wx.requestSubscribeMessage = o => { prompts++; o.success({ template: 'accept' }); };
    const count = await env.load('miniprogram/utils/subscriptions.js').request(['newTask']);
    record({ prompts, count }); assert.equal(prompts, 1); assert.equal(count, 1);
  });
  console.log(JSON.stringify({ scope: 'actual pages; synthetic identities and intercepted writes; no live duty or acceptance', pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results }, null, 2));
  if (results.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
