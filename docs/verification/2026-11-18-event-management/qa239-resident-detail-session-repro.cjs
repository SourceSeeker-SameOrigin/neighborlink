// Resident detail and seller order pages, synthetic identities and intercepted reads only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  ['P39', 'board', 'board/detail/detail', { id: 'synthetic-post' }],
  ['P42', 'idle', 'idle/detail/detail', { id: 'synthetic-item' }],
  ['idle/sale', 'sale', 'idle/sale/sale', { id: 'synthetic-order' }]
];
const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id, buildingId: 'building-' + id });

function reply(name) {
  if (name === 'board') return { post: { _id: 'synthetic-post', type: 'task', status: 'open', images: [], createdAt: '2026-11-28T00:00:00Z' }, comments: [] };
  if (name === 'idle') return { item: { _id: 'synthetic-item', title: '样本', price: 500, condition: 'used', images: [], createdAt: '2026-11-28T00:00:00Z' } };
  return { _id: 'synthetic-order', status: 'accepted', idleSale: { seller: true, price: 500, sellerAmount: 450 } };
}

async function run([pageId, name, path, options], phase) {
  let resolveSession, finishRead;
  const env = runtime(() => {
    if (phase === 'late-read' && !finishRead)
      return new Promise(resolve => { finishRead = () => resolve(reply(name)); });
    return reply(name);
  });
  env.wx.setNavigationBarTitle = () => {};
  const first = user('a'), second = user('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  const page = env.instance(`miniprogram/${path}.js`);
  page.onLoad(options);
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase === 'late-read') {
    for (let i = 0; i < 20 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${pageId} must start a detail read`);
    env.app.globalData.user = second;
    finishRead();
  }
  await pending;
  const observed = { pageId, phase, loading: page.data.loading, error: page.data.error,
    record: Boolean(page.data.post || page.data.item || page.data.order), requests: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && !observed.error && observed.record && observed.requests.length === 1
    : !observed.loading && /身份.*变化|资料.*变化/.test(observed.error || '') && !observed.record &&
      observed.requests.length === (phase === 'first-session' ? 0 : 1);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const page of pages)
    for (const phase of ['normal', 'first-session', 'late-read']) results.push(await run(page, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 9);
  assert.equal(failed.length, 6, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P39/P42/idle-sale actual pages; synthetic users; no cloud writes',
    controlsPassed: results.filter(result => result.phase === 'normal' && result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
