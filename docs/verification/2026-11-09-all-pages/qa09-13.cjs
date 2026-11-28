// Actual frontend modules/handlers in an isolated VM. No real identity, cloud or payment.
const assert = require('assert');
const fs = require('fs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const results = [];
const test = async (name, run) => { try { await run(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', message: e.message }); } };
const file = name => 'miniprogram/' + name;
const xml = name => fs.readFileSync(file(name + '.wxml'), 'utf8');
const tick = () => new Promise(setImmediate);
const clone = value => JSON.parse(JSON.stringify(value));

(async () => {
  const time = runtime().load(file('utils/time.js'));
  for (const [input, expected] of [
    ['2026-11-09T15:59:59Z', '2026-11-09'], ['2026-11-09T16:00:00Z', '2026-11-10'],
    ['2026-12-31T16:00:00Z', '2027-01-01'], ['2028-02-28T16:00:00Z', '2028-02-29']
  ]) await test('QA09 北京日期 ' + input, () => assert.equal(time.ymd(new Date(input)), expected));
  await test('QA09 跨月/年/闰日加天不改原时间戳', () => {
    for (const [input, days, expected] of [['2026-12-31T12:00:00Z', 1, '2027-01-01'],
      ['2028-02-28T12:00:00Z', 1, '2028-02-29'], ['2028-03-01T12:00:00Z', -1, '2028-02-29']]) {
      const source = new Date(input), original = source.getTime();
      assert.equal(time.ymd(time.addDays(source, days)), expected); assert.equal(source.getTime(), original);
    }
    assert.throws(() => time.ymd(new Date('invalid')));
    assert.throws(() => time.addDays(new Date(), 0.5));
  });
  for (const type of ['ask', 'task', 'carry']) await test('QA09 三类发布初始化 ' + type, async () => {
    const r = runtime(async (name, action) => {
      assert.equal(name + '.' + action, 'catalog.getCommunity');
      return { enabledFeatures: { board: true, travelCarry: true, federation: true }, dutyWindows: [{ start: '07:00', end: '00:00' }] };
    });
    r.app.globalData.user.communityId = 'fixture';
    const p = r.instance(file('board/create/create.js')); p.onLoad({ type }); await p.load();
    assert.equal(p.data.type, type); assert.equal(p.data.error, ''); assert.equal(p.data.loading, false);
    assert.equal(p.data.today, time.ymd(new Date()));
    assert.equal(p.data.slotDate, time.ymd(time.addDays(new Date(), type === 'task' ? 1 : 0)));
    assert.equal(r.requests.length, 1);
  });
  await test('QA10 协议兼容小区计价并明确继续服务另行确认', () => {
    const s = xml('pages/legal/terms'); assert(s.includes('按所属小区展示的计价方式和包含时长收费'));
    assert(s.includes('超时不自动扣费，继续服务须另行确认新订单')); assert(!s.includes('第一版不另收超时费用'));
  });
  const labels = runtime().load(file('utils/status-labels.js'));
  await test('QA11 业务状态映射覆盖既有枚举且仅含中文展示', () => {
    const enums = { merchantStatusNames: ['pending', 'approved', 'rejected', 'suspended'],
      eventStatusNames: ['draft', 'published', 'ended', 'cancelled'],
      signupStatusNames: ['pending_pay', 'signed', 'cancelled', 'refunded'],
      refundJobStatusNames: ['queued', 'processing', 'completed', 'attention'] };
    for (const [group, states] of Object.entries(enums)) for (const state of states) assert(/^[\u4e00-\u9fff]+$/.test(labels[group][state]));
  });
  for (const route of ['merchant/apply/apply', 'merchant/workbench/workbench']) await test('QA11 商家状态原值保留 ' + route, async () => {
    for (const status of ['pending', 'approved', 'rejected', 'suspended', 'future_status']) {
      const r = runtime(async () => ({ merchant: { status } })); const p = r.instance(file(route + '.js')); await p.load();
      assert.equal((p.data.existing || p.data.merchant).status, status);
      assert.equal(p.data.merchantStatusNames[status] || '状态待确认', labels.merchantStatusNames[status] || '状态待确认');
      assert(xml(route).includes("|| '状态待确认'"));
    }
  });
  await test('QA11 商家服务0分/1分/12345分展示元，存储金额原值保留', async () => {
    const rows = [0, 1, 12345].map(price => ({ _id: String(price), priceType: 'fixed', price, unit: '次', status: 'off' }));
    const r = runtime(async () => ({ list: rows })); const p = r.instance(file('merchant/services/services.js')); await p.load();
    assert.deepEqual(clone(p.data.list.map(x => x.priceText)), ['0.00', '0.01', '123.45']);
    assert.deepEqual(clone(p.data.list.map(x => x.price)), [0, 1, 12345]);
    assert(xml('merchant/services/services').includes('¥{{item.priceText}} /'));
  });
  await test('QA11 管理员服务查看转元且不扩大审核条件', async () => {
    const r = runtime(async (_, action) => ({ list: action === 'adminList' ? [{ _id: 'm', status: 'approved' }] : [{ _id: 's', price: 999, status: 'off' }], hasMore: false }));
    const p = r.instance(file('admin/merchants/merchants.js')); await p.load();
    await p.inspect({ currentTarget: { dataset: { id: 'm' } } });
    assert.equal(p.data.services[0].priceText, '9.99'); assert.equal(p.data.services[0].price, 999);
    assert(xml('admin/merchants/merchants').includes("selected.status === 'pending'"));
  });
  await test('QA11 活动/报名原状态与操作值不变', async () => {
    const r = runtime(async (name, action) => action === 'getCommunity' ? { _id: 'fixture_community' } : action === 'detail' ? { fee: 120, mySignup: { status: 'pending_pay' } } : { list: [{ status: 'published' }] });
    const d = r.instance(file('events/detail/detail.js')); d.onLoad({ id: 'fixture' }); await d.load();
    assert.equal(d.data.item.mySignup.status, 'pending_pay'); assert.equal(d.data.item.feeText, '¥1.20');
    r.app.globalData.user = { roles: ['property'], communityId: 'fixture_community' };
    const p = r.instance(file('events/manage/manage.js')); await p.load();
    assert.equal(p.data.list[0].status, 'published'); p.typeChange({ detail: { value: '1' } }); assert.equal(p.data.type, 'charity');
    p.typeChange({ detail: { value: '0' } }); assert.equal(p.data.type, 'interest');
  });
  await test('QA11 三个表单的全部输入项都有常驻中文标签', () => {
    for (const route of ['events/manage/manage', 'merchant/apply/apply', 'merchant/services/services']) {
      const s = xml(route), tags = [...s.matchAll(/<(?:input|textarea)\b[^>]*data-field="([^"]+)"[^>]*\/?\s*>/g)];
      assert(tags.length > 0);
      for (const match of tags) {
        const preceding = s.slice(0, match.index); const field = preceding.slice(preceding.lastIndexOf('<view class="field"'));
        assert(field.includes('<view class="label">'), route + ':' + match[1]);
        assert(!field.includes('<input') && !field.includes('<textarea'), 'label must belong to current field');
      }
    }
  });
  await test('QA12 审计成功/失败/重试状态准确', async () => {
    let mode = 'fail'; const r = runtime(async () => { if (mode === 'fail') throw Error('合成拒绝'); return { list: [] }; });
    const p = r.instance(file('admin/chat/chat.js')); p.onLoad({}); assert.equal(p.data.auditConfirmed, false);
    await p.load(); assert.equal(p.data.auditConfirmed, false); assert.equal(p.data.error, '合成拒绝');
    mode = 'ok'; await p.load(); assert.equal(p.data.auditConfirmed, true); assert.equal(p.data.error, '');
    mode = 'fail'; await p.load(); assert.equal(p.data.auditConfirmed, false); assert.equal(p.data.loading, false);
  });
  await test('QA12 迟到成功响应不覆盖最新失败', async () => {
    const pending = []; const r = runtime(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
    const p = r.instance(file('admin/chat/chat.js')); p.onLoad({}); const first = p.load(); await tick(); const second = p.load(); await tick();
    pending[1].reject(Error('最新拒绝')); await second; pending[0].resolve({ list: [] }); await first;
    assert.equal(p.data.auditConfirmed, false); assert.equal(p.data.error, '最新拒绝');
  });
  const dates = { startDate: '2028-02-29', startTime: '10:00', endDate: '2028-02-29', endTime: '12:00', deadlineDate: '2028-02-28', deadlineTime: '23:59' };
  for (const field of ['startDate', 'endDate', 'deadlineDate']) await test('QA13 缺少日期阻止创建 ' + field, async () => {
    const r = runtime(); const p = r.instance(file('events/manage/manage.js'));
    assert.equal(p.data.startDate + p.data.endDate + p.data.deadlineDate, '');
    p.setData({ ready: true, loading: false, communityId: 'fixture_community', ...dates, [field]: '' }); await p.createActivity();
    assert(p.data.error.startsWith('请选择')); assert.equal(r.requests.length, 0); assert.equal(p.data.busy, false);
  });
  for (const patch of [{ startDate: '2027-02-29' }, { endDate: '2028-02-30' }, { deadlineTime: '24:01' }]) await test('QA13 无效日历输入拒绝 ' + JSON.stringify(patch), async () => {
    const r = runtime(); const p = r.instance(file('events/manage/manage.js')); p.setData({ ready: true, loading: false, communityId: 'fixture_community', ...dates, ...patch }); await p.createActivity();
    assert(p.data.error); assert.equal(r.requests.length, 0);
  });
  for (const type of ['interest', 'charity']) await test('QA11/13 选定日期提交原北京时间和金额参数 ' + type, async () => {
    const r = runtime(async (name, action) => action === 'create' ? { eventId: 'fixture_event' } : { list: [{ _id: 'fixture_community' }] });
    r.app.globalData.user = { roles: ['resident', 'admin'], communityId: 'fixture_community' };
    const p = r.instance(file('events/manage/manage.js')); p.setData({ ready: true, loading: false, communityId: 'fixture_community', ...dates, type, title: '合成活动', fee: '12.34', sponsorName: '合成赞助', sponsorAmount: '1.23' });
    await p.createActivity(); assert.equal(p.data.error, '');
    const request = r.requests.find(x => x[1] === 'create')[2];
    assert.equal(request.startAt.toISOString(), '2028-02-29T02:00:00.000Z');
    assert.equal(request.signupDeadline.toISOString(), '2028-02-28T15:59:00.000Z');
    assert.equal(request.type, type); assert.equal(request.fee, type === 'charity' ? 0 : 1234);
    assert.equal(request.sponsors[0].amount, 123); assert(r.requests.some(x => x[1] === 'publish'));
  });
  const report = { scope: 'Isolated actual frontend handlers and template assertions only, no live cloud/UI/business acceptance', timezone: process.env.TZ || 'host',
    total: results.length, passed: results.filter(r => r.status === 'PASS').length, results };
  fs.writeFileSync(__dirname + '/qa09-13.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.total === report.passed ? 0 : 1;
})();
