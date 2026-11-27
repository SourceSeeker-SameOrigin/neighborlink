const api = require('../../utils/api');
const { display } = require('../../utils/time');
const { yuan } = require('../../utils/money');
Page({
  data: { missingRecord: false, loading: true, busy: false, error: '', post: null, comments: [], commentText: '',
    commentRecovery: '', commentRecoveryHint: '', commentsHasMore: false, commentsNextOffset: 0,
    commentsPaging: false, commentsError: '' },
  onLoad(options = {}) {
    this.postId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.postId, loading: !!this.postId });
  },
  onShow() { this.hidden = false; return this.load(); },
  onHide() { this.hidden = true; this.readSequence = (this.readSequence || 0) + 1; this.clearDetail(); },
  onUnload() { this.closed = true; this.readSequence = (this.readSequence || 0) + 1; this.clearDetail(); },
  clearDetail() { this.setData({ post: null, comments: [], commentText: '', busy: false,
    commentRecovery: '', commentRecoveryHint: '', commentsHasMore: false, commentsNextOffset: 0,
    commentsPaging: false, commentsError: '' }); },
  currentDetail(sequence = this.readSequence) {
    const user = getApp().globalData.user;
    return !this.hidden && !this.closed && sequence === this.readSequence && !!this.ownerId &&
      user?._id === this.ownerId && user?.communityId === this.ownerCommunityId &&
      this.data.post?._id === this.postId;
  },
  commentReceiptKey(userId) { return 'board_comment:' + userId + ':' + this.postId; },
  clearCommentReceipt() {
    if (!this.commentReceipt || !this.ownerId) return;
    const key = this.commentReceiptKey(this.ownerId);
    try { if (wx.getStorageSync(key)?.requestId === this.commentReceipt.requestId) wx.removeStorageSync(key); } catch (_) {}
    this.commentReceipt = null;
  },
  async checkOriginalComment(sequence = this.readSequence) {
    if (!this.commentReceipt || !this.currentDetail(sequence)) return;
    const requestId = this.commentReceipt.requestId;
    try {
      const result = await api.call('board', 'lookupComment', { postId: this.postId, requestId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.currentDetail(sequence) });
      if (!this.currentDetail(sequence) || this.commentReceipt?.requestId !== requestId) return;
      this.setData(result.commentId ? { commentRecovery: 'found',
        commentRecoveryHint: '已找到上次评论，请查看原评论；如需另发一条，请主动开始新评论。', error: '' } :
        { commentRecovery: 'confirm', commentRecoveryHint: '未查到上次评论。请重新输入原内容，确认后沿用原编号提交。', error: '' });
      return Boolean(result.commentId);
    } catch (error) {
      if (this.currentDetail(sequence)) this.setData({ commentRecovery: 'lookup',
        commentRecoveryHint: '评论结果待核对，请先重试读取。', error: error.message || '评论结果核对失败' });
    }
  },
  retryOriginalComment() { return this.checkOriginalComment(); },
  startNewComment() {
    if (!this.currentDetail() || this.data.busy || this.data.commentRecovery !== 'found') return;
    this.clearCommentReceipt(); this.commentRequestId = null;
    this.setData({ commentRecovery: '', commentRecoveryHint: '', commentText: '', error: '' });
  },
  async load() {
    if (!this.postId) return;
    const sequence = this.readSequence = (this.readSequence || 0) + 1;
    this.clearDetail();
    this.setData({ loading: true, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (this.hidden || this.closed || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id) return;
      if (this.ownerId && this.ownerId !== user._id) { this.commentReceipt = null; this.commentRequestId = null; }
      this.ownerId = user._id; this.ownerCommunityId = user.communityId;
      const active = () => !this.hidden && !this.closed && sequence === this.readSequence &&
        getApp().globalData.user?._id === user._id && getApp().globalData.user?.communityId === user.communityId;
      const result = await api.call('board', 'detail', { postId: this.postId },
        { loading: false, silent: true, isActive: active });
      if (this.hidden || this.closed || sequence !== this.readSequence || getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) return;
      const post = { ...result.post, timeText: display(result.post.createdAt), imageUrls: result.post.images,
        departText: result.post.carry ? display(result.post.carry.departAt) : '',
        returnText: result.post.carry && result.post.carry.returnAt ? display(result.post.carry.returnAt) : '',
        rewardText: result.post.reward ? yuan(result.post.reward) : '',
        slotText: result.post.slot ? result.post.slot.date + ' ' + result.post.slot.start + '—' + result.post.slot.end : '',
        statusText: result.post.status === 'pending_pay' ? '待支付' : result.post.status === 'open' ? '待接单' :
          result.post.status === 'taken' ? '服务处理中' : result.post.status === 'done' ? '已完成' : '已关闭' };
      this.setData({ post, comments: result.comments.map(item => ({ ...item, timeText: display(item.createdAt) })),
        commentsNextOffset: result.commentsNextOffset ?? result.comments.length,
        commentsHasMore: result.commentsHasMore === true });
      try {
        const saved = wx.getStorageSync(this.commentReceiptKey(user._id));
        this.commentReceipt = saved?.userId === user._id && saved.postId === this.postId ? saved : null;
      } catch (_) { this.commentReceipt = null; }
      if (this.commentReceipt) await this.checkOriginalComment(sequence);
      wx.setNavigationBarTitle({ title: post.type === 'task' ? '悬赏详情' : post.type === 'carry' ? '出行帮带' : '求助详情' });
    } catch (error) { if (!this.hidden && !this.closed && sequence === this.readSequence) this.setData({ error: error.message || '内容加载失败' }); }
    finally { if (!this.hidden && !this.closed && sequence === this.readSequence) this.setData({ loading: false }); }
  },
  async moreComments() {
    if (!this.currentDetail() || !this.data.commentsHasMore || this.data.commentsPaging) return;
    const sequence = this.readSequence;
    const nextOffset = this.data.commentsNextOffset;
    this.setData({ commentsPaging: true, commentsError: '' });
    try {
      const result = await api.call('board', 'listComments', { postId: this.postId, offset: nextOffset },
        { loading: false, silent: true, isActive: () => this.currentDetail(sequence) });
      if (!this.currentDetail(sequence)) return;
      const seen = new Set(this.data.comments.map(item => item._id));
      this.setData({ comments: [...this.data.comments, ...(result.list || [])
        .filter(item => !seen.has(item._id)).map(item => ({ ...item, timeText: display(item.createdAt) }))],
      commentsNextOffset: result.nextOffset, commentsHasMore: result.hasMore === true });
    } catch (error) {
      if (this.currentDetail(sequence)) this.setData({ commentsError: error.message || '评论加载失败，请重试' });
    } finally { if (this.currentDetail(sequence)) this.setData({ commentsPaging: false }); }
  },
  input(event) { this.setData({ commentText: event.detail.value }); },
  async comment() {
    if (!this.currentDetail()) return;
    if (this.data.busy) return;
    if (this.data.commentRecovery === 'lookup') return this.checkOriginalComment();
    if (this.data.commentRecovery === 'found' || !this.data.commentText.trim()) return;
    const sequence = this.readSequence;
    if (!this.commentReceipt) {
      this.commentRequestId = this.commentRequestId || Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
      this.commentReceipt = { userId: this.ownerId, postId: this.postId, requestId: this.commentRequestId };
      wx.setStorageSync(this.commentReceiptKey(this.ownerId), this.commentReceipt);
    } else this.commentRequestId = this.commentReceipt.requestId;
    this.setData({ busy: true, error: '' });
    try {
      await api.call('board', 'comment', { postId: this.postId,
        requestId: this.commentRequestId, content: this.data.commentText },
      { silent: true, isActive: () => this.currentDetail(sequence) });
      if (!this.currentDetail(sequence)) return;
      this.setData({ commentText: '', commentRecovery: 'found',
        commentRecoveryHint: '评论已提交；如需另发一条，请主动开始新评论。' });
      await this.load();
    } catch (error) {
      if (this.currentDetail(sequence) && await this.checkOriginalComment(sequence)) await this.load();
    }
    finally { if (this.currentDetail()) this.setData({ busy: false }); }
  },
  async report() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '举报内容', content: '确认举报这条内容吗？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try {
      await api.call('board', 'report', { targetType: 'post', targetId: this.postId, reason: '不当内容', text: '' },
        { isActive: () => this.currentDetail(sequence) });
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
      await api.call('board', 'report', { targetType: 'comment', targetId: commentId, reason: '不当内容', text: '' },
        { isActive: () => this.currentDetail(sequence) });
      if (this.currentDetail(sequence)) wx.showToast({ title: '已提交举报', icon: 'success' });
    } catch (error) { if (this.currentDetail(sequence)) this.setData({ error: error.message || '举报失败' }); }
  },
  async close() {
    if (!this.currentDetail()) return;
    const sequence = this.readSequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '关闭内容', content: '关闭后将不再接受评论。确定吗？', success: resolve }));
    if (!answer.confirm || !this.currentDetail(sequence)) return;
    try { await api.call('board', 'close', { postId: this.postId },
      { isActive: () => this.currentDetail(sequence) }); if (this.currentDetail(sequence)) await this.load(); }
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
