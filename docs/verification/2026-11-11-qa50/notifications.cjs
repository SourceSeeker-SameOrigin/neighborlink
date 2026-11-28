// Offline integration: actual payment/provider/admin/notifier code; synthetic in-memory DB and WeChat sender.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = process.cwd(), baseline = process.argv.includes('--baseline');
const modified = ['cloudfunctions/_shared/payFlow.js','cloudfunctions/_shared/adminOrders.js','cloudfunctions/provider/index.js'];
function harness({ status='paid', sendFails=false, conflict=false, noTemplates=false }={}) {
  const messages=[], clone=x=>structuredClone(x);
  const data={orders:[{_id:'test-order',orderNo:'TESTQA50',kind:'service',serviceCode:'trash',status,
    userOpenid:'resident-test',communityId:'test-community',address:{buildingName:'测试楼'},minLevel:1,
    providerId:'test-provider',providerOpenid:'provider-test',pricing:{payAmount:500,goodsCap:0},
    payment:{mode:'mock',paidAt:null},timeline:[],releasedProviderIds:[]}],
  users:[{_id:'test-user',openid:'resident-test',firstPaidAt:new Date(),paidOrderCount:3}],
  providers:[{_id:'test-provider',openid:'provider-test',status:'approved',level:2,onDuty:true,
    communityId:'test-community',insuranceUntil:new Date('2099-01-01')} ]};
  const command={nin:value=>({op:'nin',value}),push:value=>({op:'push',value}),gte:value=>({op:'gte',value}),gt:value=>({op:'gt',value}),inc:value=>({op:'inc',value})};
  const matches=(r,f)=>Object.entries(f).every(([k,v])=>v?.op==='nin'?!(r[k]||[]).some(x=>v.value.includes(x)):r[k]===v);
  function apply(row,patch){for(const [k,v] of Object.entries(patch))row[k]=v?.op==='push'?[...(row[k]||[]),...v.value]:clone(v);}
  const db={command, async runTransaction(work){if(conflict)throw Object.assign(Error('conflict'),{code:'DATABASE_TRANSACTION_CONFLICT'});const saved=clone(data);try{return await work(db);}catch(e){for(const k of Object.keys(data))delete data[k];Object.assign(data,saved);throw e;}},collection(name){return {
    doc(id){return {async get(){return {data:clone((data[name]||[]).find(r=>r._id===id)||null)};},async update({data:patch}){const row=data[name].find(r=>r._id===id);apply(row,patch);return {stats:{updated:1}};},async set({data:value}){(data[name]||=[]).push({_id:id,...clone(value)});}};},
    where(filter){return {async update({data:patch}){const rows=conflict?[]:(data[name]||[]).filter(r=>matches(r,filter));rows.forEach(r=>apply(r,patch));return {stats:{updated:rows.length}};}};}
  };}};
  const config={templateIds:noTemplates?{}:{newTask:'new-task',accepted:'accepted',delivered:'delivered'}};
  const server={db,command,async config(){return config;},async get(table,id){return clone((data[table]||[]).find(r=>r._id===id)||null);},async one(table,filter){return clone((data[table]||[]).find(r=>matches(r,filter))||null);},async all(table){return clone(data[table]||[]);},async feature(){throw Object.assign(Error('off'),{code:'E_FEATURE_OFF'});},entry(actions){return actions;}};
  const cloud={init(){},openapi:{subscribeMessage:{async send(message){messages.push({templateId:message.templateId,status:data.orders[0].status,phrase:message.data.phrase3?.value});if(sendFails)throw Error('synthetic send failure');return {errCode:0};}}}};
  const cache=new Map();
  function load(file){file=path.resolve(root,file).replace(/\/[^/]+\/lib\/shared\//,'/_shared/');if(!path.extname(file))file+='.js';if(cache.has(file))return cache.get(file).exports;
    const m={exports:{}};cache.set(file,m);const rel=path.relative(root,file);
    const source=baseline&&modified.includes(rel)?require('child_process').execFileSync('git',['show','a485e0c:'+rel],{cwd:root,encoding:'utf8'}):fs.readFileSync(file,'utf8');
    function req(name){if(name==='wx-server-sdk')return cloud;if(['crypto','node:crypto','https'].includes(name)){if(name==='https')return {request(){throw Error('Network prohibited');}};return require(name);}if(!name.startsWith('.'))throw Error('Unexpected dependency '+name);if(/(?:^|\/)server$/.test(name))return {createServer:()=>server};return load(path.resolve(path.dirname(file),name));}
    vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{Date,Buffer,URL,JSON,Map,Set,Promise,process:{env:{}},console:{error(){}}},{filename:file})(req,m,m.exports);return m.exports;
  }
  return {data,messages,server,cloud,load,pay:()=>load('cloudfunctions/_shared/payFlow').createPayFlow(cloud,server),provider:()=>load('cloudfunctions/provider/index').main,admin:()=>load('cloudfunctions/_shared/adminOrders').adminOrderActions(cloud,server)};
}
const cases=[];
async function check(name,fn){try{await fn();cases.push({name,passed:true});}catch(e){cases.push({name,passed:false,error:e.message});}}
(async()=>{
 const payment={mode:'mock',amount:500,transactionId:'test-transaction'};
 await check('payment success: paid status without premature resident messages',async()=>{const h=harness({status:'pending_pay'});await h.pay().onPaid(h.data.orders[0],payment);assert.equal(h.data.orders[0].status,'paid');assert.deepEqual(h.messages,[{templateId:'new-task',status:'paid',phrase:'待接单'}]);});
 await check('duplicate payment does not notify or increment statistics',async()=>{const h=harness({status:'pending_pay'});const p=h.pay();await p.onPaid(h.data.orders[0],payment);h.messages.length=0;const count=h.data.users[0].paidOrderCount;await p.onPaid(h.data.orders[0],payment);assert.equal(h.messages.length,0);assert.equal(h.data.users[0].paidOrderCount,count);});
 await check('payment transaction conflict sends nothing',async()=>{const h=harness({status:'pending_pay',conflict:true});await assert.rejects(()=>h.pay().onPaid(h.data.orders[0],payment),e=>e.code==='E_CONFLICT');assert.equal(h.messages.length,0);assert.equal(h.data.orders[0].status,'pending_pay');});
 await check('new-task delivery failure does not undo payment',async()=>{const h=harness({status:'pending_pay',sendFails:true});await h.pay().onPaid(h.data.orders[0],payment);assert.equal(h.data.orders[0].status,'paid');assert.deepEqual(h.messages.map(x=>x.templateId),['new-task']);});
 await check('payment without templates sends no messages',async()=>{const h=harness({status:'pending_pay',noTemplates:true});await h.pay().onPaid(h.data.orders[0],payment);assert.equal(h.data.orders[0].status,'paid');assert.equal(h.messages.length,0);});
 for(const type of ['provider','admin']) {
   const run=h=>type==='provider'?h.provider().accept({orderId:'test-order'},{openid:'provider-test'}):h.admin().assign({orderId:'test-order',providerId:'test-provider'},{openid:'admin-test',user:{roles:['admin']}});
   await check(type+' success notifies accepted only after persistence',async()=>{const h=harness();await run(h);assert.deepEqual(h.messages,[{templateId:'accepted',status:'accepted',phrase:'已接单'}]);});
   await check(type+' duplicate action sends no additional notification',async()=>{const h=harness();await run(h);h.messages.length=0;await assert.rejects(()=>run(h));assert.equal(h.messages.length,0);});
   await check(type+' conditional update conflict sends nothing',async()=>{const h=harness({conflict:true});await assert.rejects(()=>run(h),e=>e.code==='E_CONFLICT');assert.equal(h.messages.length,0);assert.equal(h.data.orders[0].status,'paid');});
   await check(type+' notification failure does not roll back accepted order',async()=>{const h=harness({sendFails:true});const r=await run(h);assert.equal(r.status,'accepted');assert.equal(h.data.orders[0].status,'accepted');assert.equal(h.messages.length,1);});
   await check(type+' missing template skips notification',async()=>{const h=harness({noTemplates:true});await run(h);assert.equal(h.data.orders[0].status,'accepted');assert.equal(h.messages.length,0);});
 }
 await check('completion sends delivered after persistence; repeat sends nothing',async()=>{const h=harness({status:'in_service'});const event={orderId:'test-order',photos:['cloud://synthetic/orders/test-order/complete.jpg']};await h.provider().deliver(event,{openid:'provider-test'});assert.deepEqual(h.messages,[{templateId:'delivered',status:'delivered',phrase:'待确认'}]);await h.provider().deliver(event,{openid:'provider-test'});assert.equal(h.messages.length,1);});
 const result={mode:baseline?'baseline a485e0c':'working tree',scope:'offline actual entry integration; synthetic records only; no cloud or real notifications',passed:cases.filter(x=>x.passed).length,total:cases.length,cases};console.log(JSON.stringify(result,null,2));if(result.passed!==result.total)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
