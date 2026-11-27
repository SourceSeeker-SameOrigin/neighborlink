const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
Page({
  data: { loading: false, error: '', list: [] },
  onShow() { this.hidden = false; return this.load(); },
  onHide() { this.hidden = true; this.sequence = (this.sequence || 0) + 1; this.setData({ list: [] }); },
  onUnload() { this.closed = true; this.sequence = (this.sequence || 0) + 1; this.setData({ list: [] }); },
  currentList(sequence = this.sequence) { const user = getApp().globalData.user; return !this.hidden && !this.closed &&
    sequence === this.sequence && !!this.ownerId && user?._id === this.ownerId && user?.communityId === this.ownerCommunityId; },
  async load() {
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.setData({ loading: true, error: '', list: [] });
    try {
      const user = await getApp().ensureSession();
      if (this.hidden || this.closed || sequence !== this.sequence || getApp().globalData.user?._id !== user._id) return;
      this.ownerId = user._id; this.ownerCommunityId = user.communityId;
      const result = await api.call('idle', 'mine', {}, { loading: false, silent: true });
      if (!this.currentList(sequence)) return;
      const statusText = { on_sale: '在售', reserved: '交易中', sold: '已售', removed: '已下架', hidden: '审核中' };
      this.setData({ list: result.list.map(item => ({ ...item, priceText: yuan(item.price),
        statusText: item.moderationHidden ? '审核中' : statusText[item.status] || item.status })) });
    } catch (error) { if (this.currentList(sequence)) this.setData({ error: error.message || '闲置加载失败' }); }
    finally { if (this.currentList(sequence)) this.setData({ loading: false }); }
  },
  open(event) { if (this.currentList() && this.data.list.some(item => item._id === event.currentTarget.dataset.id)) wx.navigateTo({ url: '/idle/detail/detail?id=' + encodeURIComponent(event.currentTarget.dataset.id) }); },
  sales() { if (this.currentList()) wx.navigateTo({ url: '/idle/sales/sales' }); },
  income() { if (this.currentList()) wx.navigateTo({ url: '/idle/income/income' }); },
  create() { if (this.currentList()) wx.navigateTo({ url: '/idle/create/create' }); }
});
