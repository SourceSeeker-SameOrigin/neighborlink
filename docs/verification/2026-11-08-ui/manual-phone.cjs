// Isolated page-flow regression: no real cloud, identity, phone, or address writes.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = process.cwd();
const results = [];
function runtime(call = async () => { throw Error('Unexpected API call'); }) {
  const store = {}, navigation = [], requests = [], cache = new Map();
  const app = { globalData: { user: { _id: 'fixture', roles: ['resident'] }, community: null },
    ensureSession: async () => app.globalData.user };
  const wx = { getStorageSync: key => store[key], removeStorageSync: key => delete store[key],
    navigateTo: o => navigation.push(['navigateTo', o.url]),
    redirectTo: o => navigation.push(['redirectTo', o.url]),
    switchTab: o => navigation.push(['switchTab', o.url]), showToast() {} };
  function load(file) {
    file = path.resolve(root, file); if (!path.extname(file)) file += '.js';
    if (cache.has(file)) return cache.get(file);
    let definition; const module = { exports: {} };
    const requireLocal = id => {
      const target = path.resolve(path.dirname(file), id) + '.js';
      if (target === path.join(root, 'miniprogram/utils/api.js')) return { call: async (...args) => {
        requests.push(args); return call(...args);
      } };
      if (target === path.join(root, 'miniprogram/utils/payment.js')) return { pay: async () => { throw Error('No payment'); } };
      if (!id.startsWith('.')) throw Error('External dependencies forbidden');
      return load(path.resolve(path.dirname(file), id));
    };
    vm.runInNewContext('(function(require,module,exports){' + fs.readFileSync(file, 'utf8') + '\n})',
      { wx, getApp: () => app, Page: value => { definition = value; }, Date, Promise, console,
        setTimeout: () => 1, clearTimeout() {} }, { filename: file })(requireLocal, module, module.exports);
    const value = definition || module.exports; cache.set(file, value); return value;
  }
  function instance(definition) {
    const page = typeof definition === 'string' ? load(definition) : definition;
    return { ...page, data: JSON.parse(JSON.stringify(page.data || {})), setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.'); let target = this.data;
        while (parts.length > 1) { const part = parts.shift(); target = target[part] ||= {}; }
        target[parts[0]] = value;
      }
    } };
  }
  return { app, wx, store, navigation, requests, load, instance };
}
const homeFile = 'miniprogram/pages/index/index.js';
const bindFile = 'miniprogram/pages/bind/bind.js';
function form(page) {
  Object.assign(page.data, { communities: [{ _id: 'c' }], buildings: [{ _id: 'b' }], units: ['1'], room: '302', agreed: true });
}
async function check(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', actual: error.message }); }
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

(async () => {
  await check('Manual phone binds only after consent and successful server response', async()=>{
    const r=runtime(async(name,action,input)=>{ assert.equal(action,'setAddress');assert.equal(input.phone,'13800000000');assert.equal(input.privacyAgreed,true);return {_id:'fixture',roles:['resident'],phone:'138****0000',phoneSource:'manual',phoneVerified:false,communityId:'c',buildingId:'b'}; });
    const p=r.instance(bindFile); form(p);p.manualPhoneChange({detail:{value:'13800000000'}});await p.save();
    assert.equal(r.requests.length,1);assert.equal(r.navigation.length,1);assert.equal(r.app.globalData.user.phoneVerified,false);assert.equal(p.data.saving,false);
  });
  for(const input of ['', '138****0000', '123', '23800000000']) await check('Invalid manual input never reaches cloud: '+input,async()=>{const r=runtime(),p=r.instance(bindFile);form(p);p.data.manualPhone=input;await p.save();assert.equal(r.requests.length,0);assert.equal(r.navigation.length,0);});
  await check('Consent missing prevents manual binding',async()=>{const r=runtime(),p=r.instance(bindFile);form(p);p.data.manualPhone='13800000000';p.data.agreed=false;await p.save();assert.equal(r.requests.length,0);});
  await check('Missing address selection prevents phone write',async()=>{const r=runtime(),p=r.instance(bindFile);form(p);p.data.manualPhone='13800000000';p.data.buildings=[];await p.save();assert.equal(r.requests.length,0);});
  await check('Server failure preserves input and unbound identity; return stays home',async()=>{const r=runtime(async()=>{throw Error('offline');}),p=r.instance(bindFile);form(p);p.data.manualPhone='13800000000';await p.save();assert.equal(p.data.manualPhone,'13800000000');assert.equal(p.data.room,'302');assert(!r.app.globalData.user.buildingId);assert.equal(r.navigation.length,0);p.backHome();await r.instance(homeFile).load();assert.equal(r.navigation.length,1);});
  await check('Double save sends one request',async()=>{const d=deferred(),r=runtime(()=>d.promise),p=r.instance(bindFile);form(p);p.data.manualPhone='13800000000';const first=p.save();await p.save();assert.equal(r.requests.length,1);d.resolve({phone:'138****0000',phoneVerified:false,communityId:'c',buildingId:'b'});await first;assert.equal(p.data.saving,false);});
  await check('Existing masked phone is never sent back as the new full phone',async()=>{const r=runtime(async(n,a,input)=>{assert.equal(input.phone,undefined);return {phone:'138****0000',communityId:'c',buildingId:'b'};}),p=r.instance(bindFile);form(p);p.data.phone='138****0000';await p.save();assert.equal(r.requests.length,1);});
  await check('Service introductions do not call APIs or open a disabled business page',async()=>{const r=runtime(),p=r.instance(homeFile),dialogs=[];r.wx.showModal=o=>dialogs.push(o);await p.load();p.introduce({currentTarget:{dataset:{code:'pet'}}});p.introduce({currentTarget:{dataset:{code:'unknown'}}});assert.equal(dialogs.length,1);assert.equal(r.requests.length,0);assert.equal(r.navigation.length,0);});
  await check('No eligible coordinates means no location permission request',async()=>{let locations=0;const r=runtime(async(n,a)=>a==='listCommunities'?{list:[{_id:'c',name:'测试'}],hasMore:false}:{buildings:[{_id:'b',units:['1']}]});r.wx.getLocation=()=>{locations++;};const p=r.instance(bindFile);await p.load();assert.equal(locations,0);assert.equal(p.data.communities.length,1);});
  await check('Eligible coordinates trigger location once; denial leaves manual list usable',async()=>{let locations=0;const r=runtime(async(n,a)=>a==='listCommunities'?{list:[{_id:'c',name:'测试',location:{lat:40,lng:116}}],hasMore:false}:{buildings:[{_id:'b',units:['1']}]});r.wx.getLocation=o=>{locations++;o.fail(Error('denied'));};const p=r.instance(bindFile);await p.load();assert.equal(locations,1);assert(p.data.locationHint.includes('手动'));assert.equal(p.data.communities.length,1);});
  await check('Explicit bound community suppresses location even with coordinates',async()=>{let locations=0;const r=runtime(async(n,a)=>a==='listCommunities'?{list:[{_id:'c',name:'测试',location:{lat:40,lng:116}}],hasMore:false}:{buildings:[{_id:'b',units:['1']}]});r.app.globalData.user={communityId:'c',buildingId:'b'};r.wx.getLocation=()=>{locations++;};await r.instance(bindFile).load();assert.equal(locations,0);});
  await check('Committed binding with coupon failure shows separate notice and returns home',async()=>{
    const r=runtime(async()=>({phone:'138****0000',communityId:'c',buildingId:'b',welcomeCouponStatus:'pending'})),p=r.instance(bindFile),dialogs=[];
    r.wx.showModal=o=>{dialogs.push(o);o.complete();};form(p);p.data.manualPhone='13800000000';await p.save();
    assert.equal(r.app.globalData.user.buildingId,'b');assert.equal(dialogs.length,1);assert.equal(dialogs[0].title,'门牌已保存');assert(dialogs[0].content.includes('重试'));assert.equal(p.data.error,'');assert.equal(r.navigation.length,1);
  });
  await check('Coupon retry is guarded, reloads successful results and exposes failures',async()=>{
    let fail=true;const d=deferred(),r=runtime(async(n,a)=>{if(a==='mine')return {list:[]};if(a==='retryWelcomeCoupons'){if(fail)throw Error('稍后重试');return d.promise;}throw Error('unexpected');});
    const p=r.instance('miniprogram/coupons/mine/mine.js');await p.retryWelcome();assert.equal(r.requests.length,0);await p.load();await p.retryWelcome();assert.equal(p.data.retryError,'稍后重试');assert.equal(p.data.retrying,false);
    fail=false;const first=p.retryWelcome();await p.retryWelcome();assert.equal(r.requests.filter(x=>x[1]==='retryWelcomeCoupons').length,2);d.resolve({complete:true});await first;assert.equal(p.data.retryError,'');assert(p.data.retryMessage.includes('不会重复'));assert.equal(p.data.retrying,false);
  });
  const report={scope:'Isolated VM with synthetic fixtures, no real cloud writes or device geolocation',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results};
  fs.writeFileSync('docs/verification/2026-11-08-ui/manual-phone.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.total===report.passed?0:1;
})();
