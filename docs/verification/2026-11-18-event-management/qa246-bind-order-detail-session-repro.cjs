// Actual address binding and resident order detail pages; synthetic users and intercepted reads only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id,
  buildingId: 'building-' + id, unit: '1', room: '101', phone: 'synthetic-' + id });
const order = { _id: 'synthetic-order', kind: 'garbage', status: 'paid',
  pricing: { payAmount: 500, goodsCap: 0 }, detail: {}, timeline: [], refunds: [], canChat: false };

async function run(kind, phase) {
  let finishSession, finishRead;
  const env = runtime((name, action) => {
    let result;
    if (name === 'catalog' && action === 'listCommunities')
      result = { list: [{ _id: 'community-a', name: '合成小区' }], hasMore: false };
    else if (name === 'catalog' && action === 'getCommunity')
      result = { buildings: [{ _id: 'building-a', units: ['1'] }] };
    else if (name === 'order' && action === 'detail') result = order;
    else throw Error(`Unexpected read: ${name}.${action}`);
    if (phase === 'late-read' && !finishRead && (action === 'listCommunities' || action === 'detail'))
      return new Promise(resolve => { finishRead = () => resolve(result); });
    return result;
  });
  const first = user('a');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  if (phase === 'first-session')
    env.app.ensureSession = () => new Promise(resolve => { finishSession = () => resolve(first); });
  else env.app.ensureSession = async () => first;

  const page = env.instance(kind === 'bind' ? 'miniprogram/pages/bind/bind.js' :
    'miniprogram/pages/orders/detail.js');
  let pending;
  if (kind === 'bind') pending = page.onLoad();
  else { page.onLoad({ id: order._id }); pending = page.onShow(); }
  if (phase === 'first-session') {
    env.app.globalData.user = user('b');
    finishSession();
  } else if (phase === 'late-read') {
    for (let i = 0; i < 25 && !finishRead; i += 1) await Promise.resolve();
    assert.equal(typeof finishRead, 'function', `${kind}: intercepted read must start`);
    env.app.globalData.user = user('b');
    finishRead();
  }
  await pending;
  const observed = { kind, phase, loading: page.data.loading, error: page.data.error,
    communities: page.data.communities?.length || 0, orderId: page.data.order?._id || '',
    calls: env.requests.map(request => request[1]) };
  const desired = phase === 'normal' ? !observed.loading && !observed.error &&
    (kind === 'bind' ? observed.communities === 1 : observed.orderId === order._id) :
    !observed.loading && !observed.communities && !observed.orderId &&
    /登录.*变化|资料.*变化/.test(observed.error || '');
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const kind of ['bind', 'order'])
    for (const phase of ['normal', 'first-session', 'late-read'])
      results.push(await run(kind, phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 6);
  assert.equal(failed.length, 3, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'P02/P08 actual pages; synthetic profiles; no cloud writes',
    controlsPassed: results.length - failed.length, boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
