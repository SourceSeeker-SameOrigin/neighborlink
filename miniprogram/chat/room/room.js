const reportAction = require('../../utils/report');
const api = require('../../utils/api');
const { uploadPhotos } = require('../../utils/media');
const { display } = require('../../utils/time');

Page({
  data: { loading: true, ready: false, loadError: false, sending: false, error: '', messages: [], content: '', readOnly: false },
  onLoad(options = {}) {
    this.orderId = options.orderId || '';
    this.initialConversationId = options.conversationId || '';
    this.conversationId = this.initialConversationId;
    this.afterId = '';
  },
  onShow() { this.visible = true; return this.start({ preservePhoto: true }); },
  onHide() { this.visible = false; this.reset({ preservePhoto: this.photo?.stage === 'choosing' }); },
  onUnload() { this.closed = true; this.visible = false; this.reset(); },
  reset({ preservePhoto = false } = {}) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.polling = false;
    this.generation = (this.generation || 0) + 1;
    this.context = null;
    this.sendOperation = null;
    this.reportOperation = null;
    if (!preservePhoto) this.photo = null;
    this.afterId = '';
    this.setData({ loading: false, ready: false, loadError: false, sending: false,
      error: '', messages: [], content: '', readOnly: false, scrollTarget: '' });
  },
  active(context) {
    return Boolean(context && this.visible && !this.closed && context.generation === this.generation &&
      getApp().globalData.user?._id === context.userId && this.conversationId === context.conversationId);
  },
  current(context = this.context) {
    return Boolean(context && this.context === context && this.active(context) && this.data.ready && !this.data.loading);
  },
  invalidate(message = '登录身份已变化，请重新加载') {
    if (!this.visible || this.closed) return;
    this.reset();
    this.setData({ error: message, loadError: true });
  },
  async start({ preservePhoto = false } = {}) {
    if (!this.visible || this.closed) return;
    this.reset({ preservePhoto });
    this.conversationId = this.initialConversationId;
    const generation = this.generation;
    this.setData({ loading: true, sending: Boolean(this.photo) });
    let context;
    try {
      const user = await getApp().ensureSession();
      context = { generation, userId: user?._id, conversationId: this.conversationId };
      if (!context.userId || !this.active(context)) { if (this.visible && generation === this.generation) this.invalidate(); return; }
      if (!this.conversationId && this.orderId) {
        const opened = await api.call('chat', 'open', { orderId: this.orderId },
          { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.active(context) });
        if (!this.active(context)) { if (this.visible) this.invalidate(); return; }
        this.conversationId = context.conversationId = opened.conversationId;
      }
      if (!this.conversationId) throw new Error('聊天会话不存在');
      if (await this.pull(context) && this.active(context)) {
        this.setData({ loading: false });
        this.timer = setInterval(() => this.pull(context), 3000);
        await this.applyPhoto();
      }
    } catch (error) {
      if (this.visible && !this.closed && generation === this.generation)
        this.invalidate(error.message || '聊天加载失败');
    }
    finally { if (context && this.active(context)) this.setData({ loading: false }); }
  },
  async pull(context = this.context) {
    if (!this.active(context)) { if (this.visible && this.context) this.invalidate(); return false; }
    if (this.polling) return false;
    this.polling = true;
    const active = () => this.active(context);
    try {
      const result = await api.call('chat', 'pull', { conversationId: context.conversationId, afterId: this.afterId },
        { loading: false, silent: true, redirectOnForbidden: false, mediaRedirectOnForbidden: false, isActive: active });
      if (!active()) { if (this.visible) this.invalidate(); return false; }
      if (result.unread > 0) {
        await api.call('chat', 'markRead', { conversationId: context.conversationId },
          { loading: false, silent: true, redirectOnForbidden: false, isActive: active });
        if (!active()) { if (this.visible) this.invalidate(); return false; }
      }
      const messages = [...new Map([...this.data.messages, ...(result.list || [])]
        .map(item => [item._id, { ...item, timeText: display(item.createdAt) }])).values()];
      if (result.lastId) this.afterId = result.lastId;
      this.context = context;
      this.setData({ messages, ...(messages.length ? { scrollTarget: 'message-' + messages[messages.length - 1]._id } : {}),
        ready: true, loadError: false, readOnly: result.readOnly, unread: result.unread, error: '' });
      return true;
    } catch (error) { if (active()) this.invalidate(error.message || '消息刷新失败'); return false; }
    finally { if (this.generation === context.generation) this.polling = false; }
  },
  async reportContent(event) {
    const context = this.context, id = event.currentTarget.dataset.id;
    if (!this.current(context) || this.reportOperation || !this.data.messages.some(item => item._id === id && !item.mine)) {
      if (!this.current(context)) this.invalidate();
      return;
    }
    const operation = this.reportOperation = {};
    const active = () => this.reportOperation === operation && this.current(context) &&
      this.data.messages.some(item => item._id === id && !item.mine);
    try { await reportAction.submit('message', id, active); }
    catch (error) { if (active()) this.setData({ error: error.message || '举报提交失败' }); }
    finally {
      if (this.reportOperation === operation) this.reportOperation = null;
      if (this.visible && !this.current(context)) this.invalidate();
    }
  },
  input(event) {
    if (!this.current()) { this.invalidate(); return; }
    this.setData({ content: event.detail.value });
  },
  async send() {
    const context = this.context;
    if (!this.current(context) || this.data.sending || this.data.readOnly) {
      if (!this.current(context)) this.invalidate();
      return;
    }
    const content = this.data.content.trim();
    if (!content) return;
    return this.sendMessage({ type: 'text', content }, context);
  },
  async sendMessage(data, context = this.context) {
    if (!this.current(context) || this.data.sending || this.data.readOnly || this.photo) {
      if (!this.current(context)) this.invalidate();
      return;
    }
    const operation = this.sendOperation = { context };
    this.setData({ sending: true, error: '' });
    try {
      if (data.type === 'text' && /(?:\d{11}|微信号?|wechat)/i.test(data.content)) {
        const answer = await new Promise(resolve => wx.showModal({ title: '隐私提醒',
          content: '为保护隐私，建议不要发送手机号或微信号。仍要发送吗？',
          success: resolve, fail: () => resolve(null) }));
        if (!answer?.confirm || !this.sendCurrent(operation)) return;
      }
      await this.commitSend(operation, data);
    } finally { this.finishSend(operation); }
  },
  async image() {
    const context = this.context;
    if (!this.current(context) || this.data.sending || this.data.readOnly || this.photo) {
      if (!this.current(context)) this.invalidate();
      return;
    }
    const request = this.photo = { userId: context.userId, conversationId: context.conversationId, stage: 'choosing' };
    this.setData({ sending: true, error: '' });
    try {
      const files = await uploadPhotos('chat/' + request.conversationId, 1,
        { loading: false, onChosen: () => { if (this.photo === request) request.stage = 'uploading'; } });
      if (this.photo === request) request.result = { fileId: files[0] };
    } catch (error) { if (this.photo === request) request.result = { error }; }
    finally { if (this.photo === request) { request.stage = 'result'; await this.applyPhoto(); } }
  },
  async applyPhoto() {
    const request = this.photo;
    if (!request || request.stage !== 'result' || !request.result || !this.visible || this.closed || this.data.loading) return;
    const context = this.context;
    this.photo = null;
    if (!this.current(context) || context.userId !== request.userId || context.conversationId !== request.conversationId) {
      if (!this.current(context)) this.invalidate();
      else this.setData({ sending: false });
      return;
    }
    if (request.result.error) {
      this.setData({ sending: false, error: /cancel/i.test(request.result.error.errMsg || request.result.error.message || '')
        ? '' : request.result.error.message || '图片发送失败' });
      return;
    }
    if (!request.result.fileId) { this.setData({ sending: false, error: '图片上传失败' }); return; }
    const operation = this.sendOperation = { context };
    this.setData({ sending: true, error: '' });
    try { await this.commitSend(operation, { type: 'image', fileId: request.result.fileId }); }
    finally { this.finishSend(operation); }
  },
  sendCurrent(operation) {
    return this.sendOperation === operation && this.current(operation.context) && this.data.sending && !this.data.readOnly;
  },
  async commitSend(operation, data) {
    if (!this.sendCurrent(operation)) { if (!this.current(operation.context)) this.invalidate(); return; }
    const context = operation.context;
    try {
      await api.call('chat', 'send', { conversationId: context.conversationId, ...data },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.sendCurrent(operation) });
      if (!this.sendCurrent(operation)) {
        if (this.visible && !this.current(context)) this.invalidate();
        return;
      }
      if (data.type === 'text') this.setData({ content: '' });
      await this.pull(context);
    } catch (error) {
      if (this.sendCurrent(operation)) this.invalidate('发送结果待核对，请重新加载会话');
      else if (this.visible && !this.current(context)) this.invalidate();
    }
  },
  finishSend(operation) {
    if (this.sendOperation !== operation) return;
    this.sendOperation = null;
    if (this.current(operation.context)) this.setData({ sending: false });
  }
});
