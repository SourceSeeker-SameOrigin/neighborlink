// Actual activity/notice pages; synthetic same-account community change during pagination.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const owner = { _id: 'synthetic-resident', communityId: 'community-a', buildingId: 'building-a', roles: ['resident'] };
const pages = [
  { id: 'P48', file: 'miniprogram/events/list/list.js', action: 'list', more: page => page.load(false) },
  { id: 'P69', file: 'miniprogram/notices/list/list.js', action: 'listNotices', more: page => page.loadMore() }
];

async function run(item, switched) {
  let release;
  const env = runtime((name, action, data) => {
    assert.equal(action, item.action);
    assert.equal(name, item.id === 'P48' ? 'event' : 'content');
    if (data.offset === 0) return { list: [{ _id: 'row-a', createdAt: 1, startAt: 1, fee: 0 }], hasMore: true, nextOffset: 1 };
    assert.equal(data.offset, 1);
    const reply = { list: [{ _id: 'row-b', createdAt: 2, startAt: 2, fee: 0 }], hasMore: false, nextOffset: 2 };
    if (switched) return new Promise(resolve => { release = () => resolve(reply); });
    return reply;
  });
  env.app.globalData.user = owner;
  env.app.ensureSession = async () => owner;
  const page = env.instance(item.file);
  await page.onShow();
  assert.equal(page.data.list.map(row => row._id).join(','), 'row-a');
  const pending = item.more(page);
  if (switched) {
    for (let i = 0; i < 30 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${item.id} second page must start`);
    env.app.globalData.user = { ...owner, communityId: 'community-b', buildingId: 'building-b' };
    release();
  }
  await pending;
  const observed = { page: item.id, phase: switched ? 'community-switch' : 'normal-more',
    loading: page.data.loading, ids: page.data.list.map(row => row._id),
    hasMore: page.data.hasMore, error: page.data.error,
    offsets: env.requests.map(request => request[2].offset) };
  const desired = switched
    ? !observed.loading && !observed.ids.length && !observed.hasMore &&
      /身份.*变化|资料.*变化|小区.*变化/.test(observed.error || '')
    : !observed.loading && !observed.hasMore && observed.ids.join(',') === 'row-a,row-b';
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const item of pages) {
    results.push(await run(item, false));
    results.push(await run(item, true));
  }
  const failed = results.filter(result => !result.desired);
  console.log(JSON.stringify({ scope: 'P48/P69 actual pages; synthetic resident/community; zero cloud calls',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, results }, null, 2));
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
