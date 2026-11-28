// Actual page, synthetic camera callbacks and identities. No camera or cloud writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
async function setup() {
  let failLoad = false;
  const env = runtime(async (_, action) => {
    if (action === 'listCommunities') return { list: [{ _id: 'c', name: '合成一' }, { _id: 'd', name: '合成二' }] };
    if (action === 'adminList') { if (failLoad) throw Error('读取失败'); return { list: [] }; }
    throw Error('Unexpected write: ' + action);
  });
  env.app.globalData.user = { _id: 'a', roles: ['admin'], communityId: 'c' };
  const callbacks = [];
  env.wx.scanCode = options => callbacks.push(options);
  const page = env.instance('miniprogram/events/manage/manage.js');
  await page.onShow();
  return { env, page, callbacks, failLoad() { failLoad = true; } };
}
function watch(page) { let writes = 0; const old = page.setData; page.setData = function(...args) { writes++; old.apply(this, args); }; return () => writes; }
async function test(name, run) { await run(); results.push({ name, pass: true }); }
const settle = (s, outcome, index = 0) => outcome === 'success' ? s.callbacks[index].success({ result: 'e=synthetic-code' }) : s.callbacks[index].fail({ errMsg: 'scanCode:fail synthetic' });
(async () => {
  for (const boundary of ['same-page', 'hidden', 'unload', 'refresh', 'change-user', 'change-community']) {
    for (const outcome of ['success', 'failure']) await test(boundary + '-' + outcome, async () => {
      const s = await setup(), op = s.page.scan(); assert.equal(s.callbacks.length, 1);
      if (boundary === 'hidden') s.page.onHide();
      if (boundary === 'unload') s.page.onUnload();
      if (boundary === 'refresh') await s.page.load();
      if (boundary === 'change-user') { s.env.app.globalData.user = { _id: 'b', roles: ['admin'], communityId: 'c' }; await s.page.load(); }
      if (boundary === 'change-community') { await s.page.chooseCommunity({ detail: { value: '1' } }); assert.equal(s.page.data.communityId, 'd'); }
      const writes = watch(s.page); settle(s, outcome); await op;
      if (boundary === 'same-page') {
        assert.equal(s.page.data.scanning, false);
        assert.equal(s.page.data.scanCode, outcome === 'success' ? 'synthetic-code' : '');
        assert.equal(!!s.page.data.error, outcome === 'failure');
      } else { assert.equal(writes(), 0); assert.equal(s.page.data.scanCode, ''); }
    });
  }
  for (const timing of ['before-show', 'after-show', 'during-recheck']) await test('native-camera-return-' + timing, async () => {
    const s = await setup(), op = s.page.scan(); s.page.onHide();
    if (timing === 'before-show') { settle(s, 'success'); await op; assert.equal(s.page.data.scanCode, ''); await s.page.onShow(); }
    if (timing === 'after-show') { await s.page.onShow(); settle(s, 'success'); await op; }
    if (timing === 'during-recheck') {
      let release; s.env.app.ensureSession = () => new Promise(resolve => { release = resolve; });
      const showing = s.page.onShow(); settle(s, 'success'); await op; assert.equal(s.page.data.scanCode, '');
      release(s.env.app.globalData.user); await showing;
    }
    assert.equal(s.page.data.scanCode, 'synthetic-code'); assert.equal(s.page.data.scanning, false);
    assert.equal(s.env.requests.some(x => x[1] === 'checkin'), false);
  });
  for (const boundary of ['user', 'community', 'read-failure']) await test('camera-return-recheck-rejects-' + boundary, async () => {
    const s = await setup(), op = s.page.scan(); s.page.onHide();
    if (boundary === 'user') s.env.app.globalData.user = { _id: 'b', roles: ['admin'], communityId: 'c' };
    if (boundary === 'community') s.page.setData({ communityId: 'd' });
    if (boundary === 'read-failure') s.failLoad();
    settle(s, 'success'); await op; await s.page.onShow();
    assert.equal(s.page.data.scanCode, ''); assert.equal(s.page.data.scanning, false);
    if (boundary === 'read-failure') assert.equal(s.page.data.error, '读取失败');
  });
  await test('double-click-one-camera', async () => { const s = await setup(), op = s.page.scan(); await s.page.scan(); assert.equal(s.callbacks.length, 1); settle(s, 'success'); await op; });
  for (const outcome of ['success', 'failure']) await test('old-camera-cannot-overwrite-new-' + outcome, async () => {
    const s = await setup(), old = s.page.scan(); await s.page.load(); const next = s.page.scan();
    assert.equal(s.callbacks.length, 2); s.callbacks[1].success({ result: 'new' }); await next;
    const writes = watch(s.page); settle(s, outcome); await old;
    assert.equal(writes(), 0); assert.equal(s.page.data.scanCode, 'new');
  });
  await test('cancel-clears-old-error-and-code', async () => {
    const s = await setup(); s.page.setData({ scanCode: 'old', error: 'old failure' }); const op = s.page.scan();
    s.callbacks[0].fail({ errMsg: 'scanCode:fail cancel' }); await op;
    assert.equal(s.page.data.error, ''); assert.equal(s.page.data.scanCode, ''); assert.equal(s.page.data.scanning, false);
  });
  for (const result of [{ scene: 'e=ok' }, { path: 'events/detail/detail?scene=e%3Dok&x=1' }]) await test('scan-format-' + Object.keys(result)[0], async () => {
    const s = await setup(), op = s.page.scan(); s.callbacks[0].success(result); await op; assert.equal(s.page.data.scanCode, 'ok');
  });
  await test('malformed-path-is-retryable', async () => { const s = await setup(), op = s.page.scan(); s.callbacks[0].success({ path: '?scene=%broken' }); await op; assert.equal(s.page.data.scanning, false); assert.ok(s.page.data.error); });
  for (const boundary of ['loading', 'not-ready', 'busy', 'hidden', 'changed-user']) await test('blocked-before-camera-' + boundary, async () => {
    const s = await setup();
    if (boundary === 'loading') s.page.setData({ loading: true });
    if (boundary === 'not-ready') s.page.setData({ ready: false });
    if (boundary === 'busy') s.page.setData({ busy: true });
    if (boundary === 'hidden') s.page.onHide();
    if (boundary === 'changed-user') s.env.app.globalData.user = { _id: 'b', roles: ['admin'], communityId: 'c' };
    await s.page.scan(); assert.equal(s.callbacks.length, 0);
  });
  console.log(JSON.stringify({ scope: 'isolated actual-page handlers; synthetic camera lifecycle, not native device acceptance', pass: results.length, fail: 0, results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
