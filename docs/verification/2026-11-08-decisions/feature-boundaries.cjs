// Executes actual cloud entries against synthetic records; selected cancellation and event creation tests mutate only the local fixture. No network or cloud writes.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = process.cwd();
function fixture({ bound = true, global = false, local = false, roles = ['resident'], records = {}, allowWrites = false, securityResult = null } = {}) {
  const user = { _id: 'u', openid: 'actor', roles, communityId: bound ? 'c' : null };
  const data = { users: [user], config: [{ _id: 'global', complaintWindowHours:24, blacklist:[], features: Object.fromEntries(['board','idle','events','chat','coupons','merchants','stationDelivery','autoPayout','notices'].map(k=>[k, global])) }],
    communities: [{ _id: 'c', status: 'active', features: local === null ? {} : Object.fromEntries(['board','idle','events','chat','coupons','merchants','stationDelivery','autoPayout','notices'].map(k=>[k, local])) }], ...records };
  const op = (name, value) => ({ op: name, value });
  const command = new Proxy({}, { get: (_, name) => value => op(name, value) });
  function matches(row, filter) { return Object.entries(filter).every(([key, value]) => {
    if (value && value.op === 'in') return Array.isArray(row[key]) ? row[key].some(x=>value.value.includes(x)) : value.value.includes(row[key]);
    if (value && value.op === 'neq') return row[key] !== value.value;
    if (value && value.op) throw Error('Unsupported read predicate ' + value.op);
    return row[key] === value;
  }); }
  const writes = [];
  function update(table, rows, patch) { if (!allowWrites) throw Error('Unexpected write'); rows.forEach(row=>Object.assign(row, patch.data)); writes.push({table, count:rows.length}); return {stats:{updated:rows.length}}; }
  const db = { command, runTransaction: work=>work(db), collection(table) { let filter = {}, limit = 100;
    const chain = { doc(id) { return { async get() { return {data:(data[table]||[]).find(row=>row._id===id)||null}; }, async update(patch) { return update(table,(data[table]||[]).filter(row=>row._id===id),patch); }, async set({data:value}) { if(!allowWrites) throw Error('Unexpected write'); (data[table] ||= []).push({_id:id,...value}); writes.push({table,id}); } }; }, where(value) { filter = value; return chain; }, limit(value) { limit = value; return chain; },
      orderBy() { return chain; }, skip() { return chain; }, async get() { return { data: (data[table] || []).filter(row=>matches(row, filter)).slice(0, limit) }; },
      add() { throw Error('Unexpected write'); }, async update(patch) { return update(table,(data[table]||[]).filter(row=>matches(row,filter)),patch); } }; return chain;
  }};
  const cloud = { init() {}, database:()=>db, getWXContext:()=>({OPENID:'actor'}), DYNAMIC_CURRENT_ENV:'offline',
    getTempFileURL() { throw Error('Unexpected signing'); }, openapi:{security:{async msgSecCheck() { if(!securityResult) throw Error('Unexpected security call'); return securityResult; }}} };
  function load(file, cache = new Map()) {
    file = path.resolve(file); if (!path.extname(file)) file += '.js';
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports:{}}; cache.set(file,module);
    const requireLocal = name => { if (name === 'wx-server-sdk') return cloud; if (['crypto','node:crypto'].includes(name)) return require('crypto');
      if (name === 'https') return {request(){throw Error('Unexpected network');}};
      if (!name.startsWith('.')) throw Error('Unknown dependency '+name); return load(path.resolve(path.dirname(file),name),cache); };
    vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})', { Date, JSON, Set, Map, Promise, Buffer, process:{env:{}}, console:{error(){}} }, {filename:file})(requireLocal,module,module.exports);
    return module.exports;
  }
  return { data, writes, call: (name, action, input={})=>load('cloudfunctions/'+name+'/index.js').main({...input,action}) };
}
(async()=>{
 const results=[];
 async function check(label, f) { try { await f();results.push({label,status:'PASS'}); } catch(e) { results.push({label,status:'FAIL',message:e.message}); } }
 const entries=[['board','list'],['idle','list'],['chat','list'],['coupon','center'],['coupon','mine'],['merchant','myApplication'],['merchant','listForCommunity'],['content','listNotices'],['station','myApplication'],['station','applicationOptions'],['event','list'],['payout','list']];
 for(const [name,action]of entries) for(const bound of [false,true]) await check(`${name}.${action} off bound=${bound}`,async()=>{const result=await fixture({bound}).call(name,action,bound?{communityId:'c'}:{});assert.equal(result.code,'E_FEATURE_OFF',JSON.stringify(result));});
 for(const [name,action]of entries) await check(`${name}.${action} global on but unbound prompts binding`,async()=>{const result=await fixture({bound:false,global:true}).call(name,action);assert.equal(result.code,'E_INVALID_PARAM',JSON.stringify(result));assert.match(result.message,/绑定/);});
 await check('global on/local off uses local override',async()=>assert.equal((await fixture({global:true,local:false}).call('coupon','center')).code,'E_FEATURE_OFF'));
 await check('global off/local on allows read',async()=>assert.equal((await fixture({global:false,local:true}).call('coupon','center')).ok,true));
 for(const [name,action,records,input]of [
  ['board','detail',{posts:[{_id:'p',communityId:'other'}]},{postId:'p'}],
  ['idle','detail',{idleItems:[{_id:'i',communityId:'other'}]},{itemId:'i'}],
  ['event','detail',{events:[{_id:'e',communityIds:['other']}]},{eventId:'e'}],
  ['payout','get',{payouts:[{_id:'p',openid:'other',communityId:'c'}]},{payoutId:'p'}]
 ]) await check(`${name}.${action} unrelated record returns forbidden before off`,async()=>{const result=await fixture({records}).call(name,action,input);assert.equal(result.code,'E_FORBIDDEN',JSON.stringify(result));});
 for(const [name,action,input]of [['coupon','adminTemplates',{}],['merchant','adminList',{}],['station','listApplications',{}],['content','listAds',{}],['content','listNotices',{communityId:'c'}],['event','adminList',{communityId:'c'}]]) {
  await check(`${name}.${action} authorized admin prepares while off`,async()=>{const result=await fixture({roles:['resident','admin']}).call(name,action,input);assert.equal(result.ok,true,JSON.stringify(result));});
  if(action!=='listNotices')await check(`${name}.${action} ordinary user has no preparation exemption`,async()=>{const result=await fixture().call(name,action,input);assert.equal(result.code,'E_FORBIDDEN',JSON.stringify(result));});
 }
 await check('home aggregation remains successful empty while off',async()=>{const result=await fixture().call('content','homeContent',{communityId:'c'});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.ads.length,0);});
 for(const [name,action,records,input]of [
 ['board','detail',{posts:[{_id:'p',communityId:'c',moderationHidden:true,authorOpenid:'other'}]},{postId:'p'}],
 ['idle','detail',{idleItems:[{_id:'i',communityId:'c',moderationHidden:true,sellerOpenid:'other'}]},{itemId:'i'}]
 ]) await check(`${name} hidden record is forbidden before feature lookup`,async()=>{assert.equal((await fixture({records}).call(name,action,input)).code,'E_FORBIDDEN');});

 const baseOrder={_id:'o',kind:'service',serviceCode:'pet',communityId:'c',userOpenid:'actor',status:'pending_pay',
  pricing:{payAmount:100,goodsCap:0},payment:{mode:'mock'},detail:{entry:'key'},timeline:[],refunds:[],address:{},photos:[]};
 for(const action of ['retryPayment','mockPay','confirm']) {
  await check('order.'+action+' owned extension off blocks before payment/write',async()=>assert.equal((await fixture({records:{orders:[baseOrder]}}).call('order',action,{orderId:'o'})).code,'E_FEATURE_OFF'));
  await check('order.'+action+' unrelated record denied before feature',async()=>assert.equal((await fixture({records:{orders:[{...baseOrder,userOpenid:'other'}]}}).call('order',action,{orderId:'o'})).code,'E_FORBIDDEN'));
 }
 await check('order.detail own historical extension readable, pay hidden and cancel retained',async()=>{
  const result=await fixture({records:{orders:[baseOrder]}}).call('order','detail',{orderId:'o'});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.featureEnabled,false);assert.equal(result.data.canPay,false);assert.equal(result.data.canCancel,true);
 });
 await check('order.detail stranger remains forbidden with extension off',async()=>assert.equal((await fixture({records:{orders:[{...baseOrder,userOpenid:'other'}]}}).call('order','detail',{orderId:'o'})).code,'E_FORBIDDEN'));
 await check('pet.listVisits historical record remains readable while off',async()=>assert.equal((await fixture({records:{orders:[baseOrder],visits:[]}}).call('pet','listVisits',{orderId:'o'})).ok,true));
 await check('idle.sales historical list remains readable while off',async()=>assert.equal((await fixture().call('idle','sales')).ok,true));
 await check('merchant.merchantOrders authorized history remains readable while off',async()=>assert.equal((await fixture({roles:['resident','merchant'],records:{merchants:[{_id:'m',status:'approved',staffOpenids:['actor'],communityIds:['c']}]}}).call('merchant','merchantOrders')).ok,true));
 for(const action of ['quoteBooking','merchantTransition','completeBooking']) await check('merchant.'+action+' uses own record feature after merchant permission',async()=>{
  const f=fixture({roles:['resident','merchant'],records:{merchants:[{_id:'m',status:'approved',staffOpenids:['actor'],communityIds:['c']}],orders:[{...baseOrder,kind:'merchant',merchantId:'m'}]}});
  assert.equal((await f.call('merchant',action,{orderId:'o'})).code,'E_FEATURE_OFF');
 });
 for(const action of ['start','deliver']) await check('provider.'+action+' blocks assigned extension while off',async()=>{
  const f=fixture({records:{providers:[{_id:'p',openid:'actor',status:'approved',level:2}],orders:[{...baseOrder,status:'accepted',providerId:'p',providerOpenid:'actor'}]}});
  assert.equal((await f.call('provider',action,{orderId:'o'})).code,'E_FEATURE_OFF');
 });

 await check('order.cancel unpaid quote closes while merchants off without payment/network',async()=>{
  const f=fixture({allowWrites:true,records:{orders:[{...baseOrder,kind:'merchant',status:'pending_quote'}]}});
  const result=await f.call('order','cancel',{orderId:'o'});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(f.data.orders[0].status,'closed');assert.equal(f.writes.length,1);
 });
 await check('event.cancelSignup free historical signup releases capacity while off',async()=>{
  const {signupId}=require(path.join(root,'cloudfunctions/_shared/eventData'));
  const f=fixture({allowWrites:true,records:{events:[{_id:'e',communityIds:['c'],signupDeadline:new Date(Date.now()+86400000),signupCount:1}],signups:[{_id:signupId('e','actor'),status:'signed',orderId:null}]}});
  const result=await f.call('event','cancelSignup',{eventId:'e'});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(f.data.signups[0].status,'cancelled');assert.equal(f.data.events[0].signupCount,0);
 });

 const eventInput={title:'合成测试活动',desc:'仅本地内存',communityIds:['c'],type:'charity',capacity:10,fee:0,
  location:'合成地点',signupDeadline:new Date(Date.now()+3600000),startAt:new Date(Date.now()+7200000),endAt:new Date(Date.now()+10800000),images:[],sponsors:[]};
 await check('D39 administrator creates distinct event drafts with imported crypto while feature off',async()=>{
  const f=fixture({roles:['resident','admin'],allowWrites:true,securityResult:{result:{suggest:'pass'}}});
  const first=await f.call('event','create',eventInput),second=await f.call('event','create',eventInput);
  assert.equal(first.ok,true,JSON.stringify(first));assert.equal(second.ok,true,JSON.stringify(second));assert.match(first.data.eventId,/^ev_[a-f0-9]{32}$/);assert.notEqual(first.data.eventId,second.data.eventId);
  assert.equal(f.data.events.length,2);assert.equal(f.data.events[0].status,'draft');assert.equal(f.data.events[0].ownerOpenid,'actor');assert.equal(f.writes.length,2);
 });
 await check('D39 ordinary resident cannot create event or invoke content service',async()=>{
  const f=fixture({allowWrites:true});const result=await f.call('event','create',eventInput);assert.equal(result.code,'E_FORBIDDEN');assert.equal(f.writes.length,0);
 });
 await check('D39 rejected content never creates an event record',async()=>{
  const f=fixture({roles:['resident','admin'],allowWrites:true,securityResult:{result:{suggest:'risky'}}});const result=await f.call('event','create',eventInput);assert.equal(result.code,'E_BLOCKED');assert.equal(f.writes.length,0);
 });
 await check('D38 existing signup detail remains readable while off without QR generation or new signup',async()=>{
  const {signupId}=require(path.join(root,'cloudfunctions/_shared/eventData'));
  const f=fixture({records:{events:[{_id:'e',communityIds:['c'],status:'published',capacity:10,images:[]}],signups:[{_id:signupId('e','actor'),status:'signed'}]}});
  const result=await f.call('event','detail',{eventId:'e'});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.canSignup,false);assert.equal(result.data.featureEnabled,false);assert.equal(f.writes.length,0);
 });
 const report={scope:'real entry code with isolated synthetic database; selected cancellation/event creation writes only in memory, no cloud/identity changes',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results};
 fs.writeFileSync(process.argv[2] || 'docs/verification/2026-11-08-decisions/feature-boundaries.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
})();
