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
    const orders = pageFrom(ordersSource).data;
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

assert.equal(results.filter(row => row.ordersMatch).length, 2);
assert.equal(results.filter(row => !row.ordersMatch).length, 4);
assert.equal(results.filter(row => row.exportsMatch).length, 6);
console.log(JSON.stringify({ scope: 'actual P19 and P32 page initializers; fixed clocks; no cloud calls', results }, null, 2));
