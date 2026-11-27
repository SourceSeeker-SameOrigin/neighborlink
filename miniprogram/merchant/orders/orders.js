const api = require('../../utils/api');
const { uploadPhotos } = require('../../utils/media');
const { yuan, toFen } = require('../../utils/money');
Page({
  data: { loading: false, ready: false, busy: false, error: '', pageError: false, list: [], hasMore: false,
    quoteId: '', quoteAmount: '', quoteDetail: '' },
  onShow() { this.visible = true; return this.load({ preserveMedia: true }); },
  clearContext() {
    this.read = (this.read || 0) + 1;
    this.context = null;
    this.setData({ ready: false, loading: false, list: [], hasMore: false, quoteId: '', quoteAmount: '', quoteDetail: '', busy: !!this.operation });
  },
  onHide() {
    this.visible = false;
    if (this.operation?.stage !== 'media') this.operation = null;
    this.clearContext();
  },
  onUnload() { this.operation = null; this.onHide(); },
  current(context) {
    return !!(context && this.visible && context.read === this.read &&
      getApp().globalData.user?._id === context.userId && getApp().globalData.user?.merchantId === context.merchantId);
  },
  async load(options = {}) {
    const append = options.append === true;
    if (!this.visible || (append && (this.data.loading || this.data.busy || !this.data.hasMore))) return;
    if (append && !this.current(this.context)) return this.load();
    if (options.preserveMedia !== true) this.operation = null;
    const media = this.operation?.stage === 'media' ? this.operation : null;
    // 拍照返回重新核对原先已加载的范围，才能接纳第二页等位置的原订单。
    const limit = media ? media.loadedCount : 20;
    if (!append) { this.clearContext(); this.offset = 0; }
    else { this.read++; this.context = null; }
    const read = this.read;
    let userId, merchantId;
    const current = () => this.visible && this.read === read && (!userId ||
      (getApp().globalData.user?._id === userId && getApp().globalData.user?.merchantId === merchantId));
    const apiOptions = { loading: false, silent: true, redirectOnForbidden: false, isActive: current };
    this.setData({ loading: true, ready: false, error: '', pageError: false, busy: !!this.operation });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user?._id; merchantId = user?.merchantId;
      if (!userId) throw Error('登录资料暂不可用，请重试');
      if (!current()) return;
      if (media && (media.userId !== userId || media.merchantId !== merchantId)) this.operation = null;
      let offset = append ? this.offset : 0, rows = append ? this.data.list.slice() : [], hasMore;
      do {
        const result = await api.call('merchant', 'merchantOrders', { offset }, apiOptions);
        if (!current()) return;
        const batch = result.list || [];
        if (!Array.isArray(batch) || (result.hasMore && !batch.length)) throw Error('订单分页结果异常，请重试');
        const ids = new Set(rows.map(item => item._id));
        rows = rows.concat(batch.filter(item => { if (ids.has(item._id)) return false; ids.add(item._id); return true; })
          .map(item => ({ ...item, amountText: yuan(item.pricing?.payAmount || 0), quoteAmountText: item.quote ? yuan(item.quote.amount) : '' })));
        offset += batch.length; hasMore = result.hasMore === true;
      } while (!append && media && this.operation === media && hasMore && offset < limit);
      this.offset = offset;
      this.context = { userId, merchantId, read };
      this.setData({ list: rows, hasMore, ready: true, busy: !!this.operation });
      return this.context;
    } catch (error) {
      if (current()) {
        const retain = append && !['E_FORBIDDEN', 'E_FEATURE_OFF', 'E_UNBOUND'].includes(error.code);
        this.operation = null;
        if (!retain) this.clearContext();
        else this.context = { userId, merchantId, read };
        this.setData({ loading: false, ready: false, busy: false, pageError: retain, error: error.message || '订单加载失败' });
      }
    } finally {
      if (current()) { this.setData({ loading: false }); await this.finishMedia(); }
    }
  },
  more() { return this.load({ append: true }); },
  retry() { return this.load({ append: this.data.pageError }); },
  allowed(request) {
    if (!this.current(this.context) || !this.data.ready || this.data.loading ||
      this.context.userId !== request.userId || this.context.merchantId !== request.merchantId) return false;
    const order = this.data.list.find(item => item._id === request.orderId);
    return !!(order && order.featureEnabled && order.status === request.status && order.detail?.category === request.category);
  },
  begin(orderId, status) {
    if (!this.visible || this.data.loading || this.data.busy || !this.data.ready) return null;
    if (!this.current(this.context)) { this.load(); return null; }
    const order = this.data.list.find(item => item._id === orderId);
    if (!order || !order.featureEnabled || order.status !== status) return null;
    const request = this.operation = { ...this.context, orderId, status, category: order.detail?.category,
      stage: 'choice', loadedCount: this.offset };
    this.setData({ busy: true, error: '' });
    return request;
  },
  active(request) { return this.operation === request && request.read === this.read && this.allowed(request); },
  async release(request) {
    if (this.operation !== request) return;
    this.operation = null;
    if (!this.visible) return;
    this.setData({ busy: false });
    if (!this.current(this.context)) await this.load();
  },
  chooseQuote(event) {
    if (!this.visible || !this.data.ready || this.data.loading || this.data.busy) return;
    if (!this.current(this.context)) return this.load();
    const id = event.currentTarget.dataset.id;
    if (!this.data.list.some(o => o._id === id && o.featureEnabled && o.status === 'pending_quote')) return;
    this.setData({ quoteId: id, quoteAmount: '', quoteDetail: '' });
  },
  input(event) {
    if (!this.current(this.context) || !this.data.ready || this.data.loading || this.data.busy) return;
    const field = event.currentTarget.dataset.field;
    if (['quoteAmount', 'quoteDetail'].includes(field)) this.setData({ [field]: event.detail.value });
  },
  async send(request, action, data) {
    if (!this.active(request)) return;
    request.stage = 'submit';
    await api.call('merchant', action, { orderId: request.orderId, ...data },
      { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.active(request) });
    if (this.active(request)) await this.load();
  },
  async quote() {
    const request = this.begin(this.data.quoteId, 'pending_quote');
    if (!request) return;
    try {
      const amount = toFen(this.data.quoteAmount);
      if (amount === null) throw Error('报价金额最多保留两位小数');
      if (amount <= 0) throw Error('请填写大于 0 的报价金额');
      await this.send(request, 'quoteBooking', { amount, detail: this.data.quoteDetail });
    } catch (error) { if (this.active(request)) this.setData({ error: error.message || '报价失败' }); }
    finally { await this.release(request); }
  },
  async transition(event) {
    const { id, action: actionName } = event.currentTarget.dataset;
    if (!['accept', 'start'].includes(actionName)) return;
    const request = this.begin(id, actionName === 'accept' ? 'paid' : 'accepted');
    if (!request) return;
    try {
      let identityConfirmed = false;
      if (actionName === 'start' && request.category === 'locksmith') {
        const result = await new Promise((resolve, reject) => wx.showModal({ title: '开锁前当面核验',
          content: '请当面核验下单人身份证与门牌一致。不得拍摄或上传身份证照片；完成凭证只拍门锁或服务过程。',
          confirmText: '已核验一致', cancelText: '暂不开始', success: resolve, fail: reject }));
        if (!result.confirm || !this.active(request)) return;
        identityConfirmed = true;
      }
      await this.send(request, 'merchantTransition', { actionName, identityConfirmed });
    } catch (error) { if (this.active(request)) this.setData({ error: error.message || '操作失败' }); }
    finally { await this.release(request); }
  },
  async finishMedia() {
    const request = this.operation;
    if (!request || request.stage !== 'media' || !this.visible || this.data.loading) return;
    if (!this.allowed(request)) return this.release(request);
    if (!request.result) return;
    request.read = this.read;
    request.stage = 'submit';
    try {
      if (request.result.error) throw request.result.error;
      await this.send(request, 'completeBooking', { photos: request.result.photos });
    } catch (error) {
      if (this.active(request) && !/cancel/i.test(error.errMsg || error.message || '')) this.setData({ error: error.message || '提交完成凭证失败' });
    } finally { await this.release(request); }
  },
  async complete(event) {
    const request = this.begin(event.currentTarget.dataset.id, 'in_service');
    if (!request) return;
    request.stage = 'media';
    try { request.result = { photos: await uploadPhotos('merchant-orders/' + request.orderId, 3, { loading: false }) }; }
    catch (error) { request.result = { error }; }
    if (this.operation !== request) return;
    if (this.visible) await this.load({ preserveMedia: true });
  }
});
