// Exercise rendered WXML, including refreshes that retain last successful data.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const pages = ['center', 'mine'].map(name => 'coupons/' + name + '/' + name + '.wxml');
const wcc = process.env.WCC || '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/node_modules/wcc-exec/wcc';
const compiled = execFileSync(wcc, pages, {
  cwd: path.resolve(__dirname, '../../../miniprogram'), encoding: 'utf8'
});
const context = { window: { __webview_engine_version__: 0.02 }, console };
vm.runInNewContext(compiled, context);
const sample = { _id: 'qa62', name: '联调样券', discountText: '减免20%' };
const cases = [
  ['首次加载', true, '', [], '加载'],
  ['空列表', false, '', [], '无券'],
  ['有券', false, '', [sample], '有券'],
  ['带上次结果刷新', true, '', [sample], '加载'],
  ['首次失败', false, '受控失败', [], '错误'],
  ['返回后刷新失败', false, '受控失败', [sample], '错误'],
  ['失败后重试成功', false, '', [sample], '有券'],
  ['刷新成功已无券', false, '', [], '无券']
];
function visibleText(node) {
  if (typeof node === 'string') return node;
  return (node.children || []).map(visibleText).join('');
}
for (const page of pages) {
  const render = context.$gwx(page);
  for (const [name, loading, error, list, expected] of cases) {
    const text = visibleText(render({ loading, error, list }));
    const matches = Object.entries({ '加载': /正在加载/, '无券': /暂无可领取优惠券|还没有优惠券/,
      '有券': /联调样券\s*·\s*减免20%/, '错误': /受控失败/ }).filter(([, re]) => re.test(text)).map(([key]) => key);
    assert.deepEqual(matches, [expected], page + ' ' + name);
  }
  console.log(page, cases.length + '/' + cases.length);
}

const recovery = context.$gwx(pages[0]);
for (const error of ['', '网络中断']) {
  const node = recovery({loading:false, busy:false, error, list:[],
    pending:[{id:'req-local',templateId:'ct-local',name:'最后一张样券'}]});
  function button(value) {
    if (typeof value === 'string') return null;
    if (value.tag === 'wx-button' && visibleText(value).includes('重试上次领取')) return value;
    return (value.children || []).map(button).find(Boolean);
  }
  assert.ok(button(node));
  assert.ok(visibleText(node).includes('最后一张样券'));
}
console.log('center: 2/2 pending claim recovery with no remaining inventory');
