// Two synthetic residents, one seat. No network. Requests from different residents are sequential.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function run() {
  const eventId = 'one-seat';
  const input = {eventId};
  const now = Date.now();
  const cloud = fixture({local:true, allowWrites:true, records:{events:[{
    _id:eventId, title:'本地免费活动', status:'published', communityIds:['c'], capacity:1, fee:0,
    signupDeadline:new Date(now+3600000), startAt:new Date(now+7200000), endAt:new Date(now+10800000)
  }]}});
  cloud.data.users.push({_id:'second',openid:'second',roles:['resident'],communityId:'c'});
  function screen(openid) {
    const env = runtime(async(name, action, data) => {
      cloud.setActor(openid);
      const r = await cloud.call(name, action, data);
      if (!r.ok) throw Error(r.message);
      return r.data;
    });
    env.app.globalData.user = cloud.data.users.find(u => u.openid === openid);
    const page = env.instance('miniprogram/events/detail/detail.js');
    page.onLoad({id:eventId});
    return {page,env};
  }
  const a = screen('actor'), b = screen('second');
  const count = () => cloud.data.events[0].signupCount;
  await a.page.onShow();
  await b.page.onShow();
  assert.equal(a.page.data.actions.canJoin,true);
  await Promise.all([a.page.signup(),a.page.signup()]);
  assert.equal(a.env.requests.filter(r=>r[1]==='signup').length,1);
  assert.equal(count(),1);
  assert.equal(a.page.data.item.mySignup.status,'signed');
  assert.equal(a.page.data.actions.canCancel,true);
  const replay = await cloud.call('event','signup',input);
  assert.equal(replay.data.duplicate,true);
  assert.equal(cloud.data.signups.length,1);
  assert.equal(count(),1);
  // B opened before A took the seat. A stale button still has to respect live capacity.
  await b.page.signup();
  assert.match(b.page.data.error,/名额已满/);
  assert.equal(count(),1);
  await b.page.load();
  assert.equal(b.page.data.actions.canJoin,false);
  assert.equal(b.page.data.actions.reason,'活动名额已满');
  a.env.wx.showModal = o=>o.success({confirm:false});
  await a.page.cancelSignup();
  assert.equal(count(),1);
  a.env.wx.showModal = o=>o.success({confirm:true});
  await a.page.cancelSignup();
  assert.equal(count(),0);
  assert.equal(a.page.data.item.mySignup.status,'cancelled');
  assert.equal(a.page.data.actions.canJoin,true);
  const again = await cloud.call('event','cancelSignup',input);
  assert.equal(again.ok,false);
  assert.equal(count(),0);
  await b.page.load();
  assert.equal(b.page.data.actions.canJoin,true);
  await b.page.signup();
  assert.equal(count(),1);
  assert.equal(b.page.data.item.mySignup.status,'signed');
  await a.page.load();
  assert.equal(a.page.data.item.mySignup.status,'cancelled');
  assert.equal(a.page.data.item.remaining,0);
  assert.equal(a.page.data.actions.canJoin,false);
  assert.equal(a.page.data.actions.reason,'活动名额已满');
  b.env.wx.showModal = o=>o.success({confirm:true});
  await b.page.cancelSignup();
  await a.page.load();
  await a.page.signup();
  assert.equal(count(),1);
  assert.equal(cloud.data.signups.length,2);
  assert.equal(cloud.data.signups.filter(s=>s.status==='signed').length,1);
  assert.equal((cloud.data.orders||[]).length,0);
  const checkinCode = a.page.data.item.mySignup.checkinCode;
  assert.ok(checkinCode);
  cloud.data.users.push({_id:'manager',openid:'manager',roles:['admin'],communityId:'c'});
  cloud.setActor('manager');
  const stamped = await cloud.call('event','checkin',{eventId,checkinCode});
  assert.equal(stamped.data.status,'checked_in');
  const replayCheckin = await cloud.call('event','checkin',{eventId,checkinCode});
  assert.equal(replayCheckin.ok,false);
  assert.equal(replayCheckin.code,'E_CONFLICT');
  assert.equal(cloud.data.events[0].checkinRevision,1);
  assert.equal(count(),1);
  const roster = await cloud.call('event','listSignups',input);
  assert.deepEqual(roster.data.list.map(r=>r.status),['checked_in']);
  await a.page.load();
  assert.equal(a.page.data.item.mySignup.status,'checked_in');
  assert.equal(a.page.data.item.mySignup.checkinCode,null);
  for (const action of ['canJoin','canCancel','canPay']) assert.equal(a.page.data.actions[action],false);
  const calls = a.env.requests.length;
  await a.page.cancelSignup();
  assert.equal(a.env.requests.length,calls);
  a.page.onUnload();
  b.page.onUnload();
  console.log('通过：同页双击、同人报名重放、过期余量拒绝、确认与放弃取消、取消重放未多减、第二人补位、第一人重新报名、管理员签到与重放拒绝、名单和住户状态一致；订单0。');

}
run().catch(e=>{console.error(e);process.exitCode=1;});
