const fs=require('fs'),vm=require('vm'),assert=require('assert');
const actions=JSON.parse(fs.readFileSync('/tmp/jinlin-check-20261108/boundary.json')).actionMap;
const contracts=[];
for(const [file,method,fn] of [['admin/order/order','perform','admin'],['admin/providers/providers','perform','admin'],['events/manage/manage','action','event'],['admin/exports/exports','loadAll',null]]){
 const text=fs.readFileSync('miniprogram/'+file+'.js','utf8');
 const re=new RegExp('this\\.'+method+"\\('([^']+)'"+(fn?'':", '([^']+)'"),'g');
 const pairs=[...text.matchAll(re)].map(m=>fn?[fn,m[1]]:[m[1],m[2]]);
 assert(pairs.length);for(const [name,action] of pairs)assert(actions[name].includes(action));contracts.push({file,method,pairs,status:'PASS'});
}
const exportsText=fs.readFileSync('miniprogram/admin/exports/exports.js','utf8');
const pairs=[...exportsText.matchAll(/this\.download\(\['([^']+)', '([^']+)'\]/g)].map(m=>[m[1],m[2]]);
for(const [name,action]of pairs)assert(actions[name].includes(action));contracts.push({file:'admin/exports/exports',method:'download',pairs,status:'PASS'});
for(const [file,fn,allowed]of [['pages/orders/detail','order',['confirm','rate','complain']],['provider/task/task','provider',['start','release','deliver']]]){const text=fs.readFileSync('miniprogram/'+file+'.js','utf8');assert(text.includes(JSON.stringify(allowed).replaceAll('"',"'").replaceAll(',',', ')+'.includes(action)'));for(const action of allowed)assert(actions[fn].includes(action));contracts.push({file,pairs:allowed.map(a=>[fn,a]),status:'PASS'});}
const page={};vm.runInNewContext(fs.readFileSync('miniprogram/recycle/order/order.js','utf8'),{Page:p=>Object.assign(page,p),require:()=>({call:async()=>{throw Error('offline network failure')}}),getApp:()=>({ensureSession:async()=>{throw Error('offline session failure')}}),wx:{}});page.setData=o=>Object.assign(page.data,o);
(async()=>{await page.onLoad();const markup=fs.readFileSync('miniprogram/recycle/order/order.wxml','utf8');const report={dynamicSites:contracts.length,contracts,recycleFailure:{errorShown:!!page.data.error,loading:page.data.loading,retryButtonPresent:/重试|重新加载/.test(markup),reloadHandlerPresent:typeof page.load==='function'},styles:[{file:'recycle/order/order.wxss',selector:'.choices button',fontRpx:28,requirement:32},{file:'shops/list/list.wxss',selector:'.muted',fontRpx:26,requirement:32}],scope:'source/isolated VM only; no cloud calls'};fs.writeFileSync('/tmp/jinlin-check-20261108/supplement.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));})();
