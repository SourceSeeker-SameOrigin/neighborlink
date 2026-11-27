const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display, slotText } = require('../../utils/time');
Page({
  data: { groups: [{ code: 'ongoing', name: '进行中' }, { code: 'done', name: '已完成' }, { code: 'aftersale', name: '售后' }],
    group: 'ongoing', orders: [], loading: false, error: '', hasMore: true },
  onShow() { this._hidden = false; if (this._closed) return; return Promise.all([this.load(true), this.refreshUnread()]); },
  onHide() {
    this._hidden = true;
    this.invalidateReads();
    this._ownerId = null;
    this.setData({ orders: [], hasMore: false, loading: false, error: '' });
    wx.removeTabBarBadge({ index: 1 });
  },
  onUnload() { this.onHide(); this._closed = true; },
  invalidateReads() { this.sequence = (this.sequence || 0) + 1; this.unreadSequence = (this.unreadSequence || 0) + 1; },
  visible() { return !this._closed && !this._hidden; },
  onPullDownRefresh() {
    const pending = this.load(true), sequence = this.sequence;
    return pending.finally(() => { if (this.visible() && sequence === this.sequence) wx.stopPullDownRefresh(); });
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(); },
  groupChange(event) {
    const group = event.currentTarget.dataset.group;
    if (!this.visible() || !this.data.groups.some(item => item.code === group) ||
        this._ownerId !== getApp().globalData.user?._id) return;
    this.setData({ group }); return this.load(true);
  },
  retry() { return this.load(this.data.orders.length === 0); },
  async refreshUnread() {
    if (!this.visible()) return;
    const sequence = this.unreadSequence = (this.unreadSequence || 0) + 1;
    const current = () => this.visible() && sequence === this.unreadSequence;
    try {
      const user = await getApp().ensureSession();
      if (!current() || getApp().globalData.user?._id !== user._id) return;
      const active = () => current() && getApp().globalData.user?._id === user._id &&
        getApp().globalData.user?.communityId === user.communityId;
      const result = await api.call('chat', 'list', {}, { loading: false, silent: true,
        redirectOnForbidden: false, isActive: active });
      if (!active()) return;
      if (result.unreadTotal > 0) wx.setTabBarBadge({ index: 1, text: String(Math.min(result.unreadTotal, 99)) });
      else wx.removeTabBarBadge({ index: 1 });
    } catch (_) { if (current()) wx.removeTabBarBadge({ index: 1 }); }
  },
  async load(reset = false) {
    if (!this.visible() || (!reset && (this.data.loading || !this.data.hasMore))) return;
    const sequence = (this.sequence || 0) + 1;
    this.sequence = sequence;
    const current = () => this.visible() && sequence === this.sequence;
    const group = this.data.group, offset = reset ? 0 : this.data.orders.length;
    if (reset) this._ownerId = null;
    this.setData({ loading: true, error: '', ...(reset ? { orders: [], hasMore: true } : {}) });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      if (getApp().globalData.user?._id !== user._id) {
        this._ownerId = null;
        this.setData({ orders: [], hasMore: false });
        return;
      }
      if (!reset && this._ownerId !== user._id) {
        this.setData({ orders: [], hasMore: false });
        return this.load(true);
      }
      const active = () => current() && getApp().globalData.user?._id === user._id &&
        getApp().globalData.user?.communityId === user.communityId;
      const result = await api.call('order', 'listMine', { group, offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      if (!current()) return;
      if (!active()) { this._ownerId = null; this.setData({ orders: [], hasMore: false }); return; }
      const list = result.list.map(order => ({ ...order, amountText: yuan(order.pricing.payAmount + order.pricing.goodsCap),
        slotText: slotText(order.slot), createdText: display(order.createdAt) }));
      this._ownerId = user._id;
      this.setData({ orders: reset ? list : [...this.data.orders, ...list], hasMore: result.hasMore });
    } catch (error) { if (current()) this.setData({ ...(reset ? { orders: [], hasMore: false } : {}), error: error.message || '订单加载失败' }); }
    finally { if (current()) this.setData({ loading: false }); }
  }
});
