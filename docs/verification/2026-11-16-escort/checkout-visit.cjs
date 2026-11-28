// Synthetic orders and modal callbacks through the actual checkout pages.
const {
  runtime
} = require('../2026-11-09-remediation/page-fixture.cjs');
const assert = require('node:assert/strict');
async function run(code, stage, confirm) {
  const data = {
    orderId: 'fixture-order',
    mock: true
  };
  let p, submit, dialog;
  const env = runtime(async (n, a) => {
    if (a === 'plans') return {
      list: [{
        code,
        price: 100,
        payAmount: 100
      }]
    };
    if (a === 'mine') return {
      list: []
    };
    if (a === 'detail') return {
      item: {
        title: '样本',
        price: 500
      }
    };
    if (n === 'board' && a === 'create') return {
      orderId: data.orderId,
      postId: 'post',
      payment: data,
      imageWarnings: []
    };
    if (['create', 'createBooking', 'buy'].includes(a)) return data;
    if (a === 'mockPay' || a === 'subscriptionTemplates') return {};
    throw Error(n + '.' + a);
  }, {
    payment: {
      pay: (...args) => env.load('miniprogram/utils/payment.js').pay(...args)
    }
  });
  env.wx.setNavigationBarTitle = () => {};
  env.wx.showModal = o => {
    if (o.title === '模拟支付') dialog = o;else o.success({
      confirm: true
    });
  };
  Object.assign(env.app.globalData.user, {
    buildingId: 'b',
    communityId: 'c'
  });
  if (code.endsWith('_monthly')) {
    p = env.instance('miniprogram/pages/membership/index.js');
    await p.load();
    submit = () => p.buy({
      currentTarget: {
        dataset: {
          code
        }
      }
    });
  } else if (code === 'shop') {
    p = env.instance('miniprogram/shops/booking/booking.js');
    p.onLoad({
      serviceId: 's'
    });
    await p.onShow();
    submit = () => p.submit();
  } else if (code === 'idle') {
    p = env.instance('miniprogram/idle/detail/detail.js');
    p.onLoad({
      id: 'i'
    });
    await p.load();
    submit = () => p.buy();
  } else if (code === 'board') {
    p = env.instance('miniprogram/board/create/create.js');
    p.onLoad({
      type: 'task'
    });
    p.user = env.app.globalData.user;
    p.setData({
      ready: true,
      loading: false,
      slotOptions: [{
        start: '09:00',
        end: '11:00'
      }]
    });
    submit = () => p.submit();
  } else {
    p = env.instance(env.load('miniprogram/utils/service-form.js')(code));
    p.draftKey = 'sample';
    const time = env.load('miniprogram/utils/time.js');
    const next = time.ymd(time.addDays(new Date(), 1));
    p.setData({
      loading: false,
      community: {
        _id: 'c',
        prices: {}
      },
      addresses: [{
        id: 'address',
        communityId: 'c'
      }],
      quote: {
        payAmount: 500
      },
      'form.date': next,
      'form.dates': [next]
    });
    submit = () => p.submit();
  }
  const op = submit();
  await new Promise(setImmediate);
  assert.ok(dialog, code + ' missing modal ' + String(p.data.error));
  if (stage === 'hidden') p.onHide();
  if (stage === 'unloaded') p.onUnload();
  if (stage === 'return') {
    p.onHide();
    await p.onShow();
  }
  if (stage === 'account') env.app.globalData.user = {
    ...env.app.globalData.user,
    _id: 'another'
  };
  const navBefore = env.navigation.length;
  dialog.success({
    confirm
  });
  await op;
  const count = env.requests.filter(r => r[1] === 'mockPay').length;
  assert.equal(count, stage === 'visible' && confirm ? 1 : 0, code + ' ' + stage);
  if (stage !== 'visible') assert.equal(env.navigation.length, navBefore, code + ' stale navigation ' + stage);
  return count;
}
(async () => {
  for (const c of ['trash', 'express', 'buy', 'help', 'meal', 'escort', 'pet', 'trash_monthly', 'express_monthly', 'visit_monthly', 'vacant_monthly', 'shop', 'board', 'idle']) {
    const results = [];
    for (const [s, confirm] of [['visible', true], ['visible', false], ['hidden', true], ['unloaded', true], ['return', true], ['account', true]]) results.push(await run(c, s, confirm));
    console.log(c, results.join(' '));
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
