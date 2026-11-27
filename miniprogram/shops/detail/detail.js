const reportAction = require('../../utils/report');
const api = require('../../utils/api');
const { lifecycle, currentVisit } = require('../../utils/visible-list');
const catalog = require('../catalog');

Page({
  ...lifecycle,
  data: { missingRecord: false, loading: true, error: '', reportError: '', merchant: null, ...catalog.empty },
  onLoad(options = {}) {
    this.merchantId = typeof options.merchantId === 'string' ? options.merchantId.trim() : '';
    this.setData({ missingRecord: !this.merchantId, loading: !!this.merchantId });
  },
  onHide() { lifecycle.onHide.call(this); this.clearDetail(); },
  onUnload() { lifecycle.onUnload.call(this); this.clearDetail(); },
  clearDetail() { this.setData({ ...catalog.empty, merchant: null, reportError: '', error: '' }); },
  load() { return this.readPage(false); },
  more() { return this.readPage(true); },
  readPage(append) {
    if (!this.merchantId) return;
    return catalog.read(this, append, '商家详情加载失败', async (user, options, offset) => {
      const result = await api.call('merchant', 'servicesForMerchant', {
        merchantId: this.merchantId, communityId: user.communityId, offset
      }, options);
      return { ...result, merchant: catalog.rating(result.merchant),
        list: result.list.map(item => ({ ...item, priceText: '¥' + (item.price / 100).toFixed(2) })) };
    });
  },
  async reportContent() {
    if (!this.data.merchant || this.reporting ||
        this.catalogScope !== JSON.stringify([getApp().globalData.user?._id, getApp().globalData.user?.communityId, this.merchantId])) return;
    const visible = currentVisit(this);
    const scope = this.catalogScope;
    const active = () => visible() && this.catalogScope === scope &&
      scope === JSON.stringify([getApp().globalData.user?._id, getApp().globalData.user?.communityId, this.merchantId]) &&
      this.data.merchant && this.data.merchant._id === this.merchantId;
    this.reporting = true;
    this.setData({ reportError: '' });
    try { await reportAction.submit('merchant', this.merchantId, active); }
    catch (error) { if (active()) this.setData({ reportError: error.message || '举报提交失败' }); }
    finally { this.reporting = false; }
  },
  book(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.merchant || !catalog.canOpen(this, id)) return;
    wx.navigateTo({ url: '/shops/booking/booking?serviceId=' + encodeURIComponent(id) });
  }
});
