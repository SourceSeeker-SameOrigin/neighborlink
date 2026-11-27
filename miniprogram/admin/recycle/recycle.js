const validRange = require('../../utils/date-range');
const listAll = require('../../utils/list-all');
Page({
  data: { loading: true, ready: false, busy: false, error: '', communities: [], communityIndex: 0, from: '', to: '' },
  async onLoad() {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    this._autoDate = today;
    this._defaultRange = { from: today.slice(0, 8) + '01', to: today };
    this.setData(this._defaultRange);
    await this.load();
  },
  onShow() {
    this._hidden = false;
    const userId = getApp().globalData.user?._id;
    if (userId && this._lastOwnerId && userId !== this._lastOwnerId)
      this._dateManual = this._drafts?.[userId]?.manual === true;
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (this._autoDate && this._autoDate !== today && !this._dateManual) {
      this._defaultRange = { from: today.slice(0, 8) + '01', to: today };
      this.setData(this._defaultRange);
    }
    this._autoDate = today;
    if (this._seenShow) return this.load();
    this._seenShow = true;
  },
  onHide() {
    this._hidden = true;
    this.sequence = (this.sequence || 0) + 1;
    if (this._ownerId) {
      this._drafts = this._drafts || {};
      this._drafts[this._ownerId] = { from: this.data.from, to: this.data.to, manual: this._dateManual === true };
      this._lastOwnerId = this._ownerId;
    }
    this._ownerId = null;
    this.setData({ ready: false, loading: false, busy: false, communities: [], error: '' });
  },
  onUnload() { this.onHide(); this._closed = true; },
  currentOwner() {
    const user = getApp().globalData.user;
    if (!this._closed && !this._hidden && this.data.ready && this._ownerId &&
        user?._id === this._ownerId && user.roles?.includes('admin')) return true;
    this._ownerId = null;
    this.setData({ ready: false, communities: [] });
    return false;
  },
  async load() {
    if (this._hidden || this._closed) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const current = () => !this._hidden && !this._closed && sequence === this.sequence;
    if (this._ownerId) {
      this._drafts = this._drafts || {};
      this._drafts[this._ownerId] = { from: this.data.from, to: this.data.to, manual: this._dateManual === true };
    }
    const previousOwner = this._ownerId || this._lastOwnerId;
    this._ownerId = null;
    this.setData({ loading: true, ready: false, communities: [], error: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      if (getApp().globalData.user?._id !== user._id || !user.roles?.includes('admin')) throw new Error('只有运营管理员可以导出回收企业对账');
      if (previousOwner && previousOwner !== user._id) {
        const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        this._defaultRange = { from: today.slice(0, 8) + '01', to: today };
        const draft = this._drafts?.[user._id];
        this._dateManual = draft?.manual === true;
        this.setData(draft ? { from: draft.from, to: draft.to } : this._defaultRange);
      }
      const communities = await listAll('catalog', 'listCommunities', {},
        { redirectOnForbidden: false, isActive: () => current() && getApp().globalData.user?._id === user._id });
      if (!current() || getApp().globalData.user?._id !== user._id) return;
      this._ownerId = user._id;
      this._lastOwnerId = user._id;
      this.setData({ communities, ready: true, communityIndex: Math.max(0, communities.findIndex(item => item._id === user.communityId)) });
    } catch (error) { if (current()) this.setData({ error: error.message || '加载失败' }); }
    finally { if (current()) this.setData({ loading: false }); }
  },
  input(event) {
    if (!this.currentOwner()) return;
    const field = event.currentTarget.dataset.field;
    if (field === 'from' || field === 'to') { this._dateManual = true; this.setData({ [field]: event.detail.value }); }
  },
  select(event) { if (this.currentOwner()) this.setData({ communityIndex: Number(event.detail.value) }); },
  openExports() {
    if (this.data.loading || this.data.busy || !this.currentOwner()) return;
    const ownerId = this._ownerId;
    const community = this.data.communities[this.data.communityIndex];
    if (!community) { this.setData({ error: '请选择小区' }); return; }
    if (!validRange(this.data.from, this.data.to)) { this.setData({ error: '请选择有效的对账日期范围' }); return; }
    this.setData({ error: '' });
    const query = Object.entries({ type: 'recycle', communityId: community._id, from: this.data.from, to: this.data.to })
      .map(([key, value]) => key + '=' + encodeURIComponent(value)).join('&');
    wx.navigateTo({ url: '/admin/exports/exports?' + query,
      fail: () => { if (this._ownerId === ownerId && this.currentOwner()) this.setData({ error: '未能打开数据导出页，请重试' }); } });
  }
});
