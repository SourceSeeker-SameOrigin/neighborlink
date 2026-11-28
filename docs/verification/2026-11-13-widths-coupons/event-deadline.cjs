// Drive user actions while the client clock crosses the cutoff. All data stays in memory.
const assert = require('node:assert/strict');
const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const original=Date.now;
let now=1000;
async function scenario(status, crossing) {
  now=1000;
  const calls=[];
  const env=runtime(async(_,action)=>{
    calls.push(action);
    if(action==='templates'){if(crossing==='templates')now=2000;return {eventReminder:'test'};}
    if(action==='signup')return {status:'pending_pay',duplicate:true};
    throw Error('Unexpected '+action);
  });
  let subscriptions=0,modals=0;
  env.wx.requestSubscribeMessage=async o=>{subscriptions++;if(crossing==='subscription')now=2000;o.success({});};
  env.wx.showModal=o=>{modals++;if(crossing==='confirmation')now=2000;o.success({confirm:true});};
  const p=env.instance('miniprogram/events/detail/detail.js');p.onLoad({id:'test'});p.data.loading=false;p.detailUserId=env.app.globalData.user._id;
  p.data.item={signupDeadline:2000,startAt:4000,status:'published',featureEnabled:true,remaining:1,canSignup:!status,mySignup:status?{status}:null};
  const before=p.refreshActions();
  if(crossing==='before-click')now=2000;
  if(crossing==='paid-retry'){now=2100;p.data.item.remaining=0;p.load=async()=>{};}
  if(status==='signed')await p.cancelSignup();else await p.signup();
  return {before,calls,modals,subscriptions};
}
(async()=>{
  Date.now=()=>now;
  let r=await scenario(null,'before-click');assert(r.before.canJoin);assert.deepEqual(r.calls,[]);
  r=await scenario(null,'templates');assert.deepEqual(r.calls,['templates']);assert.equal(r.subscriptions,0);
  r=await scenario(null,'subscription');assert.deepEqual(r.calls,['templates']);assert.equal(r.subscriptions,1);
  r=await scenario('signed','before-click');assert(r.before.canCancel);assert.equal(r.modals,0);assert.deepEqual(r.calls,[]);
  r=await scenario('signed','confirmation');assert.equal(r.modals,1);assert.deepEqual(r.calls,[]);
  r=await scenario('pending_pay','paid-retry');assert.deepEqual(r.calls,['templates','signup']);
  console.log('6/6 截止瞬间点击、异步返回及既有待付续付回归通过');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{Date.now=original;});
