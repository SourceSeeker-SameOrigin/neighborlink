// Actual P22 page and admin.upsertBuilding against a synthetic database. No cloud writes.
const assert = require('assert');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function setup(loseFirstResponse) {
  const backend = fixture({ roles: ['admin'], allowWrites: true,
    records: { communities: [{ _id: 'c', name: '合成小区', status: 'active', prices: {}, rates: {}, buildings: [] }] } });
  let lose = loseFirstResponse;
  const ui = runtime(async (name, action, input) => {
    if (action === 'managementConfig') return { global: {}, communities: [{ _id: 'c', name: '合成小区' }],
      community: { ...backend.data.communities[0], buildings: backend.data.buildings || [] } };
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    if (action === 'upsertBuilding' && lose) { lose = false; throw Error('合成响应丢失'); }
    return result.data;
  });
  ui.app.globalData.user = { _id: 'u', roles: ['admin'] };
  const page = ui.instance('miniprogram/admin/community/community.js');
  page.onShow();
  await page.onLoad();
  page.setData({ buildingName: '联调楼栋', buildingUnits: '1单元' });
  return { backend, ui, page };
}

(async () => {
  const normal = await setup(false);
  await normal.page.addBuilding();
  const normalId = normal.page.data.buildingId;
  normal.page.setData({ buildingName: '联调楼栋改名' });
  await normal.page.addBuilding();
  assert.strictEqual(normal.backend.data.buildings.length, 1);
  assert.strictEqual(normal.page.data.buildingId, normalId);

  const unknown = await setup(true);
  await unknown.page.addBuilding();
  const first = { error: unknown.page.data.error, buildingId: unknown.page.data.buildingId,
    records: unknown.backend.data.buildings.length };
  await unknown.page.addBuilding();
  const requests = unknown.ui.requests.filter(request => request[1] === 'upsertBuilding');
  assert.strictEqual(first.records, 1);
  assert.strictEqual(first.buildingId, unknown.backend.data.buildings[0]._id);
  assert.strictEqual(unknown.backend.data.buildings.length, 1);
  assert.strictEqual(requests.length, 2);
  assert.strictEqual(requests[0][2].requestId.length > 8, true);
  assert.strictEqual(requests[1][2].buildingId, first.buildingId);
  const originalId = first.buildingId;
  unknown.page.onUnload();
  const reopened = unknown.ui.instance('miniprogram/admin/community/community.js');
  reopened.onShow();
  await reopened.onLoad();
  assert.strictEqual(reopened.data.buildingId, originalId);
  assert.strictEqual(unknown.backend.data.buildings.length, 1);
  console.log(JSON.stringify({ scope: 'actual P22 page and admin.upsertBuilding, synthetic database only',
    normal: { records: normal.backend.data.buildings.length, reusedId: normal.page.data.buildingId === normalId },
    unknown: { first, afterRetry: { records: unknown.backend.data.buildings.length,
      distinctIds: new Set(unknown.backend.data.buildings.map(item => item._id)).size,
      reentryRecoveredOriginal: reopened.data.buildingId === originalId },
      requestBuildingIds: requests.map(request => request[2].buildingId || null) } }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
