// Actual membership page with a synthetic session failure; no cloud access.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function main() {
  const r = runtime(async () => { throw Error('Unexpected cloud call'); });
  r.app.globalData.user = null;
  r.app.ensureSession = async () => { throw Error('synthetic login timeout'); };
  const page = r.instance('miniprogram/pages/membership/index.js');
  await page.load();
  const afterFailure = { loading: page.data.loading, ready: page.data.ready, error: page.data.error,
    plans: page.data.plans.length, cloudCalls: r.requests.length };
  assert.deepEqual(afterFailure, { loading: false, ready: false, error: 'synthetic login timeout', plans: 0, cloudCalls: 0 });

  console.log(JSON.stringify({ scope: 'Actual membership page with synthetic session failure; no real cloud call', afterFailure }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
