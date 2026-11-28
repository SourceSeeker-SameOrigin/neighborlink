const assert = require('node:assert/strict');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const { ymd, addDays } = require('../../../miniprogram/utils/time');

async function main() {
  const ui = runtime(async (name, action) => {
    if (action === 'getCommunity') return { _id: 'c', prices: {} };
    if (action === 'quote') return { slots: [], pricing: null };
    throw Error('Unexpected action: ' + action);
  });
  const tomorrow = ymd(addDays(new Date(), 1));
  const defaults = ['feed', 'water'];
  const first = ['litter', 'play'];
  let page = ui.instance('miniprogram/pet/order');
  async function loadAs(id) {
    page.onHide();
    ui.app.globalData.user = { _id: id, communityId: 'c', buildingId: 'b' };
    page.hidden = false;
    await page.load();
    assert.equal(page.data.error, '');
  }
  function check(label, tasks, dates) {
    const checked = page.data.taskChoices.filter(task => task.checked).map(task => task.value);
    assert.deepEqual(Array.from(checked), tasks, label + ' checkbox');
    assert.deepEqual(Array.from(page.params().detail.tasks), tasks, label + ' quote payload');
    assert.deepEqual(Array.from(page.data.form.dates), dates, label + ' dates');
    console.log('通过', label);
  }
  function select(tasks) {
    page.change({ currentTarget: { dataset: { field: 'tasks' } }, detail: { value: tasks } });
  }

  await loadAs('alice');
  check('首次进入', defaults, []);
  page.addPetDate({ detail: { value: tomorrow } });
  select(first);
  await loadAs('alice');
  check('本人返回恢复当天草稿', first, [tomorrow]);
  await loadAs('bob');
  check('同一页切换到无草稿住户', defaults, []);
  select(['walk']);
  await loadAs('alice');
  check('切回原住户', first, [tomorrow]);
  await loadAs('bob');
  check('切回有独立草稿的住户', ['walk'], []);
  select([]);
  await loadAs('bob');
  check('本人明确清空勾选', [], []);
  await loadAs('alice');
  ui.store['orderDraft:bob:pet'].savedAt -= 2 * 86400000;
  await loadAs('bob');
  check('目标住户旧草稿过期', defaults, []);
  page.onUnload();
  page = ui.instance('miniprogram/pet/order');
  await loadAs('alice');
  check('新页面恢复本人草稿', first, [tomorrow]);
  page.onUnload();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
