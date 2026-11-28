// Actual My-page code with synthetic responses only. No cloud or private data.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup(call) {
  const r = runtime(call);
  r.app.globalData.community = { _id: 'fixture-community', enabledFeatures: {} };
  const p = r.instance('miniprogram/pages/me/me.js');
  return { r, p };
}
async function test(name, fn) {
  try { const evidence = await fn(); results.push({ name, passed: true, evidence }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}
(async () => {
  await test('successful initial read', async () => {
    const { p } = setup(async () => ({ unreadTotal: 7 }));
    await p.load(); assert.equal(p.data.loading, false); assert.equal(p.data.error, ''); assert.equal(p.data.unreadTotal, 7);
    return { loading: p.data.loading, unreadTotal: p.data.unreadTotal };
  });
  await test('older read cannot overwrite newer unread count', async () => {
    const first = deferred(), second = deferred(); let calls = 0;
    const { p } = setup(() => (++calls === 1 ? first.promise : second.promise));
    const a = p.load(); await flush(); const b = p.load(); await flush();
    second.resolve({ unreadTotal: 7 }); await b;
    first.resolve({ unreadTotal: 1 }); await a;
    assert.equal(p.data.unreadTotal, 7, 'older response overwrote latest count; actual=' + p.data.unreadTotal);
  });
  for (const lifecycle of ['onHide', 'onUnload']) {
    await test(lifecycle + ' blocks late success updates', async () => {
      const wait = deferred(); const { p } = setup(() => wait.promise);
      const pending = p.load(); await flush();
      if (p[lifecycle]) p[lifecycle](); let updates = 0;
      const setData = p.setData.bind(p); p.setData = patch => { updates++; setData(patch); };
      wait.resolve({ unreadTotal: 1 }); await pending;
      assert.equal(updates, 0, 'late setData calls=' + updates);
    });
    await test(lifecycle + ' blocks late identity failure updates', async () => {
      const wait = deferred(); const { r, p } = setup(async () => ({ unreadTotal: 0 }));
      r.app.ensureSession = () => wait.promise;
      const pending = p.load(); await flush();
      if (p[lifecycle]) p[lifecycle](); let updates = 0;
      const setData = p.setData.bind(p); p.setData = patch => { updates++; setData(patch); };
      wait.reject(Error('fixture identity unavailable')); await pending;
      assert.equal(updates, 0, 'late setData calls=' + updates);
    });
  }
  for (const module of ['merchant', 'station']) {
    await test(module + ' failed application read is not silent absence', async () => {
      const { r, p } = setup(async name => { if (name === module) throw Error('fixture application unavailable'); return { unreadTotal: 0 }; });
      r.app.globalData.community.enabledFeatures[module === 'merchant' ? 'merchants' : 'stationDelivery'] = true;
      await p.load();
      const field = module === 'merchant' ? 'merchant' : 'stationApplication';
      assert.ok(p.data.error || p.data[module + 'Error'], 'application=' + JSON.stringify(p.data[field]) + ', error=' + JSON.stringify(p.data.error));
    });
  }
  process.stdout.write(JSON.stringify({ source: 'miniprogram/pages/me/me.js', mode: 'actual-page-synthetic-only', passed: results.filter(r => r.passed).length, total: results.length, results }, null, 2) + '\n');
  process.exitCode = results.every(r => r.passed) ? 0 : 1;
})();
