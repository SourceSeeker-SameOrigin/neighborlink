const assert = require('node:assert/strict');
const { setup } = require('./station-delivery-cloud.cjs');
async function run() {
  const results = [];
  for (const action of ['startBatch', 'checkDoorDeliveryConsent', 'recordDelivery']) {
    for (const change of ['none', 'provider-owner', 'provider-community', 'provider-status', 'batch-owner']) {
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
          if (change === 'batch-owner') data.deliveryBatches[0].providerOpenid = 'synthetic-other';
        };
        if (timing === 'before') mutate(s.data);
        if (timing === 'transaction') s.faults.beforeTransaction = mutate;
        const before = s.writes.length;
        const response = action === 'recordDelivery' ? await s.record(0) : await s.callStation(action, { itemId: 'item-0' });
        const writes = s.writes.length - before;
        const pass = change === 'none' ? response.ok === true && writes === 1 : response.ok === false && writes === 0;
        results.push({ action, change, timing, pass, ok: response.ok, code: response.code || null, writes,
          started: !!s.batch().startedAt, itemStatus: s.batch().items[0].status });
      }
    }
  }
  return { scope: 'actual station code and synthetic transaction fixture only; no cloud or native calls',
    pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass).length, results };
}
if(require.main === module) run().then(r=>{console.log(JSON.stringify(r,null,2));process.exitCode=r.fail?1:0;});
module.exports={run};
