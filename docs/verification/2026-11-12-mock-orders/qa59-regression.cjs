// QA59 actual page logic; only synthetic identities and API responses.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const event = code => ({ currentTarget: { dataset: { code } } });
function setup(call = async () => ({ unreadTotal: 0, merchant: null, application: null })) {
  const r = runtime(call);
  r.app.globalData.user = { _id: 'fixture', roles: ['resident', 'admin'], communityId: 'fixture-community', buildingId: 'fixture-building' };
  r.app.globalData.community = { _id: 'fixture-community', enabledFeatures: { merchants: true, stationDelivery: true } };
  r.wx.showModal = () => {};
  return { r, p: r.instance('miniprogram/pages/me/me.js') };
}
async function test(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.message }); } }
(async () => {
  for (const code of ['merchant', 'station']) {
    const field = code === 'merchant' ? 'merchant' : 'stationApplication';
    const other = code === 'merchant' ? 'station' : 'merchant';
    const otherField = other === 'merchant' ? 'merchant' : 'stationApplication';
    await test(code + ' failure keeps identity and other module usable', async () => {
      const { p } = setup(async name => { if (name === code) throw Error('合成读取失败'); return { unreadTotal: 7, merchant: { status: 'pending' }, application: { status: 'pending' } }; });
      await p.load(); assert.equal(p.data.error, ''); assert.equal(p.data.loading, false); assert.equal(p.data.isAdmin, true);
      assert.equal(p.data[code + 'Error'], '合成读取失败'); assert.equal(p.data[other + 'Error'], ''); assert.equal(p.data[otherField].status, 'pending');
    });
    await test(code + ' retry clears only its error and never navigates or writes', async () => {
      let fail = true; const { r, p } = setup(async name => { if (fail && ['merchant', 'station'].includes(name)) throw Error('合成读取失败'); return { unreadTotal: 7, merchant: { status: 'pending' }, application: { status: 'pending' } }; });
      await p.load(); const before = r.requests.length; fail = false;
      await p.retryApplication(event(code)); assert.equal(r.requests.length, before + 1);
      assert.deepEqual(r.requests.at(-1).slice(0, 2), [code, 'myApplication']); assert.equal(p.data[code + 'Error'], '');
      assert.equal(p.data[field].status, 'pending'); assert.equal(p.data[other + 'Error'], '合成读取失败'); assert.equal(r.navigation.length, 0);
    });
    await test(code + ' busy retry does not duplicate requests or show absent state', async () => {
      const wait = deferred(); const { r, p } = setup(name => name === code ? wait.promise : Promise.resolve({ unreadTotal: 0, merchant: null, application: null }));
      const pending = p.load(); await flush(); const before = r.requests.length;
      assert.equal(p.data[code + 'Loading'], true); assert.equal(p.data.loading, false);
      await p.retryApplication(event(code)); await p.openWorkspace(event(code)); assert.equal(r.requests.length, before); assert.equal(r.navigation.length, 0);
      wait.resolve({ merchant: null, application: null }); await pending; assert.equal(p.data[code + 'Loading'], false);
    });
    await test(code + ' errored row retries read instead of opening application', async () => {
      const { r, p } = setup(async name => { if (name === code) throw Error('合成读取失败'); return { unreadTotal: 0, merchant: null, application: null }; });
      await p.load(); const before = r.requests.length; await p.openWorkspace(event(code));
      assert.equal(r.requests.length, before + 1); assert.equal(r.navigation.length, 0); assert.equal(p.data[code + 'Error'], '合成读取失败');
    });
    for (const hook of ['onHide', 'onUnload']) await test(code + ' ' + hook + ' rejects late response and API side effects', async () => {
      const wait = deferred(); let active;
      const { p } = setup((name, action, data, options) => { if (name === code) { active = options.isActive; return wait.promise; } return Promise.resolve({ unreadTotal: 0, merchant: null, application: null }); });
      const pending = p.load(); await flush(); assert.equal(active(), true); p[hook](); assert.equal(active(), false);
      let writes = 0; const original = p.setData.bind(p); p.setData = patch => { writes++; original(patch); };
      wait.reject(Error('迟到失败')); await pending; assert.equal(writes, 0);
    });
    await test(code + ' newer full load wins over older application', async () => {
      const wait = deferred(); let count = 0;
      const { p } = setup(async name => { if (name === code && ++count === 1) return wait.promise; return { unreadTotal: 7, merchant: { status: 'approved' }, application: { status: 'approved' } }; });
      const first = p.load(); await flush(); await p.load(); wait.resolve({ merchant: { status: 'pending' }, application: { status: 'pending' } }); await first;
      assert.equal(p.data[field].status, 'approved'); assert.equal(p.data[code + 'Loading'], false);
    });
  }
  await test('identity pending cannot open workspace', async () => {
    const wait = deferred(); const { r, p } = setup(); p.data.user = r.app.globalData.user; r.app.ensureSession = () => wait.promise;
    const pending = p.load(); await p.openWorkspace(event('admin')); assert.equal(r.navigation.length, 0);
    wait.resolve(r.app.globalData.user); await pending;
  });
  await test('identity failure has explicit retry, then successful reentry', async () => {
    const { r, p } = setup(); r.app.ensureSession = async () => { throw Error('合成身份失败'); };
    await p.load(); assert.equal(p.data.error, '合成身份失败'); assert.equal(r.requests.length, 0);
    r.app.ensureSession = async () => r.app.globalData.user; await p.onShow(); assert.equal(p.data.error, ''); assert.equal(p.data.isAdmin, true);
  });
  await test('hide before identity completes prevents all dependent reads', async () => {
    const wait = deferred(); const { r, p } = setup(); r.app.ensureSession = () => wait.promise;
    const pending = p.load(); p.onHide(); wait.resolve(r.app.globalData.user); await pending; assert.equal(r.requests.length, 0);
  });
  await test('hidden page retry blocked; show refreshes, unload cannot revive', async () => {
    const { r, p } = setup(); await p.load(); p.onHide(); const before = r.requests.length;
    await p.retryApplication(event('merchant')); await p.load(); await p.openWorkspace(event('admin')); assert.equal(r.requests.length, before); assert.equal(r.navigation.length, 0);
    await p.onShow(); assert.ok(r.requests.length > before); const after = r.requests.length; p.onUnload(); await p.onShow(); assert.equal(r.requests.length, after);
  });
  await test('closed modules and assigned station skip application reads', async () => {
    const { r, p } = setup(); r.app.globalData.community.enabledFeatures = {}; await p.load(); assert.equal(r.requests.length, 1);
    r.app.globalData.community.enabledFeatures = { stationDelivery: true }; r.app.globalData.user.roles.push('station'); await p.load(); assert.equal(r.requests.length, 2);
  });
  await test('unknown retry target sends no call', async () => {
    const { r, p } = setup(); await p.load(); const before = r.requests.length; await p.retryApplication(event('unknown')); assert.equal(r.requests.length, before);
  });
  await test('older unread rejection cannot erase fresh count', async () => {
    const wait = deferred(); let count = 0;
    const { p } = setup(async name => { if (name === 'chat' && ++count === 1) return wait.promise; return { unreadTotal: 7, merchant: null, application: null }; });
    const first = p.load(); await flush(); await p.load(); wait.reject(Error('迟到失败')); await first; assert.equal(p.data.unreadTotal, 7);
  });
  process.stdout.write(JSON.stringify({ mode: 'actual-page-synthetic-only', total: results.length, passed: results.filter(r => r.passed).length, results }, null, 2) + '\n');
  process.exitCode = results.every(r => r.passed) ? 0 : 1;
})();
