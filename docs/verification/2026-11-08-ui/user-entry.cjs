// Executes actual cloud entries against synthetic records; selected cancellation and event creation tests mutate only the local fixture. No network or cloud writes.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = process.cwd();
function fixture({ bound = true, global = false, local = false, roles = ['resident'], records = {}, allowWrites = false, securityResult = null, failBindEvent = false, failCouponRead = false, transactionConflict = false } = {}) {
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
  const faults = { failCouponRead, failTemplateId: null };
  function update(table, rows, patch) { if (!allowWrites) throw Error('Unexpected write'); rows.forEach(row=>Object.assign(row, patch.data)); writes.push({table, count:rows.length}); return {stats:{updated:rows.length}}; }
  const db = { command, async runTransaction(work) {
    if(transactionConflict) throw Object.assign(Error('conflict'),{code:'DATABASE_TRANSACTION_CONFLICT'});
    const snapshot=JSON.parse(JSON.stringify(data)), count=writes.length;
    try { return await work(db); } catch(error) {
      for(const key of Object.keys(data)) delete data[key]; Object.assign(data,snapshot); writes.length=count; throw error;
    }
  }, collection(table) { let filter = {}, limit = 100;
    const chain = { doc(id) { return { async get() { if(table==='couponTemplates' && id===faults.failTemplateId) throw Error('synthetic second template failure'); return {data:(data[table]||[]).find(row=>row._id===id)||null}; }, async update(patch) { return update(table,(data[table]||[]).filter(row=>row._id===id),patch); }, async set({data:value}) { if(failBindEvent && table==='events') throw Error('synthetic event write failure'); if(!allowWrites) throw Error('Unexpected write'); (data[table] ||= []).push({_id:id,...value}); writes.push({table,id}); } }; }, where(value) { filter = value; return chain; }, limit(value) { limit = value; return chain; },
      orderBy() { return chain; }, skip() { return chain; }, async get() { if(faults.failCouponRead && table==='couponTemplates') throw Error('synthetic coupon failure'); return { data: (data[table] || []).filter(row=>matches(row, filter)).slice(0, limit) }; },
      async add({data:value}) { if(failBindEvent && table === 'events' && value.type === 'bind') throw Error('synthetic event write failure'); if(!allowWrites || table !== 'events') throw Error('Unexpected write'); (data[table] ||= []).push(value); writes.push({table}); return {_id:'local-event'}; }, async update(patch) { return update(table,(data[table]||[]).filter(row=>matches(row,filter)),patch); } }; return chain;
  }};
  const cloud = { init() {}, database:()=>db, getWXContext:()=>({OPENID:'actor'}), DYNAMIC_CURRENT_ENV:'offline',
    getTempFileURL() { throw Error('Unexpected signing'); }, openapi:{phonenumber:{async getPhoneNumber(){return {phoneInfo:{purePhoneNumber:'13800000000'}};}},security:{async msgSecCheck() { if(!securityResult) throw Error('Unexpected security call'); return securityResult; }}} };
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
  return { data, writes, faults, call: (name, action, input={})=>load('cloudfunctions/'+name+'/index.js').main({...input,action}) };
}

(async()=>{
 const results=[];
 async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',message:e.message});}}
 const input={communityId:'c',buildingId:'b',unit:'1',room:'302',phone:'13800000000',privacyAgreed:true};
 const create=(user={},options={})=>fixture({allowWrites:true,bound:false,...options,records:{users:[{_id:'u',openid:'actor',roles:['resident'],phone:'',addresses:[],...user}],buildings:[{_id:'b',communityId:'c',name:'测试楼栋',units:['1']}]}});
 await check('Actual user.setAddress accepts manual phone and writes masked public result',async()=>{const f=create(),r=await f.call('user','setAddress',input);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.data.phone,'138****0000');assert.equal(r.data.phoneSource,'manual');assert.equal(r.data.phoneVerified,false);assert.equal(f.data.users[0].phone,'13800000000');assert.equal(f.data.users[0].addresses[0].contactPhone,'13800000000');assert.equal(f.writes.filter(x=>x.table==='users').length,1);});
 await check('Client forged identity, roles, source and verification are ignored',async()=>{const f=create(),r=await f.call('user','setAddress',{...input,openid:'other',roles:['admin'],phoneSource:'wechat',phoneVerified:true});assert.equal(r.ok,true);assert.equal(f.data.users[0].openid,'actor');assert.deepEqual(f.data.users[0].roles,['resident']);assert.equal(r.data.phoneVerified,false);assert.equal(r.data.phoneSource,'manual');});
 for(const patch of [{phone:'123'},{phone:13800000000},{phone:null},{phone:undefined},{privacyAgreed:false},{buildingId:'other'},{unit:'other'},{room:''},{communityId:'other'}])await check('Invalid input causes no user or event writes: '+JSON.stringify(patch),async()=>{const f=create(),r=await f.call('user','setAddress',{...input,...patch});assert.equal(r.ok,false);assert.equal(f.writes.length,0);assert.equal(f.data.users[0].phone,'');});
 await check('Existing verified phone retained only if no replacement is supplied',async()=>{const f=create({phone:'13800000000',phoneSource:'wechat',phoneVerified:true});const r=await f.call('user','setAddress',{...input,phone:undefined});assert.equal(r.ok,true);assert.equal(r.data.phoneVerified,true);});
 await check('Re-entering a previously verified phone is recorded as manual',async()=>{const f=create({phone:'13800000000',phoneSource:'wechat',phoneVerified:true});const r=await f.call('user','setAddress',input);assert.equal(r.data.phoneVerified,false);assert.equal(r.data.phoneSource,'manual');});
 await check('Legacy number gets no retroactive verification',async()=>{const f=create({phone:'13800000000'}),r=await f.call('user','setAddress',{...input,phone:undefined});assert.equal(r.ok,true);assert.equal(r.data.phoneSource,'unknown');assert.equal(r.data.phoneVerified,false);});
 await check('Blocked real user cannot save with manual phone',async()=>{const f=create({blocked:true}),r=await f.call('user','setAddress',input);assert.equal(r.code,'E_FORBIDDEN');assert.equal(f.writes.length,0);});
 await check('Genuine bindPhone action records WeChat source after provider response',async()=>{const f=create(),r=await f.call('user','bindPhone',{code:'synthetic-code'});assert.equal(r.ok,true);assert.equal(r.data.phoneVerified,true);assert.equal(r.data.phoneSource,'wechat');assert.equal(r.data.phone,'138****0000');});
 await check('Bind-event failure rolls back phone, address and event together',async()=>{
   const f=create({}, {failBindEvent:true}),r=await f.call('user','setAddress',input);
   assert.equal(r.ok,false);assert.equal(r.code,'E_INTERNAL');assert.equal(f.data.users[0].phone,'');assert(!f.data.users[0].buildingId);assert.equal(f.data.users[0].addresses.length,0);assert.equal(f.writes.length,0);assert(!f.data.events?.length);
 });
 await check('Transaction conflict returns E_CONFLICT without any profile change',async()=>{
   const f=create({}, {transactionConflict:true}),r=await f.call('user','setAddress',input);
   assert.equal(r.code,'E_CONFLICT');assert.equal(f.writes.length,0);assert.equal(f.data.users[0].phone,'');
 });
 await check('Coupon failure returns binding success and pending status after commit',async()=>{
   const f=create({}, {local:true,failCouponRead:true}),r=await f.call('user','setAddress',input);
   assert.equal(r.ok,true);assert.equal(r.data.welcomeCouponStatus,'pending');assert.equal(f.data.users[0].buildingId,'b');assert.equal(f.data.events.length,1);assert.equal(f.data.events[0].openid,'actor');
 });
 await check('Disabled coupons do not turn binding into failure',async()=>{
   const f=create(),r=await f.call('user','setAddress',input);assert.equal(r.ok,true);assert.equal(r.data.welcomeCouponStatus,'unavailable');
 });
 await check('Retry recovers partial issuance and never duplicates coupons or counters',async()=>{
   const f=create({}, {local:true,failCouponRead:true});await f.call('user','setAddress',input);
   f.faults.failCouponRead=false;
   f.data.couponTemplates=[{_id:'welcome',issueMode:'auto_new_user',status:'active',communityIds:['c'],totalLimit:10,perUserLimit:1,validDays:30,issued:0}];
   const first=await f.call('user','retryWelcomeCoupons',{openid:'victim',communityId:'other'});
   assert.equal(first.ok,true,JSON.stringify(first));const second=await f.call('user','retryWelcomeCoupons');assert.equal(second.ok,true);
   assert.equal(f.data.coupons.length,1);assert.equal(f.data.coupons[0].openid,'actor');assert.equal(f.data.couponTemplates[0].issued,1);assert.equal(f.data.users[0].couponCounts.welcome,1);assert.equal(f.data.events.length,1);
 });
 await check('A failure after one template preserves that coupon and completes only the missing template on retry',async()=>{
   const f=create({}, {local:true});const template={issueMode:'auto_new_user',status:'active',communityIds:['c'],totalLimit:10,perUserLimit:1,validDays:30,issued:0};
   f.data.couponTemplates=[{...template,_id:'first'},{...template,_id:'second'}];f.faults.failTemplateId='second';
   const r=await f.call('user','setAddress',input);assert.equal(r.ok,true);assert.equal(r.data.welcomeCouponStatus,'pending');assert.equal(f.data.coupons.length,1);
   f.faults.failTemplateId=null;const retry=await f.call('user','retryWelcomeCoupons');assert.equal(retry.ok,true,JSON.stringify(retry));assert.equal(f.data.coupons.length,2);assert(f.data.couponTemplates.every(t=>t.issued===1));assert.equal(f.data.users[0].couponCounts.first,1);assert.equal(f.data.users[0].couponCounts.second,1);
 });
 await check('Retry keeps feature and binding checks and never issues for another identity',async()=>{
   const disabled=create(),off=await disabled.call('user','retryWelcomeCoupons',{openid:'other'});assert.equal(off.code,'E_FEATURE_OFF');assert.equal(disabled.writes.length,0);
   const unbound=create({}, {global:true,local:true}),r=await unbound.call('user','retryWelcomeCoupons');assert.equal(r.ok,false);assert.equal(unbound.writes.length,0);
   const blocked=create({blocked:true},{local:true}),b=await blocked.call('user','retryWelcomeCoupons');assert.equal(b.code,'E_FORBIDDEN');assert.equal(blocked.writes.length,0);
 });
 await check('Retry failure keeps saved address and can be repeated later',async()=>{
   const f=create({}, {local:true,failCouponRead:true});await f.call('user','setAddress',input);
   const r=await f.call('user','retryWelcomeCoupons');assert.equal(r.ok,false);assert.equal(f.data.users[0].buildingId,'b');assert.equal(f.data.events.length,1);
 });
 const report={resolvedIssues:['D45'],scope:'Actual cloud entry and server boundary, in-memory synthetic DB/OpenAPI; no network or real writes',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results};require('fs').writeFileSync('docs/verification/2026-11-08-ui/user-entry.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.total===report.passed?0:1;
})();
