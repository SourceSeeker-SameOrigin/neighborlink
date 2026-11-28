// Tourist only. Actual task UI; synthetic report and read failures, no cloud writes.
require('./simulator-report-media-setup.cjs');
const fs=require('fs'),path=require('path');
const project=fs.readFileSync('/tmp/jinlin-qa100-guest-path','utf8').trim();
fs.writeFileSync(path.join(project,'probe/qa115-api.js'),`
exports.mode='lost';exports.done=false;exports.readFail=false;exports.writes=[];exports.records=[];
exports.call=async(n,a,d)=>{await new Promise(r=>setTimeout(r,100));
if(n==='order'&&a==='detail'){if(exports.readFail){exports.readFail=false;throw Error('合成核对失败');}
return {_id:'synthetic-vacant',serviceCode:'vacant',serviceName:'空置房巡检',status:exports.done?'delivered':'in_service',
statusText:exports.done?'待确认':'服务中',featureEnabled:true,canShareLocation:false,detail:{entry:'key_handover'},pricing:{},
address:{buildingName:'合成楼栋'},userPhone:'已隐藏',slot:{date:'2026-11-19',start:'07:00',end:'23:59'}};}
if(n!=='vacant'||a!=='recordReport')throw Error('Business writes forbidden');
exports.writes.push({mode:exports.mode});if(exports.mode==='lost'){exports.done=true;exports.readFail=true;throw Error('合成提交响应丢失');}
if(exports.writes.filter(x=>x.mode==='not-sent').length===1)throw Error('合成请求未送达');exports.done=true;return{};};
exports.uploadPhotos=async()=>{throw Error('Uploads forbidden');};
exports.save=p=>{exports.records.push({mode:exports.mode,status:p.data.order?.status,ready:p.data.taskReady,busy:p.data.busy,
loading:p.data.loading,error:p.data.error,notes:p.data.vacantNotes,counts:Object.fromEntries(Object.entries(p.data.photoByItem).map(([k,v])=>[k,v.length]))});
wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa120-'+wx.getWindowInfo().windowWidth+'.json',
JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,records:exports.records}),'utf8');};`);
let source=fs.readFileSync('miniprogram/provider/task/task.js','utf8').replace("require('../../utils/api')","require('../../probe/qa115-api')")
 .replace("require('../../utils/media')","require('../../probe/qa115-api')").replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
source+=`
const onLoad=definition.onLoad;definition.onLoad=function(){onLoad.call(this,{id:'synthetic-vacant'});};
const load=definition.load;definition.load=async function(...args){await load.apply(this,args);if(this.data.taskReady&&!this.qaSeeded){
this.qaSeeded=true;this.setData({checklist:Object.fromEntries(this.data.vacantItems.map(x=>[x.key,true])),
photoByItem:Object.fromEntries(this.data.vacantItems.map(x=>[x.key,['/assets/icons/help.png']])),vacantNotes:'本地保留草稿'});}api.save(this);};
const submit=definition.submitVacantReport;definition.submitVacantReport=async function(){const result=submit.call(this);api.save(this);await result;api.save(this);};
definition.qaSwitch=async function(){api.mode='not-sent';api.done=false;api.readFail=false;await this.load();};Page(definition);`;
fs.writeFileSync(path.join(project,'provider/task/task.js'),source);
fs.writeFileSync(path.join(project,'provider/task/task.wxml'),'<view class="page">仅本地：先验已提交响应丢失及核对失败，再验未送达重试。<button class="ui-button" bindtap="qaSwitch">仅本地：切换未送达场景</button></view>'+fs.readFileSync('miniprogram/provider/task/task.wxml','utf8'));
console.log('QA120 tourist harness ready; no real uploads or reports.');
