// Reuse the existing tourist project. Intercept every API call; no cloud access.
const fs = require('node:fs'), path = require('node:path');
const project = fs.readFileSync('/tmp/jinlin-qa100-guest-path', 'utf8').trim();
if (JSON.parse(fs.readFileSync(path.join(project, 'project.config.json'))).appid !== 'touristappid') throw Error('Tourist project required');
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({ pages: ['events/manage/manage'], window: { navigationBarTitleText: '活动管理' } }));
fs.writeFileSync(path.join(project, 'app.js'), `App({globalData:{user:{_id:'qa110-manager',roles:['admin'],communityId:'sample'}},async ensureSession(){return this.globalData.user}})`);
fs.writeFileSync(path.join(project, 'probe/qa110-api.js'), `
exports.calls=[];exports.pending=[];exports.hold=false;
const list=[{_id:'publish',title:'本地发布测试',status:'draft'},
{_id:'review',title:'本地审核测试',status:'draft',reviewRequested:true},
{_id:'cancelEvent',title:'本地取消测试',status:'published'},
{_id:'retryCancellation',title:'本地退款任务测试',status:'cancelled',cancelRefund:{status:'attention',failedCount:1,totalCount:1,completedCount:0}},
{_id:'checkin',title:'本地签到测试',status:'published'}];
exports.call=async(n,a,d)=>{
 if(a==='listCommunities')return{list:[{_id:'sample',name:'本地合成小区'}]};
 if(a==='adminList')return{list:list.map(x=>({signupCount:0,capacity:1,...x})),hasMore:false};
 if(['publish','review','cancelEvent','retryCancellation','checkin'].includes(a)){
 exports.calls.push({action:a,eventId:d.eventId});
 if(exports.hold)return new Promise((resolve,reject)=>exports.pending.push({resolve,reject}));return{};}
 throw Error('Unexpected API '+a);
};`);
for (const ext of ['wxml','wxss','json']) fs.copyFileSync(path.join('miniprogram/events/manage/manage.' + ext), path.join(project, 'events/manage/manage.' + ext));
const template = path.join(project, 'events/manage/manage.wxml');
fs.writeFileSync(template, fs.readFileSync(template, 'utf8').replace(/bindtap="(publish|cancel|retryCancellation|checkin)"/g, 'class="qa110-action" bindtap="$1"'));
let source = fs.readFileSync('miniprogram/events/manage/manage.js','utf8').replace("require('../../utils/api')", "require('../../probe/qa110-api')").replace('Page({','const definition = {').replace(/\}\);\s*$/, '};');
source += `
const pause=ms=>new Promise(r=>setTimeout(r,ms));
definition.onReady=async function(){const pg=this,out={width:wx.getWindowInfo().windowWidth,cases:[]};
const buttons=()=>new Promise(r=>wx.createSelectorQuery().in(pg).selectAll('.qa110-action').fields({rect:true,size:true,properties:['disabled'],dataset:true},r).exec());
try{for(let i=0;i<80&&pg.data.loading;i++)await pause(50);
for(const [action,method] of [['publish','publish'],['review','publish'],['cancelEvent','cancel'],['retryCancellation','retryCancellation'],['checkin','checkin']]){
pg.setData({scanCode:'synthetic'});api.hold=true;const before=api.calls.length;
const pending=pg[method]({currentTarget:{dataset:{id:action}}});for(let i=0;i<40&&!api.pending.length;i++)await pause(25);
if(!api.pending.length)throw Error('Operation not sent');await pause(100);const busyButtons=await buttons();
pg.onHide();await pg.onShow();api.pending.shift().reject(Error('旧错误不可显示'));await pending;
if(pg.data.error||pg.data.busy)throw Error('Stale response applied');
api.hold=false;pg.setData({scanCode:'synthetic'});await pg[method]({currentTarget:{dataset:{id:action}}});
out.cases.push({action,requests:api.calls.length-before,error:pg.data.error,busy:pg.data.busy,busyButtons});}
await pause(150);out.buttons=await buttons();out.calls=api.calls;pg.setData({scanCode:'synthetic-qa110-code'});
const first=out.buttons[0];if(first)wx.pageScrollTo({scrollTop:Math.max(0,first.top-150),duration:0});
}catch(e){out.exception=e.errMsg||e.message}
wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa110-'+out.width+'.json',JSON.stringify(out),'utf8');};
for(const name of ['publish','cancel','retryCancellation','checkin']){const original=definition[name];definition[name]=async function(...args){await original.apply(this,args);wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa110-clicks-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({calls:api.calls,error:this.data.error,busy:this.data.busy}),'utf8');};}
Page(definition);`;
fs.writeFileSync(path.join(project,'events/manage/manage.js'),source);
console.log(project);
