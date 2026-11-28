// Run from the repository root. The cloud SDK and records are local fixtures.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function verify() {
  const db = fixture({ local: true, roles: ['admin', 'resident'], allowWrites: true,
    securityResult: { result: { suggest: 'pass' } } });
  const resident = { _id: 'reader', openid: 'reader', roles: ['resident'], communityId: 'c', buildingId: 'sample' };
  db.data.users.push(resident);
  db.data.communities[0].dutyWindows = [{ start: '07:00', end: '21:00' }];
  async function call(name, action, input) {
    const result = await db.call(name, action, input);
    assert.equal(result.ok, true, name + '.' + action + ' ' + (result.message || ''));
    return result.data;
  }
  const pageApp = runtime(call);
  pageApp.app.globalData.user = resident;
  const hour = 3600000, now = Date.now();
  const title = '联调测试：公告展示';
  const body = '仅供页面验收，无需办理事项。';
  await call('content', 'saveNotice', { communityId: 'c', title, body, endAt: new Date(now + 24 * hour).toISOString() });
  const event = { communityIds:['c'], type:'interest', title:'联调测试：活动详情', desc:'仅供页面验收，无需报名。',
    location:'测试场地', fee:0, capacity:1, signupDeadline:new Date(now-hour),
    startAt:new Date(now+24*hour), endAt:new Date(now+25*hour) };
  const {eventId} = await call('event', 'create', event);
  db.setActor('reader');
  assert.equal((await call('event', 'list', {})).list.length, 0);
  db.setActor('actor');
  await call('event','publish',{eventId});
  db.setActor('reader');
  const writeCount = db.writes.length;
  const home = pageApp.instance('miniprogram/pages/index/index.js');
  const notes = pageApp.instance('miniprogram/notices/list/list.js');
  const list = pageApp.instance('miniprogram/events/list/list.js');
  const detail = pageApp.instance('miniprogram/events/detail/detail.js');
  await home.onShow();
  assert.equal(home.data.notice.title, title);
  home.openNotices();
  assert.equal(pageApp.navigation.at(-1)[1], '/notices/list/list');
  home.onHide();
  await notes.onShow();
  assert.equal(notes.data.list.length, 1);
  assert.equal(notes.data.list[0].body, body);
  notes.onUnload();
  await home.onShow();
  home.introduce({currentTarget:{dataset:{code:'events'}}});
  assert.equal(pageApp.navigation.at(-1)[1], '/events/list/list');
  home.onHide();
  await list.onShow();
  assert.equal(list.data.list.length, 1);
  const row = list.data.list[0];
  assert.equal(row._id, eventId);
  assert.equal(row.feeText, '免费');
  assert.equal(row.remaining, 1);
  list.open({currentTarget:{dataset:{id:row._id}}});
  assert.equal(pageApp.navigation.at(-1)[1], '/events/detail/detail?id='+eventId);
  list.onHide();
  detail.onLoad({id:eventId});
  await detail.onShow();
  assert.equal(detail.data.item.desc, event.desc);
  assert.equal(detail.data.actions.reason, '活动报名已截止');
  assert.equal(detail.data.actions.canJoin, false);
  assert.equal(detail.data.actions.canPay, false);
  const callCount = pageApp.requests.length;
  await detail.signup();
  assert.equal(pageApp.requests.length, callCount);
  detail.onUnload();
  await list.onShow();
  assert.deepEqual(Array.from(list.data.list, item=>item._id), [eventId]);
  list.onUnload();
  await home.onShow();
  assert.equal(home.data.notice.title, title);
  assert.equal(db.writes.length, writeCount);
  assert.equal((db.data.signups || []).length, 0);
  assert.equal((db.data.orders || []).length, 0);
  console.log('PASS 管理员发布公告和活动；住户看不到草稿，发布后可见公告正文及活动详情；已截止、免费、余量1；逐级返回无重复，住户写入0。');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
