// Read-only source reproduction with synthetic responses; no live cloud writes.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
(async () => {
  const results = [];
  for (const scenario of ['created_then_navigation_failure', 'create_response_unknown_then_retry']) {
    let creates = 0;
    const r = runtime(async (_, action) => {
      if (action === 'create') {
        creates++;
        if (scenario === 'create_response_unknown_then_retry' && creates === 1) throw Error('Synthetic lost response');
        return { orderId: 'synthetic-recycle-' + creates };
      }
      throw Error('Unexpected action');
    });
    r.wx.redirectTo = o => { r.navigation.push(['redirectTo', o.url]); o.fail?.({ errMsg: 'Synthetic navigation failure' }); };
    const p = r.instance('miniprogram/recycle/order/order.js');
    await p.onLoad();
    p.communityId = 'synthetic-community';
    p.setData({ loading: false, pricing: { payAmount: 0 }, categories: [{ code: 'paper', selected: true }],
      slots: [{ date: '2026-11-13', start: '07:00', end: '00:00' }] });
    await p.create(); await p.create();
    const reqs = r.requests.filter(x => x[1] === 'create');
    results.push({ scenario, createCalls: reqs.length, uniqueRequestIds: new Set(reqs.map(x => x[2].requestId)).size,
      navigationCalls: r.navigation.length, visibleError: p.data.error, hasRecoveryOrder: !!p.data.createdOrderId,
      observedRisk: reqs.length === 2 && new Set(reqs.map(x => x[2].requestId)).size === 2 });
  }
  console.log(JSON.stringify({ scope: 'Actual recycle page with synthetic API/navigation; no actual duplicate cloud orders claimed', results }, null, 2));
})();
