// Actual recycle booking page; synthetic identities and intercepted quote only.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const user = id => ({ _id: id, roles: ['resident'], communityId: 'community-' + id, buildingId: 'building-' + id });
const quote = { slots: [{ date: '2026-11-29', start: '09:00', end: '10:00' }], pricing: { serviceFee: 0 } };

async function run(phase) {
  let resolveSession, finishQuote;
  const env = runtime((name, action) => {
    assert.equal(action, 'quote');
    if (phase === 'late-quote') return new Promise(resolve => { finishQuote = () => resolve(quote); });
    return quote;
  });
  const first = user('a'), second = user('b');
  env.app.globalData.user = phase === 'first-session' ? null : first;
  env.app.ensureSession = phase === 'first-session'
    ? () => new Promise(resolve => { resolveSession = resolve; }) : async () => first;
  const page = env.instance('miniprogram/recycle/order/order.js');
  if (phase === 'normal-quote' || phase === 'late-quote') page.data.categories[0].selected = true;
  const pending = page.onLoad();
  if (phase === 'first-session') {
    env.app.globalData.user = second;
    resolveSession(first);
  } else if (phase === 'late-quote') {
    for (let i = 0; i < 20 && !finishQuote; i += 1) await Promise.resolve();
    assert.equal(typeof finishQuote, 'function', 'quote must start');
    env.app.globalData.user = second;
    finishQuote();
  }
  await pending;
  const observed = { phase, loading: page.data.loading, quoting: page.data.quoting,
    error: page.data.error, pricing: Boolean(page.data.pricing),
    requests: env.requests.map(request => request[1]) };
  const desired = phase.startsWith('normal')
    ? !observed.loading && !observed.error &&
      observed.pricing === (phase === 'normal-quote') &&
      observed.requests.length === (phase === 'normal-quote' ? 1 : 0)
    : !observed.loading && !observed.quoting && !observed.pricing &&
      /身份.*变化|资料.*变化/.test(observed.error || '') &&
      observed.requests.length === (phase === 'late-quote' ? 1 : 0);
  page.onHide();
  return { ...observed, desired };
}

async function main() {
  const results = [];
  for (const phase of ['normal-empty', 'normal-quote', 'first-session', 'late-quote'])
    results.push(await run(phase));
  const failed = results.filter(result => !result.desired);
  assert.equal(results.length, 4);
  assert.equal(failed.length, 2, 'reproduction baseline changed; inspect before editing decision record');
  console.log(JSON.stringify({ scope: 'recycle/order actual page; synthetic users; no cloud writes',
    controlsPassed: results.filter(result => result.phase.startsWith('normal') && result.desired).length,
    boundariesFailed: failed.length, failed }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
