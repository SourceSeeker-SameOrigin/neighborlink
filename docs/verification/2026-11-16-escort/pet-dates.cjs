// Run from the repo root. All requests use the local page fixture.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function run() {
  const RealDate = Date;
  let now = RealDate.parse('2026-12-31T15:59:59Z');
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  try {
    let finishQuote, hold = false, found = null;
    const timers = new Map();
    let counter = 0;
    const ui = runtime(async (_, action) => {
      if (action === 'lookupRequest') return { orderId: found };
      if (action === 'getCommunity') return { _id: 'c', prices: {} };
      assert.equal(action, 'quote');
      if (hold) await new Promise(resolve => { finishQuote = resolve; });
      return { slots: [], pricing: { payAmount: 4000, goodsCap: 0 } };
    }, {
      setTimeout(fn, ms) { const id = ++counter; timers.set(id, { fn, ms }); return id; },
      clearTimeout(id) { timers.delete(id); }
    });
    ui.app.globalData.user = { _id:'u', communityId:'c', buildingId:'b' };
    const key = 'orderDraft:u:pet';
    const instance = () => ui.instance('miniprogram/pet/order');
    const change = (page, value, date) => page.addPetDate({ detail:{value}, currentTarget:{dataset:{date}} });
    const remove = (page, date) => page.removePetDate({ currentTarget:{dataset:{date}} });
    const page = instance();
    await page.load();
    assert.equal(page.data.petDateStart,'2027-01-01');
    change(page, '2026-12-31');
    assert.equal(page.data.form.dates.length, 0);
    for (let day = 1; day <= 15; day++) change(page, '2027-01-' + String(day).padStart(2, '0'));
    change(page, '2027-01-16');
    assert.equal(page.data.form.dates.length, 15);
    await page.refreshQuote();
    hold = true;
    const pending = page.refreshQuote();
    const midnight = timers.get(page.bookingMidnightTimer);
    assert.equal(midnight.ms, 1000);
    now += 2000;
    midnight.fn();
    finishQuote();
    await pending;
    hold = false;
    assert.equal(page.data.petDateStart, '2027-01-02');
    assert.ok(page.data.petHasExpiredDates);
    assert.equal(page.data.quote, null);
    await page.submit();
    assert.ok(!ui.requests.some(([,action]) => action === 'create'));
    change(page, '2027-01-02', '2027-01-01');
    assert.ok(page.data.form.dates.includes('2027-01-01'));
    change(page, '2027-01-16', '2027-01-01');
    assert.equal(page.data.form.dates.length, 15);
    assert.equal(page.data.petHasExpiredDates, false);
    assert.deepEqual(Array.from(page.data.form.dates), Array.from({length:15}, (_,i)=>'2027-01-'+String(i+2).padStart(2,'0')));
    await page.refreshQuote();
    assert.equal(page.data.amount,'40.00');
    page.onUnload();

    const mixed = ['2026-12-31','2027-01-01','2027-01-15'];
    ui.store[key] = { userId:'u', communityId:'c', form:{dates:mixed}, savedAt:now, request:{id:'original'} };
    const draft = instance();
    const start = ui.requests.length;
    await draft.load();
    assert.equal(ui.requests[start][1], 'lookupRequest');
    assert.equal(ui.requests.slice(start).some(([,a])=>a==='quote'),false);
    remove(draft, mixed[0]);
    await draft.refreshQuote();
    assert.ok(draft.data.petHasExpiredDates);
    change(draft, '2027-01-18', mixed[1]);
    assert.deepEqual(Array.from(ui.store[key].form.dates), ['2027-01-15','2027-01-18']);
    assert.equal(ui.store[key].request.id, 'original');
    await draft.refreshQuote();
    assert.equal(draft.data.amount,'40.00');
    now += 15 * 86400000;
    await draft.submit(); // Midnight timer suspended; verify at action time.
    assert.ok(draft.data.petHasExpiredDates);
    assert.equal(draft.data.quote,null);
    draft.onHide();
    assert.ok(!timers.has(draft.bookingMidnightTimer));
    found = 'found-order';
    const n = ui.requests.length;
    await instance().load();
    assert.deepEqual(ui.requests.slice(n).map(([,a])=>a), ['lookupRequest']);
    assert.deepEqual(ui.navigation.at(-1), ['redirectTo','/pages/orders/detail?id=found-order']);
    console.log(process.env.TZ, '喂宠日期边界、跨年、迟到报价、15日换日、多日草稿、原单恢复通过');
  } finally { global.Date = RealDate; }
}
if (process.argv[2] === 'worker') run().catch(e => { console.error(e); process.exitCode = 1; });
else for (const TZ of ['Asia/Shanghai','UTC','America/Los_Angeles']) {
  execFileSync(process.execPath, [__filename,'worker'], {env:{...process.env,TZ},stdio:'inherit'});
}
