// P24 actual page with synthetic identities, intercepted cloud actions and file callbacks.
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const wait = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const row = { _id: 'settlement-a', total: 500, status: 'draft', payee: 'property', communityId: 'community-a' };
function fixture(handler) {
  const env = runtime(async (name, action, data) => {
    if (handler) { const result = handler(action, data); if (result !== undefined) return result; }
    if (action === 'listCommunities') return { list: [{ _id: 'community-a', name: '合成小区' }], hasMore: false };
    if (action === 'listProviders' || action === 'adminList') return { list: [], hasMore: false };
    if (action === 'getCommunity') return { _id: 'community-a', name: '合成小区' };
    if (action === 'listSettlements') return { list: [row], hasMore: false };
    if (action === 'settlementPreview') return { rows: [] };
    if (action === 'settlementCreate') return { settlements: [row] };
    if (action === 'settlementMarkPaid') return { status: 'paid' };
    if (action === 'exportCsv') return { tempFileURL: 'https://example.invalid/synthetic.csv' };
    throw Error('Unexpected ' + action);
  });
  env.app.globalData.user = { _id: 'admin-a', roles: ['admin'], communityId: 'community-a' };
  const page = env.instance('miniprogram/admin/settlements/settlements.js');
  const events = { opens: 0, toasts: 0 };
  let download;
  env.wx.downloadFile = options => { download = options; };
  env.wx.openDocument = () => { events.opens++; };
  env.wx.showToast = () => { events.toasts++; };
  page.setData({ from: '2026-11-01', to: '2026-11-26', payeeIndex: 1 });
  return { env, page, events, download: () => download };
}
async function ready(f) { await f.page.load(); assert.equal(f.page.data.ready, true); }
const markEvent = { currentTarget: { dataset: { id: 'settlement-a' } } };
async function test(name, body) {
  try { await body(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
(async () => {
  await test('current admin reads and previews', async () => {
    const f = fixture(); await ready(f); await f.page.preview();
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementPreview').length, 1);
  });
  await test('current admin creates once and verifies by reading', async () => {
    const f = fixture(); await ready(f); await f.page.create();
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementCreate').length, 1);
    assert.equal(f.env.requests.filter(x => x[1] === 'listSettlements').length, 2);
    assert.equal(f.events.toasts, 1);
  });
  await test('current admin marks a displayed draft paid and reads again', async () => {
    const f = fixture(); await ready(f); await f.page.markPaid(markEvent);
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementMarkPaid').length, 1);
    assert.equal(f.env.requests.filter(x => x[1] === 'listSettlements').length, 2);
  });
  await test('property can preview but cannot create or mark paid', async () => {
    const f = fixture(); f.env.app.globalData.user = { _id: 'property-a', roles: ['property'], communityId: 'community-a' };
    await ready(f); await f.page.preview(); await f.page.create(); await f.page.markPaid(markEvent);
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementPreview').length, 1);
    assert.equal(f.env.requests.filter(x => ['settlementCreate', 'settlementMarkPaid'].includes(x[1])).length, 0);
  });
  await test('identity change blocks old mark-paid button', async () => {
    const f = fixture(); await ready(f);
    f.env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
    await f.page.markPaid(markEvent);
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementMarkPaid').length, 0);
  });
  await test('role change blocks old create button', async () => {
    const f = fixture(); await ready(f);
    f.env.app.globalData.user = { _id: 'resident-b', roles: ['resident'] };
    await f.page.create();
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementCreate').length, 0);
  });
  await test('unload blocks old mark-paid button', async () => {
    const f = fixture(); await ready(f); f.page.onUnload();
    await f.page.markPaid(markEvent);
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementMarkPaid').length, 0);
  });
  await test('double mark-paid sends once', async () => {
    const pending = wait(); const f = fixture(action => action === 'settlementMarkPaid' ? pending.promise : undefined);
    await ready(f);
    const first = f.page.markPaid(markEvent); await tick();
    const second = f.page.markPaid(markEvent);
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementMarkPaid').length, 1);
    pending.resolve({ status: 'paid' }); await Promise.all([first, second]);
  });
  await test('double create sends once', async () => {
    const pending = wait(); const f = fixture(action => action === 'settlementCreate' ? pending.promise : undefined);
    await ready(f); const first = f.page.create(); await tick(); const second = f.page.create();
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementCreate').length, 1);
    pending.resolve({ settlements: [row] }); await Promise.all([first, second]);
  });
  await test('late loaded settlement does not cross identities', async () => {
    const pending = wait(); const f = fixture(action => action === 'listSettlements' ? pending.promise : undefined);
    const loading = f.page.load(); await tick();
    f.env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
    pending.resolve({ list: [row], hasMore: false }); await loading;
    assert.equal(f.page.data.settlements.length, 0);
  });
  await test('hide clears records and old read result', async () => {
    const f = fixture(); await ready(f); f.page.onHide();
    assert.equal(f.page.data.settlements.length, 0);
    assert.equal(f.page.data.authorized, false);
  });
  await test('late create result does not toast or change hidden page', async () => {
    const pending = wait(); const f = fixture(action => action === 'settlementCreate' ? pending.promise : undefined);
    await ready(f); const task = f.page.create(); await tick(); f.page.onHide();
    pending.resolve({ settlements: [row] }); await task;
    assert.equal(f.events.toasts, 0);
    assert.equal(f.page.data.settlements.length, 0);
  });
  await test('unknown mark-paid result requires read before another write', async () => {
    const pending = wait(); const f = fixture(action => action === 'settlementMarkPaid' ? pending.promise : undefined);
    await ready(f); const task = f.page.markPaid(markEvent); await tick();
    pending.reject(Error('合成网络中断')); await task;
    await f.page.markPaid(markEvent);
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementMarkPaid').length, 1);
    assert.equal(f.page.data.ready, false);
  });
  await test('unknown create result requires read before another write', async () => {
    const pending = wait(); const f = fixture(action => action === 'settlementCreate' ? pending.promise : undefined);
    await ready(f); const task = f.page.create(); await tick();
    pending.reject(Error('合成网络中断')); await task;
    await f.page.create();
    assert.equal(f.env.requests.filter(x => x[1] === 'settlementCreate').length, 1);
    assert.equal(f.page.data.ready, false);
  });
  await test('hidden mark-paid result does not reload old page', async () => {
    const pending = wait(); const f = fixture(action => action === 'settlementMarkPaid' ? pending.promise : undefined);
    await ready(f); const task = f.page.markPaid(markEvent); await tick();
    f.page.onHide(); pending.resolve({ status: 'paid' }); await task;
    assert.equal(f.env.requests.filter(x => x[1] === 'listSettlements').length, 1);
    assert.equal(f.page.data.settlements.length, 0);
  });
  await test('late CSV download cannot open after unload', async () => {
    const f = fixture(); await ready(f); const task = f.page.exportCsv(); await tick();
    f.page.onUnload(); f.download().success({ statusCode: 200, tempFilePath: 'synthetic.csv' });
    await task; assert.equal(f.events.opens, 0);
  });
  await test('late CSV download cannot open after identity change', async () => {
    const f = fixture(); await ready(f); const task = f.page.exportCsv(); await tick();
    f.env.app.globalData.user = { _id: 'admin-b', roles: ['admin'] };
    f.download().success({ statusCode: 200, tempFilePath: 'synthetic.csv' });
    await task; assert.equal(f.events.opens, 0);
  });
  await test('current CSV download opens once', async () => {
    const f = fixture(); await ready(f); const task = f.page.exportCsv(); await tick();
    f.download().success({ statusCode: 200, tempFilePath: 'synthetic.csv' });
    await task; assert.equal(f.events.opens, 1);
  });
  const failed = results.filter(x => !x.pass);
  console.log(JSON.stringify({ scope: 'actual P24 page, synthetic identities and intercepted actions; no cloud writes or files',
    total: results.length, passed: results.length - failed.length, cases: results, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
