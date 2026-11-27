// Actual resident content pages, synthetic users and intercepted native/cloud calls.
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');
const user = id => ({ _id: id, communityId: 'community-' + id, roles: ['resident'] });
const results = [];
function fixture(file, reply) {
  const env = runtime(reply);
  env.app.globalData.user = user('a');
  env.wx.setNavigationBarTitle = () => {};
  env.wx.showModal = ({ success }) => success({ confirm: true });
  return { env, page: env.instance(file) };
}
const put = (name, pass, observed = {}) => results.push({ name, pass: !!pass, observed });
(async () => {
  {
    let denied = false;
    const { env, page } = fixture('miniprogram/board/detail/detail.js', async (name, action) => {
      if (action === 'detail') {
        if (denied) throw Object.assign(Error('无权查看'), { code: 'E_FORBIDDEN' });
        return { post: { _id: 'post-a', type: 'ask', title: 'A', images: [] }, comments: [] };
      }
      return {};
    });
    page.onLoad({ id: 'post-a' }); await page.onShow();
    put('board-normal-detail', page.data.post?._id === 'post-a');
    env.app.globalData.user = user('b');
    page.setData({ commentText: 'A 的评论' }); await page.comment(); await page.close();
    put('board-old-comment-and-close-blocked', env.requests.filter(args => ['comment', 'close'].includes(args[1])).length === 0);
    denied = true;
    await page.load(); put('board-denied-switch-clears-post', !page.data.post && page.data.comments.length === 0);
  }
  {
    const { env, page } = fixture('miniprogram/idle/detail/detail.js', async (name, action) => {
      if (action === 'detail') return { item: { _id: 'item-a', title: 'A', price: 500, images: [] } };
      if (action === 'contact') return { phone: '13800000000' };
      return {};
    });
    let calls = 0; env.wx.makePhoneCall = () => { calls++; };
    page.onLoad({ id: 'item-a' }); await page.onShow();
    put('idle-normal-detail', page.data.item?._id === 'item-a');
    env.app.globalData.user = user('b'); await page.contact();
    put('idle-old-contact-blocked', !env.requests.some(args => args[1] === 'contact') && calls === 0);
  }
  {
    const { env, page } = fixture('miniprogram/idle/mine/mine.js', async () => ({ list: [{ _id: 'item-a', price: 500 }] }));
    await page.onShow(); env.app.globalData.user = user('b');
    page.open({ currentTarget: { dataset: { id: 'item-a' } } });
    put('idle-mine-old-card-blocked', env.navigation.length === 0);
  }
  {
    const { env, page } = fixture('miniprogram/idle/sales/sales.js', async () => ({ list: [{ _id: 'sale-a', price: 500 }] }));
    await page.onShow(); env.app.globalData.user = user('b');
    page.open({ currentTarget: { dataset: { id: 'sale-a' } } });
    put('idle-sales-old-card-blocked', env.navigation.length === 0);
  }
  {
    const { env, page } = fixture('miniprogram/idle/sale/sale.js', async () =>
      ({ _id: 'sale-a', idleSale: { seller: true, price: 500, sellerAmount: 400 } }));
    page.onLoad({ id: 'sale-a' }); await page.onShow();
    put('idle-sale-normal-detail', page.data.order?._id === 'sale-a');
    env.app.globalData.user = user('b'); await page.accept();
    put('idle-sale-old-accept-blocked', !env.requests.some(args => args[1] === 'acceptSale'));
  }
  {
    let finishUpload;
    const waiting = new Promise(resolve => { finishUpload = resolve; });
    const env = runtime(async () => ({ _id: 'sale-a', status: 'accepted',
      idleSale: { seller: true, price: 500, sellerAmount: 400 } }),
    { media: { uploadPhotos: async () => waiting } });
    env.app.globalData.user = user('a');
    const page = env.instance('miniprogram/idle/sale/sale.js');
    page.onLoad({ id: 'sale-a' }); await page.onShow();
    const upload = page.photos(); page.onHide(); await page.onShow();
    finishUpload(['synthetic-delivery-photo']); await upload;
    put('idle-sale-same-user-camera-return', page.data.photos[0] === 'synthetic-delivery-photo');
  }
  for (const [kind, file] of [
    ['board', 'miniprogram/board/create/create.js'], ['idle', 'miniprogram/idle/create/create.js']
  ]) {
    let finishUpload;
    const waiting = new Promise(resolve => { finishUpload = resolve; });
    const env = runtime(async (name, action) => {
      if (name === 'catalog' && action === 'getCommunity') return {
        enabledFeatures: { board: true, idle: true, idleEscrow: true, federation: false }, dutyWindows: []
      };
      return {};
    }, { media: { uploadPhotos: async () => waiting } });
    env.app.globalData.user = user('a');
    const page = env.instance(file);
    page.onLoad({}); await page.onShow();
    page.setData(kind === 'board' ? { title: 'A 的标题', content: 'A 的内容' } : { title: 'A 的标题', desc: 'A 的说明' });
    const upload = page.photos();
    env.app.globalData.user = user('b');
    finishUpload(['synthetic-a-image']); await upload;
    await page.load();
    put(kind + '-old-draft-and-upload-cleared', !page.data.title && page.data.images.length === 0);
    page.setData({ title: 'B 的标题', content: 'B 的内容', desc: 'B 的说明', priceYuan: '5' });
    env.app.globalData.user = user('a');
    await page.submit();
    put(kind + '-old-create-blocked', !env.requests.some(args => args[0] === kind && args[1] === 'create'));
  }
  console.log(JSON.stringify({ scope: 'actual page code, synthetic identities; no cloud or native actions',
    pass: results.filter(item => item.pass).length, fail: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
