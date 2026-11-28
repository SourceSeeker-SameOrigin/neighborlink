const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
function identity(user) {
  return user?._id ? JSON.stringify([user._id, user.communityId, [...(user.roles || [])].sort()]) : '';
}
const denied = error => ['E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND', 'E_BLOCKED'].includes(error.code);

Page({
  data: { ready: false, loading: false, busy: false, error: '', pageError: false, list: [], hasMore: false },
  onShow() { this.visible = true; return this.load(true); },
  invalidate() { this.read = (this.read || 0) + 1; this.context = null; this.operation = null; },
  onHide() {
    this.visible = false; this.invalidate(); this.offset = 0;
    this.setData({ ready: false, loading: false, busy: false, error: '', pageError: false, list: [], hasMore: false });
  },
  onUnload() { this.visible = false; this.invalidate(); },
  current(context) {
    return !!(context && this.visible && context.read === this.read && context.owner === identity(getApp().globalData.user));
  },
  onReachBottom() { if (!this.data.loading && !this.data.busy && !this.data.error && this.data.hasMore) return this.load(); },
  more() { return this.load(); },
  retry() { return this.load(!this.data.pageError); },
  async load(reset = false) {
    if (!this.visible) return;
    if (!reset && (this.data.loading || this.data.busy || !this.data.hasMore)) return;
    if (!reset && !this.current(this.context)) return this.load(true);
    const hadVerifiedContext = !!this.context;
    this.invalidate();
    if (reset) this.offset = 0;
    const read = this.read, offset = this.offset, app = getApp();
    let owner = identity(app.globalData.user);
    const hadKnownOwner = !!owner;
    const live = () => this.visible && read === this.read;
    const current = () => live() && (!owner || owner === identity(app.globalData.user));
    this.setData({ ready: false, loading: true, busy: false, error: '', pageError: false,
      ...(reset ? { list: [], hasMore: false } : {}) });
    try {
      const user = await app.ensureSession();
      if (!live()) return;
      const resolvedOwner = identity(user);
      if (!resolvedOwner) throw Error('登录资料暂不可用，请重试');
      if (identity(app.globalData.user) !== resolvedOwner || (owner && owner !== resolvedOwner))
        throw Error('登录身份已变化，请重新加载');
      owner = resolvedOwner;
      let nextOffset = offset, hasMore = true;
      const found = [];
      for (let scan = 0; scan < 5 && hasMore && !found.length; scan++) {
        const result = await api.call('station', 'providerHall', { offset: nextOffset },
          { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
        if (!live()) return;
        if (!current()) throw Error('登录身份已变化，请重新加载');
        if (!Array.isArray(result.list)) throw Error('批次分页结果异常，请重试');
        found.push(...result.list);
        const after = Number.isInteger(result.nextOffset) ? result.nextOffset : nextOffset + result.list.length;
        if (after <= nextOffset && result.hasMore) throw Error('批次分页结果异常，请重试');
        nextOffset = after;
        hasMore = result.hasMore === true;
      }
      if (!live()) return;
      if (!current()) throw Error('登录身份已变化，请重新加载');
      const rows = reset ? [] : this.data.list.slice(), ids = new Set(rows.map(item => item._id));
      const list = rows.concat(found.filter(item => {
        if (ids.has(item._id)) return false;
        ids.add(item._id); return true;
      }).map(item => ({ ...item, incomeText: yuan(item.estimatedIncome) })));
      this.offset = nextOffset;
      this.context = { read, owner };
      this.setData({ list, hasMore, ready: true });
    } catch (error) {
      if (!live()) return;
      const identityChanged = owner && identity(app.globalData.user) !== owner;
      if ((hadVerifiedContext || hadKnownOwner) && identityChanged) return;
      const retain = !reset && !identityChanged && !denied(error);
      this.context = retain ? { read, owner } : null;
      if (!retain) this.offset = 0;
      this.setData({ ready: false, pageError: retain,
        error: identityChanged ? '登录身份已变化，请重新加载' : error.message || '批次加载失败',
        ...(!retain ? { list: [], hasMore: false } : {}) });
    } finally {
      if (live() && !((hadVerifiedContext || hadKnownOwner) && owner && identity(app.globalData.user) !== owner))
        this.setData({ loading: false });
    }
  },
  async accept(event) {
    if (!this.visible || this.data.loading) return;
    if (!this.current(this.context)) return this.load(true);
    if (!this.data.ready || this.data.loading || this.data.busy) return;
    const batchId = event.currentTarget.dataset.id;
    if (!this.data.list.some(item => item._id === batchId)) return;
    const operation = this.operation = { ...this.context, batchId };
    const current = () => this.operation === operation && this.current(operation) && this.data.ready;
    this.setData({ busy: true, error: '' });
    try {
      const result = await api.call('station', 'acceptBatch', { batchId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      wx.navigateTo({ url: '/station/batch/batch?id=' + encodeURIComponent(result.batchId) });
    } catch (error) {
      if (!current()) return;
      if (denied(error)) {
        this.invalidate(); this.offset = 0;
        this.setData({ ready: false, busy: false, list: [], hasMore: false, pageError: false });
      }
      this.setData({ error: error.message || '接单失败' });
    } finally { if (current()) { this.operation = null; this.setData({ busy: false }); } }
  }
});
