const api = require('../../utils/api');
const TYPES = { post:'帖子', comment:'评论', idle:'闲置', event:'活动', message:'聊天消息', merchant:'商家服务' };
Page({
  data: { loading: false, busy: false, error: '', rows: [], hasMore: true, status: 'pending' },
  onShow() { this._hidden = false; return this.load(true); },
  onHide() {
    this._hidden = true;
    this.sequence = (this.sequence || 0) + 1;
    this.ownerId = '';
    this.operation = null;
    this.setData({ rows: [], hasMore: false, loading: false, busy: false, error: '' });
  },
  onUnload() { this.onHide(); this._closed = true; },
  current() {
    const user = getApp().globalData.user;
    return !this._closed && !this._hidden && !!this.ownerId &&
      user?._id === this.ownerId && user.roles?.includes('admin') && !this.data.loading;
  },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(); },
  retry() { return this.load(this._failedReset !== false); },
  async load(reset = false) {
    if (this._closed || this._hidden || (!reset && (this.data.loading || this.data.busy || !this.data.hasMore))) return;
    if (!reset && !this.current()) return this.load(true);
    const sequence = this.sequence = (this.sequence || 0) + 1;
    let userId = '';
    const isActive = () => !this._closed && !this._hidden && sequence === this.sequence &&
      (!userId || getApp().globalData.user?._id === userId);
    const offset = reset ? 0 : this.data.rows.length;
    const status = this.data.status;
    this._failedReset = reset;
    if (reset) this.ownerId = '';
    this.setData({ loading: true, busy: false, error: '', ...(reset ? { rows: [], hasMore: true } : {}) });
    try {
      const user = await getApp().ensureSession();
      if (!isActive()) return;
      if (!user?._id || !user.roles?.includes('admin') || getApp().globalData.user?._id !== user._id)
        throw Error('当前身份无权查看举报审核');
      userId = user._id;
      const result = await api.call('content', 'listReports', { status, offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive });
      if (!isActive()) return;
      const rows = result.list.map(item => ({ ...item, typeLabel: TYPES[item.targetType] || item.targetType }));
      this.ownerId = userId;
      this.setData({ rows: reset ? rows : [...this.data.rows, ...rows], hasMore: result.hasMore });
    } catch (error) { if (isActive()) this.setData({ error: error.message || '举报列表加载失败',
      ...(reset ? { rows: [], hasMore: false } : {}) }); }
    finally { if (isActive()) this.setData({ loading: false }); }
  },
  chooseStatus(event) {
    if (this._closed || this.data.busy || !['pending', 'upheld', 'dismissed'].includes(event.currentTarget.dataset.status)) return;
    if (!this.current()) return this.load(true);
    this.setData({ status: event.currentTarget.dataset.status }); this.load(true);
  },
  openChat(event) {
    if (this._closed || this.data.loading || this.data.busy) return;
    if (!this.current()) return this.load(true);
    const row = this.data.rows[event.currentTarget.dataset.index];
    if (!row) return;
    wx.navigateTo({ url: '/admin/chat/chat?caseType=report&reportId=' + encodeURIComponent(row._id) });
  },
  async resolve(event) {
    const row = this.data.rows[event.currentTarget.dataset.index];
    const status = event.currentTarget.dataset.status;
    if (this._closed || this.data.busy || this.data.loading || !row) return;
    if (!this.current()) return this.load(true);
    const operation = this.operation = { sequence: this.sequence, ownerId: this.ownerId, reportId: row._id };
    const active = () => this.operation === operation && this.current() &&
      this.sequence === operation.sequence && this.data.rows.some(item => item._id === operation.reportId);
    this.setData({ busy: true, error: '' });
    try {
      await api.call('content', 'resolveReport', { reportId: row._id, status },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      if (active()) await this.load(true);
    } catch (error) { if (active()) this.setData({ error: error.message || '提交审核结果失败' }); }
    finally { if (this.operation === operation) {
      this.operation = null;
      if (this.current()) this.setData({ busy: false });
    } }
  },
  async moderate(event) {
    const row = this.data.rows[event.currentTarget.dataset.index];
    const kind = event.currentTarget.dataset.kind;
    if (this._closed || this.data.busy || this.data.loading || !row) return;
    if (!this.current()) return this.load(true);
    const operation = this.operation = { sequence: this.sequence, ownerId: this.ownerId, reportId: row._id };
    const active = () => this.operation === operation && this.current() &&
      this.sequence === operation.sequence && this.data.rows.some(item => item._id === operation.reportId);
    this.setData({ busy: true, error: '' });
    try {
      if (kind === 'hide' || kind === 'show') await api.call('content', 'moderateContent', {
        targetType: row.targetType, targetId: row.targetId, communityId: row.communityId, hidden: kind === 'hide' },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      else if (row.authorUserId) await api.call('content', 'moderateUser', { userId: row.authorUserId,
        operation: kind === 'mute' ? 'mute' : 'block', hours: 24 },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
      else throw new Error('无法定位内容发布者账号');
      if (active()) await this.load(true);
    } catch (error) { if (active()) this.setData({ error: error.message || '内容管理操作失败' }); }
    finally { if (this.operation === operation) {
      this.operation = null;
      if (this.current()) this.setData({ busy: false });
    } }
  }
});
