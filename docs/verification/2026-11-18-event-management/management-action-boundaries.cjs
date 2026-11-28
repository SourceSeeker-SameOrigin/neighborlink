// Real page handlers, synthetic identities/responses only. No cloud writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const ops = [['publish', 'publish'], ['review', 'publish'], ['cancelEvent', 'cancel'],
  ['retryCancellation', 'retryCancellation'], ['checkin', 'checkin']];
const tap = { currentTarget: { dataset: { id: 'e' } } };
const results = [];
const user = id => ({ _id: id, roles: ['admin'], communityId: 'c' });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function setup(action, delayed = false) {
  const response = deferred();
  let loadError = false;
  const record = { _id: 'e', status: ['publish', 'review'].includes(action) ? 'draft' : action === 'retryCancellation' ? 'cancelled' : 'published',
    reviewRequested: action === 'review', ...(action === 'retryCancellation' ? { cancelRefund: { status: 'attention', failedCount: 1 } } : {}) };
  const env = runtime(async (_, name) => {
    if (name === 'listCommunities') return { list: [{ _id: 'c', name: '合成小区' }] };
    if (name === 'adminList') { if (loadError) throw Error('读取失败'); return { list: [{ ...record }] }; }
    assert.equal(name, action);
    return delayed ? response.promise : {};
  });
  env.app.globalData.user = user('manager-a');
  const page = env.instance('miniprogram/events/manage/manage.js');
  const count = () => env.requests.filter(x => x[1] === action).length;
  return { env, page, response, count, record, failLoad() { loadError = true; } };
}
async function ready(s) { await s.page.onShow(); s.page.setData({ scanCode: 'synthetic-code' }); }
async function sent(s) { for (let i = 0; i < 20 && !s.count(); i++) await Promise.resolve(); assert.equal(s.count(), 1, 'must exercise an already-sent request'); }
function track(s) { const original = s.page.setData; let writes = 0; s.page.setData = function(...args) { writes++; return original.apply(this, args); }; return () => writes; }
async function test(action, boundary, run) { await run(); results.push({ action, boundary, pass: true }); }
(async () => {
  for (const [action, method] of ops) {
    await test(action, 'same-page', async () => { const s = setup(action); await ready(s); await s.page[method](tap); assert.equal(s.count(), 1); assert.equal(s.page.data.busy, false); assert.equal(s.page.data.error, '');
      const req = s.env.requests.find(x => x[1] === action); assert.equal(req[2].eventId, 'e'); assert.equal(req[3].silent, true); assert.equal(req[3].redirectOnForbidden, false);
      if (action === 'review') assert.equal(req[2].approved, true);
      if (action === 'checkin') { assert.equal(req[2].checkinCode, 'synthetic-code'); assert.equal(s.page.data.scanCode, ''); }
    });
    await test(action, 'switch-user-readonly-then-explicit-click', async () => { const s = setup(action); await ready(s); s.env.app.globalData.user = user('manager-b'); await s.page[method](tap); assert.equal(s.count(), 0); assert.equal(s.page.userId, 'manager-b'); assert.equal(s.page.data.busy, false); s.page.setData({ scanCode: 'new-code' }); await s.page[method](tap); assert.equal(s.count(), 1); });
    await test(action, 'identity-changes-during-session-check', async () => { const s = setup(action); await ready(s); const session = deferred(); s.env.app.ensureSession = () => session.promise; const op = s.page[method](tap); s.env.app.globalData.user = user('manager-b'); session.resolve(s.env.app.globalData.user); await op; assert.equal(s.count(), 0); assert.equal(s.page.userId, 'manager-b'); assert.equal(s.page.data.busy, false); });
    await test(action, 'double-click', async () => { const s = setup(action, true); await ready(s); const first = s.page[method](tap); await s.page[method](tap); await sent(s); s.response.resolve({}); await first; assert.equal(s.count(), 1); assert.equal(s.page.data.busy, false); });
    await test(action, 'visible-error-and-readonly-reconcile', async () => { const s = setup(action, true); await ready(s); const op = s.page[method](tap); await sent(s); s.response.reject(Error('合成操作结果未知')); await op; assert.equal(s.page.data.error, '合成操作结果未知'); assert.equal(s.page.data.busy, false); await s.page.load(); assert.equal(s.count(), 1); assert.equal(s.page.data.error, ''); });
    for (const boundary of ['hide', 'unload', 'refresh', 'hide-show', 'refresh-failed']) {
      for (const outcome of ['success', 'error']) {
        await test(action, boundary + '-late-' + outcome, async () => {
          const s = setup(action, true); await ready(s); const op = s.page[method](tap); await sent(s);
          if (boundary === 'hide' || boundary === 'hide-show') s.page.onHide();
          if (boundary === 'unload') s.page.onUnload();
          if (boundary === 'hide-show') await s.page.onShow();
          if (boundary === 'refresh-failed') s.failLoad();
          if (boundary.startsWith('refresh')) await s.page.load();
          const writes = track(s), requestCount = s.env.requests.length;
          const options = s.env.requests.find(x => x[1] === action)[3]; assert.equal(options.isActive(), false);
          if (outcome === 'success') s.response.resolve({}); else s.response.reject(Error('迟到失败'));
          await op; assert.equal(writes(), 0); assert.equal(s.env.requests.length, requestCount); assert.equal(s.count(), 1);
          if (boundary === 'refresh-failed') { await s.page[method](tap); assert.equal(s.count(), 1); assert.equal(s.page.data.ready, false); }
        });
      }
    }
    await test(action, 'identity-changes-after-send-readonly-reconcile', async () => { const s = setup(action, true); await ready(s); const op = s.page[method](tap); await sent(s); s.env.app.globalData.user = user('manager-b'); s.response.reject(Error('旧账号错误')); await op; assert.equal(s.count(), 1); assert.equal(s.page.userId, 'manager-b'); assert.equal(s.page.data.error, ''); assert.equal(s.page.data.busy, false); });
    await test(action, 'unknown-record-blocked', async () => { const s = setup(action); await ready(s); await s.page[method]({ currentTarget: { dataset: { id: 'missing' } } }); assert.equal(s.count(), 0); });
    await test(action, 'unavailable-status-blocked', async () => { const s = setup(action); await ready(s); s.page.data.list[0].status = 'ended'; delete s.page.data.list[0].cancelRefund; await s.page[method](tap); assert.equal(s.count(), 0); });
    await test(action, 'old-completion-cannot-release-new-operation', async () => {
      const s = setup(action, true); await ready(s); const old = s.page[method](tap); await sent(s); await s.page.load();
      const session = deferred(); s.env.app.ensureSession = () => session.promise; s.page.setData({ scanCode: 'new-code' });
      const next = s.page[method](tap); assert.equal(s.page.data.busy, true); s.response.resolve({}); await old; assert.equal(s.page.data.busy, true);
      session.resolve(s.env.app.globalData.user); await next; assert.equal(s.count(), 2); assert.equal(s.page.data.busy, false);
    });
  }
  console.log(JSON.stringify({ pass: results.length, fail: 0, scope: 'synthetic actual-page handlers; no cloud writes', results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
