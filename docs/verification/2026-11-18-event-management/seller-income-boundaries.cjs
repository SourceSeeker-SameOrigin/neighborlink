// Actual seller income page with synthetic users and intercepted APIs only.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const income = { pending: 1000, settled: 0, available: 1000, payoutEnabled: true, canWithdraw: true };
const pause = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const fixture = handler => {
  const env = runtime((...args) => handler(...args));
  env.app.globalData.user = { _id: 'resident-a' };
  return { env, page: env.instance('miniprogram/idle/income/income.js') };
};

(async () => {
  const results = [];
  {
    const { page } = fixture(async (name, action) => action === 'earnings' ? income : { list: [] });
    await page.load();
    results.push({ case: 'normal-read', pass: page.data.ready && page.data.available === '10.00' });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'earnings' ? wait.promise : { list: [] });
    const read = page.load();
    await pause();
    env.app.globalData.user = { _id: 'resident-b' };
    wait.resolve(income);
    await read;
    results.push({ case: 'late-read-after-identity-change', pass: !page.data.ready,
      observed: { ready: page.data.ready, available: page.data.available } });
  }
  {
    const { env, page } = fixture(async (name, action) => action === 'earnings' ? income : action === 'create' ? { state: 'created' } : { list: [] });
    await page.load();
    env.app.globalData.user = { _id: 'resident-b' };
    await page.withdraw();
    const calls = env.requests.filter(request => request[1] === 'create').length;
    results.push({ case: 'old-withdraw-after-identity-change', pass: calls === 0, observed: { createCalls: calls } });
  }
  {
    const wait = deferred();
    const { env, page } = fixture(async (name, action) => action === 'earnings' ? income : action === 'create' ? wait.promise : { list: [] });
    let transfers = 0;
    env.wx.canIUse = () => true;
    env.wx.requestMerchantTransfer = options => { transfers++; options.success({}); };
    await page.load();
    const payout = page.withdraw();
    await pause();
    env.app.globalData.user = { _id: 'resident-b' };
    wait.resolve({ packageInfo: 'synthetic', mchId: 'synthetic', appId: 'synthetic' });
    await payout;
    results.push({ case: 'late-payout-after-identity-change', pass: transfers === 0, observed: { transferCalls: transfers } });
  }
  console.log(JSON.stringify({ scope: 'synthetic users; no cloud or real transfer', pass: results.filter(result => result.pass).length,
    fail: results.filter(result => !result.pass).length, results }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
