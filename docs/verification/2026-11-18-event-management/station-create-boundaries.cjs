// Actual page, synthetic responses only. No network, real addresses or native notifications.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const PAGE = 'miniprogram/station/create/create.js';
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const result = { batchId: 'synthetic-batch', eligibleCount: 1, skippedCount: 0 };
async function setup() {
  const pending = [], writes = [], notices = [];
  const env = runtime(async (name, action, data) => { if (action === 'lookupBatchCreation') return { batchId: null }; return new Promise((resolve, reject) => pending.push({ name, action, data, resolve, reject })); });
  env.app.globalData.user = { _id: 'station-A', roles: ['station'], stationCommunityId: 'community-A', stationCode: 'A' };
  env.wx.showToast = options => notices.push(options.title);
  const page = env.instance(PAGE);
  await page.onShow?.();
  page.data.lines = '合成楼-1单元-101';
  const setData = page.setData.bind(page);
  page.setData = patch => { writes.push(patch); setData(patch); };
  return { env, page, pending, writes, notices };
}
function boundary(s, kind) {
  if (kind === 'user') s.env.app.globalData.user = { _id: 'station-B', roles: ['station'], stationCommunityId: 'community-B', stationCode: 'B' };
  else if (kind === 'station') s.env.app.globalData.user.stationCode = 'B';
  else if (kind === 'hide') { s.page.onHide?.(); s.page.visible = false; }
  else if (kind === 'unload') { s.page.onUnload?.(); s.page.visible = false; }
}
function cloudSetup({ responseLost = false, consent = true, savedAddress = false } = {}) {
  const db = fixture({ local: true, roles: ['station'], allowWrites: true });
  if (process.env.QA133_FUNCTION_ROOT) {
    const path = require('node:path');
    db.call = (name, action, data = {}) => {
      if (name !== 'station') throw Error('Only the fixed station package may be tested');
      return db.load(path.join(process.env.QA133_FUNCTION_ROOT, 'index.js')).main({ ...data, action });
    };
  }
  Object.assign(db.data.users[0], { stationCommunityId: 'c', stationCode: 'A' });
  db.data.communities[0].stations = [{ code: 'A' }];
  db.data.buildings = [{ _id: 'building-A', communityId: 'c', name: '合成楼', units: ['1单元'] }];
  const address = { communityId: 'c', buildingId: 'building-A', unit: '1单元', room: '101' };
  db.data.users.push({ _id: 'resident-A', openid: 'synthetic-resident', roles: ['resident'], prefs: { doorDelivery: consent },
    ...(savedAddress ? { addresses: [address] } : address) });
  // The shared fixture has no elemMatch implementation. Implement only this query
  // predicate here, preserving the actual function's query and transaction paths.
  const collection = db.db.collection.bind(db.db);
  db.db.collection = table => {
    const chain = collection(table), where = chain.where;
    chain.where = filter => {
      if (table !== 'users' || filter.addresses?.op !== 'elemMatch') return where(filter);
      let limit = 100;
      const query = { limit(value) { limit = value; return query; }, async get() {
        return { data: structuredClone(db.data.users.filter(user => (user.addresses || []).some(address =>
          Object.entries(filter.addresses.value).every(([key, value]) => address[key] === value))).slice(0, limit)) };
      } };
      return query;
    };
    return chain;
  };
  let lost = false;
  const env = runtime(async (name, action, input) => {
    const response = await db.call(name, action, input);
    if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
    if (responseLost && !lost) { lost = true; throw Error('合成响应丢失'); }
    return response.data;
  });
  env.app.globalData.user = db.data.users[0];
  const page = env.instance(PAGE); page.data.lines = '合成楼-1单元-101';
  return { db, env, page };
}
async function run() {
  const results = [];
  async function check(name, body) {
    const evidence = {};
    try { await body(evidence); results.push({ name, pass: true, evidence }); }
    catch (error) { results.push({ name, pass: false, evidence, error: error.message }); }
  }
  await check('normal-create', async e => {
    const s = await setup(); const job = s.page.create(); await tick(); s.pending[0].resolve(result); await job;
    e.calls = s.pending.length; e.result = s.page.data.result.batchId;
    assert.equal(e.calls, 1); assert.equal(e.result, result.batchId); assert.equal(s.page.data.busy, false);
  });
  await check('busy-double-submit', async e => {
    const s = await setup(); const job = s.page.create(); await tick(); await s.page.create();
    e.calls = s.pending.length; s.pending[0].resolve(result); await job; assert.equal(e.calls, 1);
  });
  await check('same-page-response-loss-reuses-id', async e => {
    const s = await setup(); const a = s.page.create(); await tick(); s.pending[0].reject(Error('合成响应丢失')); await a;
    const b = s.page.create(); await tick(); s.pending[1].resolve(result); await b;
    e.sameId = s.pending[0].data.requestId === s.pending[1].data.requestId; assert.equal(e.sameId, true);
  });
  await check('response-loss-reentry-keeps-original-id', async e => {
    const s = await setup(); const a = s.page.create(); await tick(); s.pending[0].reject(Error('合成响应丢失')); await a;
    boundary(s, 'unload'); const next = s.env.instance(PAGE); await next.onShow?.(); next.data.lines = s.page.data.lines;
    const b = next.create(); await tick(); s.pending[1].resolve(result); await b;
    e.sameId = s.pending[0].data.requestId === s.pending[1].data.requestId; e.calls = s.pending.length;
    assert.equal(e.sameId, true);
  });
  for (const kind of ['hide', 'unload', 'user', 'station']) {
    await check('old-submit-' + kind, async e => {
      const s = await setup(); boundary(s, kind); const job = s.page.create(); await tick();
      e.calls = s.pending.length; for (const call of s.pending) call.resolve(result); await job;
      assert.equal(e.calls, 0);
    });
    for (const outcome of ['success', 'error']) await check('late-' + outcome + '-' + kind, async e => {
      const s = await setup(); const job = s.page.create(); await tick(); boundary(s, kind);
      const before = s.writes.length;
      if (outcome === 'success') s.pending[0].resolve(result); else s.pending[0].reject(Error('合成迟到错误'));
      await job; e.writes = s.writes.length - before; e.notices = s.notices.length;
      assert.equal(e.writes, 0); assert.equal(e.notices, 0);
    });
  }
  await check('unknown-result-unchanged-input-event-keeps-id', async e => {
    const s = await setup(); const a = s.page.create(); await tick(); s.pending[0].reject(Error('合成响应丢失')); await a;
    s.page.change({ detail: { value: s.page.data.lines } });
    const b = s.page.create(); await tick(); s.pending[1].resolve(result); await b;
    e.sameId = s.pending[0].data.requestId === s.pending[1].data.requestId; assert.equal(e.sameId, true);
  });
  await check('no-eligible-residents-no-batch-result', async e => {
    const s = await setup(); const job = s.page.create(); await tick(); s.pending[0].resolve({ batchId: null, eligibleCount: 0, skippedCount: 1 }); await job;
    e.batchId = s.page.data.result.batchId; e.notices = s.notices.length;
    assert.equal(e.batchId, null); assert.equal(e.notices, 1); assert.equal(s.page.data.busy, false);
  });
  for (const scenario of ['normal', 'same-page', 'reentry', 'unchanged-input', 'saved-address', 'no-consent']) {
    await check('actual-cloud-synthetic-db-' + scenario, async e => {
      const s = cloudSetup({ responseLost: ['same-page', 'reentry', 'unchanged-input'].includes(scenario),
        consent: scenario !== 'no-consent', savedAddress: scenario === 'saved-address' });
      await s.page.onShow?.();
      await s.page.create();
      e.firstCount = (s.db.data.deliveryBatches || []).length;
      if (scenario === 'reentry') {
        s.page.onUnload?.(); const next = s.env.instance(PAGE); next.data.lines = s.page.data.lines; await next.create();
      } else if (scenario === 'unchanged-input') { s.page.change({ detail: { value: s.page.data.lines } }); await s.page.create(); }
      else if (scenario === 'same-page') await s.page.create();
      e.finalCount = (s.db.data.deliveryBatches || []).length;
      e.calls = s.env.requests.length;
      e.uniqueRequestIds = new Set(s.env.requests.map(r => r[2].requestId)).size;
      e.error = s.page.data.error;
      assert.equal(e.firstCount, scenario === 'no-consent' ? 0 : 1, 'first actual cloud entry must produce expected synthetic record');
      assert.equal(e.finalCount, scenario === 'no-consent' ? 0 : 1, 'retry must not create a second batch');
    });
  }
  return { scope: 'actual P63 page; cloud-labelled cases execute actual station entry against synthetic database; no real cloud or native notifications',
    pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass).length, results };
}
if (require.main === module) {
  const timer = setTimeout(() => { console.error('Diagnostic did not settle'); process.exit(1); }, 3000);
  run().then(result => { console.log(JSON.stringify(result, null, 2)); if (result.fail) process.exitCode = 1; })
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(timer));
}
module.exports = { run, cloudSetup };
