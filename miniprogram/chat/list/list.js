const api = require('../../utils/api');
const { display } = require('../../utils/time');
const { lifecycle, readList } = require('../../utils/visible-list');

Page({
  ...lifecycle,
  data: { loading: false, error: '', list: [], unreadTotal: 0 },
  onHide() {
    lifecycle.onHide.call(this);
    this._listOwnerId = null;
    this.setData({ list: [], unreadTotal: 0, loading: false, error: '' });
  },
  onUnload() { this.onHide(); lifecycle.onUnload.call(this); },
  load() {
    return readList(this, { list: [], unreadTotal: 0 }, '消息加载失败', async (user, options) => {
      const result = await api.call('chat', 'list', {}, options);
      if (!options.isActive()) return;
      this._listOwnerId = user._id;
      return { unreadTotal: result.unreadTotal, list: result.list.map(item => ({ ...item,
        lastText: item.lastMessage || '开始聊天', timeText: item.lastAt ? display(item.lastAt) : '' })) };
    }, undefined, { list: [], unreadTotal: 0 });
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
