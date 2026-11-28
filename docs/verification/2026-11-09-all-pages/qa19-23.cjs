// Real page methods in an isolated VM; all API, upload and payment outcomes are synthetic.
const fs = require('fs');
const assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
async function test(name, fn) { try { await fn(); results.push({name,status:'PASS'}); } catch(e) {results.push({name,status:'FAIL',message:e.stack});} }
function deferred(){let resolve; const promise=new Promise(r=>resolve=r);return {resolve,promise};}
function page(route,handler,options={}){
 const r=runtime(handler, options);r.app.globalData.user={_id:'fixture',communityId:'fixture-community',roles:['resident'],addresses:[]};
 return {r,p:r.instance('miniprogram/'+route+'.js')};
}
(async()=>{
 for(const route of ['provider/earnings/earnings','idle/income/income']){
  await test('QA19读取失败/成功零收入/操作失败/刷新失败及恢复 '+route,async()=>{
   let readFail=true,writeFail=false;
   const {p,r}=page(route,async(f,a)=>{if(a==='create'){if(writeFail)throw Error('合成提现失败');return {state:'processing'};} if(readFail)throw Error('合成读取失败');return {list:[],pending:0,settled:0,available:1000,canWithdraw:true,payoutEnabled:true,hasMore:true};});
   const load=()=>p.load(true), act=()=>p.createPayout?p.createPayout():p.withdraw();
   await load();assert(!p.data.ready&&p.data.loadError);const n=r.requests.length;await act();assert.equal(r.requests.length,n);
   readFail=false;await load();assert(p.data.ready);assert.equal(p.data.pending,'0.00');
   writeFail=true;await act();assert(p.data.ready&&!p.data.loadError);assert.equal(p.data.error,'合成提现失败');
   readFail=true;await load();assert(!p.data.ready&&p.data.loadError);readFail=false;await load();assert(p.data.ready);
   const xml=fs.readFileSync('miniprogram/'+route+'.wxml','utf8');assert(xml.includes('<block wx:if="{{ready && !loading}}">'));
  });
  await test('QA19读取进行中拒绝提现及重复读取 '+route,async()=>{
   const d=deferred(); const {p,r}=page(route,async()=>{await d.promise;return {list:[],pending:0,settled:0,available:0};});
   const pending=p.load(true);await Promise.resolve();await p.load(true);await (p.createPayout?p.createPayout():p.withdraw());assert(!p.data.ready);d.resolve();await pending;assert.equal(r.requests.length,2);assert(r.requests.every(x=>x[1]!=='create'));
  });
 }
 const forms=[['board/create/create','submit','photos','create'],['idle/create/create','submit','photos','create'],['merchant/apply/apply','submit','upload','apply'],['merchant/services/services','save','photos','upsertService']];
 for(const [route,submit,upload,action] of forms){
  await test('QA20初始化失败阻止业务及上传，恢复保留草稿，提交失败仍可重试 '+route,async()=>{
   let fail=true,uploads=0,writes=0;
   const {p,r}=page(route,async(f,a)=>{if(a===action){writes++;throw Error('合成提交失败');}if(fail)throw Error('合成读取失败');return {enabledFeatures:{board:true,idle:true,travelCarry:true},dutyWindows:[{start:'07:00',end:'23:00'}],list:[],merchant:null};},{media:{uploadPhotos:async()=>{uploads++;return ['synthetic-file'];}}});
   if(route.startsWith('board')||route.startsWith('idle'))p.onLoad({});
   Object.assign(p.data,{title:'保留草稿',name:'合成商家',priceYuan:'5',price:'5',needEnterHome:true});
   await p.load();await p[submit]();await p[upload]();assert.equal(writes,0);assert.equal(uploads,0);assert(p.data.loadError&&!p.data.ready);
   fail=false;await p.load();assert(p.data.ready&&!p.data.loadError);assert.equal(p.data.title,'保留草稿');assert.equal(p.data.needEnterHome,true);
   await p[upload]();assert.equal(uploads,1);await p[submit]();assert.equal(writes,1);assert(p.data.ready&&!p.data.loadError);assert.equal(p.data.title,'保留草稿');
   await p[submit]();assert.equal(writes,2);
   fail=true;await p.load();await p[submit]();assert.equal(writes,2);assert.equal(p.data.title,'保留草稿');
   const xml=fs.readFileSync('miniprogram/'+route+'.wxml','utf8');assert(xml.includes('wx:if="{{loadError}}"'));for(const a of [submit,upload]){const tag=xml.match(new RegExp('<button[^>]*bindtap="'+a+'"[^>]*>'))[0];assert(tag.includes('!ready'));}
  });
  await test('QA20初始化慢响应及重复点击保护 '+route,async()=>{
   let gate=deferred(),reads=0,writes=0; const {p}=page(route,async(f,a)=>{if(a===action){writes++;await gate.promise;throw Error('合成业务失败');}reads++;await gate.promise;return {enabledFeatures:{board:true,idle:true},list:[],merchant:null};});
   if(route.startsWith('board')||route.startsWith('idle'))p.onLoad({});p.data.priceYuan='5';const loading=p.load();await Promise.resolve();await p.load();await p[submit]();assert.equal(writes,0);gate.resolve();await loading;assert.equal(reads,1);
   gate=deferred();const first=p[submit]();await p[submit]();assert.equal(writes,1);gate.resolve();await first;
  });
 }
 await test('QA20闲置编辑重读不覆盖已编辑草稿',async()=>{
  let fail=false;const {p}=page('idle/create/create',async(f,a)=>{if(fail)throw Error('合成断网');return a==='detail'?{item:{seller:true,title:'旧标题',desc:'旧描述',category:'其他',price:500,condition:'used',negotiable:true,scope:'community',images:[],tradeMode:'offline'}}:{enabledFeatures:{idle:true}};});
  p.onLoad({id:'fixture-item'});await p.load();p.data.title='新标题';fail=true;await p.load();fail=false;await p.load();assert.equal(p.data.title,'新标题');
 });
 await test('QA20商家手填电话在重试后保留',async()=>{
  const {p}=page('merchant/apply/apply',async()=>({merchant:null}));await p.load();p.input({currentTarget:{dataset:{field:'phone'}},detail:{value:'synthetic-phone'}});await p.load();assert.equal(p.data.phone,'synthetic-phone');
 });
 await test('QA20聊天无会话/首次拉取失败均不能发消息或上传',async()=>{
  let upload=0;const {p,r}=page('chat/room/room',async()=>{throw Error('合成拉取失败');},{media:{uploadPhotos:async()=>{upload++;return ['synthetic-file'];}}});p.onLoad({});p.data.content='保留消息';await p.start();await p.send();await p.image();await p.sendMessage({type:'text',content:'x'});assert.equal(r.requests.length,0);assert.equal(upload,0);
  p.conversationId='fixture';await p.start();assert(p.data.loadError&&!p.data.ready);assert(!p.timer);await p.send();assert.equal(r.requests.length,1);assert.equal(p.data.content,'保留消息');
 });
 await test('QA20聊天恢复/发送失败草稿保留/成功/只读/后续读取失败',async()=>{
  let readFail=false,sendFail=true,readOnly=false,writes=0;const {p}=page('chat/room/room',async(f,a)=>{if(a==='send'){writes++;if(sendFail)throw Error('合成发送失败');return {};}if(readFail)throw Error('合成断网');return {list:[],unread:0,readOnly};});p.onLoad({conversationId:'fixture'});p.data.content='消息草稿';await p.start();assert(p.data.ready);await p.send();assert.equal(p.data.content,'消息草稿');assert(p.data.ready&&!p.data.loadError);sendFail=false;await p.send();assert.equal(p.data.content,'');
  readOnly=true;await p.pull();p.data.content='只读草稿';await p.send();assert.equal(writes,2);readFail=true;await p.pull();assert(!p.data.ready&&p.data.loadError);await p.send();assert.equal(writes,2);readFail=false;await p.start();assert(p.data.ready);p.stop();
 });
 await test('QA20聊天离页后迟到响应不恢复发送或轮询',async()=>{
  const d=deferred();const {p}=page('chat/room/room',async()=>{await d.promise;return {list:[],unread:0,readOnly:false};});p.onLoad({conversationId:'fixture'});const loading=p.start();await Promise.resolve();p.onHide();d.resolve();await loading;assert(!p.data.ready&&!p.timer);
 });
 function booking(handler,options){const f=page('shops/booking/booking',handler,options);f.p.onLoad({serviceId:'fixture-service'});f.p.data.requirement='需求';return f;}
 await test('QA21/QA94结果未知先核对，确认后复用编号',async()=>{
  const {p,r}=booking(async(n,a)=>{if(a==='lookupBooking')return {orderId:null};throw Error('合成响应丢失');});
  await p.onShow();await p.submit();await p.submit();assert.equal(p.data.recovery,'confirm');await p.submit();
  assert.deepEqual(r.requests.map(x=>x[1]),['createBooking','lookupBooking','createBooking']);
  assert.equal(new Set(r.requests.map(x=>x[2].requestId)).size,1);assert.equal(r.navigation.length,0);
 });
 for(const mode of ['pending_quote','paymentError','paymentThrow','paymentFalse','paid'])await test('QA21确认订单后只去详情，不重建 '+mode,async()=>{
  let pays=0;const {p,r}=booking(async()=>({orderId:'fixture-order',status:mode==='pending_quote'?'pending_quote':'pending_pay',paymentError:mode==='paymentError'}),{payment:{pay:async()=>{pays++;if(mode==='paymentThrow')throw Error('合成支付取消');return mode!=='paymentFalse';}}});await p.onShow();await p.submit();assert(r.navigation.some(n=>n[1]==='/pages/orders/detail?id=fixture-order'));await p.submit();assert.equal(r.requests.length,1);assert.equal(pays,['pending_quote','paymentError'].includes(mode)?0:1);
 });
 await test('QA21慢响应重复点击仅一个创建请求',async()=>{const d=deferred();const {p,r}=booking(async()=>{await d.promise;return {orderId:'fixture-order',status:'pending_quote'};});await p.onShow();const a=p.submit();await p.submit();assert.equal(r.requests.length,1);d.resolve();await a;});
 await test('QA23地址展示无undefined且原ID、排序保留',async()=>{const {p,r}=booking(async()=>({}));r.app.globalData.user.addresses=[{id:'a',buildingName:'测试楼',unit:'测试单元',room:'测试房',contactName:''},{id:'b'}];await p.onShow();assert.equal(p.data.addresses[0].label,'测试楼 · 测试单元 · 测试房');assert.equal(p.data.addresses[1].label,'已绑定地址');assert.deepEqual(Array.from(p.data.addresses,x=>x.id),['a','b']);});
 const report={scope:'隔离真实页面方法、合成响应；不代表真实云成功、真实支付或全部视觉验收',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results};fs.writeFileSync(__dirname+'/qa19-23.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.total!==report.passed)process.exitCode=1;
})();
