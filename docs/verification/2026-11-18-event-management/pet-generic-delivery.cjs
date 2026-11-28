// Actual page + provider entry, in-memory database only. No network or real media.
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('assert');
const results = [];
(async () => {
  const cases = [
    { name: 'pet-pending', service: 'pet', visit: 'pending', allowed: false },
    { name: 'pet-missed', service: 'pet', visit: 'missed', allowed: false },
    { name: 'pet-done-needs-specialized-flow', service: 'pet', visit: 'done', allowed: false },
    { name: 'pet-already-delivered', service: 'pet', visit: 'done', status: 'delivered', allowed: true },
    { name: 'ordinary-trash', service: 'trash', allowed: true },
    { name: 'vacant-specialized-report', service: 'vacant', allowed: false },
    { name: 'pet-not-assigned', service: 'pet', visit: 'pending', wrongProvider: true, allowed: false },
    { name: 'pet-feature-disabled', service: 'pet', visit: 'pending', disabled: true, allowed: false }
  ];
  for (const c of cases) {
    const order = { _id: 'synthetic-task', serviceCode: c.service, kind: 'service', communityId: 'c',
      providerId: c.wrongProvider ? 'another-provider' : 'p', providerOpenid: 'actor',
      status: c.status || 'in_service', timeline: [], pricing: {}, featureEnabled: true,
      detail: { dates: ['2099-01-01'], visitsPerDay: 1 }, slot: {} };
    const db = fixture({ allowWrites: true, roles: ['resident', 'provider'], records: {
      providers: [{ _id: 'p', openid: 'actor', status: 'approved', level: 2 }], orders: [order],
      visits: [{ _id: 'synthetic-visit', parentOrderId: order._id, status: c.visit || 'pending', date: '2099-01-01', seq: 1 }]
    } });
    for (const record of [db.data.config[0], db.data.communities[0]]) {
      record.features.pet = !c.disabled; record.features.vacantHome = true;
    }
    const packaged = process.env.QA119_PROVIDER_PACKAGE ? db.load(process.env.QA119_PROVIDER_PACKAGE).main : null;
    const callProvider = data => packaged ? packaged({ ...data, action: 'deliver' }) : db.call('provider', 'deliver', data);
    let response;
    const env = runtime(async (name, action, data) => {
      if (name === 'order' && action === 'detail') return structuredClone(db.data.orders[0]);
      if (name !== 'provider' || action !== 'deliver') throw Error('Unexpected write');
      response = await callProvider(data);
      if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
      return response.data;
    });
    const page = env.instance('miniprogram/provider/task/task.js');
    page.onLoad({ id: order._id }); await page.onShow();
    page.setData({ photos: ['cloud://synthetic-env/orders/synthetic-task/proof.jpg'] });
    await page.act({ currentTarget: { dataset: { action: 'deliver' } } });
    const pageCalls = env.requests.filter(r => r[0] === 'provider' && r[1] === 'deliver').length;
    if (!response) {
      // Also check direct invocation: hiding a button is not server-side enforcement.
      response = await callProvider({ orderId: order._id, photos: page.data.photos });
    }
    const observed = { ok: response?.ok, code: response?.code, parent: db.data.orders[0].status,
      visit: db.data.visits[0].status, writes: db.writes.length, pageCalls };
    try {
      assert.equal(response?.ok, c.allowed, JSON.stringify(observed));
      if (c.service === 'pet') assert.equal(pageCalls, 0, 'pet page must use specialized flow');
      assert.equal(db.data.visits[0].status, c.visit || 'pending');
      if (!c.allowed || c.status === 'delivered') assert.equal(db.writes.length, 0);
      results.push({ name: c.name, pass: true, observed });
    } catch (error) { results.push({ name: c.name, pass: false, observed, error: error.message }); }
  }
  console.log(JSON.stringify({ scope: 'Actual page and cloud entry; synthetic database only; no cloud writes',
    pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results }, null, 2));
  if (results.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
