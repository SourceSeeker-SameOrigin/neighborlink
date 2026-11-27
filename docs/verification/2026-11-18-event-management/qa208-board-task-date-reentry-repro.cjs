// Actual P40 page initializer and task-slot validator with a synthetic clock.
// No CloudBase, post creation, order or payment call.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateTaskSlot } = require('../../../cloudfunctions/_shared/boardData');

const source = fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/board/create/create.js'), 'utf8');
const template = fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/board/create/create.wxml'), 'utf8');
const beforeMidnight = Date.parse('2026-11-16T15:55:00Z'); // Beijing 11-16 23:55
const afterMidnight = Date.parse('2026-11-16T16:05:00Z'); // Beijing 11-17 00:05
const afterTwoMidnights = Date.parse('2026-11-17T16:05:00Z'); // Beijing 11-18 00:05
let clock = beforeMidnight;
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
let definition;
vm.runInNewContext(source, { Date: FixedDate, Math, Page: page => { definition = page; },
  require: name => name === '../../utils/time'
    ? require('../../../miniprogram/utils/time')
    : name === '../../utils/visible-list' ? { lifecycle: { onShow() {} } } : {},
  console }, { filename: 'actual-board-create.js' });
const page = { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
definition.onLoad.call(page, { type: 'task' });
const initial = { today: page.data.today, slotDate: page.data.slotDate };
clock = afterMidnight;
definition.onShow.call(page);
const firstReturn = { today: page.data.today, slotDate: page.data.slotDate };
clock = afterTwoMidnights;
definition.onShow.call(page);
const secondReturn = { today: page.data.today, slotDate: page.data.slotDate };
let serverError = '';
try { validateTaskSlot({ date: secondReturn.slotDate, start: '09:00', end: '12:00' },
  [{ start: '09:00', end: '12:00' }], new Date(clock)); }
catch (error) { serverError = error.message; }

assert.match(template, /start="\{\{today\}\}"/);
assert.deepEqual(initial, { today: '2026-11-16', slotDate: '2026-11-17' });
assert.deepEqual(firstReturn, initial);
assert.deepEqual(secondReturn, initial);
assert.match(serverError, /必须在未来/);
console.log(JSON.stringify({ scope: 'actual P40 page and task-slot validator; synthetic clock only',
  initial, firstReturn, secondReturn, serverError, cloudCalls: 0 }, null, 2));
