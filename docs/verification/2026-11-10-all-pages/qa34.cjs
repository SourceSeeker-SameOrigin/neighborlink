const fs=require('fs'),assert=require('assert');
const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const results=[],rows=Array.from({length:121},(_,i)=>({_id:'s'+i,total:123,merchantId:'m',period:{}}));
function setup(control={}){
 const r=runtime(async(fn,action,data={})=>{
  if(action==='listCommunities')return {list:[{_id:'c'}],hasMore:false};
  if(action==='listProviders')return {list:[],hasMore:false};
  if(action==='adminList')return {list:[{_id:'m',name:'合成商家'}],hasMore:false};
  if(action==='getCommunity')return {_id:'c'};
  if(action==='listSettlements'){
   const offset=data.offset||0;
   if(offset && control.pause)await control.pause;
   if(offset && control.fail)throw Error('合成下一页失败');
   if(offset && control.result)return control.result;
   const source=control.empty?[]:rows;
   return {list:source.slice(offset,offset+20),hasMore:offset+20<source.length};
  }throw Error('Unexpected business action '+action);
 });r.app.globalData.user={_id:'fixture',roles:control.roles||['admin'],communityId:'c'};
 return {r,p:r.instance('miniprogram/admin/settlements/settlements.js')};
}
async function test(name,run){try{await run();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
 await test('121条全部可加载，金额展示及商家名称保持',async()=>{const {p}=setup();await p.load();assert.equal(p.data.settlements.length,20);while(p.data.historyHasMore)await p.loadMoreHistory();assert.equal(p.data.settlements.length,121);assert.equal(p.data.historyOffset,121);assert.equal(p.data.settlements[120].totalText,'1.23');assert.equal(p.data.settlements[120].merchantName,'合成商家');});
 await test('失败保留记录和游标，重试仍请求同一页',async()=>{const c={fail:true},{r,p}=setup(c);await p.load();await p.loadMoreHistory();assert.equal(p.data.settlements.length,20);assert.equal(p.data.historyOffset,20);assert.equal(p.data.historyError,'合成下一页失败');c.fail=false;await p.loadMoreHistory();assert.equal(p.data.settlements.length,40);assert.equal(p.data.historyError,'');assert.deepEqual(r.requests.filter(x=>x[1]==='listSettlements').map(x=>x[2].offset||0),[0,20,20]);});
 await test('空结果及未就绪均不发加载更多请求',async()=>{const {r,p}=setup({empty:true});await p.loadMoreHistory();assert.equal(r.requests.length,0);await p.load();const count=r.requests.length;await p.loadMoreHistory();assert.equal(r.requests.length,count);assert.equal(p.data.settlements.length,0);});
 await test('慢请求时重复点击只发送一次',async()=>{let done;const {r,p}=setup({pause:new Promise(resolve=>done=resolve)});await p.load();const pending=p.loadMoreHistory();await p.loadMoreHistory();assert.equal(r.requests.filter(x=>x[1]==='listSettlements').length,2);done();await pending;assert.equal(p.data.settlements.length,40);});
 await test('整页重新加载后旧分页响应不追加',async()=>{let done;const {p}=setup({pause:new Promise(resolve=>done=resolve)});await p.load();const pending=p.loadMoreHistory();await p.load();done();await pending;assert.equal(p.data.settlements.length,20);assert.equal(p.data.historyOffset,20);assert.equal(p.data.historyLoading,false);});
 await test('离页迟到请求不更新',async()=>{let done;const {p}=setup({pause:new Promise(resolve=>done=resolve)});await p.load();const pending=p.loadMoreHistory();p.onUnload();p.setData=()=>{throw Error('late update')};done();await pending;});
 await test('重复ID不重复展示，游标仍按返回记录数前进',async()=>{const {p}=setup({result:{list:[rows[19],rows[20]],hasMore:false}});await p.load();await p.loadMoreHistory();assert.equal(p.data.settlements.length,21);assert.equal(p.data.historyOffset,22);});
 await test('异常空页hasMore只报错，保留当前列表',async()=>{const {p}=setup({result:{list:[],hasMore:true}});await p.load();await p.loadMoreHistory();assert.equal(p.data.settlements.length,20);assert.equal(p.data.historyOffset,20);assert(p.data.historyError.includes('分页异常'));});
 await test('物业加载更多不携带可篡改的小区或付款参数',async()=>{const {r,p}=setup({roles:['property']});await p.load();await p.loadMoreHistory();assert.equal(p.data.isAdmin,false);assert.deepEqual(r.requests.filter(x=>x[1]==='listSettlements').map(x=>x[2]),[{}, {offset:20}]);assert(!r.requests.some(x=>['listCommunities','listProviders','adminList'].includes(x[1])));});
 const report={scope:'Isolated frontend only; no real history records or settlement writes',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results};fs.writeFileSync(__dirname+'/qa34.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.passed!==report.total)process.exitCode=1;
})();
