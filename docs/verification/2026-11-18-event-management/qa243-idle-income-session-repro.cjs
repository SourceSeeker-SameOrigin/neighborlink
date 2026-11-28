// Actual idle inventory, sales, and income pages; synthetic identities and intercepted reads only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  ['idle-mine', 'idle/mine/mine'],
  ['idle-sales', 'idle/sales/sales'],
  ['idle-income', 'idle/income/income']
];
const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id });

function reply(action) {
  if (action === 'earnings') return { pending: 0, settled: 0, available: 0, payoutEnabled: false, canWithdraw: false };
  return { list: [], hasMore: false };
}

async function run([pageId, path], phase) {
  let resolveSession, finishRead;
  const env = runtime((name, action) => {
    if (phase === 'late-read' && !finishRead)
      return new Promise(resolve => { finishRead = () => resolve(reply(action)); });
    return reply(action);
  });
  const first = user('a'), second = user('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  const page = env.instance(`miniprogram/${path}.js`);
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
  let retryBlocked = false;
  if (pageId === 'idle-income' && phase !== 'normal') {
    env.app.ensureSession = async () => second;
    const before = env.requests.length;
    await page.load();
    retryBlocked = page.data.loading && env.requests.length === before;
  }
  const observed = { pageId, phase, loading: page.data.loading, ready: page.data.ready,
    loadError: page.data.loadError, error: page.data.error, retryBlocked,
    requests: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && !observed.error && observed.requests.length === (pageId === 'idle-income' ? 2 : 1)
    : !observed.loading && /身份.*变化|资料.*变化/.test(observed.error || '') &&
      (pageId !== 'idle-income' || (observed.loadError && !observed.retryBlocked));
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const page of pages)
    for (const phase of ['normal', 'first-session', 'late-read']) results.push(await run(page, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 9);
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'three idle pages; synthetic users; no cloud writes',
    controlsPassed: results.filter(result => result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
