// Exercise the actual P26 page and listReports handler with local synthetic records.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const route = 'miniprogram/admin/reports/reports.js';
const records = Array.from({length:44}, (_,i)=>({
  _id:'case-'+i, targetId:'sample', targetType:'event', communityId:'c',
  reason:'合成记录', createdAt:new Date(i), status:i<41?'pending':i<43?'upheld':'dismissed'
}));
function setup() {
  const db = fixture({roles:['admin'],local:true,records:{reports:records,events:[{_id:'sample'}]}});
  const queue = [];
  const env = runtime(async(name,action,input)=>{
    assert.equal(action,'listReports');
    const gate=queue.shift();
    if(gate) await gate;
    const reply=await db.call(name,action,input);assert.ok(reply.ok);
    return reply.data;
  });
  const page=env.instance(route);
  const hold=()=>{
    let resolve,reject;
    queue.push(new Promise((ok,fail)=>{resolve=ok;reject=fail;}));
    return {resume:resolve,fail:()=>reject(Error('合成加载失败'))};
  };
  const offsets=()=>env.requests.map(r=>r[2].offset);
  return {db,env,page,hold,offsets};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function check(label,run) {
  try {await run();console.log('PASS '+label);}
  catch(e){process.exitCode=1;console.error('FAIL '+label+' '+e.message);}
}
(async()=>{
 await check('连续触底合并请求，41 条全部读到且无重复',async()=>{
   const {db,page,hold,offsets}=setup();
   await page.load(true);assert.equal(page.data.rows.length,20);
   const gate=hold();page.onReachBottom();page.onReachBottom();
   gate.resume();await flush();page.onReachBottom();await flush();page.onReachBottom();
   assert.deepEqual(offsets(),[0,20,40]);assert.equal(page.data.rows.length,41);
   assert.equal(new Set(page.data.rows.map(r=>r._id)).size,41);
   assert.equal(page.data.hasMore,false);assert.equal(db.writes.length,0);
 });
 await check('续页失败保留 20 条，重试从第 21 条开始',async()=>{
   const {page,hold,offsets}=setup();await page.load(true);
   const first=page.data.rows.map(r=>r._id);
   const gate=hold();const pending=page.load();gate.fail();await pending;
   assert.deepEqual(page.data.rows.map(r=>r._id),first);
   assert.equal(page.data.error,'合成加载失败');await page.retry();
   assert.deepEqual(offsets(),[0,20,20]);assert.equal(page.data.rows.length,40);assert.equal(page.data.error,'');
 });
 for(const fail of [false,true]) await check('切换筛选后忽略旧续页'+(fail?'错误':'结果'),async()=>{
   const {page,hold}=setup();await page.load(true);
   const gate=hold();const pending=page.load();
   page.chooseStatus({currentTarget:{dataset:{status:'upheld'}}});await flush();
   fail?gate.fail():gate.resume();await pending;
   assert.equal(page.data.rows.length,2);assert.ok(page.data.rows.every(r=>r.status==='upheld'));assert.equal(page.data.error,'');
 });
 for(const hook of ['onHide','onUnload']) for(const fail of [false,true]) await check(hook+' 之后旧'+(fail?'错误':'结果')+'零回写',async()=>{
   const {page,hold}=setup();await page.load(true);const gate=hold();const pending=page.load();
   if(page[hook]) page[hook]();
   let writes=0;const original=page.setData.bind(page);page.setData=patch=>{writes++;original(patch);};
   fail?gate.fail():gate.resume();await pending;assert.equal(writes,0);
 });
 await check('隐藏期间重试及触底不读取',async()=>{
   const {page,offsets}=setup();
   await page.onShow();page.onHide();await page.retry();page.onReachBottom();
   assert.deepEqual(offsets(),[0]);
 });
 await check('返回后按当前筛选重新读取第一页，迟到响应不覆盖',async()=>{
   const {page,hold,offsets}=setup();await page.onShow();
   const gate=hold();const old=page.load();page.onHide();
   await page.onShow();assert.deepEqual(offsets(),[0,20,0]);
   gate.resume();await old;assert.equal(page.data.rows.length,20);
   assert.ok(page.data.rows.every(row=>row.status==='pending'));
 });
})().catch(e=>{console.error(e);process.exitCode=1;});
