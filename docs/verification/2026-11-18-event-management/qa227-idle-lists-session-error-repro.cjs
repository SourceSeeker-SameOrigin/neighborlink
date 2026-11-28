// Actual idle item and seller order lists with a synthetic first-session failure; no cloud writes.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function main() {
  const results = [];
  for (const [route, action] of [['idle/mine/mine', 'mine'], ['idle/sales/sales', 'sales']]) {
    const r = runtime(async (fn, calledAction) => {
      assert.equal(fn, 'idle');
      assert.equal(calledAction, action);
      return { list: [], hasMore: false };
    });
    r.app.globalData.user = null;
    r.app.ensureSession = async () => { throw Error('synthetic login timeout'); };
    const page = r.instance('miniprogram/' + route + '.js');
    await page.onShow();
    const failed = { loading: page.data.loading, error: page.data.error,
      listLength: page.data.list.length, cloudCalls: r.requests.length };
    assert.deepEqual(failed, { loading: true, error: '', listLength: 0, cloudCalls: 0 });

    r.app.globalData.user = { _id: 'seller-a', communityId: 'community-a' };
    r.app.ensureSession = async () => r.app.globalData.user;
    await page.load();
    const retried = { loading: page.data.loading, error: page.data.error,
      listLength: page.data.list.length, cloudCalls: r.requests.length };
    assert.deepEqual(retried, { loading: false, error: '', listLength: 0, cloudCalls: 1 });
    results.push({ route, failed, retried });
  }
  console.log(JSON.stringify({ scope: 'P44/P45 actual pages; synthetic session failures and manual retries; no cloud writes', results }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
