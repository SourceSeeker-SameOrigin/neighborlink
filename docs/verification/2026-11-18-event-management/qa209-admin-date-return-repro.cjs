// Actual admin page methods at a Beijing month boundary; synthetic clock only.
// No session completion, CloudBase reads, CSV export or settlement mutation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const before = Date.parse('2026-11-30T15:55:00Z'); // Beijing Nov 30, 23:55
const after = Date.parse('2026-11-30T16:05:00Z'); // Beijing Dec 1, 00:05
let clock = before;
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}

function actualPage(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  let definition;
  vm.runInNewContext(source, { Date: FixedDate, Page: page => { definition = page; },
    require: () => ({}), getApp: () => ({ globalData: { user: null }, ensureSession: () => new Promise(() => {}) }),
    console }, { filename: relative });
  return Object.assign({}, definition, { data: { ...definition.data },
    setData(patch) { Object.assign(this.data, patch); } });
}

const rows = [];
for (const [id, relative] of [
  ['P18', 'miniprogram/admin/dashboard/dashboard.js'],
  ['P24', 'miniprogram/admin/settlements/settlements.js'],
  ['P31', 'miniprogram/admin/recycle/recycle.js'],
  ['P32', 'miniprogram/admin/exports/exports.js']
]) {
  clock = before;
  const page = actualPage(relative);
  if (id === 'P18') page.onShow();
  else {
    page.load = () => {}; // The actual date initializer is in onLoad; isolate it from CloudBase.
    page.onLoad({});
    page.onShow();
  }
  const initial = { from: page.data.from, to: page.data.to };
  clock = after;
  page.onHide();
  page.onShow();
  const returned = { from: page.data.from, to: page.data.to };
  page.setData({ from: '2026-10-01', to: '2026-10-15' });
  page.onHide();
  page.onShow();
  const manualReturned = { from: page.data.from, to: page.data.to };
  rows.push({ id, initial, returned, manualReturned });
}

assert.deepEqual(rows[0].initial, { from: '2026-11-30', to: '2026-11-30' });
for (const row of rows.slice(1)) assert.deepEqual(row.initial, { from: '2026-11-01', to: '2026-11-30' });
for (const row of rows) assert.deepEqual(row.returned, row.initial);
for (const row of rows) assert.deepEqual(row.manualReturned, { from: '2026-10-01', to: '2026-10-15' });
console.log(JSON.stringify({ scope: 'actual P18/P24/P31/P32 page date methods; synthetic Beijing midnight',
  expectedTodayOnReturn: '2026-12-01', rows, cloudCalls: 0 }, null, 2));
