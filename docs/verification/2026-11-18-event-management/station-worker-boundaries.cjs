// Actual P64 page; synthetic identities and batches, all cloud requests intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const PAGE = 'miniprogram/station/worker/worker.js';
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const rows = (prefix = 'A', count = 20) => Array.from({ length: count }, (_, i) => ({
  _id: prefix + '-' + i, itemCount: 1, deliveredCount: 0, estimatedIncome: 100
}));
async function setup() {
  const reads = [], accepts = [], calls = [], writes = [];
  const state = { deferRead: false, rejectRead: false, deferAccept: false };
  const env = runtime(async (name, action, data) => {
    calls.push({ action, data: structuredClone(data) });
    if (action === 'providerHall') {
      if (state.deferRead) { const d = deferred(); reads.push(d); return d.promise; }
      if (state.rejectRead) throw Object.assign(Error('合成读取拒绝'), { code: 'E_FORBIDDEN' });
      return { list: rows(data.offset ? 'B' : 'A', data.offset ? 1 : 20), hasMore: !data.offset };
    }
    if (action === 'acceptBatch') {
      if (state.deferAccept) { const d = deferred(); accepts.push(d); return d.promise; }
      return { batchId: data.batchId };
    }
    throw Error('Unexpected action ' + action);
  });
  env.app.globalData.user = { _id: 'provider-A', roles: ['provider'], communityId: 'community-A' };
  const page = env.instance(PAGE); page.visible = true; await page.load(true);
  const setData = page.setData.bind(page); page.setData = patch => { writes.push(structuredClone(patch)); setData(patch); };
  return { page, env, reads, accepts, calls, writes, state };
}
async function boundary(s, kind) {
  if (kind === 'hide') s.page.onHide();
  if (kind === 'unload') s.page.onUnload();
  if (kind === 'user') s.env.app.globalData.user = { _id: 'provider-B', roles: ['provider'], communityId: 'community-A' };
  if (kind === 'denied') { s.state.rejectRead = true; await s.page.load(true); }
  if (kind === 'refresh') await s.page.load(true);
}
async function run() {
  const results = [], event = { currentTarget: { dataset: { id: 'A-0' } } };
  async function check(name, body) { const evidence = {}; try { await body(evidence); results.push({ name, pass: true, evidence }); }
    catch (error) { results.push({ name, pass: false, evidence, error: error.message }); } }
  await check('normal-read', async e => { const s = await setup(); e.count = s.page.data.list.length; assert.equal(e.count, 20); });
  await check('normal-next-page', async e => { const s = await setup(); await s.page.load(); e.count = s.page.data.list.length;
    e.offsets = s.calls.filter(x => x.action === 'providerHall').map(x => x.data.offset); assert.equal(e.count, 21); assert.deepEqual(e.offsets, [0, 20]); });
  await check('normal-accept', async e => { const s = await setup(); await s.page.accept(event);
    e.accepts = s.calls.filter(x => x.action === 'acceptBatch'); e.navigation = s.env.navigation;
    assert.equal(e.accepts.length, 1); assert.equal(e.accepts[0].data.batchId, 'A-0'); assert.equal(e.navigation.length, 1); });
  await check('double-click-accept', async e => { const s = await setup(); s.state.deferAccept = true;
    const a = s.page.accept(event); await tick(); await s.page.accept(event); s.accepts[0].resolve({ batchId: 'A-0' }); await a;
    e.accepts = s.calls.filter(x => x.action === 'acceptBatch').length; assert.equal(e.accepts, 1); });
  await check('denied-clears-old-list', async e => { const s = await setup(); await boundary(s, 'denied');
    e.count = s.page.data.list.length; e.error = s.page.data.error; assert.equal(e.count, 0); });
  for (const kind of ['hide', 'unload', 'user']) await check('late-read-' + kind, async e => {
    const s = await setup(); s.state.deferRead = true; const job = s.page.load(true); await tick(); await boundary(s, kind);
    const before = s.writes.length; s.reads[0].resolve({ list: rows('old'), hasMore: false }); await job;
    e.uiWrites = s.writes.length - before; assert.equal(e.uiWrites, 0);
  });
  await check('return-refreshes-while-old-read-pending', async e => { const s = await setup(); s.state.deferRead = true;
    const old = s.page.load(true); await tick(); s.page.onHide(); s.page.onShow(); await tick();
    e.pendingReads = s.reads.length;
    for (const d of s.reads) d.resolve({ list: rows('returned'), hasMore: false }); await old; await tick();
    assert.equal(e.pendingReads, 2);
  });
  for (const kind of ['hide', 'unload', 'user', 'denied']) await check('old-accept-' + kind, async e => {
    const s = await setup(); await boundary(s, kind); await s.page.accept(event);
    e.accepts = s.calls.filter(x => x.action === 'acceptBatch').length; e.navigation = s.env.navigation.length;
    assert.equal(e.accepts, 0); assert.equal(e.navigation, 0);
  });
  for (const outcome of ['success', 'failure']) for (const kind of ['hide', 'unload', 'user', 'refresh'])
    await check('late-accept-' + outcome + '-' + kind, async e => {
      const s = await setup(); s.state.deferAccept = true; const job = s.page.accept(event); await tick(); await boundary(s, kind);
      const before = s.writes.length;
      if (outcome === 'success') s.accepts[0].resolve({ batchId: 'A-0' }); else s.accepts[0].reject(Error('合成旧接单失败'));
      await job; e.uiWrites = s.writes.length - before; e.navigation = s.env.navigation.length;
      assert.equal(e.navigation, 0); assert.equal(e.uiWrites, 0);
    });
  await check('next-page-network-retry-keeps-offset', async e => { const s = await setup(); s.state.deferRead = true;
    const job = s.page.load(); await tick(); s.reads[0].reject(Object.assign(Error('合成网络中断'), { code: 'E_NETWORK' })); await job;
    e.retainedCount = s.page.data.list.length; s.state.deferRead = false;
    // Use the actual WXML binding: native retry supplies an event, not a reset boolean.
    const template = require('node:fs').readFileSync('miniprogram/station/worker/worker.wxml', 'utf8');
    const handler = template.match(/bind:retry="([^"]+)"/)[1];
    await s.page[handler]({ type: 'retry', detail: {} });
    e.offsets = s.calls.filter(x => x.action === 'providerHall').map(x => x.data.offset); e.finalCount = s.page.data.list.length;
    assert.equal(e.retainedCount, 20); assert.deepEqual(e.offsets, [0, 20, 20]); assert.equal(e.finalCount, 21);
  });
  await check('latest-refresh-wins', async e => { const s = await setup(); s.state.deferRead = true;
    const a = s.page.load(true); await tick(); const b = s.page.load(true); await tick();
    s.reads[1].resolve({ list: rows('new', 1), hasMore: false }); await b;
    s.reads[0].resolve({ list: rows('old', 1), hasMore: false }); await a;
    e.id = s.page.data.list[0]._id; assert.equal(e.id, 'new-0');
  });
  await check('old-error-cannot-overwrite-refresh', async e => { const s = await setup(); s.state.deferRead = true;
    const a = s.page.load(true); await tick(); const b = s.page.load(true); await tick();
    s.reads[1].resolve({ list: rows('new', 1), hasMore: false }); await b;
    s.reads[0].reject(Error('合成旧错误')); await a; e.error = s.page.data.error; assert.equal(e.error, '');
  });
  for (const kind of ['user', 'hide', 'unload']) await check('session-pending-' + kind, async e => {
    const s = await setup(), d = deferred(), original = s.env.app.globalData.user;
    s.env.app.ensureSession = () => d.promise; const before = s.calls.length;
    const job = s.page.load(true); await tick(); await boundary(s, kind); d.resolve(original); await job;
    e.cloudCalls = s.calls.length - before; assert.equal(e.cloudCalls, 0);
  });
  for (const code of ['E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND', 'E_BLOCKED']) await check('next-page-denied-' + code, async e => {
    const s = await setup(); s.state.deferRead = true; const job = s.page.load(); await tick();
    s.reads[0].reject(Object.assign(Error('合成权限变化'), { code })); await job;
    e.rows = s.page.data.list.length; e.ready = s.page.data.ready; e.pageError = s.page.data.pageError;
    assert.equal(e.rows, 0); assert.equal(e.ready, false); assert.equal(e.pageError, false);
  });
  await check('accept-denied-clears-list', async e => { const s = await setup(); s.state.deferAccept = true;
    const job = s.page.accept(event); await tick(); s.accepts[0].reject(Object.assign(Error('合成权限拒绝'), { code: 'E_FORBIDDEN' })); await job;
    e.rows = s.page.data.list.length; e.busy = s.page.data.busy; assert.equal(e.rows, 0); assert.equal(e.busy, false);
  });
  await check('accept-failure-retry-only-reads', async e => { const s = await setup(); s.state.deferAccept = true;
    const job = s.page.accept(event); await tick(); s.accepts[0].reject(Error('合成网络中断')); await job;
    await s.page.retry(); e.accepts = s.calls.filter(x => x.action === 'acceptBatch').length; e.ready = s.page.data.ready;
    assert.equal(e.accepts, 1); assert.equal(e.ready, true);
  });
  await check('unlisted-batch-not-accepted', async e => { const s = await setup(); await s.page.accept({ currentTarget: { dataset: { id: 'foreign' } } });
    e.accepts = s.calls.filter(x => x.action === 'acceptBatch').length; assert.equal(e.accepts, 0);
  });
  for (const kind of ['community', 'role']) await check('changed-' + kind + '-only-refreshes', async e => {
    const s = await setup(); if (kind === 'community') s.env.app.globalData.user.communityId = 'community-B';
    else s.env.app.globalData.user.roles = ['resident'];
    await s.page.accept(event); e.accepts = s.calls.filter(x => x.action === 'acceptBatch').length;
    e.reads = s.calls.filter(x => x.action === 'providerHall').length; assert.equal(e.accepts, 0); assert.equal(e.reads, 2);
  });
  await check('page-inflight-blocks-accept-and-duplicate-load', async e => { const s = await setup(); s.state.deferRead = true;
    const job = s.page.load(); await tick(); await s.page.load();
    const accepting = s.page.accept(event); await tick();
    // Stale context must not cause a second read while the current page is loading.
    e.pendingReads = s.reads.length; e.accepts = s.calls.filter(x => x.action === 'acceptBatch').length;
    for (const d of s.reads) d.resolve({ list: rows('B', 1), hasMore: false }); await job; await accepting;
    assert.equal(e.pendingReads, 1); assert.equal(e.accepts, 0);
  });
  await check('dedup-does-not-rewind-offset', async e => { const s = await setup(); s.state.deferRead = true;
    const a = s.page.load(); await tick(); s.reads[0].resolve({ list: [rows()[19], ...rows('B', 1)], hasMore: true }); await a;
    const b = s.page.load(); await tick(); s.reads[1].resolve({ list: [], hasMore: false }); await b;
    e.offsets = s.calls.filter(x => x.action === 'providerHall').map(x => x.data.offset); e.rows = s.page.data.list.length;
    assert.deepEqual(e.offsets, [0, 20, 22]); assert.equal(e.rows, 21);
  });
  await check('network-error-does-not-auto-retry-on-scroll', async e => { const s = await setup(); s.state.deferRead = true;
    const job = s.page.load(); await tick(); s.reads[0].reject(Error('合成网络中断')); await job;
    s.page.onReachBottom(); await tick(); e.pendingReads = s.reads.length; assert.equal(e.pendingReads, 1);
  });
  await check('return-after-late-accept-only-reads', async e => { const s = await setup(); s.state.deferAccept = true;
    const job = s.page.accept(event); await tick(); s.page.onHide(); s.accepts[0].resolve({ batchId: 'A-0' }); await job;
    await s.page.onShow(); e.accepts = s.calls.filter(x => x.action === 'acceptBatch').length; e.navigation = s.env.navigation.length;
    e.busy = s.page.data.busy; e.ready = s.page.data.ready;
    assert.equal(e.accepts, 1); assert.equal(e.navigation, 0); assert.equal(e.busy, false); assert.equal(e.ready, true);
  });
  return { scope: 'actual page; all cloud calls intercepted; no real acceptance or navigation',
    pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results };
}
if (require.main === module) run().then(r => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.fail ? 1 : 0; });
module.exports = { run };
