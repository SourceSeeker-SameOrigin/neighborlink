// Actual P29 page and content list endpoints with synthetic notices/ads. No cloud writes.
const assert = require('assert');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function run(expireFirstTwenty) {
  let failNoticeMore = !expireFirstTwenty, failAdMore = !expireFirstTwenty;
  const now = Date.now();
  const notices = Array.from({ length: 21 }, (_, index) => ({
    _id: `notice-${String(index + 1).padStart(2, '0')}`, communityId: 'c', status: 'live',
    title: `合成公告${index + 1}`, body: '仅供本地联调', createdAt: new Date(now - index * 1000),
    endAt: new Date(now + (expireFirstTwenty && index < 20 ? -86400000 : 86400000))
  }));
  const ads = Array.from({ length: 21 }, (_, index) => ({
    _id: `ad-${String(index + 1).padStart(2, '0')}`, title: `合成广告${index + 1}`,
    status: 'draft', price: 100, createdAt: new Date(now - index * 1000)
  }));
  const backend = fixture({ roles: ['admin'], records: { notices, ads }, orderedQueries: true });
  const ui = runtime(async (name, action, input) => {
    if (name === 'content' && action === 'listNotices' && input.offset === 20 && failNoticeMore) {
      failNoticeMore = false; throw Error('合成公告续页失败');
    }
    if (name === 'content' && action === 'listAds' && input.offset === 20 && failAdMore) {
      failAdMore = false; throw Error('合成广告续页失败');
    }
    if (name === 'catalog' && action === 'listCommunities')
      return { list: [{ _id: 'c', name: '合成小区' }], hasMore: false };
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  });
  ui.app.globalData.user = { _id: 'u', roles: ['admin'], communityId: 'c' };
  const page = ui.instance('miniprogram/admin/content/content.js');
  await page.onLoad();
  if (!expireFirstTwenty) {
    await page.moreNotices();
    await page.moreAds();
    assert.equal(page.data.notices.length, 20);
    assert.equal(page.data.ads.length, 20);
    assert.match(page.data.noticeMoreError, /续页失败/);
    assert.match(page.data.adMoreError, /续页失败/);
  }
  await page.moreNotices();
  await page.moreAds();
  const noticePage2 = await backend.call('content', 'listNotices', { communityId: 'c', offset: 20 });
  const adPage2 = await backend.call('content', 'listAds', { offset: 20 });
  assert.strictEqual(noticePage2.ok, true);
  assert.strictEqual(adPage2.ok, true);
  return { pageNoticeIds: Array.from(page.data.notices, item => item._id),
    pageAdIds: Array.from(page.data.ads, item => item._id),
    secondNoticeIds: Array.from(noticePage2.data.list, item => item._id),
    secondAdIds: Array.from(adPage2.data.list, item => item._id),
    requests: Array.from(ui.requests, item => [item[0], item[1], item[2]?.offset ?? null]),
    noticeReady: page.data.noticeReady, adReady: page.data.adReady, error: page.data.error };
}

(async () => {
  const allVisible = await run(false);
  const expiredFirstTwenty = await run(true);
  assert.strictEqual(allVisible.pageNoticeIds.length, 21);
  assert.strictEqual(allVisible.pageAdIds.length, 21);
  assert.deepStrictEqual(allVisible.secondNoticeIds, ['notice-21']);
  assert.deepStrictEqual(allVisible.secondAdIds, ['ad-21']);
  assert.strictEqual(expiredFirstTwenty.pageNoticeIds.length, 1);
  assert.deepStrictEqual(expiredFirstTwenty.secondNoticeIds, ['notice-21']);
  assert.deepStrictEqual(expiredFirstTwenty.requests.filter(item => item[0] === 'content' && item[1] === 'listNotices').map(item => item[2]), [0, 20]);
  console.log(JSON.stringify({ scope: 'actual P29 page and content endpoints, synthetic records only',
    allVisible: { pageNoticeCount: allVisible.pageNoticeIds.length, pageAdCount: allVisible.pageAdIds.length,
      secondNoticeIds: allVisible.secondNoticeIds, secondAdIds: allVisible.secondAdIds },
    expiredFirstTwenty: { pageNoticeCount: expiredFirstTwenty.pageNoticeIds.length,
      secondNoticeIds: expiredFirstTwenty.secondNoticeIds, requests: expiredFirstTwenty.requests,
      noticeReady: expiredFirstTwenty.noticeReady, error: expiredFirstTwenty.error } }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
