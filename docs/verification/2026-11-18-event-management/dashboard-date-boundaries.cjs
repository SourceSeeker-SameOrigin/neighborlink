// Run the actual dashboard page with synthetic data. All cloud reads are intercepted.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const community = { _id: 'synthetic-community', name: '联调小区' };
const metrics = { serviceFeeTurnover: 0, actualIncome: 0, goodsReceived: 0,
  goodsRefunded: 0, goodsNet: 0, refundTotal: 0, complaintRate: 0,
  acceptRate15m: 0, memberships: {}, orders: {},
  extensions: { modules: [], payoutStatus: [] } };
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const fixture = () => {
  let failDashboard = false;
  const env = runtime(async (name, action, params) => {
    if (action === 'listCommunities') return { list: [community], hasMore: false };
    if (action === 'notificationTemplates') return {};
    if (action === 'dashboard') {
      if (failDashboard) throw new Error('网络暂不可用');
      if (params.from > params.to) throw new Error('统计日期范围不能超过一年');
      return metrics;
    }
    throw new Error(`Unexpected API call: ${name}.${action}`);
  });
  env.app.globalData.user = { _id: 'admin-a', communityId: community._id, roles: ['admin'] };
  return { env, page: env.instance('miniprogram/admin/dashboard/dashboard.js'),
    setNetworkFailure: value => { failDashboard = value; } };
};

(async () => {
  const results = [];
  {
    const { env, page } = fixture();
    await page.load();
    results.push({ case: 'valid-date-initial-load', pass: page.data.ready && !page.data.error });
    const originalFrom = page.data.from;
    page.chooseDate({ currentTarget: { dataset: { field: 'from' } }, detail: { value: '2099-01-01' } });
    await settle();
    const afterInvalid = { ready: page.data.ready, from: page.data.from, error: page.data.error };
    page.chooseDate({ currentTarget: { dataset: { field: 'from' } }, detail: { value: originalFrom } });
    await settle();
    results.push({ case: 'invalid-date-can-be-corrected', pass: page.data.ready && page.data.from === originalFrom,
      observed: { afterInvalid, afterCorrection: { ready: page.data.ready, from: page.data.from },
        dashboardCalls: env.requests.filter(item => item[1] === 'dashboard').length } });
    await page.load();
    results.push({ case: 'reload-recovers-invalid-date', pass: page.data.ready,
      observed: { ready: page.data.ready, from: page.data.from, error: page.data.error } });
  }
  {
    const { page, setNetworkFailure } = fixture();
    await page.load();
    setNetworkFailure(true);
    page.chooseDate({ currentTarget: { dataset: { field: 'to' } }, detail: { value: page.data.to } });
    await settle();
    setNetworkFailure(false);
    page.chooseDate({ currentTarget: { dataset: { field: 'to' } }, detail: { value: page.data.to } });
    await settle();
    results.push({ case: 'network-error-can-retry-selection', pass: page.data.ready,
      observed: { ready: page.data.ready, error: page.data.error } });
  }
  const summary = { scope: 'actual dashboard page, synthetic admin and intercepted cloud reads',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.fail) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
