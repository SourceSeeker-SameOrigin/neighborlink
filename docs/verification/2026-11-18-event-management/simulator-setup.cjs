// Prepare an existing, isolated tourist project. No cloud credentials or business calls.
const fs = require('fs'),
  path = require('path');
const root = process.cwd();
const project = fs.readFileSync('/tmp/jinlin-qa100-guest-path', 'utf8').trim();
if (JSON.parse(fs.readFileSync(path.join(project, 'project.config.json'))).appid !== 'touristappid') throw Error('Not tourist project');
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({pages: ['events/manage/manage'], window: {navigationBarTitleText: '活动管理'}}));
const api = `let fail=true,record=null;exports.calls={create:0,publish:0,lookup:0};
exports.call=async(n,a,d)=>{
 if(a==='listCommunities')return {list:[{_id:'sample',name:'联调小区'}]};
 if(a==='adminList')return {list:[],hasMore:false};
 if(a==='lookupCreation'){exports.calls.lookup++;if(fail){fail=false;throw Error('合成网络中断，请重试核对')}return record||{eventId:null};}
 if(a==='create'){exports.calls.create++;record={eventId:'synthetic-event',status:'draft'};throw Error('合成创建响应丢失');}
 if(a==='publish'){exports.calls.publish++;record={eventId:'synthetic-event',status:'published'};return record;}
 throw Error('Unexpected API: '+a);
};`;
fs.writeFileSync(path.join(project, 'probe/qa109-api.js'), api);
const future = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
const form = {
  title: '联调活动：原提交恢复',
  desc: '仅本地合成资料',
  location: '联调地点',
  type: 'interest',
  fee: '0',
  capacity: '20',
  startDate: future,
  startTime: '10:00',
  endDate: future,
  endTime: '12:00',
  deadlineDate: future,
  deadlineTime: '09:00',
  sponsorName: '',
  sponsorAmount: '0',
  sponsorNote: ''
};
const receipt = {
  requestId: 'qa109_simulator_restore',
  form,
  input: {
    title: form.title,
    communityIds: ['sample']
  }
};
fs.writeFileSync(path.join(project, 'app.js'), `App({globalData:{user:{_id:'manager',roles:['admin'],communityId:'sample'}},onLaunch(){wx.setStorageSync('event-creation:manager',${JSON.stringify(receipt)})},async ensureSession(){return this.globalData.user}})`);
for (const suffix of ['wxml', 'wxss', 'json']) fs.copyFileSync(path.join(root, 'miniprogram/events/manage/manage.' + suffix), path.join(project, 'events/manage/manage.' + suffix));
const templatePath = path.join(project, 'events/manage/manage.wxml');
fs.writeFileSync(templatePath, fs.readFileSync(templatePath, 'utf8').replace('<button type="primary"', '<button class="qa109-submit" type="primary"'));
let source = fs.readFileSync(path.join(root, 'miniprogram/events/manage/manage.js'), 'utf8').replace("require('../../utils/api')", "require('../../probe/qa109-api')").replace('Page({', 'const definition = {').replace(/\}\);\s*$/, '};');
if (process.env.QA109_MANUAL === '1') source += `
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const observations=[];
async function observe(pg,label){await pause(200);const width=wx.getWindowInfo().windowWidth;const buttons=await new Promise(r=>wx.createSelectorQuery().in(pg).selectAll('.ui-button, .qa109-submit').boundingClientRect(r).exec());observations.push({label,recovery:pg.data.recovery,error:pg.data.error,busy:pg.data.busy,buttons,calls:{...api.calls}});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa109-manual-'+width+'.json',JSON.stringify({width,observations}),'utf8');}
definition.onReady=async function(){for(let i=0;i<80&&this.data.loading;i++)await pause(50);await observe(this,'initial');};
for(const name of ['createActivity','newActivity']){const original=definition[name];definition[name]=async function(...args){await original.apply(this,args);await observe(this,name);};}
Page(definition);`;
else source += `
const pause=ms=>new Promise(r=>setTimeout(r,ms));
definition.onReady=async function(){const out={width:wx.getWindowInfo().windowWidth,states:[]};const pg=this;
const capture=async label=>{await pause(180);const buttons=await new Promise(r=>wx.createSelectorQuery().in(pg).selectAll('.ui-button, .qa109-submit').boundingClientRect(r).exec());out.states.push({label,recovery:pg.data.recovery,error:pg.data.error,busy:pg.data.busy,buttons});};
try{for(let i=0;i<80&&pg.data.loading;i++)await pause(50);await capture('lookup-error');
await pg.createActivity();await capture('confirmed-missing');await pg.createActivity();await capture('create-response-lost');
await pg.createActivity();await capture('recovered-published');out.calls=api.calls;wx.pageScrollTo({scrollTop:0,duration:0});
}catch(e){out.exception=e.errMsg||e.message}wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa109-'+out.width+'.json',JSON.stringify(out),'utf8');};Page(definition);`;
fs.writeFileSync(path.join(project, 'events/manage/manage.js'), source);
console.log(project);
