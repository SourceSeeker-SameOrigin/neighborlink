const ads = require('../../utils/ads');
const api = require('../../utils/api');
const catalog = require('../catalog');
const { lifecycle } = require('../../utils/visible-list');

Page({
  ...lifecycle,
  data: { ads: [], adError: '', loading: true, error: '', ...catalog.empty },
  onHide() { ads.clear(this); lifecycle.onHide.call(this); this.setData({ ...catalog.empty }); },
  onUnload() { ads.clear(this); lifecycle.onUnload.call(this); this.setData({ ...catalog.empty }); },
  retryAds() { return ads.load(this, 'shops_top', this.adCommunityId); },
  recordAd(event) { ads.record(this,event.currentTarget.dataset.id,'ad_view'); },
  openAd(event) { ads.open(this,event); },
  load() { ads.clear(this); return this.readPage(false); },
  more() { return this.readPage(true); },
  readPage(append) {
    return catalog.read(this, append, '商家列表加载失败', async (user, options, offset) => {
      const communityId = user.communityId;
      if (!append) await ads.load(this, 'shops_top', communityId, options.isActive);
      if (!options.isActive()) return;
      const result = await api.call('merchant', 'listForCommunity', { communityId, offset }, options);
      return { ...result, list: result.list.map(catalog.rating) };
    });
  },
  open(event) {
    const id = event.currentTarget.dataset.id;
    if (!catalog.canOpen(this, id)) return;
    wx.navigateTo({ url: '/shops/detail/detail?merchantId=' + encodeURIComponent(id) });
  }
});
