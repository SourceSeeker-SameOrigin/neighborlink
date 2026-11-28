// Actual page and cloud entry against synthetic records only. No network or media uploads.
const assert = require('assert');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { CHECKLIST } = require('../../../cloudfunctions/_shared/vacant');
const { ymd, addDays } = require('../../../cloudfunctions/_shared/time');
const results = [];
async function check(name, fn) {
  try { results.push({ name, pass: true, observed: await fn() }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
function setup() {
  const order = { _id: 'synthetic-vacant-report', serviceCode: 'vacant', kind: 'service',
    communityId: 'c', providerId: 'p', providerOpenid: 'actor', userOpenid: 'resident',
    status: 'in_service', slot: { date: ymd(new Date()) }, timeline: [], detail: {}, pricing: {}, featureEnabled: true };
  const db = fixture({ allowWrites: true, roles: ['resident', 'provider'], records: {
    orders: [order], providers: [{ _id: 'p', openid: 'actor', status: 'approved', level: 2 }]
  } });
  db.data.config[0].features.vacantHome = true;
  db.data.communities[0].features.vacantHome = true;
  const input = { orderId: order._id, checklist: {}, photoByItem: {}, notes: 'synthetic report', attention: false };
  for (const key of Object.keys(CHECKLIST)) {
    input.checklist[key] = true;
    input.photoByItem[key] = ['cloud://synthetic-env/vacant/' + order._id + '/' + key + '/proof.jpg'];
  }
  return { db, input, call: () => db.call('vacant', 'recordReport', input) };
}
(async () => {
  await check('normal-report-and-repeat-preserve-original', async () => {
    const f = setup(); const first = await f.call(); assert.equal(first.ok, true);
    const original = JSON.stringify(f.db.data.orders[0].vacantReport);
    f.input.notes = 'changed retry'; const second = await f.call();
    assert.equal(second.ok, false); assert.equal(second.code, 'E_BAD_STATE');
    assert.equal(JSON.stringify(f.db.data.orders[0].vacantReport), original);
    assert.equal(f.db.writes.length, 1);
    return { first: first.data.status, repeat: second.code, writes: f.db.writes.length };
  });
  for (const boundary of ['before-write-failure', 'response-lost']) {
    await check(boundary + '-page-retry-and-readback', async () => {
      const f = setup(); let attempts = 0;
      const env = runtime(async (name, action) => {
        if (name === 'order' && action === 'detail') return structuredClone(f.db.data.orders[0]);
        assert.equal(name, 'vacant'); assert.equal(action, 'recordReport'); attempts++;
        if (boundary === 'before-write-failure' && attempts === 1) throw Error('synthetic request not delivered');
        const result = await f.call();
        if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
        if (boundary === 'response-lost' && attempts === 1) throw Error('synthetic response lost');
        return result.data;
      });
      const page = env.instance('miniprogram/provider/task/task.js');
      page.onLoad({ id: f.input.orderId }); await page.onShow();
      page.setData({ checklist: f.input.checklist, photoByItem: f.input.photoByItem, vacantNotes: f.input.notes });
      await page.submitVacantReport();
      assert.equal(page.data.busy, false);
      if (boundary === 'response-lost') { assert.equal(page.data.error, ''); assert.equal(page.data.order.status, 'delivered'); }
      else assert.ok(page.data.error.includes('检查草稿后重试提交'));
      assert.equal(page.data.photoByItem.windows.length, 1);
      await page.submitVacantReport();
      const retryError = page.data.error;
      if (boundary === 'response-lost') assert.equal(retryError, '');
      else assert.equal(page.data.order.status, 'delivered');
      // The existing error component's retry handler reloads, rather than re-submitting.
      await page.load();
      assert.equal(page.data.order.status, 'delivered'); assert.equal(page.data.error, '');
      assert.equal(f.db.writes.length, 1); assert.equal(attempts, boundary === 'response-lost' ? 1 : 2);
      return { attempts, writes: f.db.writes.length, retryError, afterRead: page.data.order.status };
    });
  }
  for (const boundary of ['wrong-provider', 'not-today', 'feature-off', 'status-changed-in-transaction', 'assignee-changed-in-transaction']) {
    await check(boundary + '-no-report-write', async () => {
      const f = setup();
      if (boundary === 'wrong-provider') f.db.data.orders[0].providerId = 'other';
      if (boundary === 'not-today') f.db.data.orders[0].slot.date = ymd(addDays(new Date(), 1));
      if (boundary === 'feature-off') f.db.data.communities[0].features.vacantHome = false;
      if (boundary === 'status-changed-in-transaction') f.db.faults.beforeTransaction = data => { data.orders[0].status = 'cancelled'; };
      if (boundary === 'assignee-changed-in-transaction') f.db.faults.beforeTransaction = data => { data.orders[0].providerOpenid = 'other'; };
      const result = await f.call(); assert.equal(result.ok, false); assert.equal(f.db.writes.length, 0);
      assert.equal(f.db.data.orders[0].vacantReport, undefined);
      return { code: result.code, writes: 0 };
    });
  }
  console.log(JSON.stringify({ scope: 'Actual page and cloud code; synthetic records only; no real report or media writes',
    acceptance: 'QA120 local integration only; simulator and native acceptance are separate',
    pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results }, null, 2));
  if (results.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
