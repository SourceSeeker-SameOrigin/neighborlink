// Local tourist only: production task UI, four-photo legacy draft and synthetic uploads.
require('./simulator-report-media-setup.cjs');
const fs = require('fs'), path = require('path');
const project = fs.readFileSync('/tmp/jinlin-qa100-guest-path', 'utf8').trim();
for (let i = 0; i < 8; i++) fs.copyFileSync(path.join(project, 'assets/icons/help.png'), path.join(project, 'assets/qa118-' + i + '.png'));
const apiFile = path.join(project, 'probe/qa115-api.js');
let api = fs.readFileSync(apiFile, 'utf8').replace("exports.mode='buy'", "exports.mode='vacant'")
  .replace("exports.mode==='buy'?'代买':'空置房巡检'", "exports.mode==='pet'?'上门喂宠':'空置房巡检'");
api += `
exports.uploadPhotos=async(folder,count)=>{exports.uploads.push({folder,count});await new Promise(r=>setTimeout(r,400));return ['/assets/qa118-'+(4+exports.uploads.length%4)+'.png'];};
exports.save=p=>{exports.records.push({mode:exports.mode,status:p.data.order?.status,error:p.data.error,uploading:p.data.uploading,busy:p.data.busy,counts:Object.fromEntries(Object.entries(p.data.photoByItem).map(([key,files])=>[key,files.length]))});wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+'/jinlin-qa118-'+wx.getWindowInfo().windowWidth+'.json',JSON.stringify({width:wx.getWindowInfo().windowWidth,writes:exports.writes,uploads:exports.uploads,records:exports.records}),'utf8');};
`;
fs.writeFileSync(apiFile, api);
const file = path.join(project, 'provider/task/task.js');
let source = fs.readFileSync(file, 'utf8').replace("id:'synthetic-buy'", "id:'synthetic-vacant'");
source = source.replace('Page(definition);', `
const originalLoad=definition.load;definition.load=async function(...args){await originalLoad.apply(this,args);if(api.mode==='vacant'&&!this.qaSeeded&&this.data.order){this.qaSeeded=true;this.setData({checklist:Object.fromEntries(this.data.vacantItems.map(x=>[x.key,true])),photoByItem:Object.fromEntries(this.data.vacantItems.map(x=>[x.key,x.key==='windows'?[0,1,2,3].map(i=>'/assets/qa118-'+i+'.png'):['/assets/qa118-0.png']]))});}api.save(this);};
const remove=definition.removeVacantPhoto;definition.removeVacantPhoto=function(event){const result=remove.call(this,event);api.save(this);return result;};
definition.qaSwitch=async function(){api.mode=api.mode==='vacant'?'pet':'vacant';api.done=false;this.qaSeeded=false;this.orderId='synthetic-'+api.mode;await this.load();};
Page(definition);`);
fs.writeFileSync(file, source);
const markup = path.join(project, 'provider/task/task.wxml');
fs.writeFileSync(markup, fs.readFileSync(markup, 'utf8').replace('仅本地：切换代买／巡检', '仅本地：切换巡检／喂宠'));
console.log('QA118/119: local four-photo draft; remove to three/two, retake; switch to pet to verify generic completion absent. No cloud operations.');
