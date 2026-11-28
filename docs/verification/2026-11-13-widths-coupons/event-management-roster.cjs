// Run at the repository root. Synthetic records only; no network or cloud writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {fixture} = require('../2026-11-09-remediation/cloud-fixture.cjs');
const {runtime} = require('../2026-11-09-remediation/page-fixture.cjs');
const events = ['first','second'].map(_id=>({_id,title:_id+'活动',status:'published',communityIds:['c'],capacity:100}));
const signups = Array.from({length:52},(_,i)=>({_id:'s'+i,eventId:i<51?'first':'second',
  status:'signed',checkinCode:'sample'+i,people:1,createdAt:new Date(i)}));
const db = fixture({local:true,roles:['admin'],records:{events,signups}});
const tap = id=>({currentTarget:{dataset:{id}}});
const route = 'miniprogram/events/manage/manage';
async function call(name,action,data) {
  const r = await db.call(name,action,data);
  assert.equal(r.ok,true,r.message);
  return r.data;
}
function setup(handler) {
  const env=runtime(handler), page=env.instance(route+'.js');
  env.app.globalData.user={_id:'admin',roles:['admin'],communityId:'c'};
  page.userId='admin'; page.ownerCommunityId='c'; page.inactive=false;
  page.setData({loading:false,ready:true,isAdmin:true,communityId:'c',list:events});
  return {env,page};
}
const results=[];
async function check(name, action) {
  try { await action(); results.push({name,ok:true}); }
  catch (e) { results.push({name,ok:false,detail:e.message.split('\n')[0]}); }
}
(async()=>{
  await check('云函数第二页补齐第51条且不重复',async()=>{
    const one=await call('event','listSignups',{eventId:'first',offset:0});
    const two=await call('event','listSignups',{eventId:'first',offset:50});
    assert.equal(one.hasMore,true); assert.equal(two.hasMore,false);
    assert.equal(two.list.length,1); assert.equal(new Set([...one.list,...two.list].map(r=>r.signupId)).size,51);
  });
  await check('从页面能读到第51条',async()=>{
    const {page}=setup(call);
    await page.showSignups(tap('first'));
    // Accept automatic paging or an explicit page action when present.
    const body=fs.readFileSync(route+'.wxml','utf8');
    const more=[...body.matchAll(/<button\b([^>]*)>([^<]*(?:更多|下一页)[^<]*)<\/button>/g)]
      .map(m=>m[1].match(/bindtap="([^"]+)"/)?.[1]).find(s=>s&&/signup|attendee|roster/i.test(s));
    if(page.data.attendees.length<51 && more) await page[more](tap('first'));
    assert.equal(page.data.attendees.length,51,'页面仅有 '+page.data.attendees.length+' 条');
  });
  async function overlap(fail) {
    let release;
    const {page}=setup(async(n,a,d)=>{
      if(d.eventId==='first') await new Promise((resolve,reject)=>{release=fail?()=>reject(Error('旧活动读取失败')):resolve;});
      return call(n,a,d);
    });
    const old=page.showSignups(tap('first'));
    await page.showSignups(tap('second'));
    assert.deepEqual(Array.from(page.data.attendees,r=>r.signupId),['s51']);
    release(); await old;
    assert.deepEqual(Array.from(page.data.attendees,r=>r.signupId),['s51'],'旧响应覆盖新名单');
    assert.equal(page.data.error,'','旧请求错误出现在新名单上');
  }
  await check('连续查看两场活动，仅保留后选活动名单',()=>overlap(false));
  await check('先点活动的迟到错误不显示到后选活动',()=>overlap(true));
  await check('更多失败后保留50条、重复点击合并、重试原偏移',async()=>{
    let stop, fail=true; const offsets=[];
    const {page}=setup(async(n,a,d)=>{
      offsets.push(d.offset); if(d.offset===50 && fail) {
        await new Promise(resolve=>{stop=resolve}); fail=false; throw Error('翻页失败');
      }
      return call(n,a,d);
    });
    await page.showSignups(tap('first')); const loading=page.loadMoreSignups();
    await page.loadMoreSignups(); stop(); await loading;
    assert.equal(page.data.rosterError,'翻页失败'); assert.equal(page.data.attendees.length,50);
    await page.retrySignups(); assert.deepEqual(offsets,[0,50,50]); assert.equal(page.data.rosterMore,false);
    assert.equal(new Set(page.data.attendees.map(r=>r.signupId)).size,51);
  });
  await check('首读失败仅重试当前活动，不恢复上一场名单',async()=>{
    let fail=true; const {page}=setup(async(n,a,d)=>{
      if(d.eventId==='second' && fail) { fail=false; throw Error('首读失败'); } return call(n,a,d);
    });
    await page.showSignups(tap('first')); await page.showSignups(tap('second'));
    assert.equal(page.data.attendees.length,0); assert.equal(page.data.rosterTitle,'second活动');
    assert.equal(page.data.rosterError,'首读失败'); await page.retrySignups();
    assert.deepEqual(Array.from(page.data.attendees,r=>r.signupId),['s51']);
  });
  for(const phase of ['onHide','onUnload']) await check(phase+' 后迟到名单不写界面',async()=>{
    let resume; const {page}=setup(async(n,a,d)=>{await new Promise(r=>{resume=r;}); return call(n,a,d);});
    const pending=page.showSignups(tap('first')); page[phase]();
    let writes=0; const original=page.setData.bind(page); page.setData=v=>{writes++; original(v);};
    resume(); await pending; assert.equal(writes,0);
  });
  await check('切小区后旧名单不能回填',async()=>{
    let resume; const zones=[{_id:'c'},{_id:'other'}];
    const {page,env}=setup(async(n,a,d)=>{
      if(a==='listCommunities') return {list:zones,hasMore:false};
      if(a==='adminList') return {list:[]};
      await new Promise(r=>{resume=r;}); return call(n,a,d);
    });
    env.app.globalData.user={_id:'admin',roles:['admin'],communityId:'c'};
    page.setData({communities:zones}); const old=page.showSignups(tap('first'));
    await page.chooseCommunity({detail:{value:1}}); resume(); await old;
    assert.equal(page.data.communityId,'other'); assert.equal(page.data.rosterId,'');
    assert.equal(page.data.attendees.length,0);
  });
  await check('名单查询不写业务数据',()=>assert.equal(db.writes.length,0));
  for(const r of results) console.log((r.ok?'PASS':'FAIL')+' '+r.name+(r.detail?'：'+r.detail:''));
  if(results.some(r=>!r.ok)) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
