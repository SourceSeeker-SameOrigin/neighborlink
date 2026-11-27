// Actual page lifecycle date methods with synthetic identity and Beijing clock.
// Cloud loading is disabled so this checks only the date state boundary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
let clock = Date.parse('2026-11-30T15:55:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}

const results = [];
for (const [id, relative] of [
  ['P18', 'miniprogram/admin/dashboard/dashboard.js'],
  ['P24', 'miniprogram/admin/settlements/settlements.js'],
  ['P32', 'miniprogram/admin/exports/exports.js']
]) {
  clock = Date.parse('2026-11-30T15:55:00Z');
  let definition;
  let user = { _id: 'admin-a', roles: ['admin'] };
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  vm.runInNewContext(source, { Date: FixedDate, Page: page => { definition = page; },
    require: () => ({}), getApp: () => ({ globalData: { user } }), console }, { filename: relative });
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  page.load = () => {}; // Isolate date lifecycle from all CloudBase reads.
  if (id === 'P18') { page.onShow(); page.setData({ from: '2026-11-30', to: '2026-11-30' }); }
  else { page.onLoad({}); page.onShow(); }
  page.setData({ from: '2026-10-01', to: '2026-10-15' });
  page._dateManual = true; // The result of A choosing dates through the page picker.
  page.onHide();
  user = { _id: 'admin-b', roles: ['admin'] };
  page.onShow();
  const afterSwitch = [page.data.from, page.data.to];
  clock = Date.parse('2026-11-30T16:05:00Z');
  page.onHide(); page.onShow();
  const afterMidnight = [page.data.from, page.data.to];
  results.push({ id, afterSwitch, afterMidnight });
}
assert(results.every(result => result.afterSwitch[0] === '2026-10-01' &&
  result.afterMidnight[0] === '2026-10-01'));
console.log(JSON.stringify({ scope: 'actual P18/P24/P32 date lifecycle; synthetic identity and clock; cloud load disabled',
  results, realCloudCalls: 0 }, null, 2));
