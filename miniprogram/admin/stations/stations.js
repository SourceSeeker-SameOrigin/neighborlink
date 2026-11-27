const api = require('../../utils/api');
Page({
  data: { loading: true, busy: false, error: '', rows: [], hasMore: true },
  onShow() { this._hidden = false; return this.load(true); },
  onHide() {
    this._hidden = true;
    this.sequence = (this.sequence || 0) + 1;
    this._ownerId = null;
    this.setData({ rows: [], hasMore: false, loading: false, busy: false, error: '' });
  },
  onUnload() { this.onHide(); this._closed = true; },
  currentOwner(sequence = this.sequence) {
    const user = getApp().globalData.user;
    return !this._closed && !this._hidden && sequence === this.sequence &&
      this._ownerId && user?._id === this._ownerId && user.roles?.includes('admin');
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(); },
  retry() { return this.load(this._failedReset !== false); },
  async load(reset = false) {
    if (this._closed || this._hidden || (!reset && (this.data.loading || this.data.busy || !this.data.hasMore))) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const isActive = () => !this._closed && !this._hidden && sequence === this.sequence;
    const offset = reset ? 0 : this.data.rows.length;
    this._failedReset = reset;
    if (reset) this._ownerId = null;
    this.setData({ loading: true, error: '', ...(reset ? { rows: [], hasMore: true } : {}) });
    try {
      const user = await getApp().ensureSession();
      if (!isActive()) return;
      if (getApp().globalData.user?._id !== user._id || !user.roles?.includes('admin')) throw new Error('无权查看驿站申请');
      if (!reset && this._ownerId !== user._id) throw new Error('审核身份已变化，请重新加载');
      const result = await api.call('station', 'listApplications', { status: 'pending', offset },
        { loading: false, silent: true, redirectOnForbidden: false,
          isActive: () => isActive() && getApp().globalData.user?._id === user._id });
      if (!isActive()) return;
      if (getApp().globalData.user?._id !== user._id) {
        this._ownerId = null;
        this.setData({ rows: [], hasMore: false });
        return;
      }
      this._ownerId = user._id;
      this.setData({ rows: reset ? result.list : this.data.rows.concat(result.list), hasMore: result.hasMore });
    } catch (error) {
      if (isActive()) {
        const clear = reset || error.code === 'E_FORBIDDEN' || !this._ownerId ||
          getApp().globalData.user?._id !== this._ownerId;
        if (clear) this._ownerId = null;
        this.setData({ ...(clear ? { rows: [], hasMore: false } : {}), error: error.message || '驿站申请加载失败' });
      }
    }
    finally { if (isActive()) this.setData({ loading: false }); }
  },
  async review(event) {
    if (!this.currentOwner() || this.data.busy || this.data.loading) return;
    const row = this.data.rows[event.currentTarget.dataset.index];
    if (!row) return;
    const sequence = this.sequence;
    const status = event.currentTarget.dataset.status;
    let reviewNote = '';
    if (status === 'rejected') {
      const answer = await new Promise(resolve => wx.showModal({ title: '拒绝申请', editable: true, placeholderText: '填写原因（选填）', success: resolve }));
      if (!answer.confirm) return;
      reviewNote = answer.content || '';
    } else {
      const answer = await new Promise(resolve => wx.showModal({ title: '通过申请', content: `确认授予 ${row.stationName} 驿站账号权限吗？`, success: resolve }));
      if (!answer.confirm) return;
    }
    if (!this.currentOwner(sequence) || this.data.busy || this.data.loading ||
        !this.data.rows.some(item => item._id === row._id)) return;
    this.setData({ busy: true, error: '' });
    try {
      await api.call('station', 'reviewApplication', { applicationId: row._id, status, reviewNote },
        { silent: true, redirectOnForbidden: false, isActive: () => this.currentOwner(sequence) });
      if (!this.currentOwner(sequence)) return;
      wx.showToast({ title: status === 'approved' ? '已通过' : '已拒绝', icon: 'success' });
      this.setData({ busy: false });
      await this.load(true);
    } catch (error) {
      if (this.currentOwner(sequence)) {
        this.setData({ busy: false, error: error.message || '审核结果待核对' });
        await this.load(true);
      }
    }
  }
});
