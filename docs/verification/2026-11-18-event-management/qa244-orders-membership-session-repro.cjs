// Actual resident orders and membership pages; synthetic identities and intercepted reads only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id,
  buildingId: 'building-' + id, addresses: [{ id: 'address-' + id, communityId: 'community-' + id,
    buildingName: 'A栋', unit: '1', room: '101' }] });

async function run(pageId, phase) {
  let resolveSession, finishRead;
  const env = runtime((name, action) => {
    const result = name === 'chat' ? { unreadTotal: 0 } : { list: [], hasMore: false };
    const delayed = pageId === 'orders' ? name === 'order' : action === 'plans';
    if (phase === 'late-read' && delayed && !finishRead)
      return new Promise(resolve => { finishRead = () => resolve(result); });
    return result;
  });
  env.wx.removeTabBarBadge = () => {};
  env.wx.setTabBarBadge = () => {};
  const first = user('a'), second = user('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  const session = new Promise(resolve => { resolveSession = resolve; });
  env.app.ensureSession = phase === 'first-session' ? () => session : async () => first;
  const page = env.instance(pageId === 'orders'
    ? 'miniprogram/pages/orders/list.js' : 'miniprogram/pages/membership/index.js');
  let pending;
  if (pageId === 'orders') pending = page.onShow();
  else {
    const originalLoad = page.load;
    page.load = function (...args) { pending = originalLoad.apply(this, args); return pending; };
    page.onShow();
  }
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase === 'late-read') {
    for (let i = 0; i < 25 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${pageId} must start a read`);
    env.app.globalData.user = second;
    finishRead();
  }
  await pending;
  const observed = { pageId, phase, loading: page.data.loading, ready: page.data.ready,
    error: page.data.error, addresses: page.data.addresses?.length || 0,
    rows: (page.data.orders || page.data.plans || []).length,
    requests: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && !observed.error && observed.requests.length === 2 &&
      (pageId !== 'membership' || observed.ready)
    : !observed.loading && /身份.*变化|资料.*变化/.test(observed.error || '') &&
      observed.rows === 0 && (pageId !== 'membership' || (!observed.ready && observed.addresses === 0));
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const pageId of ['orders', 'membership'])
    for (const phase of ['normal', 'first-session', 'late-read']) results.push(await run(pageId, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 6);
  assert.equal(failed.length, 3, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'orders and membership actual pages; synthetic users; no cloud writes',
    controlsPassed: results.filter(result => result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
