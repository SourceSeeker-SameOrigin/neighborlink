// Actual page and cloud entry with synthetic identities, services and media only.
// No network, real uploads, service creation or approval.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const results = [];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const service = id => ({ _id: id, merchantId: 'merchant-a', title: '合成服务', desc: '仅供测试', priceType: 'fixed', price: 500, unit: '次', images: [], status: 'off' });
function setup() {
  let call = async (n, a) => a === 'myServices' ? { list: [service('service-a')] } : {};
  let upload = async () => ['cloud://synthetic/merchant-services/user-a/photo.jpg'];
  const env = runtime((...args) => call(...args), { media: { uploadPhotos: (...args) => upload(...args) } });
  env.app.globalData.user = { _id: 'user-a', roles: ['merchant'], merchantId: 'merchant-a' };
  const page = env.instance('miniprogram/merchant/services/services.js'); page.visible = true;
  return { env, page, use: fn => { call = fn; }, media: fn => { upload = fn; } };
}
function change(f, state) {
  if (state === 'hidden') f.page.onHide?.();
  if (state === 'unloaded') f.page.onUnload?.();
  if (state === 'user') f.env.app.globalData.user = { _id: 'user-b', roles: ['merchant'], merchantId: 'merchant-b' };
}
async function check(name, fn) {
  let evidence;
  try { await fn(v => { evidence = v; }); results.push({ name, pass: true, evidence }); }
  catch (error) { results.push({ name, pass: false, evidence, error: error.message }); }
}
(async () => {
  await check('normal-load', async record => {
    const f = setup(); await f.page.load(); record({ rows: f.page.data.list.length, ready: f.page.data.ready });
    assert.equal(f.page.data.list.length, 1); assert(f.page.data.ready);
  });
  await check('denied-reload-clears-old-services', async record => {
    const f = setup(); await f.page.load(); f.use(async () => { throw Object.assign(Error('合成无权读取'), { code: 'E_FORBIDDEN' }); });
    await f.page.load(); record({ rows: f.page.data.list.length, ready: f.page.data.ready }); assert.equal(f.page.data.list.length, 0);
  });
  for (const state of ['hidden', 'unloaded', 'user']) await check('late-read-' + state, async record => {
    const f = setup(), wait = deferred(); f.use(() => wait.promise); const op = f.page.load(); change(f, state);
    let updates = 0; const set = f.page.setData; f.page.setData = function(p) { updates++; set.call(this, p); };
    wait.resolve({ list: [service('old')] }); await op; record({ updates, rows: f.page.data.list.length }); assert.equal(updates, 0);
  });
  await check('return-refresh-not-blocked-by-old-read', async record => {
    const f = setup(), wait = deferred(); let calls = 0;
    f.use(() => ++calls === 1 ? wait.promise : { list: [service('new')] });
    const old = f.page.load(); await flush(); change(f, 'hidden'); f.page.onShow(); await flush(); wait.resolve({ list: [service('old')] }); await old;
    record({ calls, id: f.page.data.list[0]?._id }); assert.equal(f.page.data.list[0]?._id, 'new');
  });
  for (const state of ['same-page', 'hidden', 'unloaded', 'user']) await check('save-entry-' + state, async record => {
    const f = setup(); await f.page.load(); f.page.setData({ title: '合成新服务', desc: '仅供测试', price: '5' }); change(f, state);
    await f.page.save(); const calls = f.env.requests.filter(r => r[1] === 'upsertService').length;
    record({ calls }); assert.equal(calls, state === 'same-page' ? 1 : 0);
  });
  for (const state of ['same-page', 'unloaded', 'user']) await check('upload-result-' + state, async record => {
    const f = setup(), wait = deferred(); await f.page.load(); f.media(() => wait.promise);
    const op = f.page.photos(); await flush(); change(f, state); wait.resolve(['cloud://synthetic/old-photo.jpg']); await op;
    record({ images: f.page.data.images.length }); assert.equal(f.page.data.images.length, state === 'same-page' ? 1 : 0);
  });
  await check('account-change-clears-old-draft', async record => {
    const f = setup(); await f.page.load(); f.page.setData({ title: 'A的合成草稿', desc: 'A的文字', images: ['cloud://synthetic/a.jpg'] });
    change(f, 'hidden'); change(f, 'user'); f.page.onShow(); await flush();
    record({ title: f.page.data.title, images: f.page.data.images.length }); assert.equal(f.page.data.title, ''); assert.equal(f.page.data.images.length, 0);
  });
  await check('same-person-return-preserves-draft', async record => {
    const f=setup(); await f.page.load(); f.page.setData({title:'本人草稿',price:'5',images:['cloud://synthetic/a.jpg']});
    change(f,'hidden'); await f.page.onShow(); record({title:f.page.data.title,images:f.page.data.images.length});
    assert.equal(f.page.data.title,'本人草稿'); assert.equal(f.page.data.images.length,1);
  });
  for(const state of ['hidden','unloaded','user','refresh']) for(const fail of [false,true]) await check('late-save-'+state+'-'+fail,async record=>{
    const f=setup(),wait=deferred(); await f.page.load();
    f.page.setData({ title: '合成服务', desc: '旧保存请求', price: '5' });
    f.use((n,a)=>a==='upsertService'?wait.promise:{list:[service('new')]});
    const op=f.page.save(); await flush();
    if(state==='refresh') await f.page.load(); else change(f,state);
    f.page.setData({title:'当前草稿'}); let updates=0;const set=f.page.setData;f.page.setData=function(p){updates++;set.call(this,p);};
    wait.resolve(fail?Promise.reject(Error('旧保存失败')):{});await op;await flush();
    record({title:f.page.data.title,error:f.page.data.error,updates});
    assert.notEqual(f.page.data.error,'旧保存失败');
    if(state==='hidden'||state==='unloaded') assert.equal(updates,0);
    if(state==='refresh') assert.equal(f.page.data.title,'当前草稿');
    if(state==='user') assert.equal(f.page.data.title,'');
  });
  await check('save-failure-preserves-draft-and-allows-retry',async record=>{
    const f=setup();await f.page.load();f.page.setData({title:'本人草稿',desc:'合成需求',price:'5'});
    f.use(async(n,a)=>{if(a==='upsertService')throw Error('合成保存失败');return{list:[]};});await f.page.save();
    record({title:f.page.data.title,ready:f.page.data.ready,busy:f.page.data.busy,error:f.page.data.error});
    assert.equal(f.page.data.title,'本人草稿');assert(f.page.data.ready&&!f.page.data.busy);assert.equal(f.page.data.error,'合成保存失败');
  });
  for(const mode of ['result-first','show-first','read-pending','cancel','failure','denied','merchant','refresh']) await check('system-media-'+mode,async record=>{
    const f=setup(),wait=deferred();await f.page.load();f.media(()=>wait.promise);let uploads=0;
    f.media(()=>{uploads++;return wait.promise;});const op=f.page.photos();await flush();await f.page.photos();assert.equal(uploads,1);change(f,'hidden');
    if(mode==='merchant') f.env.app.globalData.user.merchantId='merchant-b';
    if(mode==='denied') f.use(async()=>{throw Object.assign(Error('读取被拒'),{code:'E_FORBIDDEN'});});
    let show,readWait;
    if(mode==='read-pending'){readWait=deferred();f.use(()=>readWait.promise);show=f.page.onShow();await flush();}
    else if(mode!=='result-first') await f.page.onShow();
    if(mode==='refresh')await f.page.load();
    wait.resolve(mode==='cancel'?Promise.reject({errMsg:'chooseMedia:fail cancel'}):mode==='failure'?Promise.reject(Error('合成上传失败')):['cloud://synthetic/photo.jpg']);
    if(readWait){await flush();assert.equal(f.page.data.images.length,0);readWait.resolve({list:[]});}
    await op;
    if(mode==='result-first'){assert.equal(f.page.data.images.length,0);await f.page.onShow();}
    if(readWait){await show;await flush();}
    record({images:f.page.data.images.length,busy:f.page.data.busy,error:f.page.data.error,uploads});
    const accepted=['result-first','show-first','read-pending'].includes(mode);
    assert.equal(f.page.data.images.length,accepted?1:0);assert.equal(f.page.data.busy,false);
    if(mode==='cancel')assert.equal(f.page.data.error,'');if(mode==='failure')assert.equal(f.page.data.error,'合成上传失败');
  });
  await check('page-network-retry-preserves-offset-and-draft',async record=>{
    const f=setup();const offsets=[];let fail=true;
    f.use(async(n,a,d)=>{offsets.push(d.offset);if(d.offset===20&&fail){fail=false;throw Error('合成分页失败');}return{list:Array.from({length:d.offset===0?20:1},(_,i)=>service('s'+(d.offset+i))),hasMore:d.offset===0,nextOffset:d.offset===0?20:21};});
    await f.page.load();f.page.setData({title:'本人草稿'});await f.page.more();assert.equal(f.page.data.list.length,20);assert(f.page.data.pageError);await f.page.retry();
    record({offsets,rows:f.page.data.list.length,title:f.page.data.title,hasMore:f.page.data.hasMore});
    assert.deepStrictEqual(offsets,[0,20,20]);assert.equal(f.page.data.list.length,21);assert.equal(f.page.data.title,'本人草稿');assert.equal(f.page.data.hasMore,false);
  });
  for(const mode of ['denied','empty-more','stale','duplicate'])await check('pagination-'+mode,async record=>{
    const f=setup(),wait=deferred();f.use(async(n,a,d)=>d.offset===0?{list:[service('a')],hasMore:true}:{list:[service('b')],hasMore:false});await f.page.load();
    if(mode==='denied')f.use(async()=>{throw Object.assign(Error('拒绝'),{code:'E_FORBIDDEN'});});
    if(mode==='empty-more')f.use(async()=>({list:[],hasMore:true}));
    if(mode==='duplicate')f.use(async()=>({list:[service('a'),service('b')],hasMore:false}));
    if(mode==='stale')f.use(()=>wait.promise);
    const op=f.page.more();await flush();if(mode==='stale'){change(f,'unloaded');wait.resolve({list:[service('old')],hasMore:false});}await op;
    record({ids:f.page.data.list.map(s=>s._id),offset:f.page.offset,pageError:f.page.data.pageError});
    if(mode==='denied'||mode==='stale')assert.equal(f.page.data.list.length,0);
    if(mode==='empty-more'){assert.equal(f.page.data.list.length,1);assert.equal(f.page.offset,1);assert(f.page.data.pageError);}
    if(mode==='duplicate'){assert.equal(f.page.data.list.length,2);assert.equal(f.page.offset,3);}
  });
  function database() {
    const db = fixture({ roles: ['resident', 'merchant'], global: true, local: true, records: {
      merchants: [{ _id: 'merchant-a', status: 'approved', staffOpenids: ['actor'], communityIds: ['c'] }],
      merchantServices: Array.from({ length: 101 }, (_, i) => ({ ...service('service-' + i), createdAt: new Date(Date.UTC(2026, 10, 19, 0, 0, 101 - i)) }))
    } });
    const collection = db.db.collection.bind(db.db);
    db.db.collection = table => {
      const chain = collection(table);
      if (table === 'merchantServices') {
        const keys = [], get = chain.get;
        chain.orderBy = (field, direction) => { keys.push([field, direction]); return chain; };
        chain.get = async () => {
          const original = db.data[table];
          db.data[table] = original.slice().sort((a, b) => {
            for (const [field, direction] of keys) {
              if (a[field] < b[field]) return direction === 'desc' ? 1 : -1;
              if (a[field] > b[field]) return direction === 'desc' ? -1 : 1;
            }
            return 0;
          });
          try { return await get(); } finally { db.data[table] = original; }
        };
      }
      return chain;
    };
    if (process.env.MERCHANT_ENTRY) db.call = (name, action, data = {}) => {
      assert.equal(name, 'merchant');
      return db.load(process.env.MERCHANT_ENTRY).main({ ...data, action });
    };
    return db;
  }
  await check('equal-time-stable-id-pagination', async record => {
    const db = database(), time = new Date('2026-11-19T00:00:00Z');
    db.data.merchantServices = Array.from({ length: 41 }, (_, i) => ({ ...service('s' + String(i).padStart(3, '0')), createdAt: time }));
    const ids = [];
    for (const offset of [0, 20, 40]) {
      const result = await db.call('merchant', 'myServices', { offset });
      assert(result.ok); ids.push(...result.data.list.map(row => row._id));
    }
    record({ count: ids.length, first: ids[0], last: ids.at(-1), unique: new Set(ids).size });
    assert.deepStrictEqual(ids, db.data.merchantServices.map(row => row._id).reverse());
    assert.equal(db.writes.length, 0);
  });
  await check('cloud-offset-reaches-101st-service', async record => {
    const db = database(); const first = await db.call('merchant', 'myServices', { offset: 0 }); const last = await db.call('merchant', 'myServices', { offset: 100 });
    assert(first.ok && last.ok); record({ counts: [first.data.list.length, last.data.list.length], firstIds: [first.data.list[0]?._id, last.data.list[0]?._id], writes: db.writes.length });
    assert(last.data.list.some(s => s._id === 'service-100')); assert.equal(db.writes.length, 0);
  });
  await check('page-reaches-101st-service', async record => {
    const db = database(), env = runtime(async (n,a,d) => { const r = await db.call(n,a,d); if (!r.ok) throw Error(r.message); return r.data; });
    const page = env.instance('miniprogram/merchant/services/services.js'); await page.onShow();
    const template = fs.readFileSync('miniprogram/merchant/services/services.wxml', 'utf8');
    const handler = /bindtap="([^"]+)"[^>]*>\s*加载更多/.exec(template)?.[1];
    if (handler && typeof page[handler] === 'function') for (let i=0; i<6 && !page.data.list.some(s=>s._id==='service-100'); i++) await page[handler]();
    record({ rows: page.data.list.length, paginationButton: !!handler, calls: env.requests.length, writes: db.writes.length });
    assert(page.data.list.some(s => s._id === 'service-100')); assert.equal(db.writes.length, 0);
  });
  await check('other-merchant-cannot-read-services', async record => {
    const db = database(); db.data.merchants[0].staffOpenids = ['other']; const r = await db.call('merchant','myServices',{});
    record({ ok: r.ok, code: r.code, writes: db.writes.length }); assert.equal(r.ok,false); assert.equal(db.writes.length,0);
  });
  for(const mode of ['legacy','invalid-offset','feature-off','suspended'])await check('cloud-'+mode,async record=>{
    const db=database();if(mode==='suspended')db.data.merchants[0].status='suspended';
    if(mode==='feature-off'){db.data.config[0].features.merchants=false;db.data.communities[0].features.merchants=false;}
    const r=await db.call('merchant','myServices',mode==='legacy'?{}:{offset:mode==='invalid-offset'?-1:0});
    record({ok:r.ok,code:r.code,count:r.data?.list.length,writes:db.writes.length});
    if(mode==='legacy'){assert(r.ok);assert.equal(r.data.list.length,100);}else assert.equal(r.ok,false);
    assert.equal(db.writes.length,0);
  });
  console.log(JSON.stringify({ scope: 'synthetic interfaces and database; no real media or cloud writes; query sorting simulated, real cloud index unverified', pass: results.filter(r=>r.pass).length, fail: results.filter(r=>!r.pass).length, results },null,2));
  if (results.some(r=>!r.pass)) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
