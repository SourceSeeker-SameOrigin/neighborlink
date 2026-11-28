// Test-only tourist project, actual scan handler and WXML. No real camera/cloud.
const fs = require('node:fs'), path = require('node:path');
const project = fs.readFileSync('/tmp/jinlin-qa100-guest-path', 'utf8').trim();
if (JSON.parse(fs.readFileSync(path.join(project, 'project.config.json'))).appid !== 'touristappid') throw Error('Tourist project required');
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({ pages: ['events/manage/manage'], window: { navigationBarTitleText: '活动扫码联调' } }));
fs.writeFileSync(path.join(project, 'app.js'), `App({globalData:{user:{_id:'qa111-manager',roles:['admin'],communityId:'sample'}},async ensureSession(){return this.globalData.user}})`);
fs.writeFileSync(path.join(project, 'probe/qa111-api.js'), `
exports.count=0;
exports.call=async(n,a)=>{
 if(a==='listCommunities')return{list:[{_id:'sample',name:'本地合成小区'}]};
 if(a==='adminList')return{list:[],hasMore:false};
 throw Error('Unexpected API '+a);
};
exports.scanCode=o=>{const n=++exports.count;setTimeout(()=>{
 if(n===1)o.fail({errMsg:'扫码失败（本地合成）'});
 else if(n===2)o.fail({errMsg:'scanCode:fail cancel'});
 else o.success({scene:'e=qa111-synthetic-code'});
},500);};`);
for (const ext of ['wxml','wxss','json']) fs.copyFileSync('miniprogram/events/manage/manage.'+ext,path.join(project,'events/manage/manage.'+ext));
const template=path.join(project,'events/manage/manage.wxml');
fs.writeFileSync(template,fs.readFileSync(template,'utf8').replace('bindtap="scan"','class="qa111-scan" bindtap="scan"'));
let source=fs.readFileSync('miniprogram/events/manage/manage.js','utf8').replace("require('../../utils/api')","require('../../probe/qa111-api')").replace('wx.scanCode(', 'api.scanCode(').replace('Page({','const definition={').replace(/\}\);\s*$/,'};');
source+=`
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const records=[];
const measure=pg=>new Promise(r=>wx.createSelectorQuery().in(pg).select('.qa111-scan').fields({rect:true,size:true,properties:['disabled','loading']},r).exec());
const save=()=>wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa111-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,records}),'utf8');
definition.onReady=async function(){for(let i=0;i<80&&this.data.loading;i++)await pause(50);await pause(150);const rect=await measure(this);records.push({state:'initial',rect});save();if(rect)wx.pageScrollTo({scrollTop:Math.max(0,rect.top-250),duration:0});};
const original=definition.scan;
definition.scan=async function(){const pending=original.call(this);await pause(100);records.push({state:'scanning',rect:await measure(this),scanning:this.data.scanning});await pending;await pause(50);records.push({state:'settled',count:api.count,rect:await measure(this),error:this.data.error,scanCode:this.data.scanCode,scanning:this.data.scanning});save();if(this.data.error)wx.pageScrollTo({scrollTop:0,duration:0});};
Page(definition);`;
fs.writeFileSync(path.join(project,'events/manage/manage.js'),source);
console.log('QA111 tourist project prepared');
