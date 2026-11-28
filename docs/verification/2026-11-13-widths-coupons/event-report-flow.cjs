// Offline only: actual page handlers and cloud entries, simulated WeChat dialogs and database.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const id = 'sample-event', now = Date.now();
const db = fixture({local:true,allowWrites:true,records:{events:[{_id:id,title:'合成活动',status:'published',
  ownerOpenid:'author',communityIds:['c'],fee:0,capacity:1,signupDeadline:new Date(now+3600000),
  startAt:new Date(now+7200000),endAt:new Date(now+10800000)}]}});
for (const actor of ['second','third','manager','author']) db.data.users.push({_id:actor,openid:actor,
  roles:actor==='manager'?['admin']:['resident'],communityId:'c'});
let loseReply=false;
const results=[];
function environment(actor) {
  const env=runtime(async(name,action,data)=>{
    db.setActor(actor); const r=await db.call(name,action,data);
    if (!r.ok) throw Error(r.message);
    if (action==='report'&&loseReply) {loseReply=false;throw Error('合成：响应未收到');}
    return r.data;
  });
  env.app.globalData.user=db.data.users.find(row=>row.openid===actor);
  env.toasts=[];env.wx.showToast=o=>env.toasts.push(o.title);
  env.wx.showActionSheet=o=>o.success({tapIndex:2});
  env.wx.showModal=o=>o.success({confirm:true,content:'  本地测试说明  '});
  return env;
}
async function resident(actor) {
  const env=environment(actor); const page=env.instance('miniprogram/events/detail/detail.js');
  page.onLoad({id});await page.onShow();assert.equal(page.data.item.title,'合成活动');
  return {env,page};
}
function record(name,condition){results.push({name,ok:Boolean(condition)});}
const reports=()=>db.data.reports||[];
async function run() {
  const {env,page}=await resident('actor');
  const sheet=env.wx.showActionSheet,modal=env.wx.showModal;
  env.wx.showActionSheet=o=>o.fail({errMsg:'cancel'}); await page.reportContent();
  env.wx.showActionSheet=sheet;env.wx.showModal=o=>o.success({confirm:false});await page.reportContent();
  record('取消理由选择及取消说明均无请求、记录或成功提示',!env.requests.some(r=>r[1]==='report') && !reports().length&&!env.toasts.length);
  env.wx.showModal=o=>o.success({confirm:true,content:'字'.repeat(501)});await page.reportContent();
  record('超500字在客户端拒绝',!env.requests.some(r=>r[1]==='report') && page.data.reportError.includes('500') && page.data.error==='');
  env.wx.showModal=modal;
  loseReply=true;await page.reportContent();
  record('服务端已写、响应丢失时显示失败且无成功提示',reports().length===1 && page.data.reportError.includes('响应未收到')&&!env.toasts.length);
  page.setData({error:'独立的详情提示'});
  env.wx.showModal=o=>o.success({confirm:false});
  const beforeCancel=env.requests.length;
  await page.reportContent();
  record('取消重试不提交且保留上次举报反馈',env.requests.length===beforeCancel&&page.data.reportError.includes('响应未收到'));
  env.wx.showModal=modal;
  await Promise.all([page.reportContent(),page.reportContent()]);
  record('重试并双击仅发一次、无重复记录',env.requests.filter(r=>r[1]==='report').length===2 &&
    reports().length===1 && env.toasts.length===1 && env.toasts[0]==='举报已提交');
  record('同页重试成功后不残留过期错误',page.data.reportError==='' && page.data.error==='独立的详情提示');
  const adminEnv=environment('manager'), admin=adminEnv.instance('miniprogram/admin/reports/reports.js');
  await admin.load(true);const first=admin.data.rows[0];
  record('管理待处理队列收到同一条活动举报及正确理由说明',first?.typeLabel==='活动'&&first.targetId===id&&first.reason==='其他问题'&&first.text==='本地测试说明');
  for(const actor of ['second','third']) {
    const next=await resident(actor); await next.page.reportContent(); next.page.onUnload();
    record(actor==='second'?'两名举报人时仍可见':'第三名不同住户举报后隐藏',!!db.data.events[0].moderationHidden===(actor==='third'));
  }
  await page.load();record('刷新后住户无法打开已隐藏活动',page.data.item===null && !!page.data.error);
  await admin.load(true);record('管理员读到三条不同记录且目标已隐藏',admin.data.rows.length===3&&admin.data.rows.every(row=>row.hidden));
  const resolve=async(status)=>admin.resolve({currentTarget:{dataset:{index:0,status}}});
  await resolve('dismissed');await resolve('upheld');
  record('驳回及成立各移出待处理队列',admin.data.rows.length===1&&reports().filter(r=>r.status==='dismissed').length===1&&reports().filter(r=>r.status==='upheld').length===1);
  for(const status of ['dismissed','upheld']) {
    admin.setData({status});await admin.load(true);
    record(status+'筛选只返回已处理的对应记录',admin.data.rows.length===1&&admin.data.rows[0].status===status);
  }
  await admin.moderate({currentTarget:{dataset:{index:0,kind:'show'}}});
  await page.load();
  record('管理员明确解除隐藏后住户可重新读取活动',admin.data.rows[0]?.hidden===false&&page.data.item?.title==='合成活动');
  record('无报名、订单或账户角色变更',!(db.data.orders||[]).length&&!(db.data.signups||[]).length&&!db.writes.some(w=>w.table==='users'));
  // Hold one dialog or cloud reply while this visit ends. No cloud connection.
  for (const boundary of ['reason','confirm','success','failure']) {
    let release, reached;
    const ready = new Promise(resolve => { reached = resolve; });
    const hold = fn => { release = fn; reached(); };
    const lateEnv = runtime(async (name, action) => {
      assert.equal(action, 'report');
      return new Promise((resolve, reject) => hold(() => boundary === 'failure' ? reject(Error('旧错误')) : resolve({})));
    });
    const late = lateEnv.instance('miniprogram/events/detail/detail.js');
    late.onLoad({id}); late.detailUserId = lateEnv.app.globalData.user._id; late.setData({loading:false,item:{_id:id}});
    let modals=0, successToasts=0;
    lateEnv.wx.showToast=()=>{successToasts++;};
    lateEnv.wx.showActionSheet=o=>{
      const choose=()=>o.success({tapIndex:0});
      if(boundary==='reason') hold(choose); else choose();
    };
    lateEnv.wx.showModal=o=>{
      modals++;
      const confirm=()=>o.success({confirm:true,content:''});
      if(boundary==='confirm') hold(confirm); else confirm();
    };
    const pending=late.reportContent();
    await ready;
    if(boundary==='failure') late.onUnload(); else late.onHide();
    let writes=0;
    const set=late.setData.bind(late);
    late.setData=patch=>{writes++; set(patch);};
    release(); await pending;
    const expectedCalls=boundary==='reason'||boundary==='confirm'?0:1;
    record('离页后 '+boundary+' 回调不产生过期反馈',
      writes===0 && !successToasts && !late.reporting && lateEnv.requests.length===expectedCalls &&
      (boundary!=='reason'||modals===0));
  }
  page.onUnload();admin.onUnload();
  for(const r of results)console.log((r.ok?'PASS ':'FAIL ')+r.name);
  if(results.some(r=>!r.ok))process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1;});
