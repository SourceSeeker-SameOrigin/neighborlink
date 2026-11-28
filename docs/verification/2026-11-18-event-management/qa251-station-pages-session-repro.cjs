// Actual station pages; synthetic identities and intercepted read APIs only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const cases = [
  { page: 'P62', path: 'miniprogram/station/workbench/workbench.js', action: 'listMyBatches',
    result: { list: [], hasMore: false } },
  { page: 'P64', path: 'miniprogram/station/worker/worker.js', action: 'providerHall',
    result: { list: [], hasMore: false, nextOffset: 0 } },
  { page: 'P65', path: 'miniprogram/station/batch/batch.js', action: 'providerBatch',
    result: { _id: 'synthetic-batch', status: 'assigned', items: [] } }
];
const user = id => ({ _id: id, roles: ['station', 'provider'], stationCode: 'gate',
  stationCommunityId: 'community-a', communityId: 'community-a' });

async function run(item, phase) {
  let finishSession, finishRead;
  const env = runtime((name, action) => {
    assert.equal(name, 'station');
    assert.equal(action, item.action);
    if (phase.startsWith('late-')) return new Promise(resolve => { finishRead = resolve; });
    return item.result;
  });
  const first = user('a');
  env.app.globalData.user = first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { finishSession = () => resolve(first); })
    : async () => first;
  const page = env.instance(item.path);
  if (page.onLoad) page.onLoad(item.page === 'P65' ? { id: 'synthetic-batch' } : {});
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = user('b');
    finishSession();
  } else if (phase.startsWith('late-')) {
    for (let i = 0; i < 25 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${item.page} read must start`);
    env.app.globalData.user = phase === 'late-user' ? user('b')
      : phase === 'late-community' ? { ...first, communityId: 'community-b', stationCommunityId: 'community-b' }
        : { ...first, roles: ['resident'] };
    finishRead(item.result);
  }
  await pending;
  const observed = { page: item.page, phase, loading: page.data.loading,
    ready: page.data.ready, error: page.data.error, calls: env.requests.length,
    oldData: Boolean(page.data.batch || page.data.batches?.length || page.data.list?.length) };
  const desired = phase === 'normal'
    ? !observed.loading && observed.ready && !observed.error && observed.calls === 1
    : !observed.loading && !observed.ready && !observed.oldData &&
      /身份.*变化|资料.*变化/.test(observed.error) &&
      (phase !== 'first-session' || observed.calls === 0);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const item of cases) for (const phase of ['normal', 'first-session', 'late-user',
    'late-community', 'late-role']) results.push(await run(item, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 15);
  assert.equal(failed.length, 12, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P62/P64/P65 actual pages; synthetic users; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
