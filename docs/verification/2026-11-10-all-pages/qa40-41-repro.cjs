const fs=require('fs'), assert=require('assert');
const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const results=[];
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function gate(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(name){const calls=[];const r=runtime((service,action,params)=>{const g=gate();calls.push({...g,service,action,params});return g.promise;});r.app.globalData.user={_id:'admin',openid:'actor',communityId:'c',roles:['admin']};return {r,p:r.instance(`miniprogram/admin/${name}/${name}.js`),calls};}
function row(id){return {_id:id,status:'pending',targetType:'post',pricing:{payAmount:100,goodsCap:0},createdAt:'2026-11-01T00:00:00Z',certs:[]};}
async function check(name,fn){try{const observed=await fn();results.push({name,status:'PASS',observed});}catch(e){results.push({name,status:'FAIL',observed:e.message});}}
(async()=>{
for(const name of ['orders','providers'])await check(name+':新筛选失败不能在新标签下保留旧筛选可操作列表',async()=>{
 const {p,calls}=setup(name);let a=p.load(true);await tick();calls[0].resolve({list:[{...row('old_pending'),status:name==='orders'?'pending_pay':'pending'}],hasMore:true});await a;
 p.filter({detail:{value:1}});await tick();calls[1].reject(Error('synthetic read failure'));await tick();
 assert.equal(p.data.rows.length,0,'new statusIndex='+p.data.statusIndex+', old rows='+p.data.rows.map(x=>x._id)+', error='+p.data.error);
});
await check('reports:快速切换状态，旧成功不得覆盖新状态结果',async()=>{
 const {p,calls}=setup('reports');let a=p.load(true);await tick();p.chooseStatus({currentTarget:{dataset:{status:'upheld'}}});await tick();
 calls[1].resolve({list:[{...row('new_upheld'),status:'upheld'}],hasMore:false});await tick();calls[0].resolve({list:[row('old_pending')],hasMore:true});await a;
 assert.equal(p.data.rows[0]._id,'new_upheld','status='+p.data.status+', row='+p.data.rows[0]._id);
});
await check('stations:重新加载后旧分页不得追加进新列表',async()=>{
 const {p,calls}=setup('stations');const initial=p.load(true);await tick();
 calls[0].resolve({list:[row('old0')],hasMore:true});await initial;
 let a=p.load(false);await tick();let b=p.load(true);await tick();
 calls[2].resolve({list:[row('new0')],hasMore:false});await b;calls[1].resolve({list:[row('old_page')],hasMore:false});await a;
 assert.deepEqual(p.data.rows.map(x=>x._id),['new0']);
});
for(const name of ['orders','providers','reports','merchants','stations'])await check(name+':离页后的读取结果不更新页面',async()=>{
 const {p,calls}=setup(name);const pending=p.load(true);await tick();if(p.onUnload)p.onUnload();let updates=0;p.setData=()=>updates++;
 calls[0].resolve({list:[row('late')],hasMore:false});await pending;assert.equal(updates,0,'late setData count='+updates);
});
await check('merchants:首20项且hasMore时可触达下一页',async()=>{
 const {p,calls}=setup('merchants');let a=p.load();await tick();calls[0].resolve({list:Array.from({length:20},(_,i)=>row('m'+i)),hasMore:true});await a;
 if(p.onReachBottom)p.onReachBottom();await tick();
 assert.equal(calls.length,2,'rendered='+p.data.list.length+', API calls='+calls.length+', onReachBottom='+typeof p.onReachBottom);
});
for(const name of ['orders','providers','merchants'])await check(name+':已有序号保护拒绝旧成功覆盖新列表',async()=>{
 const {p,calls}=setup(name);const a=p.load(true);await tick();const b=p.load(true);await tick();calls[1].resolve({list:[row('new')],hasMore:false});await b;calls[0].resolve({list:[row('old')],hasMore:false});await a;assert.equal((p.data.rows||p.data.list)[0]._id,'new');
});
const result={scope:'Only synthetic API promises, no cloud calls, role changes or review actions',source:'QA40-QA42 working tree; baseline 8cd5817',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results};fs.writeFileSync(__dirname+'/qa40-41-after.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.passed!==result.total)process.exitCode=1;
})();
