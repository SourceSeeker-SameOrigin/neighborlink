const api = require('../../utils/api');
const { display } = require('../../utils/time');
const { yuan } = require('../../utils/money');
Page({
  data: { missingRecord: false, loading: true, busy: false, error: '', post: null, comments: [], commentText: '' },
  onLoad(options = {}) {
    this.postId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.postId, loading: !!this.postId });
  },
  onShow() { this.hidden = false; return this.load(); },
  onHide() { this.hidden = true; this.readSequence = (this.readSequence || 0) + 1; this.clearDetail(); },
  onUnload() { this.closed = true; this.readSequence = (this.readSequence || 0) + 1; this.clearDetail(); },
  clearDetail() { this.setData({ post: null, comments: [], commentText: '', busy: false }); },
  currentDetail(sequence = this.readSequence) {
    const user = getApp().globalData.user;
    return !this.hidden && !this.closed && sequence === this.readSequence && !!this.ownerId &&
      user?._id === this.ownerId && user?.communityId === this.ownerCommunityId &&
      this.data.post?._id === this.postId;
  },
  async load() {
    if (!this.postId) return;
    const sequence = this.readSequence = (this.readSequence || 0) + 1;
    this.clearDetail();
    this.setData({ loading: true, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (this.hidden || this.closed || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id) return;
      this.ownerId = user._id; this.ownerCommunityId = user.communityId;
      const result = await api.call('board', 'detail', { postId: this.postId }, { loading: false, silent: true });
      if (this.hidden || this.closed || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) return;
      const post = { ...result.post, timeText: display(result.post.createdAt), imageUrls: result.post.images,
        departText: result.post.carry ? display(result.post.carry.departAt) : '',
        returnText: result.post.carry && result.post.carry.returnAt ? display(result.post.carry.returnAt) : '',
        rewardText: result.post.reward ? yuan(result.post.reward) : '',
        slotText: result.post.slot ? result.post.slot.date + ' ' + result.post.slot.start + '—' + result.post.slot.end : '',
        statusText: result.post.status === 'pending_pay' ? '待支付' : result.post.status === 'open' ? '待接单' :
          result.post.status === 'taken' ? '服务处理中' : result.post.status === 'done' ? '已完成' : '已关闭' };
      this.setData({ post, comments: result.comments.map(item => ({ ...item, timeText: display(item.createdAt) })) });
      wx.setNavigationBarTitle({ title: post.type === 'task' ? '悬赏详情' : post.type === 'carry' ? '出行帮带' : '求助详情' });
    } catch (error) { if (!this.hidden && !this.closed && sequence === this.readSequence) this.setData({ error: error.message || '内容加载失败' }); }
    finally { if (!this.hidden && !this.closed && sequence === this.readSequence) this.setData({ loading: false }); }
  },
  input(event) { this.setData({ commentText: event.detail.value }); },
  async comment() {
    if (!this.currentDetail()) return;
    if (this.data.busy || !this.data.commentText.trim()) return;
    const sequence = this.readSequence;
    this.commentRequestId = this.commentRequestId || Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    this.setData({ busy: true, error: '' });
    try {
      await api.call('board', 'comment', { postId: this.postId,
        requestId: this.commentRequestId, content: this.data.commentText });
      if (!this.currentDetail(sequence)) return;
      this.commentRequestId = null;
      this.setData({ commentText: '' }); await this.load();
    } catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '评论失败' }); }
    finally { if (this.currentDetail()) this.setData({ busy: false }); }
  },
  async report() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '举报内容', content: '确认举报这条内容吗？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try {
      await api.call('board', 'report', { targetType: 'post', targetId: this.postId, reason: '不当内容', text: '' });
      if (this.currentDetail(sequence)) wx.showToast({ title: '已提交举报', icon: 'success' });
    } catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '举报失败' }); }
  },
  async reportComment(event) {
    if (!this.currentDetail()) return;
    const commentId = event.currentTarget.dataset.id;
    if (!this.data.comments.some(item => item._id === commentId)) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '举报评论', content: '确认举报这条评论吗？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try {
      await api.call('board', 'report', { targetType: 'comment', targetId: commentId, reason: '不当内容', text: '' });
      if (this.currentDetail(sequence)) wx.showToast({ title: '已提交举报', icon: 'success' });
    } catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '举报失败' }); }
  },
  async close() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '关闭内容', content: '关闭后将不再接受评论。确定吗？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try { await api.call('board', 'close', { postId: this.postId }); if (this.currentDetail(sequence)) await this.load(); }
    catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '关闭失败' }); }
  },
  continuePayment() {
    if (this.currentDetail() && this.data.post.orderId) wx.navigateTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(this.data.post.orderId) }); },
  preview(event) {
    if (!this.currentDetail()) return; require('../../utils/media-links').preview({ current: event.currentTarget.dataset.url, urls: this.data.post.imageUrls }); },
  onShareAppMessage() {
    if (!this.postId) return { title: '需求广场', path: '/board/list/list' }; return { title: this.data.post && this.data.post.title || '近邻帮需求',
    path: '/board/detail/detail?id=' + encodeURIComponent(this.postId) }; }
});
