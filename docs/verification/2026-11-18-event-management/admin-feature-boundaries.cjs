// Actual P25 page with synthetic identities and intercepted API calls; no cloud writes.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const page = 'miniprogram/admin/features/features.js';
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const admin = id => ({ _id: id, roles: ['admin'], communityId: 'c1' });
const event = (key = 'coupons', value = true) => ({ currentTarget: { dataset: { key } }, detail: { value } });

function setup(handler = async (_name, action) => {
  if (action === 'listCommunities') return { list: [{ _id: 'c1', name: '甲小区' }], hasMore: false };
  if (action === 'getFeatures') return { communityId: 'c1', global: { coupons: false }, community: {} };
  if (action === 'updateCommunity' || action === 'updateConfig') return { ok: true };
  throw Error('Unexpected API: ' + action);
}) {
  const r = runtime(handler);
  r.app.globalData.user = admin('a');
  return { ...r, p: r.instance(page) };
}
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}

(async () => {
  await check('current admin loads and toggles selected community once', async () => {
    const { p, requests } = setup(); await p.load(); await p.toggle(event());
    assert.equal(requests.filter(x => x[1] === 'updateCommunity').length, 1);
    assert.equal(requests.find(x => x[1] === 'updateCommunity')[2].communityId, 'c1');
    assert.equal(requests.filter(x => x[1] === 'getFeatures').length, 2);
  });
  await check('current admin may update global default once', async () => {
    const { p, requests } = setup(); await p.load();
    await p.scope({ currentTarget: { dataset: { scope: 'global' } } }); await p.toggle(event());
    assert.equal(requests.filter(x => x[1] === 'updateConfig').length, 1);
  });
  await check('different admin cannot submit old community switch', async () => {
    const { p, app, requests } = setup(); await p.load(); app.globalData.user = admin('b'); await p.toggle(event());
    assert.equal(requests.filter(x => x[1] === 'updateCommunity').length, 0);
    assert.equal(p.data.ready, false);
  });
  await check('resident cannot submit stale admin switch', async () => {
    const { p, app, requests } = setup(); await p.load(); app.globalData.user = { _id: 'b', roles: ['resident'], communityId: 'c1' };
    await p.toggle(event()); assert.equal(requests.filter(x => x[1] === 'updateCommunity').length, 0);
  });
  await check('identity change clears old options before scope switch', async () => {
    const { p, app, requests } = setup(); await p.load(); app.globalData.user = admin('b');
    await p.scope({ currentTarget: { dataset: { scope: 'global' } } });
    assert.equal(p.data.ready, false); assert.equal(p.data.items.length, 0);
    assert.equal(requests.filter(x => x[1] === 'getFeatures').length, 1);
  });
  await check('community switch reads only selected community before write', async () => {
    const { p, requests } = setup(async (_name, action, data) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }, { _id: 'c2' }], hasMore: false };
      if (action === 'getFeatures') return { communityId: data.communityId, global: {}, community: {} };
      if (action === 'updateCommunity') return { ok: true };
      throw Error(action);
    });
    await p.load(); await p.choose({ detail: { value: '1' } }); await p.toggle(event());
    assert.equal(requests.find(x => x[1] === 'updateCommunity')[2].communityId, 'c2');
  });
  await check('hidden page clears data and rejects stale switch', async () => {
    const { p, requests } = setup(); await p.load(); p.onHide(); await p.toggle(event());
    assert.equal(requests.filter(x => x[1] === 'updateCommunity').length, 0);
    assert.equal(p.data.items.length, 0); assert.equal(p.data.ready, false);
  });
  await check('double switch sends one update', async () => {
    const writing = deferred(); const { p, requests } = setup(async (_name, action) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'getFeatures') return { communityId: 'c1', global: {}, community: {} };
      if (action === 'updateCommunity') return writing.promise;
      throw Error(action);
    });
    await p.load(); const first = p.toggle(event()), second = p.toggle(event());
    assert.equal(requests.filter(x => x[1] === 'updateCommunity').length, 1);
    writing.resolve({ ok: true }); await Promise.all([first, second]);
  });
  await check('late read after hide does not restore old switches', async () => {
    const reading = deferred(); const { p } = setup(async (_name, action) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'getFeatures') return reading.promise;
      throw Error(action);
    });
    const pending = p.load(); await Promise.resolve(); await Promise.resolve(); p.onHide();
    reading.resolve({ communityId: 'c1', global: { coupons: true }, community: {} }); await pending;
    assert.equal(p.data.items.length, 0); assert.equal(p.data.ready, false);
  });
  await check('late write result after identity change does not repopulate old page', async () => {
    const writing = deferred(); const { p, app, requests } = setup(async (_name, action) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'getFeatures') return { communityId: 'c1', global: {}, community: {} };
      if (action === 'updateCommunity') return writing.promise;
      throw Error(action);
    });
    await p.load(); const pending = p.toggle(event()); app.globalData.user = admin('b');
    writing.resolve({ ok: true }); await pending;
    assert.equal(requests.filter(x => x[1] === 'getFeatures').length, 1);
    assert.equal(p.data.ready, false);
  });
  await check('failed refresh does not retain previously authorized switches', async () => {
    let reads = 0; const { p } = setup(async (_name, action) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'getFeatures') { reads++; if (reads === 2) throw Error('synthetic read error'); return { communityId: 'c1', global: {}, community: {} }; }
      throw Error(action);
    });
    await p.load(); await p.load(); assert.equal(p.data.ready, false); assert.equal(p.data.items.length, 0);
  });
  await check('failed update leaves read-only retry instead of re-sending write', async () => {
    const { p, requests } = setup(async (_name, action) => {
      if (action === 'listCommunities') return { list: [{ _id: 'c1' }], hasMore: false };
      if (action === 'getFeatures') return { communityId: 'c1', global: {}, community: {} };
      if (action === 'updateCommunity') throw Error('response lost');
      throw Error(action);
    });
    await p.load(); await p.toggle(event()); await p.toggle(event());
    assert.equal(requests.filter(x => x[1] === 'updateCommunity').length, 1);
    assert.equal(p.data.ready, false);
  });
  const report = { scope: 'Actual P25 page, synthetic identities and intercepted actions; no cloud writes',
    total: results.length, passed: results.filter(x => x.pass).length, cases: results };
  if (process.env.QA142_SAVE === '1') fs.writeFileSync('docs/verification/2026-11-18-event-management/qa142-after.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
