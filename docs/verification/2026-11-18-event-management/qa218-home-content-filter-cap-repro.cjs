// Actual content.homeContent and P01 page with 101 synthetic notices and ads.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const recent = new Date(Date.UTC(2026, 10, 27));
const old = new Date(Date.UTC(2026, 10, 1));
const notices = Array.from({ length: 101 }, (_, index) => ({
  _id: `notice-${String(index + 1).padStart(3, '0')}`, communityId: 'c',
  status: 'live', title: `合成公告 ${index + 1}`, body: '仅供隔离测试',
  createdAt: new Date(recent.getTime() - index * 1000),
  moderationHidden: index < 100, endAt: new Date(Date.UTC(2027, 0, 1))
}));
const ads = Array.from({ length: 101 }, (_, index) => ({
  _id: `ad-${String(index + 1).padStart(3, '0')}`, status: 'live',
  slot: 'home_banner', communityIds: ['c'], title: `合成广告 ${index + 1}`,
  imageFileId: `ad-file-${index + 1}`, moderationApprovedFileIds: index < 100 ? [] : [`ad-file-${index + 1}`],
  target: { type: 'page', path: '/pages/index/index' },
  startAt: new Date(old.getTime() + index * 1000),
  endAt: new Date(Date.UTC(2027, 0, 1))
}));
const otherAds = ['board_top', 'shops_top'].flatMap(slot => ads.map(item => ({
  ...item, _id: `${slot}-${item._id}`, slot
})));

(async () => {
  const backend = fixture({ global: true, local: true, orderedQueries: true,
    records: { notices, ads: [...ads, ...otherAds] } });
  const response = await backend.call('content', 'homeContent', { communityId: 'c' });
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.equal(response.data.notice?._id, 'notice-101');
  assert.equal(JSON.stringify(response.data.ads.map(item => item._id)), JSON.stringify(['ad-101']));
  for (const slot of ['board_top', 'shops_top']) {
    const slotReply = await backend.call('content', 'adsForSlot', { communityId: 'c', slot });
    assert.equal(slotReply.ok, true, JSON.stringify(slotReply));
    assert.equal(JSON.stringify(slotReply.data.ads.map(item => item._id)), JSON.stringify([`${slot}-ad-101`]));
  }
  assert.equal(notices[100].moderationHidden, false);
  assert.equal(ads[100].moderationApprovedFileIds.length, 1);
  const ui = runtime(async (name, action, input) => {
    if (name === 'catalog' && action === 'getCommunity') return {
      _id: 'c', name: '合成小区', enabledFeatures: { notices: true, ads: true }
    };
    const reply = await backend.call(name, action, input);
    if (!reply.ok) throw Object.assign(Error(reply.message), { code: reply.code });
    return reply.data;
  });
  ui.app.globalData.user = { ...backend.data.users[0], buildingId: 'building-1' };
  const page = ui.instance('miniprogram/pages/index/index.js');
  await page.onShow();
  assert.equal(page.data.community?._id, 'c');
  assert.equal(page.data.notice?._id, 'notice-101');
  assert.equal(JSON.stringify(page.data.ads.map(item => item._id)), JSON.stringify(['ad-101']));
  backend.data.notices[0].moderationHidden = false;
  backend.data.ads[0].moderationApprovedFileIds = [backend.data.ads[0].imageFileId];
  for (const slot of ['board_top', 'shops_top']) {
    const firstAd = backend.data.ads.find(item => item.slot === slot);
    firstAd.moderationApprovedFileIds = [firstAd.imageFileId];
    const slotReply = await backend.call('content', 'adsForSlot', { communityId: 'c', slot });
    assert.equal(JSON.stringify(slotReply.data.ads.map(item => item._id)), JSON.stringify([firstAd._id, `${slot}-ad-101`]));
  }
  await page.load();
  assert.equal(page.data.notice?._id, 'notice-001');
  assert.equal(JSON.stringify(page.data.ads.map(item => item._id)), JSON.stringify(['ad-001', 'ad-101']));
  assert.equal(backend.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual P01, content.homeContent and adsForSlot; synthetic data only',
    noticeRecords: notices.length, adRecordsPerSlot: ads.length,
    adSlotsChecked: ['home_banner', 'board_top', 'shops_top'],
    laterVisibleNotice: notices[100]._id, laterApprovedAd: ads[100]._id,
    initialHomeNotice: 'notice-101', initialHomeAds: 1,
    visibleWithinFirstHundred: page.data.notice._id,
    approvedWithinFirstHundred: page.data.ads[0]._id,
    realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
