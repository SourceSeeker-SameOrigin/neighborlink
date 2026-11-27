// Executes actual cloud entries against synthetic records; selected cancellation and event creation tests mutate only the local fixture. No network or cloud writes.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = process.cwd();
function fixture({ bound = true, global = false, local = false, roles = ['resident'], records = {}, allowWrites = false, mockPay = false, paymentEnv, securityResult = null, failBindEvent = false, failCouponRead = false, transactionConflict = false, orderedQueries = false } = {}) {
  const user = { _id: 'u', openid: 'actor', roles, communityId: bound ? 'c' : null };
  const data = { users: [user], config: [{ _id: 'global', complaintWindowHours:24, blacklist:[], features: Object.fromEntries(['board','idle','events','chat','coupons','merchants','stationDelivery','autoPayout','notices','ads'].map(k=>[k, global])) }],
    communities: [{ _id: 'c', status: 'active', features: local === null ? {} : Object.fromEntries(['board','idle','events','chat','coupons','merchants','stationDelivery','autoPayout','notices','ads'].map(k=>[k, local])) }], ...records };
  const op = (name, value) => ({ op: name, value, and(other){return op('and',[this,other]);} });
  const command = new Proxy({}, { get: (_, name) => value => op(name, value) });
  function compare(actual,value) {
    if(value && value.op==='and')return value.value.every(v=>compare(actual,v));
    if(value && value.op==='in')return Array.isArray(actual)?actual.some(v=>value.value.includes(v)):value.value.includes(actual);
    if(value && value.op==='neq')return actual!==value.value;
    if(value && value.op==='gt')return actual>value.value;
    if(value && value.op==='gte')return actual>=value.value;
    if(value && value.op==='lt')return actual<value.value;
    if(value && value.op==='lte')return actual<=value.value;
    if(value && value.op)throw Error('Unsupported predicate '+value.op);
    return Array.isArray(actual)?actual.includes(value):actual===value;
  }
  function matches(row,filter){return Object.entries(filter).every(([key,value])=>compare(row[key],value));}
  const writes = [];
  const faults = { failCouponRead, failTemplateId: null };
  function update(table, rows, patch) { if (!allowWrites) throw Error('Unexpected write'); rows.forEach(row=>Object.assign(row, patch.data)); writes.push({table, count:rows.length}); return {stats:{updated:rows.length}}; }
  const db = { command, async runTransaction(work) {
    if(transactionConflict) throw Object.assign(Error('conflict'),{code:'DATABASE_TRANSACTION_CONFLICT'});
    if(faults.beforeTransaction){const hook=faults.beforeTransaction;faults.beforeTransaction=null;hook(data);}
    const snapshot=structuredClone(data), count=writes.length;
    try { return await work({collection(table){return {doc:id=>db.collection(table).doc(id)};}}); } catch(error) {
      for(const key of Object.keys(data)) delete data[key]; Object.assign(data,snapshot); writes.length=count; throw error;
    }
  }, collection(table) { let filter = {}, limit = 100, offset = 0, ordering = [];
    const chain = { doc(id) { return { async get() { if(table==='couponTemplates' && id===faults.failTemplateId) throw Error('synthetic second template failure'); return {data:structuredClone((data[table]||[]).find(row=>row._id===id)||null)}; }, async update(patch) { return update(table,(data[table]||[]).filter(row=>row._id===id),patch); }, async set({data:value}) { if(failBindEvent && table==='events') throw Error('synthetic event write failure'); if(!allowWrites) throw Error('Unexpected write'); const rows=(data[table] ||= []),index=rows.findIndex(r=>r._id===id),row={_id:id,...value};if(index<0)rows.push(row);else rows[index]=row; writes.push({table,id}); } }; }, where(value) { filter = value; return chain; }, limit(value) { limit = value; return chain; },
      orderBy(field,direction) { ordering.push([field,direction]); return chain; }, skip(value) { offset=value; return chain; }, async count(){return {total:(data[table]||[]).filter(row=>matches(row,filter)).length};}, async get() { if(faults.failCouponRead && table==='couponTemplates') throw Error('synthetic coupon failure'); const rows=(data[table] || []).filter(row=>matches(row, filter)); if(orderedQueries) rows.sort((a,b)=>{for(const [field,direction] of ordering){const left=a[field] instanceof Date?a[field].getTime():a[field],right=b[field] instanceof Date?b[field].getTime():b[field];if(left<right)return direction==='desc'?1:-1;if(left>right)return direction==='desc'?-1:1;}return 0;}); return { data: structuredClone(rows.slice(offset, offset+limit)) }; },
      async add({data:value}) { if(failBindEvent && table === 'events' && value.type === 'bind') throw Error('synthetic event write failure'); if(!allowWrites) throw Error('Unexpected write'); (data[table] ||= []).push(value); writes.push({table}); return {_id:'local-event'}; }, async update(patch) { return update(table,(data[table]||[]).filter(row=>matches(row,filter)),patch); } }; return chain;
  }};
  // Database clones and dates created inside a simulated function must share a Date constructor.
  const databaseDate = structuredClone(new Date()).constructor;
  const signed=[];let actor='actor';
  const cloud = { init() {}, database:()=>db, getWXContext:()=>({OPENID:actor}), DYNAMIC_CURRENT_ENV:'offline',
    getTempFileURL({fileList}) { signed.push(...fileList);return {fileList:fileList.map(item=>({fileID:item.fileID,status:0,tempFileURL:'https://synthetic.invalid/authorized'}))}; }, openapi:{phonenumber:{async getPhoneNumber(){return {phoneInfo:{purePhoneNumber:'13800000000'}};}},security:{async msgSecCheck() { if(!securityResult) throw Error('Unexpected security call'); return securityResult; }, async mediaCheckAsync() { if(!securityResult) throw Error('Unexpected media check'); return { trace_id: 'synthetic-media-check' }; }}} };
  function load(file, cache = new Map()) {
    file = path.resolve(file); if (!path.extname(file)) file += '.js';
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports:{}}; cache.set(file,module);
    const requireLocal = name => { if (name === 'wx-server-sdk') return cloud; if (['crypto','node:crypto'].includes(name)) return require('crypto');
      if (name === 'https') return {request(){throw Error('Unexpected network');}};
      if (file.startsWith(path.join(root, 'cloudfunctions') + path.sep) && name.startsWith('./lib/shared/')) {
        return load(path.join(root, 'cloudfunctions/_shared', name.slice('./lib/shared/'.length)), cache);
      }
      if (!name.startsWith('.')) throw Error('Unknown dependency '+name); return load(path.resolve(path.dirname(file),name),cache); };
    vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})', { Date: databaseDate, JSON, Set, Map, Promise, Buffer, process:{env:paymentEnv || (mockPay ? {ALLOW_MOCK_PAY:"true"} : {})}, console:{error(){}} }, {filename:file})(requireLocal,module,module.exports);
    return module.exports;
  }
  return { data, writes, faults, signed, db, load, cloud, setActor(value){actor=value;}, call: (name, action, input={})=>load('cloudfunctions/'+name+'/index.js').main({...input,action}) };
}

module.exports={fixture};
