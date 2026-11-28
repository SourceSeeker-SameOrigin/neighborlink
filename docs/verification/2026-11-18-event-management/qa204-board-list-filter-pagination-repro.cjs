// Actual board.list and P38 page against synthetic posts. No network or cloud writes.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function run(visibleIndexes, turns, count = 21) {
  const now = Date.now();
  const posts = Array.from({ length: count }, (_, index) => ({
    _id: `post-${String(index + 1).padStart(3, '0')}`,
    communityId: 'c', scope: 'community', type: 'ask', status: 'open',
    expireAt: new Date(now + 86400000), createdAt: new Date(now - index * 1000),
    title: `合成求助${index + 1}`, content: '合成正文', authorOpenid: 'other',
    moderationHidden: !visibleIndexes.includes(index)
  }));
  const backend = fixture({ global: true, local: true, records: { posts }, orderedQueries: true });
  backend.data.users[0].buildingId = 'b';
  const ui = runtime(async (name, action, input) => {
    if (name === 'catalog' && action === 'getCommunity')
      return { enabledFeatures: { board: true, federation: false } };
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  });
  ui.app.globalData.user = { _id: 'u', communityId: 'c', buildingId: 'b', roles: ['resident'] };
  const page = ui.instance('miniprogram/board/list/list.js');
  await page.onShow();
  for (let index = 1; index < turns; index++) await page.more();
  const secondPage = await backend.call('board', 'list', { type: 'ask', scope: 'community', offset: 20 });
  assert.equal(secondPage.ok, true);
  return { offsets: ui.requests.filter(request => request[0] === 'board').map(request => request[2].offset),
    postIds: Array.from(page.data.posts, post => post._id), hasMore: page.data.hasMore,
    secondPageIds: Array.from(secondPage.data.list, post => post._id), error: page.data.error };
}

(async () => {
  const normal = await run(Array.from({ length: 21 }, (_, index) => index), 2);
  const hiddenFirstPage = await run([20], 2);
  const partlyVisible = await run([0, 20], 3);
  const deepHidden = await run([100], 2, 101);
  assert.deepEqual(normal.offsets, [0, 20]);
  assert.equal(normal.postIds.length, 21);
  assert.deepEqual(hiddenFirstPage.offsets, [0, 20]);
  assert.deepEqual(hiddenFirstPage.postIds, ['post-021']);
  assert.deepEqual(hiddenFirstPage.secondPageIds, ['post-021']);
  assert.deepEqual(partlyVisible.offsets, [0, 20]);
  assert.deepEqual(partlyVisible.postIds, ['post-001', 'post-021']);
  assert.deepEqual(deepHidden.offsets, [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(deepHidden.postIds, ['post-101']);
  console.log(JSON.stringify({ scope: 'actual P38 page and board.list; synthetic posts; zero cloud writes',
    normal, hiddenFirstPage, partlyVisible, deepHidden }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
