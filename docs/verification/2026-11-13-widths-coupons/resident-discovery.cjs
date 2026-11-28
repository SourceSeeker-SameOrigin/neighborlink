// Run from repository root. Synthetic resident, actual page handlers and cloud entries.
const assert = require('node:assert/strict');
const {fixture} = require('../2026-11-09-remediation/cloud-fixture.cjs');
const {runtime} = require('../2026-11-09-remediation/page-fixture.cjs');
const {signupId} = require('../../../cloudfunctions/_shared/eventData');
const time = Date.now();
const hour = 3600000;
const base = {communityIds:['c'],status:'published',capacity:8,fee:500,startAt:new Date(time+3*hour),
  endAt:new Date(time+4*hour), signupDeadline:new Date(time+hour), location:'测试场地'};
const events=[
  {...base,_id:'open',title:'本区活动'}, {...base,_id:'ended',signupDeadline:new Date(time-hour),title:'已截止'},
  {...base,_id:'signed',signupDeadline:new Date(time-hour),title:'已报名且截止'},
  {...base,_id:'other',communityIds:['x']}, {...base,_id:'hidden',moderationHidden:true}
];
const notices=['c','x'].map(id=>({_id:'notice-'+id,communityId:id,title:id+'公告',body:'本地测试',status:'live',createdAt:new Date(time)}));
const signups=[{_id:signupId('signed','actor'),eventId:'signed',openid:'actor',status:'signed',checkinQrFileId:'fixture-qr'}];
const cloud=fixture({local:true,records:{events,notices,signups}});
cloud.data.communities[0].dutyWindows = [{ start:'07:00', end:'21:00' }];
const env=runtime(async(name,action,data)=>{
  const reply=await cloud.call(name,action,data);
  if(!reply.ok)throw Error(reply.message);
  return reply.data;
});
env.app.globalData.user={_id:'u',roles:['resident'],communityId:'c',buildingId:'test'};
(async()=>{
  const home=env.instance('miniprogram/pages/index/index.js');
  await home.onShow();assert.equal(home.data.error,'');assert.equal(home.data.needsBinding,false);
  assert.equal(home.data.notice.title, "c公告");
  home.openNotices();assert.equal(env.navigation.at(-1)[1],'/notices/list/list');
  home.onHide();
  const news=env.instance('miniprogram/notices/list/list.js');await news.onShow();
  assert.equal(news.data.error,'');assert.deepEqual(Array.from(news.data.list,r=>r._id),['notice-c']);
  cloud.data.notices[0].title = '公告已更新';
  news.onUnload();
  await home.onShow();
  assert.equal(home.data.notice.title, '公告已更新');
  home.introduce({currentTarget:{dataset:{code:'events'}}});assert.equal(env.navigation.at(-1)[1],'/events/list/list');
  home.onHide();
  const list=env.instance('miniprogram/events/list/list.js');await list.onShow();
  assert.equal(list.data.error,'');assert.deepEqual(Array.from(list.data.list,r=>r._id),['open','ended','signed']);
  assert.equal(list.data.list[0].feeText,'¥5.00');assert.equal(list.data.list[0].remaining,8);
  const detail=env.instance('miniprogram/events/detail/detail.js');
  list.open({currentTarget:{dataset:{id:'open'}}});assert.equal(env.navigation.at(-1)[1],'/events/detail/detail?id=open');
  list.onHide();
  detail.onLoad({id:'open'});await detail.onShow();assert.equal(detail.data.item.title,'本区活动');
  detail.onUnload();
  const changed = cloud.data.events.find(row => row._id === 'open');
  changed.signupCount = 2;
  changed.fee = 0;
  await list.onShow();
  const fresh = list.data.list.find(row => row._id === 'open');
  assert.equal(fresh.remaining, 6);
  assert.equal(fresh.feeText, '免费');
  assert.equal(list.data.list.filter(row => row._id === 'open').length, 1);
  list.onUnload();
  cloud.data.notices[0].status = 'ended';
  await home.onShow();
  assert.equal(home.data.notice, null);
  assert.equal(home.data.eventsEnabled, true);
  for(const [name,action,args] of [['content','listNotices',{communityId:'x'}],['event','list',{communityId:'x'}],['event','detail',{eventId:'other'}]]){
    assert.equal((await cloud.call(name,action,args)).code,'E_FORBIDDEN');
  }
  console.log('普通住户：首页至本区公告、活动及详情通过；非本区公告列表、活动列表及活动详情均拒绝。');
  for(const [id,method] of [['ended','signup'],['signed','cancelSignup']]){
    const detail = env.instance('miniprogram/events/detail/detail.js');
    detail.onLoad({id});await detail.onShow();assert.equal(detail.data.error,'');

    // Check page actions against actual business responses.
    const offered=method==='signup'?detail.data.actions.canJoin:detail.data.actions.canCancel;
    assert.equal(offered,false);
    const before=env.requests.length;await detail[method]();assert.equal(env.requests.length,before);
    const reply=await cloud.call('event',method,{eventId:id});
    console.log(JSON.stringify({id,method,offered,accepted:reply.ok,message:reply.message}));
    assert.equal(reply.ok,false);assert.match(reply.message,/截止/);
    detail.onUnload();
  }
  assert.equal(cloud.writes.length,0);
  console.log('返回刷新通过：公告更新；活动列表剩余8到6、价格5元到免费、记录唯一；首页清除已结束公告。');

})().catch(e=>{console.error(e);process.exitCode=1;});
