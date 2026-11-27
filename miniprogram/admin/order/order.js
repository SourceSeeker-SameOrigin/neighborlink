const api = require('../../utils/api');
const { yuan, toFen } = require('../../utils/money');
const { display, slotText } = require('../../utils/time');
Page({
  data: { missingRecord: false, loading: true, busy: false, error: '', order: null, readOnly: true, providers: [], providerIndex: 0,
    serviceRefundYuan: '0', goodsRefundYuan: '0', refundTotal: '0.00', providerLiable: false, resolutionNote: '', voidRefundYuan: '0', voidNote: '' },
  onLoad(options = {}) {
    this.orderId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.orderId, loading: !!this.orderId });
  },
  onShow() { this._hidden = false; this.load(); },
  onHide() { this.invalidate(); },
  onUnload() { this.invalidate(); this._closed = true; },
  invalidate() {
    this._hidden = true;
    this.sequence = (this.sequence || 0) + 1;
    this._ownerId = null;
    this.setData({ loading: false, busy: false, order: null, details: [], providers: [], refunds: [],
      readOnly: true, canCancel: false, error: '' });
  },
  currentOrder(sequence = this.sequence, adminRequired = false) {
    const user = getApp().globalData.user;
    return !this._closed && !this._hidden && sequence === this.sequence &&
      this._ownerId && user?._id === this._ownerId &&
      (user.roles?.includes('admin') || user.roles?.includes('property')) &&
      (!adminRequired || user.roles.includes('admin')) &&
      this.data.order?._id === this.orderId && (!adminRequired || !this.data.readOnly);
  },
  async load() {
    if (!this.orderId || this._hidden || this._closed) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const current = () => !this._hidden && !this._closed && sequence === this.sequence;
    this._ownerId = null;
    this.setData({ loading: true, busy: false, error: '', order: null, details: [], providers: [], refunds: [],
      readOnly: true, canCancel: false });
    let userId;
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user._id;
      if (getApp().globalData.user?._id !== userId ||
          (!user.roles?.includes('admin') && !user.roles?.includes('property'))) throw new Error('无权查看订单详情');
      const readOnly = !user.roles.includes('admin');
      const order = await api.call('order', 'detail', { orderId: this.orderId },
        { loading: false, silent: true, redirectOnForbidden: false,
          isActive: () => current() && getApp().globalData.user?._id === userId });
      if (!current() || getApp().globalData.user?._id !== userId) return;
      const details = Object.entries(order.detail || {}).map(([key, value]) => ({ key,
        label: ({ stationCode: '驿站', pickupCodes: '取件码', largeCount: '大件数', placement: '交付方式', bags: '袋数', sorted: '已分类', shop: '店名', items: '代买清单', goodsCap: '商品预付（分）', category: '类别', desc: '描述', blocks: '时长块数', billingMode: '计价方式', includedMinutes: '包含时长（分钟）', overtimePolicy: '超时规则' })[key] || key,
        value: Array.isArray(value) ? value.join('、') : typeof value === 'boolean' ? (value ? '是' : '否') : ({per_visit:'按次计价',per15min:'每15分钟计价',new_order:'不自动扣费，另行确认新订单',door:'放门口',hand:'当面交'})[value] || String(value) }));
      // The detail API exposes status history, not the private payment record or payment mode.
      // A paid history entry confirms a payment transition, never a real cash charge.
      const paymentRecorded = (order.timeline || []).some(item => item.status === 'paid');
      this._ownerId = userId;
      this.setData({ order, readOnly, details, slotText: slotText(order.slot),
        amount: order.status === 'pending_quote' ? '待商家报价' : yuan(order.pricing.payAmount + order.pricing.goodsCap),
        paymentRecordText: paymentRecorded ? '已记录支付成功（不代表真实扣款）' : '未见支付成功记录',
        canCancel: ['pending_pay', 'paid', 'accepted', 'in_service'].includes(order.status) &&
          (order.kind !== 'membership_purchase' || order.status === 'pending_pay'),
        refunds: order.refunds.map(item => ({ ...item, amountText: yuan(item.amount), statusText: { failed: '失败', processing: '处理中', success: '成功' }[item.status], time: display(item.at) })) });
      if (!readOnly && order.status === 'paid' && order.kind !== 'membership_purchase') {
        const providers = []; let page;
        do {
          page = await api.call('admin', 'listProviders', { status: 'approved', communityId: order.communityId, offset: providers.length },
            { loading: false, silent: true, redirectOnForbidden: false,
              isActive: () => current() && getApp().globalData.user?._id === userId });
          if (!current()) return;
          if (getApp().globalData.user?._id !== userId) {
            this._ownerId = null;
            this.setData({ order: null, details: [], providers: [], refunds: [], readOnly: true, canCancel: false });
            return;
          }
          providers.push(...page.list);
        } while (page.hasMore);
        if (current() && getApp().globalData.user?._id === userId) this.setData({ providers, providerIndex: 0 });
      }
    } catch (error) {
      if (current()) this.setData({ order: null, details: [], providers: [], refunds: [],
        readOnly: true, canCancel: false, error: error.message || '订单加载失败' });
    } finally { if (current()) this.setData({ loading: false }); }
  },
  provider(event) { if (this.currentOrder(this.sequence, true)) this.setData({ providerIndex: Number(event.detail.value) }); },
  openChat() {
    if (!this.currentOrder(this.sequence, true)) return;
    wx.navigateTo({ url: '/admin/chat/chat?caseType=complaint&orderId=' + encodeURIComponent(this.orderId) });
  },
  async assign() {
    if (!this.currentOrder(this.sequence, true)) return;
    const provider = this.data.providers[this.data.providerIndex];
    if (!provider) { this.setData({ error: '请选择服务员' }); return; }
    await this.perform('assign', { providerId: provider._id });
  },
  async cancel() {
    if (!this.currentOrder(this.sequence, true)) return;
    const sequence = this.sequence;
    const answer = await new Promise(resolve => wx.showModal({ title: '强制取消', content: '确认取消订单并退还剩余已付款项吗？', success: resolve }));
    if (answer.confirm && this.currentOrder(sequence, true)) await this.perform('forceCancel');
  },
  retryRefund(event) {
    if (!this.currentOrder(this.sequence, true)) return; this.perform('retryRefund', { outRefundNo: event.currentTarget.dataset.no }); },
  resolutionField(event) {
    if (!this.currentOrder(this.sequence, true)) return;
    const field = event.currentTarget.dataset.field;
    if (!['serviceRefundYuan', 'goodsRefundYuan', 'resolutionNote', 'voidRefundYuan', 'voidNote'].includes(field)) return;
    this.setData({ [field]: event.detail.value });
    const service = toFen(this.data.serviceRefundYuan), goods = toFen(this.data.goodsRefundYuan);
    this.setData({ refundTotal: service === null || goods === null ? '--' : yuan(service + goods) });
  },
  liable(event) { if (this.currentOrder(this.sequence, true)) this.setData({ providerLiable: event.detail.value.includes('liable') }); },
  async resolve() {
    if (!this.currentOrder(this.sequence, true)) return;
    const sequence = this.sequence;
    const serviceRefundAmount = toFen(this.data.serviceRefundYuan);
    const goodsRefundAmount = this.data.order.serviceCode === 'buy' ? toFen(this.data.goodsRefundYuan) : 0;
    if (serviceRefundAmount === null || goodsRefundAmount === null) { this.setData({ error: '退款金额请填写最多两位小数的元数' }); return; }
    const answer = await new Promise(resolve => wx.showModal({ title: '确认处理投诉',
      content: '服务费退款 ¥' + yuan(serviceRefundAmount) + '，商品款退款 ¥' + yuan(goodsRefundAmount) +
        '，合计 ¥' + yuan(serviceRefundAmount + goodsRefundAmount) + '。确认提交吗？', success: resolve }));
    if (answer.confirm && this.currentOrder(sequence, true)) await this.perform('resolveComplaint', { serviceRefundAmount, goodsRefundAmount,
      providerLiable: this.data.providerLiable, note: this.data.resolutionNote });
  },
  async voidCard() {
    if (!this.currentOrder(this.sequence, true)) return;
    const sequence = this.sequence;
    const amount = toFen(this.data.voidRefundYuan);
    if (amount === null) { this.setData({ error: '请填写有效退款金额' }); return; }
    const answer = await new Promise(resolve => wx.showModal({ title: '作废月卡',
      content: '将停止整张月卡及续期权益，并按本购买订单退款 ¥' + yuan(amount) + '。已接单任务需另行处理。确认吗？', success: resolve }));
    if (answer.confirm && this.currentOrder(sequence, true)) await this.perform('voidMembership', { refundAmount: amount, note: this.data.voidNote });
  },
  async perform(action, data = {}) {
    if (!this.currentOrder(this.sequence, true) || this.data.busy || this.data.loading) return;
    const sequence = this.sequence;
    this.setData({ busy: true, error: '' });
    try {
      await api.call('admin', action, { orderId: this.orderId, ...data },
        { silent: true, redirectOnForbidden: false, isActive: () => this.currentOrder(sequence, true) });
      if (!this.currentOrder(sequence, true)) return;
      this.setData({ busy: false });
      await this.load();
    } catch (error) {
      if (this.currentOrder(sequence, true)) {
        this.setData({ busy: false, error: error.message || '操作结果待核对，请刷新订单' });
        await this.load();
      }
    }
  },
  preview(event) { if (this.currentOrder()) require('../../utils/media-links').preview({ current: event.currentTarget.dataset.url, urls: [event.currentTarget.dataset.url] }); }
});
