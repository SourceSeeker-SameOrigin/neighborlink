// Execute the actual station entry against a local transactional fixture only.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
function setup(options = {}) {
  const s = fixture({ local: true, roles: ['provider'], allowWrites: true, ...options });
  if (process.env.QA136_FUNCTION_ROOT) {
    const file = require('node:path').join(process.env.QA136_FUNCTION_ROOT, 'index.js');
    s.call = (name, action, input = {}) => {
      if (name !== 'station') throw Error('Only station is allowed');
      return s.load(file).main({ ...input, action });
    };
  }
  s.data.providers = [{ _id: 'provider-A', openid: 'actor', communityId: 'c', status: 'approved',
    level: 1, onDuty: true, insuranceUntil: new Date(Date.now() + 86400000) }];
  for (let i = 0; i < 2; i++) s.data.users.push({ _id: 'resident-' + i, openid: 'synthetic-' + i,
    roles: ['resident'], communityId: 'c', prefs: { doorDelivery: true } });
  s.data.deliveryBatches = [{ _id: 'batch-A', communityId: 'c', stationCode: 'A', status: 'open',
    createdAt: new Date('2026-11-25T00:00:00Z'), priceSnapshot: { perPiece: 50, perPiecePayout: 40 },
    items: [0, 1].map(i => ({ _id: 'item-' + i, userId: 'resident-' + i, consented: true, status: 'pending',
      buildingName: '合成楼', unit: '合成单元', room: '合成门牌' + i })) }];
  s.batch = () => s.data.deliveryBatches[0];
  s.callStation = (action, data = {}) => s.call('station', action, { batchId: 'batch-A', ...data });
  s.record = (i, status = 'delivered') => s.callStation('recordDelivery', { itemId: 'item-' + i, status,
    photoFileId: 'cloud://synthetic/station/batch-A/photo-' + i + '.jpg', reason: '合成未送达' });
  s.start = async () => { assert.equal((await s.callStation('acceptBatch')).ok, true); assert.equal((await s.callStation('startBatch')).ok, true); };
  return s;
}
async function run() {
  const results = [];
  async function check(name, body) { const evidence = {}; try { await body(evidence); results.push({ name, pass: true, evidence }); }
    catch (error) { results.push({ name, pass: false, evidence, error: error.message }); } }
  await check('hall-hides-addresses-before-accept', async e => { const s = setup(); const r = await s.callStation('providerHall');
    assert.equal(r.ok, true); e.list = r.data.list; assert.equal(e.list.length, 1); assert.equal('items' in e.list[0], false); });
  await check('normal-delivery-bills-once', async e => { const s = setup(); await s.start();
    assert.equal((await s.record(0)).ok, true); e.afterFirst = { status: s.batch().status, ledger: (s.data.ledger || []).length };
    assert.equal(e.afterFirst.status, 'assigned'); assert.equal(e.afterFirst.ledger, 0);
    assert.equal((await s.record(1)).ok, true); e.final = { status: s.batch().status, ledger: s.data.ledger.length, amounts: s.data.ledger[0].amounts };
    assert.equal(e.final.status, 'done'); assert.equal(e.final.ledger, 1); assert.equal(e.final.amounts.gross, 100); assert.equal(e.final.amounts.provider, 80); });
  await check('duplicate-start-no-new-write', async e => { const s = setup(); await s.start(); const before = s.writes.length;
    const r = await s.callStation('startBatch'); e.ok = r.ok; e.writes = s.writes.length - before;
    assert.equal(e.ok, true); assert.equal(e.writes, 0); });
  for (const final of [false, true]) await check('duplicate-record-' + (final ? 'completed-batch' : 'pending-batch'), async e => {
    const s = setup(); await s.start(); await s.record(0); if (final) await s.record(1);
    const before = JSON.stringify(s.data), count = s.writes.length; const r = await s.record(0);
    e.code = r.code; e.writes = s.writes.length - count; e.unchanged = JSON.stringify(s.data) === before;
    assert.equal(e.writes, 0); assert.equal(e.unchanged, true);
  });
  for (const action of ['checkDoorDeliveryConsent', 'recordDelivery']) await check('withdrawn-consent-' + action, async e => {
    const s = setup(); await s.start(); await s.record(0); s.data.users.find(u => u._id === 'resident-1').prefs.doorDelivery = false;
    const r = action === 'recordDelivery' ? await s.record(1) : await s.callStation(action, { itemId: 'item-1' });
    assert.equal(r.ok, true); e.status = s.batch().items[1].status; e.amounts = s.data.ledger[0].amounts; e.ledger = s.data.ledger.length;
    assert.equal(e.status, 'skipped'); assert.equal(e.amounts.gross, 50); assert.equal(e.amounts.provider, 40); assert.equal(e.ledger, 1);
  });
  await check('repeat-delivered-after-consent-withdrawn-keeps-record', async e => { const s = setup(); await s.start(); await s.record(0);
    s.data.users.find(u => u._id === 'resident-0').prefs.doorDelivery = false; const r = await s.record(0);
    e.code = r.code; e.itemStatus = s.batch().items[0].status; assert.equal(e.itemStatus, 'delivered'); assert.equal(r.ok, false);
    await s.record(1, 'failed'); e.gross = s.data.ledger[0].amounts.gross; assert.equal(e.gross, 50);
  });
  await check('all-failed-no-ledger', async e => { const s = setup(); await s.start(); await s.record(0, 'failed'); await s.record(1, 'failed');
    e.status = s.batch().status; e.ledger = (s.data.ledger || []).length; e.gross = s.batch().amounts.gross;
    assert.equal(e.status, 'done'); assert.equal(e.ledger, 0); assert.equal(e.gross, 0);
  });
  await check('wrong-photo-folder-rejected', async e => { const s = setup(); await s.start(); const r = await s.callStation('recordDelivery',
    { itemId: 'item-0', status: 'delivered', photoFileId: 'cloud://synthetic/station/another/photo.jpg' });
    e.ok = r.ok; e.status = s.batch().items[0].status; assert.equal(e.ok, false); assert.equal(e.status, 'pending');
  });
  await check('other-provider-rejected', async e => { const s = setup(); await s.start(); s.batch().providerId = 'provider-B';
    const r = await s.record(0); e.code = r.code; assert.equal(e.code, 'E_FORBIDDEN'); assert.equal(s.batch().items[0].status, 'pending');
  });
  for (const change of ['status', 'community', 'duty', 'insurance']) for (const timing of ['before', 'transaction'])
    await check('accept-eligibility-' + change + '-' + timing, async e => {
      const s = setup(), mutate = data => {
        const p = data.providers[0];
        if (change === 'status') p.status = 'rejected';
        if (change === 'community') p.communityId = 'another-community';
        if (change === 'duty') p.onDuty = false;
        if (change === 'insurance') p.insuranceUntil = new Date(0);
      };
      if (timing === 'before') mutate(s.data); else s.faults.beforeTransaction = mutate;
      const r = await s.callStation('acceptBatch'); e.result = r; e.batchStatus = s.batch().status;
      assert.equal(r.ok, false); assert.equal(e.batchStatus, 'open');
    });
  for (const change of ['owner', 'level', 'missing-provider', 'batch-community', 'already-assigned', 'no-pending-items'])
    await check('transaction-recheck-' + change, async e => { const s = setup();
      s.faults.beforeTransaction = data => {
        if (change === 'owner') data.providers[0].openid = 'another-actor';
        if (change === 'level') data.providers[0].level = 0;
        if (change === 'missing-provider') data.providers = [];
        if (change === 'batch-community') data.deliveryBatches[0].communityId = 'another-community';
        if (change === 'already-assigned') Object.assign(data.deliveryBatches[0], { status: 'assigned', providerId: 'provider-B' });
        if (change === 'no-pending-items') data.deliveryBatches[0].items.forEach(item => { item.status = 'skipped'; });
      };
      const r = await s.callStation('acceptBatch'); e.code = r.code; e.writes = s.writes.length;
      e.providerId = s.batch().providerId || null;
      assert.equal(r.ok, false); assert.equal(e.writes, 0); assert.notEqual(e.providerId, 'provider-A');
    });
  await check('transaction-conflict-leaves-open', async e => { const s = setup({ transactionConflict: true });
    const r = await s.callStation('acceptBatch'); e.code = r.code; e.status = s.batch().status; e.writes = s.writes.length;
    assert.equal(e.code, 'E_CONFLICT'); assert.equal(e.status, 'open'); assert.equal(e.writes, 0);
  });
  await check('repeated-accept-does-not-reassign', async e => { const s = setup();
    assert.equal((await s.callStation('acceptBatch')).ok, true);
    const snapshot = JSON.stringify(s.batch()), count = s.writes.length;
    const r = await s.callStation('acceptBatch'); e.code = r.code; e.writes = s.writes.length - count;
    e.unchanged = JSON.stringify(s.batch()) === snapshot;
    assert.equal(e.code, 'E_CONFLICT'); assert.equal(e.writes, 0); assert.equal(e.unchanged, true);
  });
  await check('lost-accept-response-readable-without-resubmission', async e => { const s = setup();
    // Drop the caller's first response, then use the existing assigned-batch reader.
    await s.callStation('acceptBatch'); const before = s.writes.length; const r = await s.callStation('providerBatch');
    e.ok = r.ok; e.status = r.data?.status; e.writes = s.writes.length - before;
    assert.equal(e.ok, true); assert.equal(e.status, 'assigned'); assert.equal(e.writes, 0);
  });
  return { scope: 'actual station entry, synthetic database only; no cloud writes, native calls or uploaded photos',
    pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass).length, results };
}
if (require.main === module) run().then(r => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.fail ? 1 : 0; });
module.exports = { run, setup };
