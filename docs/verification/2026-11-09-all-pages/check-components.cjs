// Check actual custom tag declarations, not only paths already in usingComponents.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../..');
const app=JSON.parse(fs.readFileSync(path.join(root,'miniprogram/app.json')));
const routes=[...app.pages,...app.subPackages.flatMap(p=>p.pages.map(x=>p.root+'/'+x))];
const native=new Set('view text image input textarea picker picker-view picker-view-column switch checkbox checkbox-group radio radio-group button label block navigator scroll-view rich-text form template import include wxs map camera canvas video audio cover-view cover-image movable-area movable-view swiper swiper-item progress slider web-view official-account ad open-data page-meta navigation-bar editor icon'.split(' '));
const problems=[];let checked=0;const visited=new Set();
function check(route){
 if(visited.has(route))return;visited.add(route);checked++;
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'miniprogram/'+route+'.json')));
 const registered={...app.usingComponents,...cfg.usingComponents};
 const xml=fs.readFileSync(path.join(root,'miniprogram/'+route+'.wxml'),'utf8').replace(/<!--[\s\S]*?-->/g,'');
 for(const tag of new Set([...xml.matchAll(/<([a-z][\w-]*)\b/g)].map(m=>m[1]))){
  if(native.has(tag))continue;
  if(!registered[tag]){problems.push({route,tag,reason:'未注册'});continue;}
  const target=registered[tag].startsWith('/')?registered[tag].slice(1):path.posix.normalize(path.posix.join(path.posix.dirname(route),registered[tag]));
  if(!fs.existsSync(path.join(root,'miniprogram/'+target+'.json'))){problems.push({route,tag,reason:'组件不存在'});continue;}
  check(target);
 }
}
for(const route of routes)check(route);
const report={pages:routes.length,templates:checked,problems};
fs.writeFileSync(path.join(__dirname,'components.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(problems.length)process.exitCode=1;
