const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display } = require('../../utils/time');
const { lifecycle, readList } = require('../../utils/visible-list');

Page({
  ...lifecycle,
  data: { loading: true, error: '', list: [], hasMore: true },
  onHide() {
    lifecycle.onHide.call(this);
    this.listUserId = null;
    this.listCommunityId = null;
    this.setData({ list: [], hasMore: false, loading: false, error: '' });
  },
  onUnload() { this.onHide(); lifecycle.onUnload.call(this); },
  onPullDownRefresh() {
    return this.load(true).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) return this.load(false);
  },
  load(reset = true) {
    const append = reset === false;
    const list = this.data.list;
    return readList(this, append ? {} : { list: [], hasMore: false }, '活动加载失败', async (user, options) => {
      const sameList = append && this.listUserId === user._id && this.listCommunityId === user.communityId;
      if (append && !sameList) this.setData({ list: [], hasMore: false });
      const previous = sameList ? list : [];
      const result = await api.call('event', 'list', { offset: previous.length }, options);
      if (!options.isActive()) return;
      this.listUserId = user._id;
      this.listCommunityId = user.communityId;
      const rows = result.list.map(item => ({ ...item, feeText: item.fee ? '¥' + yuan(item.fee) : '免费', startText: display(item.startAt) }));
      return { list: previous.concat(rows), hasMore: result.hasMore };
    }, undefined, { list: [], hasMore: false });
  },
  open(event) {
    const user = getApp().globalData.user;
    if (this._hidden || this._unloaded || !user?._id || user._id !== this.listUserId || user.communityId !== this.listCommunityId) {
      this.listUserId = null;
      this.listCommunityId = null;
      this.setData({ list: [], hasMore: false });
      return;
    }
    const id = event.currentTarget.dataset.id;
    if (this.data.list.some(item => item._id === id)) wx.navigateTo({ url: '/events/detail/detail?id=' + encodeURIComponent(id) });
  }
});
