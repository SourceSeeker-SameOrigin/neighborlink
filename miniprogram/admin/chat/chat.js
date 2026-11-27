const api = require('../../utils/api');
const { display } = require('../../utils/time');

function emptyView() {
  return { messages: [], lastId: '', hasMore: false, auditConfirmed: false, pageError: '' };
}

function networkFailure(error) {
  return error.code === 'E_NETWORK' || (!error.code && /network|timeout|网络|超时/i.test(error.errMsg || error.message || ''));
}

Page({
  data: { ...emptyView(), loading: false, error: '' },
  onLoad(options) {
    this.caseType = options.caseType || 'complaint';
    this.orderId = options.orderId || '';
    this.reportId = options.reportId || '';
  },
  onShow() { this.inactive = false; return this.load(); },
  onHide() {
    this.inactive = true;
    this.ownerId = '';
    this.setData({ ...emptyView(), loading: false, error: '' });
  },
  onUnload() { this.onHide(); },
  authorized() {
    const user = getApp().globalData.user;
    return !this.inactive && !!this.ownerId && user?._id === this.ownerId &&
      user.roles?.includes('admin') && this.data.auditConfirmed;
  },
  invalidate() {
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.ownerId = '';
    this.setData({ ...emptyView(), loading: false, error: '登录身份已变化，请重新加载' });
  },
  load() { return this.read(false); },
  loadMore() { return this.read(true); },
  async read(append) {
    if (this.inactive || (append && (this.data.loading || !this.data.hasMore))) return;
    if (append && !this.authorized()) return this.invalidate();
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    let ownerId = append ? this.ownerId : '';
    const isActive = () => !this.inactive && sequence === this.loadSequence &&
      (!ownerId || getApp().globalData.user?._id === ownerId);
    const afterId = append ? this.data.lastId : '';
    if (!append) this.ownerId = '';
    this.setData({ ...(append ? {} : emptyView()), loading: true, error: '', pageError: '' });
    try {
      const user = await getApp().ensureSession();
      if (!isActive()) return;
      if (!user?._id || !user.roles?.includes('admin') || getApp().globalData.user?._id !== user._id)
        throw new Error('当前身份无权查看聊天审计');
      ownerId = user._id;
      const result = await api.call('chat', 'adminPull', { caseType: this.caseType,
        ...(this.orderId ? { orderId: this.orderId } : {}), ...(this.reportId ? { reportId: this.reportId } : {}),
        ...(append ? { afterId } : {}) }, { loading: false, silent: true, isActive, redirectOnForbidden: false });
      if (!isActive()) return;
      if (result.hasMore && (!result.lastId || result.lastId <= afterId)) throw new Error('消息分页位置异常，请刷新重试');
      const byId = new Map((append ? this.data.messages : []).map(item => [item._id, item]));
      for (const item of result.list) {
        byId.set(item._id, { ...item, timeText: display(item.createdAt),
          contentText: item.content || (item.type === 'image' ? (item.status === 'pending' ? '图片审核中' : '图片') : '') });
      }
      // adminPull can include the reported message ahead of its chronological page.
      const messages = [...byId.values()].sort((a, b) => a._id.localeCompare(b._id));
      this.ownerId = ownerId;
      this.setData({ auditConfirmed: true, messages, lastId: result.lastId || '', hasMore: !!result.hasMore });
    } catch (error) {
      if (!isActive()) return;
      const message = error.message || '聊天记录读取失败，请重试';
      if (append && networkFailure(error)) this.setData({ pageError: message });
      else { this.ownerId = ''; this.setData({ ...emptyView(), error: message }); }
    } finally {
      if (isActive()) this.setData({ loading: false });
    }
  },
  preview(event) {
    const url = event.currentTarget.dataset.url;
    if (!this.authorized()) return this.invalidate();
    if (!url || !this.data.messages.some(item => item.fileId === url)) return;
    const sequence = this.loadSequence;
    return require('../../utils/media-links').preview({ current: url, urls: [url] },
      () => this.authorized() && sequence === this.loadSequence);
  }
});
