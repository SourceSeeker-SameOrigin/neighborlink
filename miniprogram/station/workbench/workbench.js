const api = require('../../utils/api');
const { display } = require('../../utils/time');
function identity(user) {
  return user?._id ? JSON.stringify([user._id, user.stationCommunityId || user.communityId,
    user.stationCode, (user.roles || []).includes('station')]) : '';
}
Page({
  data: { loading: true, ready: false, error: '', loadError: false, pageError: false,
    batches: [], hasMore: false, exporting: false },
  onLoad() { const today = new Date(); this.setData({ month: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}` }); },
  onShow() { this.visible = true; return this.load(true); },
  invalidate() {
    this.read = (this.read || 0) + 1;
    this.context = null;
    this.operation = null;
  },
  onHide() {
    this.visible = false; this.invalidate();
    this.setData({ ready: false, loading: false, batches: [], hasMore: false,
      exporting: false, error: '', loadError: false, pageError: false });
  },
  onUnload() { this.visible = false; this.invalidate(); },
  current(context) {
    return !!(context && this.visible && context.read === this.read &&
      context.owner === identity(getApp().globalData.user));
  },
  onReachBottom() {
    if (!this.data.loading && !this.data.exporting && !this.data.loadError && this.data.hasMore) return this.load();
  },
  retry() { return this.load(!this.data.pageError); },
  async load(reset = false) {
    if (!this.visible) return;
    if (!reset && (this.data.loading || this.data.exporting || !this.data.hasMore)) return;
    if (!reset && !this.current(this.context)) return this.load(true);
    this.invalidate();
    if (reset) this.offset = 0;
    const read = this.read, app = getApp();
    let owner = identity(app.globalData.user);
    const current = () => this.visible && this.read === read && (!owner || owner === identity(app.globalData.user));
    const offset = reset ? 0 : this.offset;
    this.setData({ loading: true, ready: false, exporting: false, error: '', loadError: false, pageError: false,
      ...(reset ? { batches: [], hasMore: false } : {}) });
    try {
      const user = await app.ensureSession();
      if (!current()) return;
      owner = identity(user);
      if (!owner) throw Error('登录资料暂不可用，请重试');
      if (!current()) return;
      const result = await api.call('station', 'listMyBatches', { offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      if (!Array.isArray(result.list) || (result.hasMore && !result.list.length)) throw Error('批次分页结果异常，请重试');
      const rows = reset ? [] : this.data.batches.slice(), ids = new Set(rows.map(item => item._id));
      const batches = rows.concat(result.list.filter(item => {
        if (ids.has(item._id)) return false;
        ids.add(item._id); return true;
      }).map(batch => ({ ...batch, createdText: display(batch.createdAt).slice(0, 16) })));
      this.offset = offset + result.list.length;
      this.context = { owner, read };
      this.setData({ batches, hasMore: result.hasMore === true, ready: true });
    } catch (error) {
      if (!current()) return;
      const retain = !reset && !['E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND', 'E_BLOCKED'].includes(error.code);
      this.context = retain ? { owner, read } : null;
      if (!retain) this.offset = 0;
      this.setData({ ready: false, loadError: true, pageError: retain, error: error.message || '批次加载失败',
        ...(!retain ? { batches: [], hasMore: false } : {}) });
    } finally { if (current()) this.setData({ loading: false }); }
  },
  monthChange(event) {
    if (!this.visible || this.data.exporting) return;
    const month = event.detail.value;
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) this.setData({ month, ...(!this.data.loadError ? { error: '' } : {}) });
  },
  async exportStatement() {
    if (!this.visible || !this.data.ready || this.data.loading || this.data.exporting) return;
    if (!this.current(this.context)) return this.load(true);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(this.data.month || '')) {
      this.setData({ error: '请选择正确的对账月份' }); return;
    }
    const operation = this.operation = { ...this.context, month: this.data.month };
    const current = () => this.operation === operation && this.current(operation) &&
      this.data.ready && !this.data.loading && this.data.month === operation.month;
    const [year, month] = this.data.month.split('-').map(Number);
    const from = `${this.data.month}-01`;
    const to = `${this.data.month}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
    this.setData({ exporting: true, error: '' });
    try {
      const result = await api.call('station', 'exportStatement', { from, to },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      await new Promise((resolve, reject) => wx.setClipboardData({ data: result.tempFileURL,
        success: () => resolve(), fail: reject }));
      if (!current()) return;
      wx.showModal({ title: '对账CSV已生成', content: `${result.count} 个批次，应付 ¥${(result.gross / 100).toFixed(2)}。下载链接已复制，可在浏览器打开。`,
        showCancel: false });
    } catch (error) {
      if (!current()) return;
      if (['E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND', 'E_BLOCKED'].includes(error.code)) {
        this.invalidate(); this.offset = 0;
        this.setData({ batches: [], hasMore: false, ready: false, exporting: false,
          loadError: true, pageError: false, error: error.message || '请重新核对驿站权限' });
      } else this.setData({ error: error.message || '对账导出失败' });
    }
    finally {
      if (this.operation === operation) {
        this.operation = null;
        if (this.current(operation)) this.setData({ exporting: false });
        else if (this.visible) this.load(true);
      }
    }
  }
});
