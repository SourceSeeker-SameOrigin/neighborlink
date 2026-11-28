const api = require('../../utils/api');
function scope(user) {
  return user?._id && user.roles?.includes('station') && user.stationCode && (user.stationCommunityId || user.communityId)
    ? JSON.stringify([user._id, user.stationCommunityId || user.communityId, user.stationCode]) : '';
}
function validResult(result) {
  return result && (result.batchId === null || (typeof result.batchId === 'string' && result.batchId)) &&
    Number.isSafeInteger(result.eligibleCount) && result.eligibleCount >= 0 &&
    Number.isSafeInteger(result.skippedCount) && result.skippedCount >= 0;
}
Page({
  data: { ready: false, loading: true, busy: false, error: '', lines: '', result: null, recovery: '' },
  onShow() { this.visible = true; return this.load(); },
  onHide() {
    this.visible = false; this.version = (this.version || 0) + 1;
    this.setData({ ready: false, busy: false, loading: false, result: null, error: '' });
  },
  onUnload() { this.visible = false; this.version = (this.version || 0) + 1; },
  current(context) {
    return !!(context && this.visible && context.version === this.version && context.owner === scope(getApp().globalData.user));
  },
  async load() {
    if (!this.visible) return;
    const version = this.version = (this.version || 0) + 1;
    let owner = scope(getApp().globalData.user);
    const live = () => this.visible && version === this.version;
    const active = () => live() && (!owner || scope(getApp().globalData.user) === owner);
    this.context = null;
    this.setData({ ready: false, loading: true, busy: false, result: null, error: '', recovery: 'lookup' });
    try {
      const user = await getApp().ensureSession();
      if (!live()) return;
      const resolvedOwner = scope(user);
      if (!resolvedOwner) throw Error('请先核对驿站账号和小区绑定');
      if (scope(getApp().globalData.user) !== resolvedOwner || (owner && owner !== resolvedOwner))
        throw Error('登录身份已变化，请重新加载');
      owner = resolvedOwner;
      if (this.owner && this.owner !== owner) this.setData({ lines: '' });
      this.owner = owner;
      this.storageKey = 'station-creation:' + encodeURIComponent(owner);
      this.receipt = wx.getStorageSync(this.storageKey) || null;
      if (this.receipt && !/^[a-zA-Z0-9_-]{8,80}$/.test(this.receipt.requestId || '')) throw Error('原批次恢复编号不可用，请到工作台核对');
      let result = null;
      if (this.receipt) {
        const found = await api.call('station', 'lookupBatchCreation', { requestId: this.receipt.requestId },
          { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
        if (!live()) return;
        if (!active()) throw Error('登录身份已变化，请重新加载');
        if (!found || (found.batchId !== null && !validResult(found))) throw Error('原批次查询结果暂不可用');
        if (found.batchId) result = found;
      }
      this.context = { owner, version };
      this.setData({ ready: true, result, recovery: result ? 'done' : this.receipt ? 'confirm' : '' });
    } catch (error) {
      if (live()) this.setData({
        error: owner && scope(getApp().globalData.user) !== owner
          ? '登录身份已变化，请重新加载' : error.message || '原批次结果待核对，请重试读取',
        recovery: 'lookup'
      });
    } finally { if (live()) this.setData({ loading: false }); }
  },
  change(event) {
    if (!this.current(this.context) || !this.data.ready || this.data.busy || this.data.recovery === 'done') return;
    // Editing never discards an unresolved request number.
    this.setData({ lines: event.detail.value, result: null });
  },
  async create() {
    if (!this.visible || this.data.busy || this.data.loading) return;
    if (!this.current(this.context)) return this.load();
    if (!this.data.ready || this.data.recovery === 'done') return;
    const lines = this.data.lines.trim();
    if (!lines) { this.setData({ error: '请填写并确认门牌清单' }); return; }
    const context = this.context, key = this.storageKey;
    const active = () => this.current(context);
    this.setData({ busy: true, error: '', result: null });
    try {
      const saved = wx.getStorageSync(key);
      if (saved && saved.requestId !== this.receipt?.requestId) { await this.load(); return; }
      const receipt = this.receipt || { requestId: 'station_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10) };
      // Persist before sending; a storage failure must not create an untraceable batch.
      wx.setStorageSync(key, { requestId: receipt.requestId });
      this.receipt = receipt;
      const result = await api.call('station', 'createBatch', { lines, requestId: receipt.requestId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      if (!active()) return;
      if (!validResult(result)) throw Error('批次结果暂不可用');
      this.setData({ result, recovery: 'done' });
      wx.showToast({ title: result.batchId ? '批次已创建' : '这些门牌没有已授权住户', icon: result.batchId ? 'success' : 'none' });
    } catch (error) {
      if (!active()) return;
      if (this.receipt) await this.load();
      else this.setData({ error: error.message || '创建凭据未保存，请重试' });
    } finally { if (active()) this.setData({ busy: false }); }
  },
  nextBatch() {
    if (!this.current(this.context) || !this.data.ready || this.data.busy || this.data.recovery !== 'done') return;
    try {
      const saved = wx.getStorageSync(this.storageKey);
      if (saved && saved.requestId !== this.receipt?.requestId) return this.load();
      wx.removeStorageSync(this.storageKey);
      this.receipt = null;
      this.setData({ lines: '', result: null, recovery: '', error: '' });
    } catch (error) { this.setData({ error: '恢复凭据未清理，请重试，尚未开始下一批' }); }
  }
});
