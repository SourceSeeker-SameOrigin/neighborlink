// Actual provider application page with a synthetic first-session failure.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function main() {
  const r = runtime(async () => { throw Error('Unexpected cloud call'); });
  r.app.globalData.user = null;
  r.app.ensureSession = async () => { throw Error('synthetic login timeout'); };
  const page = r.instance('miniprogram/provider/apply/apply.js');
  await page.load();
  const observed = { loading: page.data.loading, ready: page.data.ready, error: page.data.error,
    errorKind: page.data.errorKind, cloudCalls: r.requests.length };
  assert.deepEqual(observed, { loading: true, ready: false, error: '', errorKind: '', cloudCalls: 0 });
  console.log(JSON.stringify({ scope: 'Actual provider application page; synthetic session failure, no cloud writes', observed }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
