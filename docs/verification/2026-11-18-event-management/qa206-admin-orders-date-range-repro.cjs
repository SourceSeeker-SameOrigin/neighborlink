// Reproduce the P19 default subsidy range with the actual page definition.
// Fixed clocks and device time zones only; no CloudBase calls or CSV export.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const ordersSource = fs.readFileSync(path.join(root, 'miniprogram/admin/orders/orders.js'), 'utf8');
const exportsSource = fs.readFileSync(path.join(root, 'miniprogram/admin/exports/exports.js'), 'utf8');
const moments = ['2026-11-30T16:05:00Z', '2026-12-31T16:05:00Z'];
const zones = ['Asia/Shanghai', 'UTC', 'America/Los_Angeles'];
const results = [];

for (const moment of moments) {
  const epoch = Date.parse(moment);
  const expectedTo = new Date(epoch + 8 * 3600000).toISOString().slice(0, 10);
  const expectedFrom = expectedTo.slice(0, 8) + '01';
  for (const zone of zones) {
    process.env.TZ = zone;
    class FixedDate extends Date {
      constructor(...args) { super(...(args.length ? args : [epoch])); }
      static now() { return epoch; }
    }
    function pageFrom(source) {
      let definition;
      vm.runInNewContext(source, { Date: FixedDate, Page: page => { definition = page; },
        require: () => ({}), console }, { filename: 'actual-page.js' });
      return definition;
    }
    const ordersPage = pageFrom(ordersSource);
    const orders = ordersPage.data;
    const exportsPage = pageFrom(exportsSource);
    const exportState = { data: { ...exportsPage.data }, setData(patch) { Object.assign(this.data, patch); } };
    exportsPage.onLoad.call(exportState, {});
    results.push({ moment, zone, expectedFrom, expectedTo,
      ordersFrom: orders.subsidyFrom, ordersTo: orders.subsidyTo,
      exportFrom: exportState.data.from, exportTo: exportState.data.to,
      ordersMatch: orders.subsidyFrom === expectedFrom && orders.subsidyTo === expectedTo,
      exportsMatch: exportState.data.from === expectedFrom && exportState.data.to === expectedTo });
  }
}

assert.equal(results.filter(row => row.ordersMatch).length, 6);
assert.equal(results.filter(row => !row.ordersMatch).length, 0);
assert.equal(results.filter(row => row.exportsMatch).length, 6);
let clock = Date.parse('2026-11-30T15:55:00Z');
class MovingDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
let definition;
vm.runInNewContext(ordersSource, { Date: MovingDate, Page: page => { definition = page; }, require: () => ({}), console });
const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); }, load() {} };
page.onShow();
assert.equal(page.data.subsidyTo, '2026-11-30');
clock = Date.parse('2026-11-30T16:05:00Z');
page.onShow();
assert.equal(page.data.subsidyFrom, '2026-12-01');
assert.equal(page.data.subsidyTo, '2026-12-01');
page.currentOwner = () => true;
page.data.isAdmin = true;
page.date({ currentTarget: { dataset: { field: 'subsidyFrom' } }, detail: { value: '2026-10-01' } });
clock = Date.parse('2027-01-01T16:05:00Z');
page.onShow();
assert.equal(page.data.subsidyFrom, '2026-10-01');
assert.equal(page.data.subsidyTo, '2026-12-01');
console.log(JSON.stringify({ scope: 'actual P19 and P32 page initializers; fixed clocks; no cloud calls', results }, null, 2));
