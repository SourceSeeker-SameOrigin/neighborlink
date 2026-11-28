// Run from the repository root. Database, wxacode, file storage and camera responses are local doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

function scenario(role = 'admin', count = 1) {
  const now = Date.now();
  const events = Array.from({ length: count }, (_, i) => ({
    _id: 'activity-' + (i + 1), title: '合成活动 ' + (i + 1), ownerOpenid: 'manager',
    communityIds: ['c'], status: 'published', capacity: 1, fee: 0,
    createdAt: new Date(now - i * 1000), signupDeadline: new Date(now + 3600000),
    startAt: new Date(now + 7200000), endAt: new Date(now + 10800000)
  }));
  const db = fixture({ local: true, allowWrites: true, records: { events } });
  db.data.communities.push({ _id: 'other', status: 'active', features: { events: true } });
  const manager = { _id: 'manager-id', openid: 'manager', roles: [role], communityId: 'c' };
  db.data.users.push(manager);
  const qrRequests = [];
  db.cloud.openapi.wxacode = { async getUnlimited(input) {
    qrRequests.push(input);
    return { buffer: Buffer.from('synthetic') };
  } };
  db.cloud.uploadFile = async () => ({ fileID: 'cloud://fixture/checkin.png' });
  function screen(actor, route) {
    const env = runtime(async (name, action, params) => {
      db.setActor(actor.openid);
      const result = await db.call(name, action, params);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    });
    env.app.globalData.user = actor;
    return { env, page: env.instance('miniprogram/events/' + route + '/' + route + '.js') };
  }
  const resident = screen(db.data.users[0], 'detail');
  const management = screen(manager, 'manage');
  async function enroll(id) {
    resident.page.onLoad({ id });
    await resident.page.onShow();
    await resident.page.signup();
    assert.equal(resident.page.data.item.mySignup.status, 'signed', resident.page.data.error);
    assert.equal(resident.page.data.item.remaining, 0);
    const code = resident.page.data.item.mySignup.checkinCode;
    assert.equal(qrRequests.at(-1).scene, 'e=' + code);
    return code;
  }
  return { db, resident, management, manager, enroll };
}

const click = id => ({ currentTarget: { dataset: { id } } });
async function main() {
  const baseline = scenario('admin', 2);
  const id = 'activity-1';
  const code = await baseline.enroll(id);
  const { env, page } = baseline.management;
  await page.onShow();
  assert.equal(page.data.ready, true, page.data.error);
  await page.showSignups(click(id));
  assert.equal(page.data.attendees[0].status, 'signed');
  env.wx.scanCode = options => options.success({ path: 'events/detail/detail?scene=' + encodeURIComponent('e=' + code) });
  await page.scan();
  assert.equal(page.data.scanCode, code);
  await page.checkin(click('activity-2'));
  assert.ok(page.data.error);
  assert.equal(baseline.db.data.signups[0].status, 'signed');
  await page.checkin(click(id));
  assert.equal(page.data.error, '');
  assert.equal(page.data.scanCode, '');
  await page.showSignups(click(id));
  assert.equal(page.data.attendees[0].status, 'checked_in');
  await page.scan();
  await page.checkin(click(id));
  assert.ok(page.data.error);
  assert.equal(baseline.db.data.events[0].checkinRevision, 1);
  await baseline.resident.page.load();
  assert.equal(baseline.resident.page.data.item.mySignup.status, 'checked_in');
  assert.equal(baseline.resident.page.data.item.mySignup.checkinCode, null);
  assert.equal(baseline.resident.page.data.item.remaining, 0);
  console.log('PASS: registration, scene parsing, roster, wrong activity, check-in, duplicate rejection and resident refresh');

  const many = scenario('admin', 21);
  const lastCode = await many.enroll('activity-21');
  await many.management.page.onShow();
  assert.equal(many.management.page.data.ready, true, many.management.page.data.error);
  const second = await many.db.call('event', 'adminList', { communityId: 'c', offset: 20 });
  assert.equal(second.data.list[0]._id, 'activity-21');
  const markup = fs.readFileSync('miniprogram/events/manage/manage.wxml', 'utf8');
  const management = many.management;
  const pagingButtons = Array.from(markup.matchAll(/bindtap="([^"]*(?:[Mm]ore|[Nn]ext)[^"]*)"/g), match => match[1]);
  const initialCount = management.page.data.list.length;
  for (const handler of pagingButtons.filter(name => name !== 'loadMoreSignups')) {
    await management.page[handler]();
  }
  management.env.wx.scanCode = options => options.success({ result: 'e=' + lastCode });
  await management.page.scan();
  await management.page.showSignups(click('activity-21'));
  await management.page.checkin(click('activity-21'));
  const visibleTarget = management.page.data.list.some(row => row._id === 'activity-21');
  console.log('P50 activity list:', JSON.stringify({ initialCount, visible: many.management.page.data.list.length,
    targetInList: visibleTarget, rosterId: management.page.data.rosterId,
    targetSignupStatus: many.db.data.signups[0].status,
    serverSecondPageCount: second.data.list.length, pagingButtons }));

  const failures = [];
  if (!visibleTarget || management.page.data.rosterId !== 'activity-21' || many.db.data.signups[0].status !== 'checked_in') {
    failures.push('QA107: cannot access roster and check in activity 21 using the management page');
  }

  for (const role of ['property', 'merchant', 'admin']) {
    for (const moved of [false, true]) {
      const s = scenario(role);
      const residentCode = await s.enroll(id);
      if (moved) s.manager.communityId = 'other';
      s.db.setActor('manager');
      const list = await s.db.call('event', 'listSignups', { eventId: id });
      const checked = await s.db.call('event', 'checkin', { eventId: id, checkinCode: residentCode });
      console.log('organizer scope:', JSON.stringify({ role, moved, roster: list.ok || list.code,
        checkin: checked.ok || checked.code, storedStatus: s.db.data.signups[0].status,
        revision: s.db.data.events[0].checkinRevision || 0 }));
      const allowed = !moved || role === 'admin';
      assert.equal(list.ok, allowed);
      if (checked.ok !== allowed || s.db.data.signups[0].status !== (allowed ? 'checked_in' : 'signed')) {
        failures.push('QA108: unexpected check-in for ' + role + ' moved=' + moved);
      }
    }
  }
  const revoked = scenario('property');
  const validCode = await revoked.enroll(id);
  revoked.db.setActor('manager');
  revoked.db.faults.beforeTransaction = data => {
    data.users.find(user => user.openid === 'manager').communityId = 'other';
  };
  const result = await revoked.db.call('event', 'checkin', { eventId: id, checkinCode: validCode });
  console.log('community changed before transaction:', result.ok, revoked.db.data.signups[0].status);
  if (result.ok || revoked.db.data.signups[0].status !== 'signed') failures.push('QA108: moved before transaction still checked in');
  for (const [label, revoke] of [
    ['role removed', data => { data.users[1].roles = ['resident']; }],
    ['blocked', data => { data.users[1].blocked = true; }],
    ['different login identity', data => { data.users[1].openid = 'other-person'; }],
    ['user removed', data => { data.users.splice(1, 1); }],
    ['organizer changed', data => { data.events[0].ownerOpenid = 'other-person'; }]
  ]) {
    const s = scenario('merchant');
    const valid = await s.enroll(id);
    s.db.setActor('manager');
    s.db.faults.beforeTransaction = revoke;
    const denied = await s.db.call('event', 'checkin', { eventId: id, checkinCode: valid });
    assert.equal(denied.code, 'E_FORBIDDEN', label);
    assert.equal(s.db.data.signups[0].status, 'signed', label);
    assert.equal(s.db.data.events[0].checkinRevision || 0, 0, label);
  }
  for (const failure of failures) console.log('UNMET', failure);
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
