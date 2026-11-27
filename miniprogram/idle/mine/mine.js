const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
Page({
  data: { loading: false, paging: false, hasMore: false, error: '', moreError: '', list: [] },
  onShow() { this.hidden = false; return this.load(); },
  onHide() { this.hidden = true; this.sequence = (this.sequence || 0) + 1; this.setData({ list: [], hasMore: false, paging: false }); },
  onUnload() { this.closed = true; this.sequence = (this.sequence || 0) + 1; this.setData({ list: [], hasMore: false, paging: false }); },
  currentList(sequence = this.sequence) { const user = getApp().globalData.user; return !this.hidden && !this.closed &&
    sequence === this.sequence && !!this.ownerId && user?._id === this.ownerId && user?.communityId === this.ownerCommunityId; },
  async load() {
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.nextOffset = 0;
    this.setData({ loading: true, paging: false, hasMore: false, error: '', moreError: '', list: [] });
    try {
      const user = await getApp().ensureSession();
      if (this.hidden || this.closed || sequence !== this.sequence || getApp().globalData.user?._id !== user._id) return;
      this.ownerId = user._id; this.ownerCommunityId = user.communityId;
      const result = await api.call('idle', 'mine', { offset: 0 }, { loading: false, silent: true, isActive: () => this.currentList(sequence) });
      if (!this.currentList(sequence)) return;
      const statusText = { on_sale: '在售', reserved: '交易中', sold: '已售', removed: '已下架', hidden: '审核中' };
      this.nextOffset = result.list.length;
      this.setData({ hasMore: !!result.hasMore, list: result.list.map(item => ({ ...item, priceText: yuan(item.price),
        statusText: item.moderationHidden ? '审核中' : statusText[item.status] || item.status })) });
    } catch (error) { if (this.currentList(sequence)) this.setData({ error: error.message || '闲置加载失败' }); }
    finally { if (this.currentList(sequence)) this.setData({ loading: false }); }
  },
  async more() {
    if (!this.currentList() || this.data.loading || this.data.paging || !this.data.hasMore) return;
    const sequence = this.sequence, offset = this.nextOffset;
    this.setData({ paging: true, moreError: '' });
    try {
      const result = await api.call('idle', 'mine', { offset }, { loading: false, silent: true,
        isActive: () => this.currentList(sequence) });
      if (!this.currentList(sequence)) return;
      const statusText = { on_sale: '在售', reserved: '交易中', sold: '已售', removed: '已下架', hidden: '审核中' };
      const seen = new Set(this.data.list.map(item => item._id));
      const more = result.list.filter(item => !seen.has(item._id)).map(item => ({ ...item,
        priceText: yuan(item.price), statusText: item.moderationHidden ? '审核中' : statusText[item.status] || item.status }));
      this.nextOffset = offset + result.list.length;
      this.setData({ list: [...this.data.list, ...more], hasMore: !!result.hasMore });
    } catch (error) {
      if (this.currentList(sequence)) this.setData(error.code === 'E_FORBIDDEN'
        ? { list: [], hasMore: false, error: error.message || '无权查看闲置' }
        : { moreError: error.message || '后续闲置加载失败' });
    }
    finally { if (this.currentList(sequence)) this.setData({ paging: false }); }
  },
  open(event) { if (this.currentList() && this.data.list.some(item => item._id === event.currentTarget.dataset.id)) wx.navigateTo({ url: '/idle/detail/detail?id=' + encodeURIComponent(event.currentTarget.dataset.id) }); },
  sales() { if (this.currentList()) wx.navigateTo({ url: '/idle/sales/sales' }); },
  income() { if (this.currentList()) wx.navigateTo({ url: '/idle/income/income' }); },
  create() { if (this.currentList()) wx.navigateTo({ url: '/idle/create/create' }); }
});
