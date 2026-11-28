// Actual P44/P45 seller lists; synthetic same-account community switch during pagination.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const firstUser = { _id: 'synthetic-seller', communityId: 'community-a', roles: ['resident'] };
const pages = [
  { id: 'P44', file: 'miniprogram/idle/mine/mine.js', action: 'mine' },
  { id: 'P45', file: 'miniprogram/idle/sales/sales.js', action: 'sales' }
];

async function run(item, switched) {
  let release;
  const row = (id, offset) => item.id === 'P44'
    ? { _id: id, title: `合成闲置${offset}`, price: 500, status: 'on_sale' }
    : { _id: id, price: 500, status: 'pending_pay', createdAt: 1 };
  const env = runtime((name, action, data) => {
    assert.equal(name, 'idle');
    assert.equal(action, item.action);
    if (data.offset === 0) return { list: [row('row-a', 0)], hasMore: true };
    assert.equal(data.offset, 1);
    const reply = { list: [row('row-b', 1)], hasMore: false };
    if (switched) return new Promise(resolve => { release = () => resolve(reply); });
    return reply;
  });
  env.app.globalData.user = firstUser;
  env.app.ensureSession = async () => firstUser;
  const page = env.instance(item.file);
  await page.onShow();
  assert.deepEqual(page.data.list.map(item => item._id), ['row-a']);
  const pending = page.more();
  if (switched) {
    for (let i = 0; i < 30 && !release; i += 1) await Promise.resolve();
    assert.equal(typeof release, 'function', `${item.id} next page must start`);
    env.app.globalData.user = { ...firstUser, communityId: 'community-b' };
    release();
  }
  await pending;
  const observed = { page: item.id, phase: switched ? 'community-switch' : 'normal-more',
    paging: page.data.paging, hasMore: page.data.hasMore,
    ids: page.data.list.map(row => row._id), error: page.data.error,
    offsets: env.requests.map(request => request[2].offset) };
  const desired = switched
    ? !observed.paging && !observed.ids.length && !observed.hasMore &&
      /资料.*变化|身份.*变化|小区.*变化/.test(observed.error)
    : !observed.paging && !observed.hasMore && observed.ids.join(',') === 'row-a,row-b';
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
  console.log(JSON.stringify({ scope: 'P44/P45 actual pages; synthetic seller and community; zero cloud calls',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, results }, null, 2));
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
