// Actual station entry; synthetic residents and transaction mutations only.
const assert = require('node:assert/strict');
const { cloudSetup } = require('./station-create-boundaries.cjs');
const input = { requestId: 'resident_recheck_request', lines: '合成楼-1单元-101' };

async function run() {
  const results = [];
  async function check(name, body) {
    const evidence = {};
    try { await body(evidence); results.push({ name, pass: true, evidence }); }
    catch (error) { results.push({ name, pass: false, evidence, error: error.message }); }
  }
  for (const savedAddress of [false, true]) {
    for (const change of ['unchanged', 'consent', 'blocked', 'removed', 'communityId', 'buildingId', 'unit', 'room', 'address-removed']) {
      await check(`${savedAddress ? 'saved' : 'primary'}-${change}-before-write`, async e => {
        const s = cloudSetup({ savedAddress });
        s.db.faults.beforeTransaction = data => {
          const resident = data.users.find(user => user._id === 'resident-A');
          const address = savedAddress ? resident.addresses[0] : resident;
          if (change === 'consent') resident.prefs.doorDelivery = false;
          else if (change === 'blocked') resident.blocked = true;
          else if (change === 'removed') data.users = data.users.filter(user => user._id !== resident._id);
          else if (change === 'address-removed') {
            if (savedAddress) resident.addresses = [];
            else for (const field of ['communityId', 'buildingId', 'unit', 'room']) delete resident[field];
          } else if (change !== 'unchanged') address[change] = 'different-synthetic-value';
        };
        const response = await s.db.call('station', 'createBatch', input);
        assert.equal(response.ok, true, response.message);
        e.result = response.data;
        e.batches = (s.db.data.deliveryBatches || []).length;
        e.writes = s.db.writes.length;
        const expected = change === 'unchanged' ? 1 : 0;
        assert.equal(e.result.eligibleCount, expected);
        assert.equal(e.result.skippedCount, 1 - expected);
        assert.equal(e.batches, expected);
        if (!expected) { assert.equal(e.result.batchId, null); assert.equal(e.writes, 0); }
      });
    }
    await check(`${savedAddress ? 'saved' : 'primary'}-original-address-still-linked`, async e => {
      const s = cloudSetup({ savedAddress });
      s.db.faults.beforeTransaction = data => {
        const resident = data.users.find(user => user._id === 'resident-A');
        if (savedAddress) Object.assign(resident, { communityId: 'elsewhere', buildingId: 'other', unit: '2', room: '202' });
        else resident.addresses = [{ communityId: 'elsewhere', buildingId: 'other', unit: '2', room: '202' }];
      };
      const response = await s.db.call('station', 'createBatch', input);
      assert.equal(response.ok, true, response.message);
      e.result = response.data;
      assert.equal(e.result.eligibleCount, 1);
      assert.equal(s.db.data.deliveryBatches[0].items[0].room, '101');
    });
  }
  await check('mixed-list-skips-revoked-resident-without-retaining-address', async e => {
    const s = cloudSetup();
    const resident = s.db.data.users.find(user => user._id === 'resident-A');
    s.db.data.users.push({ ...structuredClone(resident), _id: 'resident-B', openid: 'synthetic-B', room: '102' });
    s.db.faults.beforeTransaction = data => { data.users.find(user => user._id === 'resident-A').prefs.doorDelivery = false; };
    const response = await s.db.call('station', 'createBatch', { ...input, lines: input.lines + '\n合成楼-1单元-102' });
    assert.equal(response.ok, true, response.message);
    e.result = response.data;
    const batch = s.db.data.deliveryBatches[0];
    assert.equal(e.result.eligibleCount, 1); assert.equal(e.result.skippedCount, 1);
    assert.equal(batch.items.length, 1); assert.equal(batch.items[0].userId, 'resident-B');
    assert.equal(JSON.stringify(batch).includes('resident-A'), false);
    assert.equal(batch.items.some(item => item.room === '101'), false);
  });
  return { scope: 'actual station.createBatch with synthetic database; no network or real records',
    pass: results.filter(row => row.pass).length, fail: results.filter(row => !row.pass).length, results };
}
if (require.main === module) run().then(result => {
  console.log(JSON.stringify(result, null, 2)); if (result.fail) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
