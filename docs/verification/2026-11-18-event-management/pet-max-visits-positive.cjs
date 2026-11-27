// Actual P52/P53 and pet.listVisits at the allowed 15 days x 2 visits; synthetic only.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const dates = Array.from({ length: 15 }, (_, index) => '2026-12-' + String(index + 1).padStart(2, '0'));
const visits = dates.flatMap(date => [1, 2].map(seq => ({
  _id: 'visit-' + date + '-' + seq, parentOrderId: 'pet-order', date, seq,
  status: 'pending', photos: []
})));
const backend = fixture({ global: true, local: true, orderedQueries: true,
  roles: ['resident', 'provider'], records: {
    providers: [{ _id: 'provider', openid: 'actor', status: 'approved', level: 2, communityId: 'c' }],
    orders: [{ _id: 'pet-order', serviceCode: 'pet', status: 'in_service', userOpenid: 'resident',
      providerId: 'provider', providerOpenid: 'actor', detail: { dates, visitsPerDay: 2, entry: 'key_handover' } }],
    visits
  } });
const ui = runtime(async (name, action, input) => {
  const response = await backend.call(name, action, input);
  if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
  return response.data;
});
ui.app.globalData.user = backend.data.users[0];

(async () => {
  const page = ui.instance('miniprogram/pet/work.js');
  page.onLoad({ id: 'pet-order' });
  await page.onShow();
  assert.equal(page.data.visits.length, 30);
  assert.equal(page.data.visits[0]._id, 'visit-2026-12-01-1');
  assert.equal(page.data.visits[29]._id, 'visit-2026-12-15-2');
  assert.equal(page.data.parentStatus, 'in_service');

  // The resident-facing report page reads the same full schedule under its own identity.
  backend.data.users.push({ _id: 'resident-user', openid: 'resident', roles: ['resident'], communityId: 'c' });
  backend.setActor('resident');
  const residentUI = runtime(async (name, action, input) => {
    const response = await backend.call(name, action, input);
    if (!response.ok) throw Object.assign(Error(response.message), { code: response.code });
    return response.data;
  });
  residentUI.app.globalData.user = backend.data.users[1];
  const reports = residentUI.instance('miniprogram/pet/reports.js');
  reports.onLoad({ id: 'pet-order' });
  await reports.onShow();
  assert.equal(reports.data.visits.length, 30);
  assert.equal(reports.data.visits[0]._id, 'visit-2026-12-01-1');
  assert.equal(reports.data.visits[29]._id, 'visit-2026-12-15-2');
  assert.equal(backend.writes.length, 0);
  console.log(JSON.stringify({ scope: 'actual P52/P53 and pet.listVisits; synthetic maximum schedule',
    providerCount: page.data.visits.length, residentCount: reports.data.visits.length,
    first: page.data.visits[0]._id,
    last: page.data.visits[29]._id, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
