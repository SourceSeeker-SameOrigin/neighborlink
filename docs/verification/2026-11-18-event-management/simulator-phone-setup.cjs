// Local tourist harness: actual task UI, synthetic phone callbacks; no real calls.
require('./simulator-report-media-setup.cjs');
const fs = require('fs'), path = require('path');
const project = fs.readFileSync('/tmp/jinlin-qa100-guest-path', 'utf8').trim();
fs.writeFileSync(path.join(project, 'probe/qa115-api.js'), `
exports.records=[];exports.calls=[];
exports.call=async(n,a)=>{if(n!=='order'||a!=='detail')throw Error('Business writes forbidden');
await new Promise(r=>setTimeout(r,100));return {_id:'synthetic-visit',serviceCode:'visit',serviceName:'独居探访',
status:'in_service',statusText:'服务中',featureEnabled:true,canCallResident:true,canShareLocation:false,
address:{buildingName:'合成楼栋'},userPhone:'仅本地合成电话',detail:{},pricing:{},
slot:{date:'2026-11-18',start:'07:00',end:'23:59'},note:'本地拨号回调验收，不会拨打电话'};};
exports.uploadPhotos=async()=>{throw Error('Uploads forbidden');};
exports.makePhoneCall=options=>{const outcome=['cancel','failure','success'][exports.calls.length%3];
exports.calls.push({outcome});setTimeout(()=>{if(outcome==='success')options.success();
else options.fail({errMsg:outcome==='cancel'?'makePhoneCall:fail cancel':'synthetic failure'});},2000);};
exports.save=(p,phase)=>{exports.records.push({phase,ready:p.data.taskReady,calling:p.data.callingResident,
error:p.data.error,attention:p.data.visitAttention,confirmed:p.data.attentionCallConfirmed});
wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa117-'+wx.getWindowInfo().windowWidth+'.json',
JSON.stringify({width:wx.getWindowInfo().windowWidth,calls:exports.calls,records:exports.records}),'utf8');};
`);
let source = fs.readFileSync('miniprogram/provider/task/task.js', 'utf8')
  .replace("require('../../utils/api')", "require('../../probe/qa115-api')")
  .replace("require('../../utils/media')", "require('../../probe/qa115-api')")
  .replace('wx.makePhoneCall(', 'api.makePhoneCall(')
  .replace('Page({', 'const definition={').replace(/\}\);\s*$/, '};');
source += `
const onLoad=definition.onLoad;definition.onLoad=function(){onLoad.call(this,{id:'synthetic-visit'});};
const load=definition.load;definition.load=async function(...args){await load.apply(this,args);
if(this.data.taskReady&&!this.qaSeeded){this.qaSeeded=true;this.visitAttention({detail:{value:true}});}api.save(this,'loaded');};
for(const name of ['callResident','applyPhoneResult']){const fn=definition[name];definition[name]=function(...args){
const result=fn.apply(this,args);api.save(this,name);return result;};}
Page(definition);
`;
fs.writeFileSync(path.join(project, 'provider/task/task.js'), source);
fs.writeFileSync(path.join(project, 'provider/task/task.wxml'),
  '<view class="page">仅本地：联系按钮依次返回取消、失败、成功；不拨电话。</view>' +
  fs.readFileSync('miniprogram/provider/task/task.wxml', 'utf8'));
console.log('QA117 local phone harness ready; every third synthetic callback succeeds. No real phone, cloud writes or uploads.');
