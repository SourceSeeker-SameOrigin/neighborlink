// Diagnostic only. Execute actual page code; all cloud, clipboard and modal calls are intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const PAGE = 'miniprogram/station/workbench/workbench.js';
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const batch = id => ({ _id: id, status: 'done', createdAt: '2026-11-25T00:00:00Z', itemCount: 2 });
const response = id => ({ list: [batch(id)], hasMore: false });
const statement = { tempFileURL: 'https://example.invalid/synthetic.csv', count: 1, gross: 100 };
function setup() {
  const pending = [], writes = [], clipboard = [], modals = [];
  const env = runtime(async (name, action, data) => {
    const job = deferred(); pending.push({ ...job, name, action, data }); return job.promise;
  });
  env.app.globalData.user = { _id: 'station-A', roles: ['station'], stationCommunityId: 'community-A', stationCode: 'A' };
  env.wx.setClipboardData = options => { clipboard.push(options.data); options.success(); };
  env.wx.showModal = options => { modals.push(options.title); };
  const page = env.instance(PAGE);
  page.visible = true;
  page.data.month = '2026-11';
  const original = page.setData.bind(page);
  page.setData = patch => { writes.push(patch); original(patch); };
  return { page, env, pending, writes, clipboard, modals };
}
const changeUser = s => { s.env.app.globalData.user = { _id: 'station-B', roles: ['station'], stationCommunityId: 'community-B', stationCode: 'B' }; };
async function ready(s) {
  const job = s.page.load(true); await tick(); s.pending.at(-1).resolve({ ...response('A'), hasMore: true }); await job;
}
async function run() {
  const results = [];
  async function check(name, body) {
    const evidence = {};
    try { await body(evidence); results.push({ name, pass: true, evidence }); }
    catch (error) { results.push({ name, pass: false, evidence, error: error.message }); }
  }
  await check('normal-read', async e => {
    const s = setup(); await ready(s); e.rows = Array.from(s.page.data.batches, x => x._id);
    assert.deepEqual(e.rows, ['A']); assert.equal(s.page.data.loading, false);
  });
  await check('normal-next-page', async e => {
    const s = setup(); await ready(s); const job = s.page.load(); await tick();
    e.offset = s.pending.at(-1).data.offset; s.pending.at(-1).resolve(response('B')); await job;
    e.rows = Array.from(s.page.data.batches, x => x._id); assert.equal(e.offset, 1); assert.deepEqual(e.rows, ['A', 'B']);
  });
  await check('reload-denied-clears-old-batches', async e => {
    const s = setup(); await ready(s); const job = s.page.load(true); await tick();
    s.pending.at(-1).reject(Object.assign(Error('合成无权访问'), { code: 'E_FORBIDDEN' })); await job;
    e.rows = s.page.data.batches.length; e.error = s.page.data.error; assert.equal(e.rows, 0);
  });
  for (const oldResult of ['success', 'error']) await check('older-' + oldResult, async e => {
    const s = setup(); const old = s.page.load(true); await tick(); const newer = s.page.load(true); await tick();
    s.pending[1].resolve(response('B')); await newer;
    if (oldResult === 'success') s.pending[0].resolve(response('A')); else s.pending[0].reject(Error('旧读取失败'));
    await old; e.rows = Array.from(s.page.data.batches, x => x._id); e.error = s.page.data.error;
    assert.deepEqual(e.rows, ['B']); assert.equal(e.error, '');
  });
  for (const boundary of ['hide', 'unload', 'user', 'return']) await check('late-read-' + boundary, async e => {
    const s = setup(); const job = s.page.load(true); await tick();
    if (boundary === 'user') changeUser(s); else if (boundary === 'unload') s.page.onUnload(); else s.page.onHide();
    if (boundary === 'return') { s.page.onShow(); await tick(); s.pending[1].resolve(response('B')); await tick(); }
    const before = s.writes.length; s.pending[0].resolve(response('A')); await job;
    e.writesAfterBoundary = s.writes.length - before; e.rows = Array.from(s.page.data.batches, x => x._id);
    assert.equal(e.writesAfterBoundary, 0);
  });
  await check('next-page-network-error-retains-rows', async e => {
    const s = setup(); await ready(s); const job = s.page.load(); await tick();
    s.pending.at(-1).reject(Error('合成网络故障')); await job;
    e.rows = Array.from(s.page.data.batches, x => x._id); assert.deepEqual(e.rows, ['A']);
  });
  await check('retry-event-keeps-failed-page-offset', async e => {
    const s = setup(); await ready(s); const failed = s.page.load(); await tick();
    s.pending.at(-1).reject(Error('合成网络故障')); await failed;
    // WXML bind:retry="load" passes an event object, not a reset boolean.
    const retry = s.page.retry ? s.page.retry({ type: 'retry', detail: {} }) : s.page.load({ type: 'retry', detail: {} }); await tick();
    e.offset = s.pending.at(-1).data.offset; s.pending.at(-1).resolve(response('B')); await retry;
    assert.equal(e.offset, 1);
  });
  await check('normal-export', async e => {
    const s = setup(); await ready(s); const job = s.page.exportStatement(); await tick();
    s.pending.at(-1).resolve(statement); await job;
    e.clipboard = s.clipboard.length; e.modals = s.modals.length;
    assert.equal(e.clipboard, 1); assert.equal(e.modals, 1); assert.equal(s.page.data.exporting, false);
  });
  await check('duplicate-export-blocked', async e => {
    const s = setup(); await ready(s); const job = s.page.exportStatement(); await tick();
    await s.page.exportStatement(); e.exports = s.pending.filter(x => x.action === 'exportStatement').length;
    s.pending.at(-1).resolve(statement); await job; assert.equal(e.exports, 1);
  });
  for (const boundary of ['hide', 'unload', 'user', 'denied']) await check('export-start-' + boundary, async e => {
    const s = setup(); await ready(s);
    if (boundary === 'hide') s.page.onHide(); else if (boundary === 'unload') s.page.onUnload();
    else if (boundary === 'user') changeUser(s);
    else { const read = s.page.load(true); await tick(); s.pending.at(-1).reject(Error('合成拒绝')); await read; }
    const job = s.page.exportStatement(); await tick();
    const exports = s.pending.filter(x => x.action === 'exportStatement'); e.exports = exports.length;
    exports.forEach(x => x.resolve(statement));
    s.pending.filter(x => x.action === 'listMyBatches').forEach(x => x.resolve(response('B')));
    await job; assert.equal(e.exports, 0);
  });
  for (const boundary of ['hide', 'unload', 'user', 'refresh']) await check('late-export-' + boundary, async e => {
    const s = setup(); await ready(s); const job = s.page.exportStatement(); await tick(); const original = s.pending.at(-1);
    if (boundary === 'hide') s.page.onHide(); else if (boundary === 'unload') s.page.onUnload();
    else if (boundary === 'user') changeUser(s); else await ready(s);
    original.resolve(statement); await job;
    e.clipboard = s.clipboard.length; e.modals = s.modals.length;
    assert.equal(e.clipboard, 0); assert.equal(e.modals, 0);
  });
  for (const field of ['stationCode', 'stationCommunityId', 'roles']) await check('export-scope-change-' + field, async e => {
    const s = setup(); await ready(s);
    s.env.app.globalData.user[field] = field === 'roles' ? ['resident'] : 'changed';
    const job = s.page.exportStatement(); await tick();
    e.exports = s.pending.filter(x => x.action === 'exportStatement').length;
    s.pending.at(-1).resolve(response('new-scope')); await job; assert.equal(e.exports, 0);
  });
  await check('next-page-overlap-and-raw-offset', async e => {
    const s = setup(); await ready(s); const first = s.page.load(); await tick();
    const count = s.pending.length; await s.page.load(); assert.equal(s.pending.length, count);
    s.pending.at(-1).resolve({ list: [batch('A'), batch('B')], hasMore: true }); await first;
    e.rows = Array.from(s.page.data.batches, x => x._id); assert.deepEqual(e.rows, ['A', 'B']);
    const next = s.page.load(); await tick(); e.nextOffset = s.pending.at(-1).data.offset;
    s.pending.at(-1).resolve({ list: [], hasMore: false }); await next; assert.equal(e.nextOffset, 3);
  });
  for (const code of ['E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND']) await check('next-page-denied-' + code, async e => {
    const s = setup(); await ready(s); const job = s.page.load(); await tick();
    s.pending.at(-1).reject(Object.assign(Error('合成权限拒绝'), { code })); await job;
    e.rows = s.page.data.batches.length; e.ready = s.page.data.ready;
    assert.equal(e.rows, 0); assert.equal(e.ready, false); assert.equal(s.page.data.pageError, false);
  });
  await check('export-denied-clears-readiness-and-rows', async e => {
    const s = setup(); await ready(s); const job = s.page.exportStatement(); await tick();
    s.pending.at(-1).reject(Object.assign(Error('合成权限拒绝'), { code: 'E_FORBIDDEN' })); await job;
    e.rows = s.page.data.batches.length; e.ready = s.page.data.ready;
    assert.equal(e.rows, 0); assert.equal(e.ready, false); assert.equal(s.page.data.exporting, false);
  });
  await check('export-network-error-allows-active-retry', async e => {
    const s = setup(); await ready(s); const job = s.page.exportStatement(); await tick();
    s.pending.at(-1).reject(Error('合成导出失败')); await job;
    assert.equal(s.page.data.ready, true); assert.equal(s.page.data.month, '2026-11');
    const retry = s.page.exportStatement(); await tick(); s.pending.at(-1).resolve(statement); await retry;
    e.exports = s.pending.filter(x => x.action === 'exportStatement').length;
    assert.equal(e.exports, 2); assert.equal(s.clipboard.length, 1); assert.equal(s.page.data.error, '');
  });
  await check('export-freezes-month-and-blocks-next-page', async e => {
    const s = setup(); await ready(s); const job = s.page.exportStatement(); await tick();
    s.page.monthChange({ detail: { value: '2026-12' } }); s.page.onReachBottom();
    e.month = s.page.data.month; e.reads = s.pending.filter(x => x.action === 'listMyBatches').length;
    assert.equal(e.month, '2026-11'); assert.equal(e.reads, 1);
    assert.equal(s.pending.at(-1).data.to, '2026-11-30'); s.pending.at(-1).resolve(statement); await job;
  });
  for (const boundary of ['active', 'hide', 'user']) await check('clipboard-callback-' + boundary, async e => {
    const s = setup(); await ready(s); let clipboardOptions;
    s.env.wx.setClipboardData = options => { clipboardOptions = options; };
    const job = s.page.exportStatement(); await tick(); s.pending.at(-1).resolve(statement); await tick();
    assert.ok(clipboardOptions);
    if (boundary === 'hide') s.page.onHide(); else if (boundary === 'user') changeUser(s);
    clipboardOptions.success(); await job; e.modals = s.modals.length;
    assert.equal(e.modals, boundary === 'active' ? 1 : 0);
  });
  await check('clipboard-failure-restores-button', async e => {
    const s = setup(); await ready(s); s.env.wx.setClipboardData = options => options.fail(Error('合成复制失败'));
    const job = s.page.exportStatement(); await tick(); s.pending.at(-1).resolve(statement); await job;
    e.error = s.page.data.error; assert.equal(e.error, '合成复制失败'); assert.equal(s.page.data.exporting, false);
    assert.equal(s.page.data.loadError, false);
  });
  await check('hidden-load-is-noop', async e => {
    const s = setup(); s.page.onHide(); const before = s.writes.length;
    await s.page.load(true); e.reads = s.pending.length;
    assert.equal(e.reads, 0); assert.equal(s.writes.length, before);
  });
  await check('missing-identity-does-not-query', async e => {
    const s = setup(); s.env.app.globalData.user = null; await s.page.load(true);
    e.reads = s.pending.length; assert.equal(e.reads, 0); assert.equal(s.page.data.ready, false);
    assert.equal(s.page.data.loading, false); assert.ok(s.page.data.error);
  });
  await check('request-options-suppress-stale-global-effects', async () => {
    const s = setup(); const job = s.page.load(true); await tick(); const options = s.env.requests[0][3];
    assert.equal(options.silent, true); assert.equal(options.redirectOnForbidden, false); assert.equal(options.isActive(), true);
    s.page.onHide(); assert.equal(options.isActive(), false); s.pending[0].resolve(response('A')); await job;
  });
  return { scope: 'actual P62 page, synthetic identities and responses; zero cloud, clipboard or native modal actions',
    pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results };
}
if (require.main === module) {
  const timeout = setTimeout(() => { console.error('Diagnostic did not settle'); process.exit(1); }, 3000);
  run().then(result => { console.log(JSON.stringify(result, null, 2)); if (result.fail) process.exitCode = 1; })
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(timeout));
}
module.exports = { run };
