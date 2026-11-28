const assert=require('node:assert/strict');
const {runtime}=require(process.cwd()+'/docs/verification/2026-11-09-remediation/page-fixture.cjs');
const results=[];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
const payload=id=>({list:[{_id:id,status:'unused',kind:'amount_off',value:100,validTo:1795000000000,createdAt:1795000000000}],hasMore:false});
async function test(name,fn){try{await fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:e.message})}}
(async()=>{
for(const route of ['coupons/mine/mine','coupons/center/center','notices/list/list']){
 await test(route+' successful list load',async()=>{const r=runtime(async()=>payload('new'));const p=r.instance('miniprogram/'+route+'.js');await p.load();assert.equal(p.data.list[0]._id,'new');assert.equal(p.data.loading,false)});
 await test(route+' old response cannot replace new list',async()=>{const a=deferred(),b=deferred();let n=0;const r=runtime(()=>++n===1?a.promise:b.promise),p=r.instance('miniprogram/'+route+'.js');const x=p.load();await flush();const y=p.load();await flush();b.resolve(payload('new'));await y;a.resolve(payload('old'));await x;assert.equal(p.data.list[0]._id,'new','actual latest item='+p.data.list[0]._id)});
 for(const event of ['onHide','onUnload'])await test(route+' '+event+' suppresses late writes',async()=>{const d=deferred(),r=runtime(()=>d.promise),p=r.instance('miniprogram/'+route+'.js');const pending=p.load();await flush();if(p[event])p[event]();let writes=0;const set=p.setData.bind(p);p.setData=x=>{writes++;set(x)};d.resolve(payload('late'));await pending;assert.equal(writes,0,'late setData count='+writes)});
}
console.log(JSON.stringify({mode:'actual-page-synthetic-only',total:results.length,passed:results.filter(x=>x.passed).length,results},null,2));
})();
