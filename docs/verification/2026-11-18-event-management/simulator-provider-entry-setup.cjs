// Only synthetic data in the already-authorized disposable tourist project.
const fs = require('fs'), path = require('path');
const project = fs.readFileSync('/tmp/jinlin-qa100-guest-path', 'utf8').trim();
if (JSON.parse(fs.readFileSync(path.join(project, 'project.config.json'))).appid !== 'touristappid') throw Error('Tourist only');
for (const folder of ['provider/workbench', 'provider/hall', 'provider/task', 'utils', 'probe']) fs.mkdirSync(path.join(project, folder), { recursive: true });
for (const folder of ['components', 'styles', 'templates', 'assets']) fs.cpSync('miniprogram/' + folder, path.join(project, folder), { recursive: true });
for (const name of ['money', 'time', 'privacy', 'subscriptions']) fs.copyFileSync('miniprogram/utils/' + name + '.js', path.join(project, 'utils/' + name + '.js'));
fs.copyFileSync('miniprogram/app.wxss', path.join(project, 'app.wxss'));
fs.writeFileSync(path.join(project, 'utils/api.js'), "module.exports=require('../probe/qa123-api');");
fs.writeFileSync(path.join(project, 'app.json'), JSON.stringify({ pages: ['provider/workbench/workbench', 'provider/hall/hall', 'provider/task/task'], window: { navigationBarTitleText: '工作台联调' } }));
fs.writeFileSync(path.join(project, 'app.js'), "App({globalData:{user:{_id:'synthetic-a',roles:['provider']},community:{features:{}}},async ensureSession(){return this.globalData.user;}});");
fs.writeFileSync(path.join(project, 'probe/qa123-api.js'), `
exports.fail=false;exports.records=[];exports.writes=[];
exports.save=(page,phase)=>{exports.records.push({page:page.route,phase,ready:page.data.ready,loading:page.data.loading,busy:page.data.busy,error:page.data.error,tasks:(page.data.tasks||[]).length,provider:page.data.provider?.realName||'',writes:exports.writes.length});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa123-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,records:exports.records}),'utf8');};
exports.call=async(n,a,d={})=>{if(exports.fail)throw Object.assign(Error('合成读取失败，请重试'),{code:'E_FORBIDDEN'});
if(a==='myStatus')return{provider:{_id:getApp().globalData.user._id,realName:'合成服务员',status:'approved',onDuty:false,level:2,insuranceUntil:Date.now()+86400000,referralCode:'仅本地样例'},todayCount:1,todayIncome:300};
if(a==='myTasks'||a==='hall')return{list:[{_id:'synthetic-task',serviceName:'代扔垃圾',serviceCode:'trash',statusText:'待接单',buildingName:'合成楼栋',pricing:{payAmount:500,goodsCap:0},estimatedIncome:300,slot:{date:'2026-11-20',start:'07:00',end:'09:00'},createdAt:Date.now()}],hasMore:false};
if(a==='setDuty'||a==='accept'){exports.writes.push({action:a,user:getApp().globalData.user._id,...d});return{orderId:'synthetic-task'};}
if(a==='subscriptionTemplates')return{};throw Error('Blocked unexpected API '+a);};`);
for (const route of ['workbench', 'hall']) {
  for (const ext of ['json', 'wxml', 'wxss']) fs.copyFileSync('miniprogram/provider/' + route + '/' + route + '.' + ext, path.join(project, 'provider/' + route + '/' + route + '.' + ext));
  let js = fs.readFileSync('miniprogram/provider/' + route + '/' + route + '.js', 'utf8').replace('Page({', 'const definition={').replace(/\}\);\s*$/, '};');
  js += `
const onShow=definition.onShow;definition.onShow=async function(){await onShow.call(this);api.save(this,'shown');};
definition.qaFailure=async function(){api.fail=true;await this.load(${route === 'hall' ? 'true' : ''});api.save(this,'read-failed');api.fail=false;};
const retry=definition.retry;definition.retry=async function(){await retry.call(this);api.save(this,'retry');};
definition.qaUser=async function(){getApp().globalData.user={_id:getApp().globalData.user._id==='synthetic-a'?'synthetic-b':'synthetic-a',roles:['provider']};await this.${route === 'hall' ? "accept({currentTarget:{dataset:{id:'synthetic-task'}}})" : 'duty({detail:{value:false}})'};api.save(this,'changed-user');};
${route === 'hall' ? "const accept=definition.accept;definition.accept=async function(e){await accept.call(this,e);api.save(this,'accept-settled');};" : ''}
Page(definition);`;
  fs.writeFileSync(path.join(project, 'provider/' + route + '/' + route + '.js'), js);
  const wxml = path.join(project, 'provider/' + route + '/' + route + '.wxml');
  fs.writeFileSync(wxml, '<view>仅本地合成，无真实任务</view><button bindtap="qaFailure">模拟读取失败</button><button bindtap="qaUser">模拟换人后旧操作</button>' + fs.readFileSync(wxml, 'utf8'));
}
fs.writeFileSync(path.join(project, 'provider/task/task.json'), '{}');
fs.writeFileSync(path.join(project, 'provider/task/task.wxss'), '');
fs.writeFileSync(path.join(project, 'provider/task/task.wxml'), '<view>已进入合成任务详情，真实接单0笔</view>');
fs.writeFileSync(path.join(project, 'provider/task/task.js'), "const api=require('../../utils/api');Page({onShow(){api.save(this,'task-detail');}});");
console.log('Prepared synthetic workbench/hall: read failure, retry, changed identity, normal accept; no cloud writes');
