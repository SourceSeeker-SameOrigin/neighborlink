const assert = require('node:assert/strict');
const { setup } = require('./station-delivery-cloud.cjs');
async function run() {
  const results = [];
  for (const action of ['startBatch', 'checkDoorDeliveryConsent', 'recordDelivery']) {
    for (const change of ['none', 'provider-owner', 'provider-community', 'provider-status', 'provider-level',
      'missing-provider', 'batch-owner', 'batch-provider', 'batch-community', 'missing-batch', 'duty', 'insurance']) {
      for (const timing of change === 'none' ? ['normal'] : ['before', 'transaction']) {
        const s = setup();
        assert.equal((await s.callStation('acceptBatch')).ok, true);
        if (action !== 'startBatch') {
          assert.equal((await s.callStation('startBatch')).ok, true);
          // The consent-check path can write a skipped result when consent is withdrawn.
          if (action === 'checkDoorDeliveryConsent') s.data.users.find(u => u._id === 'resident-0').prefs.doorDelivery = false;
        }
        const mutate = data => {
          if (change === 'provider-owner') data.providers[0].openid = 'synthetic-other';
          if (change === 'provider-community') data.providers[0].communityId = 'other-community';
          if (change === 'provider-status') data.providers[0].status = 'rejected';
          if (change === 'provider-level') data.providers[0].level = 0;
          if (change === 'missing-provider') data.providers = [];
          if (change === 'batch-owner') data.deliveryBatches[0].providerOpenid = 'synthetic-other';
          if (change === 'batch-provider') data.deliveryBatches[0].providerId = 'other-provider';
          if (change === 'batch-community') data.deliveryBatches[0].communityId = 'other-community';
          if (change === 'missing-batch') data.deliveryBatches = [];
          if (change === 'duty') data.providers[0].onDuty = false;
          if (change === 'insurance') data.providers[0].insuranceUntil = new Date(0);
        };
        if (timing === 'before') mutate(s.data);
        if (timing === 'transaction') s.faults.beforeTransaction = mutate;
        const before = s.writes.length;
        const response = action === 'recordDelivery' ? await s.record(0) : await s.callStation(action, { itemId: 'item-0' });
        const writes = s.writes.length - before;
        // Starting keeps its insurance requirement; already-started delivery does not acquire a new duty/insurance gate.
        const allowed = change === 'none' || change === 'duty' || (change === 'insurance' && action !== 'startBatch');
        const pass = allowed ? response.ok === true && writes === 1 : response.ok === false && writes === 0;
        results.push({ action, change, timing, pass, ok: response.ok, code: response.code || null, writes,
          started: !!s.batch()?.startedAt, itemStatus: s.batch()?.items[0].status || null });
      }
    }
    const s = setup();
    await s.callStation('acceptBatch');
    if (action !== 'startBatch') await s.callStation('startBatch');
    s.db.runTransaction = async () => { throw Object.assign(Error('synthetic conflict'), { code: 'DATABASE_TRANSACTION_CONFLICT' }); };
    const before = JSON.stringify(s.data), count = s.writes.length;
    const response = action === 'recordDelivery' ? await s.record(0) : await s.callStation(action, { itemId: 'item-0' });
    results.push({ action, change: 'transaction-conflict', pass: response.code === 'E_CONFLICT' &&
      JSON.stringify(s.data) === before && s.writes.length === count, code: response.code, writes: s.writes.length - count });
  }
  for (const action of ['checkDoorDeliveryConsent', 'recordDelivery']) {
    const s = setup();
    await s.start();
    await s.record(0);
    if (action === 'checkDoorDeliveryConsent') s.data.users.find(u => u._id === 'resident-1').prefs.doorDelivery = false;
    s.faults.beforeTransaction = data => { data.providers[0].status = 'rejected'; };
    const count = s.writes.length;
    const response = action === 'recordDelivery' ? await s.record(1) : await s.callStation(action, { itemId: 'item-1' });
    const ledgerCount = (s.data.ledger || []).length;
    results.push({ action, change: 'final-item-revoked-provider', pass: response.ok === false && s.writes.length === count &&
      s.batch().status === 'assigned' && s.batch().items[1].status === 'pending' && ledgerCount === 0,
    code: response.code || null, writes: s.writes.length - count, ledgerCount });
  }
  return { scope: 'actual station code and synthetic transaction fixture only; no cloud or native calls',
    pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass).length, results };
}
if(require.main === module) run().then(r=>{console.log(JSON.stringify(r,null,2));process.exitCode=r.fail?1:0;});
module.exports={run};
