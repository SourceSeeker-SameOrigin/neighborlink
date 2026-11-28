// Actual resident publish pages, synthetic identities and intercepted reads only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  ['P40-ask', 'board/create/create', { type: 'ask' }],
  ['P40-task', 'board/create/create', { type: 'task' }],
  ['P40-carry', 'board/create/create', { type: 'carry' }],
  ['P43-new', 'idle/create/create', {}],
  ['P43-edit', 'idle/create/create', { id: 'synthetic-item' }]
];
const user = (id, communityId = 'community-' + id) => ({ _id: id, roles: ['resident'], communityId, buildingId: 'building-' + id });

function reply(action) {
  if (action === 'getCommunity') return { enabledFeatures: {
    board: true, travelCarry: true, idle: true, idleEscrow: true, federation: false
  }, dutyWindows: [{ start: '09:00', end: '18:00' }] };
  if (action === 'detail') return { item: { _id: 'synthetic-item', seller: true,
    title: '原小区商品', desc: '合成说明', category: '其他', price: 500, condition: 'used',
    negotiable: true, scope: 'community', images: [], tradeMode: 'offline' } };
  throw Error('Unexpected action: ' + action);
}

async function run([pageId, path, options], phase) {
  let resolveSession, finishRead;
  const delayedAction = phase === 'late-catalog' ? 'getCommunity' :
    ['late-detail', 'same-id-new-community'].includes(phase) ? 'detail' : '';
  const env = runtime((name, action) => {
    if (action === delayedAction && !finishRead)
      return new Promise(resolve => { finishRead = () => resolve(reply(action)); });
    return reply(action);
  });
  const first = user('a');
  const second = phase === 'same-id-new-community' ? user('a', 'community-b') : user('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  const page = env.instance(`miniprogram/${path}.js`);
  page.onLoad(options);
  const pending = page.onShow();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (delayedAction) {
    for (let i = 0; i < 20 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${pageId} must start ${delayedAction}`);
    env.app.globalData.user = second;
    finishRead();
  }
  await pending;
  const observed = { pageId, phase, loading: page.data.loading, ready: page.data.ready,
    loadError: page.data.loadError, error: page.data.error, title: page.data.title,
    requests: env.requests.map(request => request[1]) };
  const desired = phase === 'normal'
    ? !observed.loading && observed.ready && !observed.error &&
      observed.requests.length === (pageId === 'P43-edit' ? 2 : 1)
    : !observed.loading && !observed.ready && observed.loadError &&
      /身份.*变化|资料.*变化/.test(observed.error || '') && !observed.title;
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const page of pages)
    for (const phase of ['normal', 'first-session', 'late-catalog']) results.push(await run(page, phase));
  for (const phase of ['late-detail', 'same-id-new-community']) results.push(await run(pages[4], phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 17);
  assert.equal(failed.length, 12, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P40 three types and P43 new/edit; synthetic users; no cloud writes',
    controlsPassed: results.filter(result => result.phase === 'normal' && result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
