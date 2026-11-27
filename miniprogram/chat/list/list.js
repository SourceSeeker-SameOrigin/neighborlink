const api = require('../../utils/api');
const { display } = require('../../utils/time');
const { lifecycle, readList } = require('../../utils/visible-list');

Page({
  ...lifecycle,
  data: { loading: false, error: '', list: [], unreadTotal: 0, hasMore: false,
    loadingMore: false, moreError: '' },
  onHide() {
    lifecycle.onHide.call(this);
    this._listOwnerId = null;
    this.cursor = null;
    this.setData({ list: [], unreadTotal: 0, loading: false, error: '', hasMore: false,
      loadingMore: false, moreError: '' });
  },
  onUnload() { this.onHide(); lifecycle.onUnload.call(this); },
  load() {
    this.cursor = null;
    return readList(this, { list: [], unreadTotal: 0, hasMore: false, moreError: '' }, '消息加载失败', async (user, options) => {
      const result = await api.call('chat', 'list', { limit: 20 }, options);
      if (!options.isActive()) return;
      this._listOwnerId = user._id;
      this.cursor = result.nextCursor || null;
      return { unreadTotal: result.unreadTotal, list: result.list.map(item => ({ ...item,
        lastText: item.lastMessage || '开始聊天', timeText: item.lastAt ? display(item.lastAt) : '' })),
        hasMore: Boolean(result.hasMore) };
    }, undefined, { list: [], unreadTotal: 0, hasMore: false, moreError: '' });
  },
  async loadMore() {
    const userId = getApp().globalData.user?._id;
    if (this._hidden || this._unloaded || !userId || userId !== this._listOwnerId) {
      this.onHide();
      return;
    }
    if (!this.data.hasMore || this.data.loadingMore || !this.cursor) return;
    const cursor = this.cursor, visit = this._visit;
    const active = () => !this._hidden && !this._unloaded && this._visit === visit &&
      getApp().globalData.user?._id === userId && this._listOwnerId === userId && this.cursor === cursor;
    this.setData({ loadingMore: true, moreError: '' });
    try {
      const result = await api.call('chat', 'list', { limit: 20, cursor },
        { loading: false, silent: true, isActive: active });
      if (!active()) return;
      const seen = new Set(this.data.list.map(item => item.conversationId));
      const appended = result.list.filter(item => !seen.has(item.conversationId)).map(item => ({ ...item,
        lastText: item.lastMessage || '开始聊天', timeText: item.lastAt ? display(item.lastAt) : '' }));
      this.cursor = result.nextCursor || null;
      this.setData({ list: [...this.data.list, ...appended], unreadTotal: result.unreadTotal,
        hasMore: Boolean(result.hasMore) });
    } catch (error) { if (active()) this.setData({ moreError: error.message || '更多会话加载失败' }); }
    finally { if (active() || this._visit === visit) this.setData({ loadingMore: false }); }
  },
  open(event) {
    const userId = getApp().globalData.user?._id;
    if (this._hidden || this._unloaded || !userId || userId !== this._listOwnerId) {
      this._listOwnerId = null;
      this.setData({ list: [], unreadTotal: 0 });
      return;
    }
    const id = event.currentTarget.dataset.id;
    if (!this.data.list.some(item => item.conversationId === id)) return;
    wx.navigateTo({ url: '/chat/room/room?conversationId=' + encodeURIComponent(id) });
  }
});
