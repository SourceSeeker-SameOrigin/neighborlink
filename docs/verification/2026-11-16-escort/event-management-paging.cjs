// Synthetic activity-list responses. Run from the repository root.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

function setup() {
  const pages = [], offsets = [];
  const env = runtime(async (_, action, data) => {
    if (action === 'listCommunities') return { list: [{ _id: 'a' }, { _id: 'b' }] };
    assert.equal(action, 'adminList');
    offsets.push([data.communityId, data.offset || 0]);
    if (!data.offset) return {
      list: Array.from({ length: 20 }, (_, i) => ({ _id: data.communityId + i })), hasMore: true
    };
    return new Promise((resolve, reject) => pages.push({ resolve, reject }));
  });
  env.app.globalData.user = { _id: 'admin', roles: ['admin'], communityId: 'a' };
  return { page: env.instance('miniprogram/events/manage/manage.js'), pages, offsets };
}

async function run() {
  const { page, pages, offsets } = setup();
  await page.onShow();
  const first = page.loadMoreEvents();
  await page.loadMoreEvents();
  assert.equal(pages.length, 1);
  pages[0].reject(Error('续页失败'));
  await first;
  assert.equal(page.data.eventError, '续页失败');
  assert.equal(page.data.eventOffset, 20);
  assert.equal(page.data.list.length, 20);
  const retry = page.loadMoreEvents();
  pages[1].resolve({ list: [{ _id: 'a19' }, { _id: 'a20' }], hasMore: false });
  await retry;
  assert.deepEqual(offsets, [['a', 0], ['a', 20], ['a', 20]]);
  assert.equal(page.data.eventOffset, 22);
  assert.equal(page.data.list.length, 21);
  assert.equal(page.data.eventError, '');
  assert.equal(page.data.eventMore, false);
  await page.loadMoreEvents();
  assert.equal(pages.length, 2);
  for (const transition of ['chooseCommunity', 'onHide', 'onUnload']) {
    for (const failed of [true, false]) {
      const s = setup();
      await s.page.onShow();
      const pending = s.page.loadMoreEvents();
      if (transition === 'chooseCommunity') await s.page.chooseCommunity({ detail: { value: 1 } });
      else s.page[transition]();
      const before = JSON.stringify(s.page.data);
      if (failed) s.pages[0].reject(Error('旧错误'));
      else s.pages[0].resolve({ list: [{ _id: 'old' }], hasMore: false });
      await pending;
      assert.equal(JSON.stringify(s.page.data), before, transition + ' stale response');
      if (transition === 'chooseCommunity') assert.equal(s.page.data.list[0]._id, 'b0');
      else if (transition === 'onHide') {
        await s.page.onShow();
        assert.equal(s.page.data.eventOffset, 20);
        assert.equal(s.page.data.eventLoading, false);
      }
    }
  }
  console.log('PASS: double tap, failed page, same-offset retry, overlap, end, obsolete success/error after switch, hide or unload');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
