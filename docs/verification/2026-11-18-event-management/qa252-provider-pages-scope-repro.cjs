// Actual provider pages; synthetic same-user scope changes; mutations intercepted.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const pages = [
  { name: 'P14', path: 'miniprogram/provider/workbench/workbench.js', mutation: 'setDuty',
    action: page => page.duty({ detail: { value: true } }) },
  { name: 'P15', path: 'miniprogram/provider/hall/hall.js', mutation: 'accept',
    action: page => page.accept({ currentTarget: { dataset: { id: 'synthetic-task' } } }) },
  { name: 'P17', path: 'miniprogram/provider/earnings/earnings.js', mutation: 'create',
    action: page => page.createPayout() }
];
const user = () => ({ _id: 'synthetic-provider', communityId: 'community-a', roles: ['provider'] });
const task = { _id: 'synthetic-task', pricing: { payAmount: 500, goodsCap: 0 },
  slot: { date: '2026-11-30', start: '10:00' } };

function response(name, action) {
  if (name === 'provider' && action === 'myStatus') return { provider: { status: 'approved' }, todayCount: 0, todayIncome: 0 };
  if (name === 'provider' && action === 'myTasks') return { list: [], hasMore: false };
  if (name === 'provider' && action === 'hall') return { list: [task], hasMore: false, nextOffset: 1 };
  if (name === 'provider' && action === 'earnings') return { list: [], pending: 0,
    settled: 0, available: 100, canWithdraw: true, payoutEnabled: true, hasMore: false };
  if (name === 'payout' && action === 'list') return { list: [], hasMore: false };
  throw Error(`Unexpected API read: ${name}.${action}`);
}

async function run(item, phase) {
  const env = runtime((name, action) => {
    if (action === item.mutation && (name === 'provider' || name === 'payout'))
      throw Error('synthetic mutation intercepted');
    return response(name, action);
  });
  const first = user();
  env.app.globalData.user = first;
  env.app.ensureSession = async () => first;
  const page = env.instance(item.path);
  await page.onShow();
  assert.equal(page.data.ready, true, `${item.name} control load must authorize`);
  if (phase === 'role') env.app.globalData.user = { ...first, roles: ['resident'] };
  if (phase === 'community') env.app.globalData.user = { ...first, communityId: 'community-b' };
  const before = env.requests.filter(call => call[1] === item.mutation).length;
  await item.action(page);
  const writes = env.requests.filter(call => call[1] === item.mutation).length - before;
  const desired = phase === 'normal' ? writes === 1 : writes === 0;
  page.onHide();
  return { page: item.name, phase, interceptedMutations: writes, desired };
}

async function main() {
  const results = [];
  for (const item of pages) for (const phase of ['normal', 'role', 'community'])
    results.push(await run(item, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 9);
  assert.equal(failed.length, 6, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P14/P15/P17 actual provider pages; synthetic identities; zero cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
