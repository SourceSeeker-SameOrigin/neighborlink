// Diagnosis only: actual page, synthetic identities, intercepted writes/uploads.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const results = [];
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
async function check(name, fn) { try { const observed=await fn(); results.push({name,pass:true,observed}); } catch(e) { results.push({name,pass:false,error:e.message}); } }
function fixture() {
  const order={_id:'synthetic-order-a',serviceCode:'vacant',status:'in_service',featureEnabled:true,canShareLocation:false,detail:{},pricing:{},slot:{}};
  let read=async()=>JSON.parse(JSON.stringify(order)),write=async()=>({}),upload=async()=>['synthetic-file'];
  const uploads=[],toasts=[];
  const env=runtime(async(n,a,d,o)=>a==='detail'?read():write(d,o),{media:{uploadPhotos:async(...args)=>{uploads.push(args);return upload();}}});
  env.app.globalData.user={_id:'synthetic-provider-a',roles:['provider']};
  env.wx.showToast=o=>toasts.push(o.title);
  const page=env.instance('miniprogram/provider/task/task.js');page.onLoad({id:order._id});
  return {env,page,order,uploads,toasts,read:f=>read=f,write:f=>write=f,upload:f=>upload=f,
    writes:()=>env.requests.filter(r=>r[1]==='recordReport')};
}
function reportDraft(f) {
  f.page.setData({ photoByItem: Object.fromEntries(f.page.data.vacantItems.map(item => [item.key, ['synthetic-' + item.key]])) });
}
async function boundary(f,b) {
  if(b==='hidden')f.page.onHide();
  if(b==='unloaded')f.page.onUnload();
  if(b==='changed-user')f.env.app.globalData.user={_id:'synthetic-provider-b'};
  if(b==='changed-order')f.page.orderId='synthetic-order-b';
  if(b==='read-failed'){f.read(async()=>{throw Error('合成读取失败');});await f.page.load();}
  if(b==='refreshed')await f.page.load();
  if(b==='completed')f.page.data.order.status='delivered';
  if(b==='disabled')f.page.data.order.featureEnabled=false;
  if(b==='picker-return'){f.page.onHide();await f.page.onShow();}
}
(async()=>{
  for(const b of ['ready','hidden','unloaded','changed-user','changed-order','read-failed','completed','disabled']) await check('report-before-'+b,async()=>{
    const f=fixture();await f.page.onShow();reportDraft(f);await boundary(f,b);await f.page.submitVacantReport();
    assert.equal(f.writes().length,b==='ready'?1:0,'recordReport call count=' + f.writes().length);
    return {calls:f.writes().length};
  });
  for(const outcome of ['success','failure'])for(const b of ['ready','hidden','unloaded','changed-user','changed-order','refreshed'])await check('report-late-'+outcome+'-'+b,async()=>{
    const f=fixture(),wait=deferred();f.write(()=>wait.promise);await f.page.onShow();reportDraft(f);const op=f.page.submitVacantReport();
    await boundary(f,b);let updates=0;const set=f.page.setData.bind(f.page);f.page.setData=p=>{updates++;set(p);};
    const reads=f.env.requests.filter(r=>r[1]==='detail').length;
    outcome==='success'?wait.resolve({}):wait.reject(Error('合成提交失败'));await op;
    const observed={updates,toasts:f.toasts.length,extraReads:f.env.requests.filter(r=>r[1]==='detail').length-reads};
    if(b!=='ready')assert.deepEqual(observed,{updates:0,toasts:0,extraReads:0},JSON.stringify(observed));
    else assert.equal(f.page.data.busy,false);
    return observed;
  });
  for(const type of ['photos','receipt','vacant'])for(const outcome of ['success','failure'])for(const b of ['ready','unloaded','changed-user','changed-order','picker-return'])await check('media-'+type+'-'+outcome+'-'+b,async()=>{
    const f=fixture(),wait=deferred();f.order.serviceCode=type==='receipt'?'buy':type==='photos'?'trash':'vacant';f.upload(()=>wait.promise);await f.page.onShow();
    const event={currentTarget:{dataset:{type,key:'windows'}}};
    const op=type==='vacant'?f.page.vacantPhoto(event):f.page.photo(event);
    await boundary(f,b);const snapshot=JSON.stringify(f.page.data);
    outcome==='success'?wait.resolve(['synthetic-file']):wait.reject(Error('合成上传失败'));await op;
    if(!['ready','picker-return'].includes(b))assert.equal(JSON.stringify(f.page.data),snapshot,'stale media changed page');
    else if(outcome==='success')assert.equal(type==='vacant'?f.page.data.photoByItem.windows[0]:type==='receipt'?f.page.data.receiptPhoto:f.page.data.photos[0],'synthetic-file');
    else assert.equal(f.page.data.error,'合成上传失败');
    return {uploads:f.uploads.length};
  });
  for(const type of ['photos','receipt','vacant']) {
    const invoke=f=>type==='vacant'?f.page.vacantPhoto({currentTarget:{dataset:{key:'windows'}}}):f.page.photo({currentTarget:{dataset:{type}}});
    const make=()=>{const f=fixture();f.order.serviceCode=type==='receipt'?'buy':type==='photos'?'trash':'vacant';return f;};
    for(const b of ['hidden','unloaded','changed-user','changed-order','read-failed','completed','disabled'])await check('media-before-'+type+'-'+b,async()=>{
      const f=make();await f.page.onShow();await boundary(f,b);await invoke(f);assert.equal(f.uploads.length,0);return {uploads:0};
    });
    for(const b of ['same','changed-user','changed-order','read-failed','completed'])await check('media-result-while-hidden-'+type+'-'+b,async()=>{
      const f=make(),wait=deferred();f.upload(()=>wait.promise);await f.page.onShow();const op=invoke(f);f.page.onHide();
      const snapshot=JSON.stringify(f.page.data);wait.resolve(['synthetic-file']);await op;assert.equal(JSON.stringify(f.page.data),snapshot);
      if(b==='completed')f.order.status='delivered';
      else await boundary(f,b);
      await f.page.onShow();
      const file=type==='vacant'?f.page.data.photoByItem.windows?.[0]:type==='receipt'?f.page.data.receiptPhoto:f.page.data.photos[0];
      assert.equal(Boolean(file),b==='same');assert.equal(f.page.data.uploading,false);return {accepted:!!file};
    });
    await check('media-result-during-return-read-'+type,async()=>{
      const f=make(),wait=deferred(),read=deferred();f.upload(()=>wait.promise);await f.page.onShow();const op=invoke(f);f.page.onHide();
      f.read(()=>read.promise);const show=f.page.onShow();await Promise.resolve();await Promise.resolve();wait.resolve(['synthetic-file']);await op;
      assert.equal(f.page.data.loading,true);assert.equal(f.page.data.photos.length,0);assert.equal(f.page.data.receiptPhoto,'');assert.deepEqual(f.page.data.photoByItem,{});
      read.resolve(f.order);await show;assert.equal(f.page.data.uploading,false);
      assert.equal(type==='vacant'?f.page.data.photoByItem.windows[0]:type==='receipt'?f.page.data.receiptPhoto:f.page.data.photos[0],'synthetic-file');
    });
    await check('media-duplicate-cancel-retry-'+type,async()=>{
      const f=make(),wait=deferred();f.upload(()=>wait.promise);await f.page.onShow();const op=invoke(f);await invoke(f);assert.equal(f.uploads.length,1);
      await f.page.submitVacantReport();await f.page.act({currentTarget:{dataset:{action:'deliver'}}});assert.equal(f.env.requests.filter(r=>r[1]!=='detail').length,0);
      wait.reject({errMsg:'chooseMedia:fail cancel'});await op;assert.equal(f.page.data.error,'');assert.equal(f.page.data.uploading,false);
      f.upload(async()=>['synthetic-file']);await invoke(f);assert.equal(f.uploads.length,2);
      assert.equal(f.uploads[0][2].loading,false);
    });
  }
  await check('report-duplicate-and-retry',async()=>{
    const f=fixture(),wait=deferred();f.write(()=>wait.promise);await f.page.onShow();reportDraft(f);const op=f.page.submitVacantReport();await f.page.submitVacantReport();assert.equal(f.writes().length,1);
    wait.reject(Error('合成提交失败'));await op;assert.equal(f.page.data.busy,false);f.write(async()=>({}));await f.page.submitVacantReport();assert.equal(f.writes().length,2);
    assert.equal(f.writes()[0][3].redirectOnForbidden,false);assert.equal(f.writes()[0][3].silent,true);
  });
  await check('report-old-result-does-not-unlock-new-operation',async()=>{
    const f=fixture(),old=deferred(),next=deferred();let count=0;f.write(()=>++count===1?old.promise:next.promise);await f.page.onShow();reportDraft(f);
    const one=f.page.submitVacantReport();await f.page.load();const two=f.page.submitVacantReport();old.resolve({});await one;assert.equal(f.page.data.busy,true);assert.equal(f.toasts.length,0);
    next.reject(Error('新请求失败'));await two;assert.equal(f.page.data.busy,false);assert.ok(f.page.data.error.startsWith('新请求失败；已核对任务尚未完成'));
  });
  for(const b of ['ready','hidden','changed-user'])await check('report-actual-api-forbidden-'+b,async()=>{
    const f=fixture(),wait=deferred(),effects=[],module={exports:{}};
    vm.runInNewContext(fs.readFileSync('miniprogram/utils/api.js','utf8'),{module,wx:{cloud:{callFunction:()=>wait.promise},showToast:()=>effects.push('toast'),switchTab:()=>effects.push('redirect')}});
    f.write((d,o)=>module.exports.call('vacant','recordReport',d,o));await f.page.onShow();reportDraft(f);const op=f.page.submitVacantReport();await boundary(f,b);
    wait.resolve({result:{ok:false,code:'E_FORBIDDEN',message:'拒绝操作'}});await op;
    assert.deepEqual(effects,[]);if(b==='ready')assert.ok(f.page.data.error.startsWith('拒绝操作；已核对任务尚未完成'));else assert.equal(f.page.data.error,'');
  });
  console.log(JSON.stringify({scope:'Actual page; synthetic responses only; no cloud writes, camera or real files',pass:results.filter(r=>r.pass).length,fail:results.filter(r=>!r.pass).length,results},null,2));
  if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
