// Actual station entry and page, isolated synthetic database. No network or native UI.
const assert = require('node:assert/strict');
const { cloudSetup } = require('./station-create-boundaries.cjs');
const PAGE = 'miniprogram/station/create/create.js';
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const ok = r => { assert.equal(r.ok, true, r.message); return r.data; };
const input = { requestId: 'qa133_original_request', lines: '合成楼-1单元-101' };
async function run() {
  const results = [];
  async function check(name, body) {
    const evidence = {};
    try { await body(evidence); results.push({ name, pass: true, evidence }); }
    catch (error) { results.push({ name, pass: false, evidence, error: error.message }); }
  }
  await check('lookup-only-minimal-result-and-no-writes', async e => {
    const s = cloudSetup(); const original = ok(await s.db.call('station', 'createBatch', input));
    const count = s.db.writes.length; const found = ok(await s.db.call('station', 'lookupBatchCreation', input));
    assert.equal(found.batchId, original.batchId); e.keys = Object.keys(found).sort();
    assert.deepEqual(e.keys, ['batchId', 'eligibleCount', 'repeated', 'skippedCount']); assert.equal(s.db.writes.length, count);
  });
  for (const change of ['user', 'station', 'community', 'role']) await check('lookup-isolated-' + change, async e => {
    const s = cloudSetup(); ok(await s.db.call('station', 'createBatch', input));
    if (change === 'user') { s.db.data.users.push({ ...s.db.data.users[0], _id: 'other', openid: 'other' }); s.db.setActor('other'); }
    if (change === 'station') s.db.data.users[0].stationCode = 'other';
    if (change === 'community') s.db.data.users[0].stationCommunityId = 'other';
    if (change === 'role') s.db.data.users[0].roles = ['resident'];
    const found = await s.db.call('station', 'lookupBatchCreation', input);
    e.code = found.code || null; e.found = !!found.data?.batchId;
    assert.equal(e.found, false); assert.equal(s.db.data.deliveryBatches.length, 1);
  });
  await check('changed-input-refused-original-retained', async e => {
    const s = cloudSetup(); const first = ok(await s.db.call('station', 'createBatch', input));
    const changed = await s.db.call('station', 'createBatch', { ...input, lines: '合成楼-1单元-102' });
    e.code = changed.code; assert.equal(e.code, 'E_CONFLICT'); assert.equal(s.db.data.deliveryBatches.length, 1);
    assert.equal(ok(await s.db.call('station', 'lookupBatchCreation', input)).batchId, first.batchId);
  });
  await check('lookup-after-feature-off-but-new-create-refused', async () => {
    const s = cloudSetup(); const first = ok(await s.db.call('station', 'createBatch', input));
    s.db.data.communities[0].features.stationDelivery = false;
    assert.equal(ok(await s.db.call('station', 'lookupBatchCreation', input)).batchId, first.batchId);
    assert.equal((await s.db.call('station', 'createBatch', { ...input, requestId: 'qa133_new_request' })).code, 'E_FEATURE_OFF');
  });
  await check('legacy-create-compatible-lookup-conservative', async e => {
    const s = cloudSetup(); ok(await s.db.call('station', 'createBatch', input));
    const batch = s.db.data.deliveryBatches[0]; delete batch.creationOwnerId; delete batch.creationInputHash; delete batch.inputCount;
    assert.equal(ok(await s.db.call('station', 'createBatch', input)).batchId, batch._id);
    e.code = (await s.db.call('station', 'lookupBatchCreation', input)).code; assert.equal(e.code, 'E_FORBIDDEN');
  });
  for (const change of ['role', 'station', 'community', 'blocked']) await check('transaction-rechecks-actor-' + change, async e => {
    const s = cloudSetup();
    s.db.faults.beforeTransaction = data => {
      const user = data.users[0];
      if (change === 'role') user.roles = ['resident'];
      if (change === 'station') user.stationCode = 'B';
      if (change === 'community') user.stationCommunityId = 'B';
      if (change === 'blocked') user.blocked = true;
    };
    const response = await s.db.call('station', 'createBatch', input);
    e.code = response.code; assert.equal(e.code, 'E_FORBIDDEN'); assert.equal((s.db.data.deliveryBatches || []).length, 0);
  });
  await check('transaction-rechecks-resident-consent', async () => {
    const s = cloudSetup(); s.db.faults.beforeTransaction = data => { data.users[1].prefs.doorDelivery = false; };
    assert.equal(ok(await s.db.call('station', 'createBatch', input)).batchId, null);
    assert.equal((s.db.data.deliveryBatches || []).length, 0);
  });
  await check('response-and-lookup-lost-reentry-read-only', async e => {
    const s = cloudSetup({ responseLost: true }); const call = s.db.call; let failLookup = true;
    s.db.call = (name, action, data) => action === 'lookupBatchCreation' && failLookup ? Promise.reject(Error('合成查询失败')) : call(name, action, data);
    await s.page.onShow(); await s.page.create(); assert.equal(s.page.data.ready, false); assert.equal(s.page.data.recovery, 'lookup');
    await s.page.create(); assert.equal(s.env.requests.filter(r => r[1] === 'createBatch').length, 1);
    failLookup = false; s.page.onUnload(); const next = s.env.instance(PAGE); await next.onShow();
    assert.equal(next.data.recovery, 'done'); assert.equal(next.data.lines, '');
    e.batches = s.db.data.deliveryBatches.length; e.creates = s.env.requests.filter(r => r[1] === 'createBatch').length;
    assert.equal(e.batches, 1); assert.equal(e.creates, 1);
    e.savedFields = Object.keys(Object.values(s.env.store)[0]); assert.deepEqual(e.savedFields, ['requestId']);
    assert.equal(JSON.stringify(s.env.store).includes('合成楼'), false);
  });
  await check('request-not-delivered-confirm-original-number', async e => {
    const s = cloudSetup(); const call = s.db.call; let fail = true;
    s.db.call = (name, action, data) => { if (action === 'createBatch' && fail) { fail = false; throw Error('合成请求未送达'); } return call(name, action, data); };
    await s.page.onShow(); await s.page.create(); assert.equal(s.page.data.recovery, 'confirm');
    assert.equal((s.db.data.deliveryBatches || []).length, 0);
    const id = s.page.receipt.requestId; s.page.onUnload(); const next = s.env.instance(PAGE); await next.onShow();
    assert.equal(next.data.recovery, 'confirm'); assert.equal(next.data.lines, ''); await next.create();
    assert.equal((s.db.data.deliveryBatches || []).length, 0);
    next.change({ detail: { value: input.lines } }); await next.create();
    e.sameId = id === s.env.requests.filter(r => r[1] === 'createBatch').at(-1)[2].requestId;
    assert.equal(e.sameId, true); assert.equal(s.db.data.deliveryBatches.length, 1);
  });
  await check('storage-failure-blocks-create', async () => {
    const s = cloudSetup(); await s.page.onShow(); s.env.wx.setStorageSync = () => { throw Error('合成存储失败'); };
    await s.page.create(); assert.equal(s.env.requests.length, 0); assert.equal(s.page.data.busy, false); assert.ok(s.page.data.error);
  });
  await check('next-batch-explicit-and-clear-failure-safe', async e => {
    const s = cloudSetup(); await s.page.onShow(); await s.page.create(); const first = s.page.receipt.requestId;
    await s.page.create(); assert.equal(s.db.data.deliveryBatches.length, 1);
    const remove = s.env.wx.removeStorageSync; s.env.wx.removeStorageSync = () => { throw Error('合成清理失败'); };
    s.page.nextBatch(); assert.equal(s.page.data.recovery, 'done'); assert.equal(s.page.receipt.requestId, first);
    s.env.wx.removeStorageSync = remove; s.page.nextBatch(); assert.equal(s.page.data.lines, '');
    s.page.change({ detail: { value: input.lines } }); await s.page.create();
    e.batches = s.db.data.deliveryBatches.length; assert.equal(e.batches, 2); assert.notEqual(s.page.receipt.requestId, first);
  });
  await check('return-preserves-own-draft-change-owner-clears', async () => {
    const s = cloudSetup(); await s.page.onShow(); s.page.onHide(); await s.page.onShow(); assert.equal(s.page.data.lines, input.lines);
    s.env.app.globalData.user = { ...s.env.app.globalData.user, _id: 'other' }; await s.page.onShow();
    assert.equal(s.page.data.lines, ''); assert.equal(s.page.receipt, null);
  });
  await check('old-lookup-does-not-overwrite-new-context', async () => {
    const s = cloudSetup(); await s.page.onShow(); await s.page.create();
    const call = s.db.call; let resolve;
    s.db.call = (name, action, data) => action === 'lookupBatchCreation' ? new Promise(r => { resolve = r; }) : call(name, action, data);
    const old = s.page.load(); await tick(); s.page.onHide(); s.env.app.globalData.user = { ...s.env.app.globalData.user, _id: 'other' };
    await s.page.onShow(); resolve({ ok: true, data: { batchId: 'old', eligibleCount: 1, skippedCount: 0 } }); await old;
    assert.equal(s.page.data.result, null); assert.equal(s.page.data.recovery, ''); assert.equal(s.page.data.ready, true);
  });
  await check('invalid-request-and-no-record', async () => {
    const s = cloudSetup(); assert.equal((await s.db.call('station', 'lookupBatchCreation', { requestId: 'bad' })).ok, false);
    assert.equal(ok(await s.db.call('station', 'lookupBatchCreation', input)).batchId, null); assert.equal(s.db.writes.length, 0);
  });
  return { scope: 'synthetic database and page only; no real business records', pass: results.filter(r => r.pass).length,
    fail: results.filter(r => !r.pass).length, results };
}
if (require.main === module) {
  const timer = setTimeout(() => { console.error('Diagnostic did not settle'); process.exit(1); }, 5000);
  run().then(result => { console.log(JSON.stringify(result, null, 2)); if (result.fail) process.exitCode = 1; })
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(timer));
}
module.exports = { run };
