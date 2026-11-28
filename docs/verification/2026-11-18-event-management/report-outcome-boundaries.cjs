// Actual page; all reads and writes intercepted. No cloud operations.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('assert');
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise,resolve,reject }; };
async function test(name, fn) { try { results.push({ name, pass:true, observed:await fn() }); } catch(e) { results.push({ name, pass:false, error:e.message }); } }
async function fixture() {
  const order = { _id:'synthetic-report', serviceCode:'vacant', status:'in_service', featureEnabled:true, detail:{}, pricing:{}, slot:{} };
  let reads=0, writes=0, reader=async()=>structuredClone(order);
  const env=runtime(async(n,a)=>{if(a==='detail'){reads++;return reader();} assert.equal(a,'recordReport');writes++;throw Error('合成提交响应丢失');});
  const page=env.instance('miniprogram/provider/task/task.js'); page.onLoad({id:order._id});await page.onShow();
  page.setData({vacantNotes:'本人草稿',photoByItem:Object.fromEntries(page.data.vacantItems.map(x=>[x.key,['synthetic-photo']])),checklist:{windows:true}});
  return {order,env,page,reader:fn=>reader=fn,counts:()=>({reads,writes})};
}
(async()=>{
  for(const finalStatus of ['in_service','delivered','completed','cancelled'])await test('recovery-read-'+finalStatus,async()=>{
    const f=await fixture();f.order.status=finalStatus;await f.page.submitVacantReport();
    assert.equal(f.page.data.order.status,finalStatus);assert.equal(f.page.data.busy,false);
    assert.equal(f.page.data.vacantNotes,'本人草稿');
    if(finalStatus==='in_service')assert.ok(f.page.data.error.includes('检查草稿后重试提交'));
    else {assert.equal(f.page.data.error,'');await f.page.submitVacantReport();}
    assert.deepEqual(f.counts(),{reads:2,writes:1});return f.counts();
  });
  for(const boundary of ['failure','forbidden','feature-disabled'])await test('recovery-'+boundary+'-no-resubmit',async()=>{
    const f=await fixture();
    f.reader(async()=>{if(boundary==='feature-disabled')return {...f.order,featureEnabled:false};throw Object.assign(Error('合成读取失败'),{code:boundary==='forbidden'?'E_FORBIDDEN':'E_NETWORK'});});
    await f.page.submitVacantReport();assert.equal(f.page.data.busy,false);
    if(boundary!=='feature-disabled'){assert.equal(f.page.data.order,null);assert.equal(f.page.data.taskReady,false);assert.ok(f.page.data.error.startsWith('提交结果待核对'));}
    await f.page.submitVacantReport();assert.equal(f.counts().writes,1);
    f.reader(async()=>({...f.order,status:'delivered'}));await f.page.load();
    assert.equal(f.page.data.order.status,'delivered');assert.equal(f.page.data.error,'');assert.equal(f.counts().writes,1);return f.counts();
  });
  for(const outcome of ['success','failure'])for(const boundary of ['hidden','unloaded','changed-user','changed-order','refreshed'])await test('late-recovery-'+outcome+'-'+boundary,async()=>{
    const f=await fixture(),wait=deferred(),started=deferred();
    f.reader(()=>{started.resolve();return wait.promise;});const submit=f.page.submitVacantReport();await started.promise;
    assert.equal(f.page.data.order,null);assert.equal(f.page.data.loading,true);await f.page.submitVacantReport();assert.equal(f.counts().writes,1);
    if(boundary==='hidden')f.page.onHide();
    if(boundary==='unloaded')f.page.onUnload();
    if(boundary==='changed-user')f.env.app.globalData.user={_id:'other-provider'};
    if(boundary==='changed-order')f.page.orderId='another-task';
    if(boundary==='refreshed'){f.reader(async()=>({...f.order,status:'delivered'}));await f.page.load();}
    const snapshot=JSON.stringify(f.page.data);
    outcome==='success'?wait.resolve({...f.order,status:'delivered'}):wait.reject(Error('合成迟到错误'));
    await submit;assert.equal(JSON.stringify(f.page.data),snapshot);assert.equal(f.counts().writes,1);
    if(boundary==='changed-user'){f.reader(async()=>({...f.order,status:'delivered'}));await f.page.load();assert.equal(f.page.data.vacantNotes,'');assert.equal(f.page.reportOutcome,null);}
    return f.counts();
  });
  console.log(JSON.stringify({scope:'QA120 actual page with synthetic results only',pass:results.filter(x=>x.pass).length,fail:results.filter(x=>!x.pass).length,results},null,2));
  if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
