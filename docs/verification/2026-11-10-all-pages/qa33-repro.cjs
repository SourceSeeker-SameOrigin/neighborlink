// Diagnostic only: synthetic pagination responses, no network or cloud writes.
const fs=require('fs');const {runtime}=require('../2026-11-09-remediation/page-fixture.cjs');
const allCommunities=Array.from({length:101},(_,i)=>({_id:'c'+i,name:'合成小区'+i}));
const allProviders=Array.from({length:21},(_,i)=>({_id:'p'+i}));
const allMerchants=Array.from({length:21},(_,i)=>({_id:'m'+i}));
(async()=>{const results=[];for(const name of ['dashboard','features','recycle','posters','settlements']){
const r=runtime(async(fn,action,p={})=>{
 const all=action==='listCommunities'?allCommunities:action==='listProviders'?allProviders:action==='adminList'?allMerchants:null;
 if(all){const offset=p.offset||0,size=action==='listCommunities'?100:20;return{list:all.slice(offset,offset+size),hasMore:offset+size<all.length};}
 if(action==='getCommunity')return{buildings:[]};if(action==='getFeatures')return{global:{},community:{}};
 if(action==='dashboard')return{serviceFeeTurnover:0,actualIncome:0,refundTotal:0,complaintRate:0,acceptRate15m:0,extensions:{},orders:{}};
 if(action==='listSettlements')return{list:[]};return{};
});r.app.globalData.user={roles:['admin'],communityId:'c100'};const p=r.instance(`miniprogram/admin/${name}/${name}.js`);await p.load();
results.push({page:name,communityCount:p.data.communities.length,expectedCommunities:101,lastCommunityAvailable:p.data.communities.some(c=>c._id==='c100'),providerCount:p.data.providers?.length,expectedProviders:['posters','settlements'].includes(name)?21:undefined,merchantCount:p.data.merchants?.length,expectedMerchants:name==='settlements'?21:undefined,offsets:r.requests.filter(x=>['listCommunities','listProviders','adminList'].includes(x[1])).map(x=>({action:x[1],offset:x[2].offset||0})),error:p.data.error});
}const report={scope:'Isolated VM pagination diagnostic only',status:'New QA33 decision required; not fixed',results};fs.writeFileSync(__dirname+'/qa33-repro.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));})();
