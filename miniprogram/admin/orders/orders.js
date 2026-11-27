const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display } = require('../../utils/time');
function beijingToday() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
const today = beijingToday();
Page({
  data: { loading: false, exporting: false, error: '', rows: [], hasMore: true, statusIndex: 0,
    subsidyFrom: today.slice(0, 8) + '01', subsidyTo: today,
    statuses: ['全部', '待报价', '待支付', '待接单', '已接单', '服务中', '待确认', '已完成', '售后处理中', '已退款', '已取消', '已关闭'] },
  onShow() {
    this._hidden = false;
    if (!this._subsidyRangeEdited) {
      const today = beijingToday();
      this.setData({ subsidyFrom: today.slice(0, 8) + '01', subsidyTo: today });
    }
    return this.load(true);
  },
  onHide() {
    this._hidden = true;
    this.sequence = (this.sequence || 0) + 1;
    this._ownerId = null;
    this.setData({ rows: [], hasMore: false, loading: false, exporting: false, isAdmin: false, readOnly: true, error: '' });
  },
  onUnload() { this.onHide(); this._closed = true; },
  visible() { return !this._closed && !this._hidden; },
  currentOwner() {
    const user = getApp().globalData.user;
    if (this.visible() && this._ownerId && user?._id === this._ownerId &&
      (user.roles?.includes('admin') || user.roles?.includes('property'))) return true;
    this._ownerId = null;
    this.setData({ rows: [], hasMore: false, isAdmin: false, readOnly: true });
    return false;
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(); },
  retry() { return this.load(this._failedReset !== false); },
  filter(event) {
    const statusIndex = Number(event.detail.value);
    if (!this.currentOwner() || this.data.busy || !Number.isInteger(statusIndex) || statusIndex < 0 || statusIndex >= this.data.statuses.length) return;
    this.setData({ statusIndex }); return this.load(true);
  },
  async load(reset = false) {
    if (!this.visible() || (!reset && (this.data.loading || this.data.busy || !this.data.hasMore))) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const current = () => this.visible() && sequence === this.sequence;
    const statusIndex = this.data.statusIndex;
    const offset = reset ? 0 : this.data.rows.length;
    this._failedReset = reset;
    if (reset) this._ownerId = null;
    this.setData({ loading: true, error: '', ...(reset ? { rows: [], hasMore: true, isAdmin: false, readOnly: true } : {}) });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      if (getApp().globalData.user?._id !== user._id ||
          (!user.roles?.includes('admin') && !user.roles?.includes('property'))) throw new Error('无权查看订单管理');
      if (!reset && this._ownerId !== user._id) throw new Error('管理身份已变化，请重新加载');
      const result = await api.call('admin', 'listOrders', { status: ['', 'pending_quote', 'pending_pay', 'paid', 'accepted', 'in_service', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled', 'closed'][statusIndex],
        offset }, { loading: false, silent: true, redirectOnForbidden: false,
          isActive: () => current() && getApp().globalData.user?._id === user._id });
      if (!current()) return;
      if (getApp().globalData.user?._id !== user._id) { this.currentOwner(); return; }
      const rows = result.list.map(order => ({ ...order,
        amount: order.status === 'pending_quote' ? '待商家报价' : yuan(order.pricing.payAmount + order.pricing.goodsCap),
        createdText: display(order.createdAt) }));
      this._ownerId = user._id;
      this.setData({ rows: reset ? rows : [...this.data.rows, ...rows], hasMore: result.hasMore,
        readOnly: result.readOnly, isAdmin: user.roles.includes('admin') });
    } catch (error) {
      if (current()) {
        const clear = reset || error.code === 'E_FORBIDDEN' || !this._ownerId ||
          getApp().globalData.user?._id !== this._ownerId;
        if (clear) this._ownerId = null;
        this.setData({ ...(clear ? { rows: [], hasMore: false, isAdmin: false, readOnly: true } : {}),
          error: error.message || '订单加载失败' });
      }
    }
    finally { if (current()) this.setData({ loading: false }); }
  },
  date(event) {
    if (!this.currentOwner() || !this.data.isAdmin) return;
    const field = event.currentTarget.dataset.field;
    if (field === 'subsidyFrom' || field === 'subsidyTo') {
      this._subsidyRangeEdited = true;
      this.setData({ [field]: event.detail.value });
    }
  },
  async exportSubsidy() {
    if (!this.currentOwner() || !this.data.isAdmin || this.data.exporting) return;
    const ownerId = this._ownerId;
    const current = () => this.visible() && this._ownerId === ownerId && getApp().globalData.user?._id === ownerId;
    this.setData({ exporting: true, error: '' });
    try {
      const result = await api.call('admin', 'exportSubsidyOrders', { from: this.data.subsidyFrom, to: this.data.subsidyTo });
      if (!current()) return;
      const filePath = await new Promise((resolve, reject) => wx.downloadFile({ url: result.tempFileURL,
        success: response => response.statusCode === 200 ? resolve(response.tempFilePath) : reject(new Error('CSV 下载失败')), fail: reject }));
      if (!current()) return;
      wx.openDocument({ filePath, fileType: 'csv', showMenu: true,
        fail: () => { if (current()) this.setData({ error: 'CSV 已下载，请使用“用其他应用打开”查看' }); } });
    } catch (error) { if (current()) this.setData({ error: error.message || '补贴订单导出失败' }); }
    finally { if (current()) this.setData({ exporting: false }); }
  },
  open(event) {
    if (!this.currentOwner()) return;
    const id = event.currentTarget.dataset.id;
    if (!this.data.rows.some(row => row._id === id)) return;
    wx.navigateTo({ url: '/admin/order/order?id=' + encodeURIComponent(id) });
  }
});
