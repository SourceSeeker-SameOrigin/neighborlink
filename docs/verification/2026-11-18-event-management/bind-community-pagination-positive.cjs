// P02 binding reads all active communities from the actual catalog entry.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

(async () => {
  const communities = Array.from({ length: 101 }, (_, index) => ({
    _id: `community-${String(index + 1).padStart(3, '0')}`,
    name: `合成小区 ${index + 1}`, status: 'active', features: {},
    dutyWindows: []
  }));
  const backend = fixture({ bound: false, records: { communities, buildings: [] },
    orderedQueries: true });
  const offsets = [];
  const ui = runtime(async (name, action, input) => {
    if (name === 'catalog' && action === 'listCommunities') offsets.push(input.offset);
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  });
  ui.app.globalData.user = backend.data.users[0];
  const page = ui.instance('miniprogram/pages/bind/bind.js');
  await page.load();
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.error, '');
  assert.equal(page.data.communities.length, 101);
  assert.equal(page.data.communities[100]._id, 'community-101');
  assert.equal(backend.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual P02 and catalog.listCommunities; synthetic data',
    offsets, displayed: page.data.communities.length,
    lastCommunity: page.data.communities[100]._id, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
