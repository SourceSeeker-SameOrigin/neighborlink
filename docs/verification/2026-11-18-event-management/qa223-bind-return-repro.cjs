// Actual bind page after opening a legal page; all data and calls are synthetic.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function main() {
  let pendingBuildingRead;
  const r = runtime(async (name, action) => {
    assert.equal(name, 'catalog');
    if (action === 'listCommunities') return { list: [{ _id: 'synthetic-community', name: '合成小区' }], hasMore: false };
    if (action === 'getCommunity') return pendingBuildingRead ||
      { buildings: [{ _id: 'synthetic-building', name: '合成楼栋', units: ['1单元'] }] };
    throw Error(`Unexpected action ${action}`);
  });
  r.app.globalData.user = { _id: 'synthetic-resident', communityId: 'synthetic-community', buildingId: 'synthetic-building',
    unit: '1单元', room: '302', phone: '13800000000' };
  const page = r.instance('miniprogram/pages/bind/bind.js');
  await page.load();
  assert.equal(page.data.communities.length, 1);
  page.roomChange({ detail: { value: '303' } });
  page.agreementChange({ detail: { value: ['agree'] } });
  const callsBeforeReturn = r.requests.length;

  page.onHide(); // navigate to privacy policy / service terms
  page.onShow(); // navigate back as the same resident
  const afterReturn = { loading: page.data.loading, error: page.data.error, communityCount: page.data.communities.length,
    buildingCount: page.data.buildings.length, room: page.data.room, agreed: page.data.agreed,
    additionalReadCalls: r.requests.length - callsBeforeReturn };
  assert.deepEqual(afterReturn, { loading: false, error: '', communityCount: 0, buildingCount: 0,
    room: '', agreed: false, additionalReadCalls: 0 });

  await page.load();
  let rejectBuildingRead;
  pendingBuildingRead = new Promise((_, reject) => { rejectBuildingRead = reject; });
  const change = page.communityChange({ detail: { value: 0 } });
  page.onHide();
  rejectBuildingRead(Error('synthetic old building error'));
  await change;
  assert.equal(page.data.error, 'synthetic old building error');

  const failedSession = runtime(async () => { throw Error('Unexpected cloud call'); });
  failedSession.app.globalData.user = null;
  failedSession.app.ensureSession = async () => { throw Error('synthetic session timeout'); };
  const firstLoad = failedSession.instance('miniprogram/pages/bind/bind.js');
  await firstLoad.load();
  const afterSessionFailure = { loading: firstLoad.data.loading, error: firstLoad.data.error,
    cloudCalls: failedSession.requests.length };
  assert.deepEqual(afterSessionFailure, { loading: true, error: '', cloudCalls: 0 });
  console.log(JSON.stringify({ scope: 'Actual bind page with synthetic catalog and resident; no live cloud writes',
    afterReturn, lateErrorAfterHide: page.data.error, afterSessionFailure }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
