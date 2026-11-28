const fs = require('fs'), vm = require('vm'), assert = require('assert');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [], tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const row = id => ({ _id: id, status: 'approved', pricing: { payAmount: 100, goodsCap: 0 }, certs: [], images: [], price: 123, createdAt: '2026-11-01T00:00:00Z' });
const pick = id => ({ currentTarget: { dataset: { id } } });
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; }
function setup(name, handler) { const r = runtime(handler); r.app.globalData.user = { roles: ['admin'] }; return { r, p: r.instance(`miniprogram/admin/${name}/${name}.js`) }; }
async function test(name, run) { try { await run(); results.push({name,status:'PASS'}); } catch(e) { results.push({name,status:'FAIL',error:e.stack}); } }
(async () => {
 for (const name of ['orders','providers','reports','stations']) await test(name+':下一页失败保留记录与草稿、重试同一offset，重复读取被挡', async () => {
  const requests = []; let fail = true, pause;
  const {p} = setup(name, async (fn,action,params) => { requests.push(params.offset); if(params.offset) { if(pause) await pause.promise; if(fail) throw Error('合成分页失败'); } return {list:[row(params.offset ? 'second' : 'first')],hasMore: !params.offset}; });
  await p.load(true); p.setData({'rows[0].note':'保留草稿'}); await p.load(false);
  assert.equal(p.data.rows.length,1); assert.equal(p.data.rows[0].note,'保留草稿');assert(p.data.error);
  fail=false;pause=deferred();const pending=p.retry();await tick();await p.load(false);pause.resolve();await pending;
  assert.deepEqual(requests,[0,1,1]);assert.equal(p.data.rows.length,2);assert.equal(p.data.rows[0].note,'保留草稿');assert.equal(p.data.error,'');
 });
 for (const name of ['orders','providers','reports','stations']) await test(name+':过期失败不覆盖新成功，离页失败不更新',async()=>{
  const calls=[];const {p}=setup(name,()=>{const g=deferred();calls.push(g);return g.promise;});
  const old=p.load(true);await tick();const fresh=p.load(true);await tick();calls[1].resolve({list:[row('new')],hasMore:false});await fresh;calls[0].reject(Error('过期失败'));await old;
  assert.equal(p.data.error,'');assert.equal(p.data.rows[0]._id,'new');const last=p.load(true);await tick();p.onUnload();p.setData=()=>{throw Error('离页更新');};calls[2].reject(Error('迟到失败'));await last;
 });
 for (const name of ['orders', 'providers', 'reports', 'stations', 'merchants', 'merchantServices']) {
  for (const fails of [false, true]) await test(name + ' 隐藏后忽略迟到' + (fails ? '错误' : '结果') + '，返回读取第一页', async () => {
    const gate = deferred();
    let blocked = false;
    const serviceList = name === 'merchantServices';
    const { p, r } = setup(serviceList ? 'merchants' : name, async () => {
      if (blocked) return gate.promise;
      return { list: [row('visible')], hasMore: true };
    });
    await p.load(true);
    blocked = true;
    const pending = serviceList ? p.inspect(pick('visible')) : p.load(false);
    await tick();
    if (p.onHide) p.onHide();
    const setData = p.setData.bind(p);
    let hiddenWrites = 0;
    p.setData = patch => { hiddenWrites++; setData(patch); };
    if (fails) gate.reject(Error('隐藏后返回的错误'));
    else gate.resolve({ list: [row('hidden')], hasMore: false });
    await pending;
    assert.equal(hiddenWrites, 0);
    p.setData = setData;
    blocked = false;
    await p.onShow(); await tick();
    assert.equal(r.requests.at(-1)[2].offset, 0);
    assert.equal((p.data.rows || p.data.list)[0]._id, 'visible');
    assert.equal(p.data.error, '');
  });
 }
 await test('商家和服务各121条完整分页，价格展示不变，终页不再请求',async()=>{
  const all=Array.from({length:121},(_,i)=>row('x'+i));const {r,p}=setup('merchants',async(fn,action,params)=>({list:all.slice(params.offset,params.offset+20),hasMore:params.offset+20<all.length}));
  await p.load();while(p.data.hasMore)await p.loadMore();assert.equal(p.data.list.length,121);assert.equal(p.data.offset,121);
  await p.inspect(pick('x0'));while(p.data.servicesHasMore)await p.loadMoreServices();assert.equal(p.data.services.length,121);assert.equal(p.data.servicesOffset,121);assert.equal(p.data.services[120].priceText,'1.23');
  const count=r.requests.length;await p.loadMore();await p.loadMoreServices();assert.equal(r.requests.length,count);
 });
 await test('商家与服务分页失败重试保留记录，重复ID只展示一次但游标按返回数量前进',async()=>{
  let fail=true;const {r,p}=setup('merchants',async(fn,action,params)=>{if(params.offset&&fail)throw Error('下一页失败');return {list:params.offset?[row('x0'),row('x1')]:[row('x0')],hasMore:!params.offset};});
  await p.load();await p.loadMore();assert.equal(p.data.list.length,1);assert.equal(p.data.offset,1);fail=false;await p.retry();assert.equal(p.data.list.length,2);assert.equal(p.data.offset,3);
  await p.inspect(pick('x0'));fail=true;await p.loadMoreServices();assert.equal(p.data.services.length,1);assert.equal(p.data.servicesOffset,1);fail=false;await p.retryServices();assert.equal(p.data.services.length,2);assert.equal(p.data.servicesOffset,3);
  assert.deepEqual(r.requests.filter(x=>x[1]==='adminServices').map(x=>x[2].offset),[0,1,1]);
 });
 await test('切换商家时清旧服务，忽略旧商家迟到成功和失败',async()=>{
  for(const rejectOld of [false,true]){const calls=[];const {p}=setup('merchants',async(fn,action)=>{if(action==='adminList')return {list:[row('a'),row('b')],hasMore:false};const g=deferred();calls.push(g);return g.promise;});await p.load();const a=p.inspect(pick('a'));await tick();const b=p.inspect(pick('b'));await tick();assert.equal(p.data.services.length,0);calls[1].resolve({list:[row('b-service')],hasMore:false});await b;if(rejectOld)calls[0].reject(Error('a错误'));else calls[0].resolve({list:[row('a-service')],hasMore:true});await a;assert.equal(p.data.selected._id,'b');assert.equal(p.data.services[0]._id,'b-service');assert.equal(p.data.servicesError,'');}
 });
 await test('商家重载或离页后服务迟到结果丢弃',async()=>{
  for(const close of [false,true]){const g=deferred();const {p}=setup('merchants',async(fn,action)=>action==='adminList'?{list:[row('a')],hasMore:false}:g.promise);await p.load();const pending=p.inspect(pick('a'));await tick();if(close){p.onUnload();p.setData=()=>{throw Error('离页更新');};}else await p.load();g.resolve({list:[row('late')],hasMore:false});await pending;if(!close){assert.equal(p.data.selected,null);assert.equal(p.data.services.length,0);}}
 });
 await test('商家和服务异常空页报错，游标不前进',async()=>{
  let bad=false;const {p}=setup('merchants',async(fn,action)=>({list:bad?[]:[row('a')],hasMore:true}));await p.load();bad=true;await p.loadMore();assert.equal(p.data.offset,1);assert(p.data.error.includes('分页异常'));bad=false;await p.inspect(pick('a'));bad=true;await p.loadMoreServices();assert.equal(p.data.servicesOffset,1);assert(p.data.servicesError.includes('分页异常'));
 });
 await test('空服务员/商家选择拒绝事件，物业与卖家切换仍可用且不自动导出',async()=>{
  const {r,p}=setup('exports',async(fn,action)=>action==='getCommunity'?{_id:'c'}:{list:action==='listCommunities'?[{_id:'c'}]:[],hasMore:false});p.onLoad();await p.load();
  const e=(field,value)=>({currentTarget:{dataset:{field}},detail:{value}});p.select(e('providerIndex',5));p.select(e('merchantIndex',5));assert.equal(p.data.providerIndex,0);assert.equal(p.data.merchantIndex,0);p.select(e('payeeIndex',1));assert.equal(p.data.payeeIndex,1);p.select(e('payeeIndex',3));assert.equal(p.data.payeeIndex,3);assert(!r.requests.some(x=>x[1].startsWith('export')));
  const w=fs.readFileSync('miniprogram/admin/exports/exports.wxml','utf8');for(const field of ['providers','merchants'])assert(w.includes('disabled="{{busy || !'+field+'.length}}"'));assert(w.includes('暂无已审核服务员'));assert(w.includes('暂无已审核商家'));
 });
 await test('真实adminServices函数：121条分页、权限和分页参数校验',async()=>{
  const root=process.cwd(),src=fs.readFileSync('cloudfunctions/merchant/index.js','utf8');const code=src.slice(src.indexOf('async function adminServices('),src.indexOf('\nexports.main'));
  const all=Array.from({length:121},(_,i)=>({...row('s'+i),merchantId:'m'}));let offset=0,limit=0,queries=0;
  const q={where(v){assert.equal(v.merchantId,'m');return this;},orderBy(){return this;},skip(n){offset=n;return this;},limit(n){limit=n;return this;},async get(){queries++;return {data:all.slice(offset,offset+limit)};}};
  const fn=vm.runInNewContext(code+';adminServices',{db:{collection:name=>{assert.equal(name,'merchantServices');return q;}},requireRole:require(root+'/cloudfunctions/_shared/auth').requireRole,...require(root+'/cloudfunctions/_shared/validate'),visibleService:require(root+'/cloudfunctions/_shared/merchant').visibleService});
  const got=[];let page;do{page=await fn({merchantId:'m',offset:got.length},{user:{roles:['admin']}});got.push(...page.list);}while(page.hasMore);assert.equal(got.length,121);assert.equal(new Set(got.map(x=>x._id)).size,121);assert.equal(limit,20);
  const count=queries;await assert.rejects(()=>fn({merchantId:'m'},{user:{roles:['resident']}}));for(const bad of [-1,0.5,'20',100001])await assert.rejects(()=>fn({merchantId:'m',offset:bad},{user:{roles:['admin']}}));assert.equal(queries,count);
 });
 const report={scope:'Synthetic controlled page APIs and extracted actual cloud function; no cloud calls or business writes',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results};fs.writeFileSync(__dirname+'/qa40-42.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.passed!==report.total)process.exitCode=1;
})();
