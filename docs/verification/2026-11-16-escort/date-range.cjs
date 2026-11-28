// Run in separate processes so device time zones are independent.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function checkZone() {
  const RealDate = Date;
  let now = RealDate.parse('2026-12-31T15:59:59Z');
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  try {
    let found = null;
    const timers = new Map();
    let nextTimer = 0;
    const ui = runtime(async (_, action) => {
      if (action === 'lookupRequest') return { orderId: found };
      if (action === 'getCommunity') return { _id: 'c', prices: {} };
      if (action === 'quote') return { slots: [], pricing: {payAmount: 16800, goodsCap: 0} };
      throw Error('意外请求 ' + action);
    }, { setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
      clearTimeout(id) { timers.delete(id); } });
    ui.app.globalData.user = { _id: 'u', communityId: 'c', buildingId: 'b' };
    const newPage = () => ui.instance('miniprogram/elder/escort');
    const page = newPage();
    await page.load();
    assert.deepEqual([page.data.escortDateStart, page.data.escortDateEnd, page.data.form.date],
      ['2026-12-31', '2027-01-30', '2027-01-01']);
    const change = (p, date) => p.change({currentTarget:{dataset:{field:'date'}}, detail:{value:date}});
    change(page, '2026-12-31');
    await page.refreshQuote();
    assert.ok(page.data.quote);
    const suspended = newPage();
    await suspended.load();
    await suspended.refreshQuote();
    assert.ok(suspended.data.quote);
    const midnight = timers.get(page.bookingMidnightTimer);
    assert.equal(midnight.ms, 1000);
    now += 2000;
    midnight.fn();
    assert.equal(page.data.escortDateNeedsSelection, true);
    assert.equal(page.data.quote, null);
    // A device can suspend timers; the submit guard must work independently.
    await suspended.submit();
    assert.equal(suspended.data.escortDateNeedsSelection, true);
    suspended.onUnload();
    await page.submit();
    assert.equal(ui.requests.some(([,a]) => a === 'create'), false);
    assert.equal(page.data.quote, null);
    assert.equal(page.data.escortDateNeedsSelection, true);
    assert.deepEqual([page.data.escortDateStart, page.data.escortDateEnd], ['2027-01-01','2027-01-31']);
    page.onUnload();

    const restored = newPage();
    await restored.load();
    assert.equal(restored.data.escortDateNeedsSelection, true);
    assert.equal(restored.data.form.date, '2026-12-31');
    change(restored, '2027-01-31');
    await restored.refreshQuote();
    assert.equal(restored.data.escortDateNeedsSelection, false);
    assert.ok(restored.data.quote);
    const timerBeforeHide = restored.bookingMidnightTimer;
    restored.onHide();
    assert.equal(timers.has(timerBeforeHide), false);
    now += 86400000;
    restored.hidden = false;
    await restored.load();
    assert.deepEqual([restored.data.form.date, restored.data.escortDateStart, restored.data.escortDateEnd],
      ['2027-01-31', '2027-01-02', '2027-02-01']);
    restored.onUnload();
    found = 'existing-order';
    ui.store['orderDraft:u:escort'] = { userId:'u', communityId:'c', form:{date:'2026-12-01'}, request:{id:'pending-request'} };
    const before = ui.requests.length;
    await newPage().load();
    assert.deepEqual(ui.requests.slice(before).map(([,a]) => a), ['lookupRequest']);
    assert.deepEqual(ui.navigation.at(-1), ['redirectTo','/pages/orders/detail?id=existing-order']);
    console.log(process.env.TZ, '首次范围、午夜自动失效、跨年阻止创建、过期草稿、手选末日、离页取消定时、跨天保留、找回原单：通过');
  } finally { global.Date = RealDate; }
}
if (process.argv[2] === 'worker') checkZone().catch(error => { console.error(error); process.exitCode=1; });
else for (const TZ of ['Asia/Shanghai','UTC','America/Los_Angeles']) {
  execFileSync(process.execPath,[__filename,'worker'], {env:{...process.env,TZ},stdio:'inherit'});
}
