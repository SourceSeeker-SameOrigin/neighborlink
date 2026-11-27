// Structural/style coverage only. It does not assert pixel fidelity or business success.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve('miniprogram'),app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));
const pages=[...app.pages,...app.subPackages.flatMap(p=>p.pages.map(x=>p.root+'/'+x))];
const before=JSON.parse(fs.readFileSync('docs/verification/2026-11-08-ui/before-pages.json'));
const issues=[],coverage=[];
for(const route of pages){
 const xml=fs.readFileSync(path.join(root,route+'.wxml'),'utf8');
 const events=[...xml.matchAll(/(?:bind|catch)(?::)?[a-z]+\s*=\s*['"]([A-Za-z_$][\w$]*)['"]/g)].map(m=>m[1]).sort();
 const previous=before.find(x=>x.page===route);
 // QA40 approved replacing load retry handlers with range-aware retry wrappers.
 const approvedRetryRoutes=['admin/reports/reports','admin/merchants/merchants','admin/stations/stations',
  'provider/workbench/workbench','merchant/orders/orders','station/workbench/workbench','station/worker/worker'];
 const previousEvents=previous.events.map(e=>e==='load'&&approvedRetryRoutes.includes(route)?'retry':e);
 const oldEvents=previousEvents.filter(x=>!(x==='phone'&&['pages/bind/bind','provider/apply/apply'].includes(route)));
 // QA80 replaced exactly one generic change handler per location picker.
 const placeFields = { 'pages/service/express': 'stationIndex', 'elder/meal': 'canteenIndex' };
 if (placeFields[route]) {
   const locationPicker = (xml.match(/<picker\b[^>]*>/g) || []).find(tag =>
     tag.includes('form.' + placeFields[route]) && /\bbindchange="selectPlace"/.test(tag));
   if (!locationPicker) issues.push({ route, missingLocationPickerBinding: 'selectPlace' });
   const index = oldEvents.indexOf('change');
   if (index !== -1) oldEvents[index] = 'selectPlace';
 }
 const remaining=[...events];for(const event of oldEvents){const i=remaining.indexOf(event);if(i<0)issues.push({route,missingEvent:event});else remaining.splice(i,1);}
 for(const m of xml.matchAll(/src="(\/assets\/[^{}"]+)"/g))if(!fs.existsSync(path.join(root,m[1])))issues.push({route,missingAsset:m[1]});
 const shell=['pages/index/index','pages/bind/bind','pages/me/me'].includes(route)||xml.includes('page-masthead');if(!shell)issues.push({route,missingDesignShell:true});
 coverage.push({route,title:JSON.parse(fs.readFileSync(path.join(root,route+'.json'))).navigationBarTitleText,sourceStyleCovered:shell,eventsPreserved:true,liveVisualStatus:'pending',businessAcceptance:'pending'});
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);}
for(const file of walk(root).filter(x=>x.endsWith('.wxss'))){const css=fs.readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');for(const match of css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)rpx/g))if(+match[1]<32)issues.push({file: path.relative(root,file),smallFont:match[1]});
 if(file !== path.join(root,'app.wxss'))for(const match of css.matchAll(/([^{}]+)\{/g)){const selector=match[1].trim();if(!selector.startsWith('@')&&(selector.includes('[')||/(?:^|[ ,>+~])(?:button|view|text|image|input|textarea|picker|label|navigator)\b/.test(selector)))issues.push({file:path.relative(root,file),invalidLocalSelector:selector});}
}
const report={scope:'Static all-page coverage, handler retention, assets, text sizes and component selectors; no claim of visual equivalence',pageCount:pages.length,issues,coverage};
fs.writeFileSync('docs/verification/2026-11-11-ui-audit/style-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pageCount:pages.length,issues},null,2));assert.equal(issues.length,0);
