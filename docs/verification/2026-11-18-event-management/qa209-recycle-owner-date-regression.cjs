// Actual P31 page with synthetic administrators and a Beijing midnight.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

(async () => {
  const realNow = Date.now;
  let clock = Date.parse('2026-11-30T15:55:00Z');
  Date.now = () => clock;
  try {
    const env = runtime(async (_name, action) => {
      assert.equal(action, 'listCommunities');
      return { list: [{ _id: 'synthetic-community', name: '合成小区' }], hasMore: false };
    });
    env.app.globalData.user = { _id: 'admin-a', roles: ['admin'], communityId: 'synthetic-community' };
    const page = env.instance('miniprogram/admin/recycle/recycle.js');
    await page.onLoad();
    page.onShow();
    page.input({ currentTarget: { dataset: { field: 'from' } }, detail: { value: '2026-10-01' } });
    page.input({ currentTarget: { dataset: { field: 'to' } }, detail: { value: '2026-10-31' } });
    page.onHide();

    env.app.globalData.user = { _id: 'admin-b', roles: ['admin'], communityId: 'synthetic-community' };
    await page.onShow();
    assert.deepEqual([page.data.from, page.data.to], ['2026-11-01', '2026-11-30']);
    page.onHide();
    clock = Date.parse('2026-11-30T16:05:00Z');
    await page.onShow();
    const bAfterMidnight = [page.data.from, page.data.to];
    assert.deepEqual(bAfterMidnight, ['2026-12-01', '2026-12-01']);
    page.onHide();

    env.app.globalData.user = { _id: 'admin-a', roles: ['admin'], communityId: 'synthetic-community' };
    await page.onShow();
    const aRestored = [page.data.from, page.data.to];
    assert.deepEqual(aRestored, ['2026-10-01', '2026-10-31']);
    console.log(JSON.stringify({ scope: 'actual P31 page; synthetic administrators and Beijing clock',
      bAfterMidnight, aRestored, realCloudCalls: 0 }, null, 2));
  } finally { Date.now = realNow; }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
