// Direct WeChat scan of an attendee check-in QR must not load or check in an activity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

const ui = runtime();
const page = ui.instance('miniprogram/events/detail/detail.js');
page.onLoad({ scene: 'e=ABCDEF0123456789' });
assert.equal(page.eventId, '');
assert.equal(page.data.checkinScene, true);
assert.equal(page.data.missingRecord, false);
assert.equal(page.data.loading, false);
Promise.resolve(page.onShow()).then(() => {
  assert.equal(ui.requests.length, 0);
  const template = fs.readFileSync('miniprogram/events/detail/detail.wxml', 'utf8');
  assert.match(template, /checkinScene[\s\S]*请由组织者扫码签到/);
  const ordinary = ui.instance('miniprogram/events/detail/detail.js');
  ordinary.onLoad({});
  assert.equal(ordinary.data.missingRecord, true);
  const direct = ui.instance('miniprogram/events/detail/detail.js');
  direct.onLoad({ id: 'evt_1', scene: 'e=ABCDEF0123456789' });
  assert.equal(direct.data.checkinScene, false);
  assert.equal(direct.eventId, 'evt_1');
  console.log('QA200: direct scan guidance, ordinary missing ID and event ID precedence passed');
}).catch(error => { console.error(error.stack); process.exitCode = 1; });
