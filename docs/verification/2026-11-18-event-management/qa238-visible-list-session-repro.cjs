// Twelve actual pages using visible-list; synthetic identities and intercepted reads.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  ['P34', 'chat/list/list'],
  ['P36', 'coupons/center/center'],
  ['P37', 'coupons/mine/mine'],
  ['P38', 'board/list/list'],
  ['P41', 'idle/list/list'],
  ['P48', 'events/list/list'],
  ['P69', 'notices/list/list']
];
const additionalFirstSession = [
  ['P01', 'pages/index/index', {}],
  ['P49', 'events/detail/detail', { id: 'synthetic-event' }],
  ['P53', 'pet/reports', { id: 'synthetic-order' }],
  ['P58', 'shops/list/list', {}],
  ['P59', 'shops/detail/detail', { merchantId: 'synthetic-merchant' }]
];
const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id, buildingId: 'building-' + id });

function reply(name, action) {
  if (action === 'getCommunity') return { enabledFeatures: { board: true, idle: true, federation: false } };
  if (action === 'adsForSlot') return { ads: [] };
  if (name === 'chat') return { list: [], unreadTotal: 0, hasMore: false };
  return { list: [], hasMore: false, nextOffset: 0 };
}

async function run([pageId, path, options = {}], phase) {
  let resolveSession, finishRead;
  const env = runtime((name, action) => {
    if (phase === 'late-read' && !finishRead)
      return new Promise(resolve => { finishRead = () => resolve(reply(name, action)); });
    return reply(name, action);
  });
  const first = user('a'), second = user('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  const page = env.instance(`miniprogram/${path}.js`);
  if (page.onLoad) page.onLoad(options);
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase === 'late-read') {
    for (let i = 0; i < 20 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${pageId} must start a read`);
    env.app.globalData.user = second;
    finishRead();
  }
  await pending;
  const observed = { pageId, phase, loading: page.data.loading, error: page.data.error,
    needsBinding: page.data.needsBinding, rows: (page.data.list || page.data.posts || []).length,
    requests: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && observed.error === '' && observed.requests.length > 0 &&
      (!['P38', 'P41'].includes(pageId) || observed.needsBinding === false)
    : !observed.loading && /身份.*变化|资料.*变化/.test(observed.error || '') &&
      observed.rows === 0 && observed.requests.length === (phase === 'first-session' ? 0 : 1);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const item of pages)
    for (const phase of ['normal', 'first-session', 'late-read']) results.push(await run(item, phase));
  for (const item of additionalFirstSession) results.push(await run(item, 'first-session'));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 26);
  assert.equal(failed.length, 19, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: '12 actual pages using visible-list; synthetic users; no cloud writes',
    controlsPassed: results.filter(result => result.phase === 'normal' && result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
