// Actual P62/P64/P65 pages, synthetic identities and read responses only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const cases = [
  { name: 'P62 workbench', path: 'miniprogram/station/workbench/workbench.js', action: 'listMyBatches',
    result: { list: [], hasMore: false } },
  { name: 'P64 worker hall', path: 'miniprogram/station/worker/worker.js', action: 'providerHall',
    result: { list: [], hasMore: false, nextOffset: 0 } },
  { name: 'P65 batch detail', path: 'miniprogram/station/batch/batch.js', action: 'providerBatch',
    result: { _id: 'batch-a', status: 'assigned', items: [] } }
];
const user = id => ({ _id: id, roles: ['station', 'provider'], stationCode: 'gate',
  stationCommunityId: 'community-a', communityId: 'community-a' });

function makePage(env, item) {
  const page = env.instance(item.path);
  if (page.onLoad) page.onLoad(item.name === 'P65 batch detail' ? { id: 'batch-a' } : {});
  return page;
}

async function main() {
  const outcomes = [];
  for (const item of cases) {
    let resolveSession;
    const env = runtime();
    const first = user('first'), second = user('second');
    env.app.globalData.user = null;
    env.app.ensureSession = () => new Promise(resolve => { resolveSession = resolve; });
    const page = makePage(env, item);
    const load = page.onShow();
    env.app.globalData.user = second;
    resolveSession(first);
    await load;
    outcomes.push({ page: item.name, phase: 'first-session', loading: page.data.loading,
      ready: page.data.ready, error: page.data.error, calls: env.requests.length });

    let finishRead;
    const delayed = runtime((name, action) => {
      assert.equal(action, item.action);
      return new Promise(resolve => { finishRead = resolve; });
    });
    delayed.app.globalData.user = null;
    delayed.app.ensureSession = async () => { delayed.app.globalData.user = first; return first; };
    const latePage = makePage(delayed, item);
    const pendingRead = latePage.onShow();
    for (let attempt = 0; attempt < 10 && !finishRead; attempt += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${item.name} must reach its read`);
    delayed.app.globalData.user = second;
    finishRead(item.result);
    await pendingRead;
    outcomes.push({ page: item.name, phase: 'late-read', loading: latePage.data.loading,
      ready: latePage.data.ready, error: latePage.data.error,
      oldDataVisible: Boolean(latePage.data.batch || latePage.data.batches?.length || latePage.data.list?.length) });
  }
  console.log(JSON.stringify({ scope: 'actual station pages, synthetic first-session and late reads', outcomes }, null, 2));
  for (const result of outcomes) {
    assert.equal(result.loading, false, `${result.page}/${result.phase} must end loading`);
    assert.equal(result.ready, false, `${result.page}/${result.phase} must not be ready`);
    assert.match(result.error, /身份.*变化|重新.*核对|重新.*加载/, `${result.page}/${result.phase} needs retry feedback`);
    if (result.phase === 'first-session') assert.equal(result.calls, 0);
    else assert.equal(result.oldDataVisible, false);
  }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
