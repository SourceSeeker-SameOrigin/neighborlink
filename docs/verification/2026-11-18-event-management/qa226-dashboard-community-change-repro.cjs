// Actual P18 page with a synthetic same-user community change while session refresh is pending.
const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const metrics = { serviceFeeTurnover: 0, actualIncome: 0, goodsReceived: 0, goodsRefunded: 0,
  refundTotal: 0, complaintRate: 0, acceptRate15m: 0, memberships: {},
  extensions: { modules: [], payoutStatus: [] }, orders: {} };

async function readWithChange() {
  const r = runtime(async (name, action) => {
    if (name === 'admin' && action === 'dashboard') return metrics;
    throw Error('Unexpected cloud call');
  });
  const before = { _id: 'property', communityId: 'community-a', roles: ['property'] };
  const after = { ...before, communityId: 'community-b' };
  let finishSession;
  r.app.globalData.user = before;
  r.app.ensureSession = () => new Promise(resolve => { finishSession = resolve; });
  const page = r.instance('miniprogram/admin/dashboard/dashboard.js');
  page.onShow(); // This lifecycle method starts load without returning its promise.
  r.app.globalData.user = after;
  finishSession(before);
  await new Promise(resolve => setImmediate(resolve));
  const observed = { loading: page.data.loading, ready: page.data.ready,
    authorized: page.data.authorized, pageCommunity: page.user?.communityId,
    currentCommunity: r.app.globalData.user.communityId,
    requestedCommunity: r.requests.find(([name, action]) => name === 'admin' && action === 'dashboard')?.[2]?.communityId };
  assert.deepEqual(observed, { loading: false, ready: false, authorized: false,
    pageCommunity: undefined, currentCommunity: 'community-b', requestedCommunity: undefined });
  page.onHide();
  return observed;
}

readWithChange().then(observed => console.log(JSON.stringify({
  scope: 'P18 actual page; synthetic property account with community change; cloud response mocked; no writes', observed
}, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
