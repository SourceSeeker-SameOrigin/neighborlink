const assert = require('node:assert/strict');
const hint = require('../../../miniprogram/elder/escort-times');
const { cleanEscort } = require('../../../cloudfunctions/_shared/services/elder');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { ymd, addDays } = require('../../../miniprogram/utils/time');

const windows = (pairs) => pairs.map(([start, end]) => ({start, end}));
const demo = windows([['19:00','21:00'],['07:00','09:00'],['14:00','16:00']]);
const overnight = windows([['22:00','04:00'],['08:30','13:15']]);
const prefix = '可选开始时间（北京时间）：';
const now = new Date('2026-11-16T09:48:23+08:00');
function advertised(text, start) {
  if (!text.startsWith(prefix)) return false;
  return text.slice(prefix.length).split('、').some(item => {
    const [first, last = first] = item.split('–');
    return first <= start && start <= last;
  });
}

function compareWithServer() {
  let comparisons = 0;
  for (const duty of [demo, overnight]) {
    for (const date of ['2026-11-16','2026-11-17']) {
      for (const blocks of [1,2,3,4]) {
        const text = hint(duty, date, blocks, now);
        for (let minute = 0; minute < 1440; minute++) {
          const start = [Math.floor(minute / 60), minute % 60].map(n=>String(n).padStart(2,'0')).join(':');
          let accepted = true;
          try { cleanEscort({date, blocks, start, hospital:'测试', department:'测试', pickup:false}, duty, now); }
          catch (error) { assert.match(error.message,/值班时段|必须在未来/); accepted = false; }
          assert.equal(advertised(text,start), accepted, [text,date,start,blocks].join(' '));
          comparisons++;
        }
      }
    }
  }
  console.log(comparisons, '个分钟级开始时间与实际服务端一致');
}

async function checkForm() {
  let resolveOld;
  const ui = runtime(async (_, action, payload) => {
    if (action !== 'getCommunity') throw Error('额外请求 ' + action);
    if (payload.communityId === 'slow') return new Promise(r => { resolveOld = r; });
    return {_id:payload.communityId, dutyWindows:payload.communityId === 'demo' ? demo : overnight};
  });
  const ids = ['demo','slow','night'];
  ui.app.globalData.user = {_id:'test', communityId:'demo', buildingId:'b',
    addresses:ids.map(id=>({id,communityId:id,buildingId:'b'}))};
  const page = ui.instance('miniprogram/elder/escort');
  const change = (field,value) => page.change({currentTarget:{dataset:{field}},detail:{value}});
  const address = value => page.addressChange({detail:{value}});
  await page.load();
  assert.equal(page.data.escortStartHint,prefix + '07:00、14:00、19:00');
  change('start','10:12');
  change('blocks','2');
  assert.match(page.data.escortStartHint,/调整日期或时长/);
  change('blocks','');
  assert.match(page.data.escortStartHint,/1 至 4/);
  change('blocks','1');
  const old = address(1);
  await address(2);
  resolveOld({_id:'slow',dutyWindows:[]});
  await old;
  assert.equal(page.data.escortStartHint,prefix+'08:30–11:15、22:00–23:59');
  assert.equal(page.data.form.start,'10:12');
  const today = new Date();
  const noon = new Date(ymd(today)+'T10:12:00+08:00');
  change('date',ymd(today));
  page.checkEscortDate(noon);
  assert.match(page.data.escortStartHint,/10:13–11:15/);
  page.checkEscortDate(new Date(noon.getTime()+60000));
  assert.match(page.data.escortStartHint,/10:14–11:15/);
  change('date',ymd(addDays(today,-1)));
  assert.equal(page.data.escortStartHint,'');
  page.onUnload();
  console.log('页面覆盖地址反序、日期、时长、过期草稿提示和保留原开始时间');
}
compareWithServer();
checkForm().catch(e=>{console.error(e);process.exitCode=1});
