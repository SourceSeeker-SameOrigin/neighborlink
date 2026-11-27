const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display, slotText } = require('../../utils/time');
const { pay } = require('../../utils/payment');
const subscriptions = require('../../utils/subscriptions');
const statuses = { pending_quote: '待报价', pending_pay: '待支付', paid: '待接单', accepted: '已接单', in_service: '服务中', delivered: '待确认',
  completed: '已完成', disputed: '售后处理中', refunded: '已退款', cancelled: '已取消', closed: '已关闭' };
const cleared = {
  order: null, detailRows: [], timeline: [], refunds: [], vacantReportRows: [], vacantPhotoGroups: [],
  visitReportRows: [], mapMarkers: [], slotText: '', amount: '', couponDiscountText: '', pointsRedeemed: 0, unread: 0
};
const merchantCategories = { housekeeping: '家政', repair: '维修', laundry: '洗衣', locksmith: '开锁',
  haul: '清运', canteen: '食堂', recycler: '回收企业', other: '其他' };
Page({
  data: { missingRecord: false, loading: true, error: '', order: null, busy: false, timeline: [], detailRows: [],
    ratingScore: '5', ratingText: '', complaintIndex: 0, complaintText: '',
    complaintReasons: ['未上门', '物品损坏或丢失', '态度', '其他'] },
  onLoad(options = {}) {
    this.orderId = typeof options.id === 'string' ? options.id.trim() : '';
    this.setData({ missingRecord: !this.orderId, loading: !!this.orderId });
  },
  onShow() { this.hidden = false; this.setData({ busy: !!this.actionPending }); return this.load(); },
  onHide() { this.hidden = true; this.clearDetail(); },
  onUnload() { this.closed = true; this.clearDetail(); },
  clearDetail() {
    this.sequence = (this.sequence || 0) + 1;
    this.chatConversationId = null;
    this.ownerId = null;
    this.ownerCommunityId = null;
    this.setData({ ...cleared, loading: false, error: '', ratingText: '', complaintText: '', ratingScore: '5', complaintIndex: 0 });
  },
  active(sequence) { return !this.hidden && !this.closed && this.sequence === sequence; },
  currentOwner(sequence = this.sequence) {
    const user = getApp().globalData.user;
    return this.active(sequence) && this.ownerId && user?._id === this.ownerId &&
      user.communityId === this.ownerCommunityId && this.data.order?._id === this.orderId;
  },
  actionAllowed(order, flag) {
    return !!order && this.currentOwner() && !this.data.loading && !this.data.busy &&
      order === this.data.order && (!flag || !!order[flag]);
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    if (!this.orderId || this.hidden || this.closed) return;
    this.clearDetail();
    const sequence = this.sequence;
    const current = () => this.active(sequence);
    let userId, communityId;
    const scoped = () => current() && (!userId ||
      (getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId));
    const options = { loading: false, silent: true, redirectOnForbidden: false, mediaRedirectOnForbidden: false, isActive: scoped };
    this.setData({ loading: true });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user._id;
      communityId = user.communityId;
      if (!scoped()) return;
      const order = await api.call('order', 'detail', { orderId: this.orderId }, options);
      if (!current()) return;
      if (!scoped()) { this.clearDetail(); return; }
      let unread = 0;
      if (order.canChat) {
        try {
          const chat = await api.call('chat', 'open', { orderId: this.orderId }, options);
          if (!current()) return;
          if (!scoped()) { this.clearDetail(); return; }
          this.chatConversationId = chat.conversationId;
          unread = chat.unread;
        } catch (_) { if (!scoped()) { if (current()) this.clearDetail(); return; } }
      }
      const labels = { stationCode: '驿站', pickupCodes: '取件码', largeCount: '大件数', placement: '交付方式', bags: '袋数',
        sorted: '已分类', shop: '店名', canteenName: '合作食堂', items: '清单', goodsCap: '预付金额', category: '类别', desc: '描述', blocks: '时长块数', billingMode: '计价方式', includedMinutes: '包含时长（分钟）', overtimePolicy: '超时规则', merchantName: '商家', unit: '单位', priceType: '计价方式',
        title: order.kind === 'merchant' ? '服务名称' : '悬赏任务', needEnterHome: '需要进入家中', hospital: '医院', department: '科室', date: '日期', start: '开始时间', pickup: '需要接送' };
      const values = { per_visit: '按次计价', per15min: '每15分钟计价', new_order: '不自动扣费，另行确认新订单', door: '放门口', hand: '当面交', carry: '搬重物', elder: '陪老人办事', other: '其他' };
      function formatValue(key, value) {
        if (order.kind === 'merchant' && key === 'category') return merchantCategories[value] || String(value);
        if (order.kind === 'merchant' && key === 'priceType') return ({ fixed: '固定价', quote: '报价制' })[value] || String(value);
        if (key === 'goodsCap') return '¥' + yuan(value);
        if (Array.isArray(value)) return value.join('、');
        if (typeof value === 'boolean') return value ? '是' : '否';
        return values[value] || String(value);
      }
      const detailRows = Object.entries(order.detail || {}).filter(([key]) => labels[key]).map(([key, value]) => ({ label: labels[key],
        value: formatValue(key, value) }));
      if (order.recycleSummary) detailRows.push({ label: '称重和积分', value: order.recycleSummary.breakdown.map(item => item.category + ' ' + item.kg + ' kg / ' + item.points + ' 分').join('；') });
      if (order.quote) detailRows.push({ label: '商家报价', value: '¥' + yuan(order.quote.amount) + (order.quote.detail ? ' · ' + order.quote.detail : '') });
      const vacantLabels = { windows: '门窗检查', utilities: '水电燃气', leakMold: '漏水与霉斑', ventilation: '开窗通风', mail: '代收快递信件', photos: '巡检拍照' };
      const vacantReportRows = Object.entries(order.vacantReport && order.vacantReport.checklist || {}).map(([key, value]) => ({ label: vacantLabels[key] || key, value: value ? '已检查' : '未检查' }));
      const vacantPhotoGroups = Object.entries(order.vacantReport && order.vacantReport.photoByItem || {}).map(([key, photos]) => ({ label: vacantLabels[key] || key, photos }));
      const visitLabels = { mental: '精神状态', diet: '饮食情况', utilities: '水电燃气', doors: '门窗安全', medical: '是否需要就医' };
      const visitReportRows = Object.entries(order.visitReport && order.visitReport.checks || {}).map(([key, value]) => ({ label: visitLabels[key] || key, value: value ? '已检查' : '未检查' }));
      if (!scoped()) { this.clearDetail(); return; }
      this.ownerId = userId;
      this.ownerCommunityId = communityId;
      this.setData({ order, detailRows, unread, amount: yuan(order.pricing.payAmount + order.pricing.goodsCap),
        vacantReportRows, vacantPhotoGroups, visitReportRows,
        couponDiscountText: yuan(order.pricing.couponDiscount || 0), pointsRedeemed: order.pricing.pointsRedeemed || 0,
        mapMarkers: order.providerLocation ? [{ id: 1, latitude: order.providerLocation.latitude, longitude: order.providerLocation.longitude,
          title: '服务员', width: 36, height: 36 }] : [],
        slotText: slotText(order.slot), timeline: order.timeline.map(item => ({ text: statuses[item.status], time: display(item.at) })),
        refunds: order.refunds.map(item => ({ ...item, amountText: yuan(item.amount),
          statusText: { success: '已退款', processing: '退款处理中', failed: '退款失败，请联系客服' }[item.status] })) });
    } catch (error) { if (scoped()) this.setData({ error: error.message || '订单加载失败，请重试' }); }
    finally { if (current()) this.setData({ loading: false }); }
  },
  async runAction(order, flag, work) {
    if (!this.actionAllowed(order, flag)) return;
    const sequence = this.sequence;
    const current = () => this.currentOwner(sequence);
    const options = { silent: true, redirectOnForbidden: false, isActive: current };
    this.actionPending = true;
    this.setData({ busy: true, error: '' });
    try {
      const reload = await work(current, options);
      if (current() && reload !== false) await this.load();
    } catch (error) {
      if (current()) {
        if (error.code === 'E_FORBIDDEN') this.clearDetail();
        this.setData({ error: error.message || '操作未完成，请重试' });
      }
    } finally {
      this.actionPending = false;
      if (!this.closed && !this.hidden) this.setData({ busy: false });
    }
  },
  async cancel() {
    const order = this.data.order;
    if (!this.actionAllowed(order, 'canCancel')) return;
    const sequence = this.sequence;
    const content = order.status === 'pending_quote' ? '确认取消这条尚未报价的预约吗？' : '确认取消这笔订单吗？已支付且未接单的订单将全额退款。';
    const answer = await new Promise(resolve => wx.showModal({ title: '取消订单', content, success: resolve }));
    if (answer.confirm && this.currentOwner(sequence)) return this.runAction(order, 'canCancel', (_, options) => api.call('order', 'cancel', { orderId: this.orderId }, options));
  },
  pay() {
    return this.runAction(this.data.order, 'canPay', async (current, options) => {
      const payment = await api.call('order', 'retryPayment', { orderId: this.orderId }, options);
      if (current()) await pay(payment, current);
    });
  },
  callProvider() {
    if (!this.currentOwner()) return;
    const provider = this.data.order && this.data.order.provider;
    if (provider && provider.canCall) wx.makePhoneCall({ phoneNumber: provider.phone });
  },
  subscribeVisitReport() { return this.subscribeReport('visit'); },
  subscribeVacantReport() { return this.subscribeReport('vacant'); },
  subscribeReport(type) {
    const order = this.data.order;
    if (!this.currentOwner() || !order || order.serviceCode !== type || order.visitReportNotifyAuthorized ||
      order.visitReport || order.vacantReport || !['paid', 'accepted', 'in_service'].includes(order.status)) return;
    return this.runAction(order, null, async (current, options) => {
      const pendingKey = 'visitReportConsentPending:' + this.orderId;
      const stored = type === 'visit' && wx.getStorageSync(pendingKey) === true;
      const accepted = stored || (await subscriptions.request(['visitReport'])) > 0;
      if (!current()) return false;
      if (!accepted) {
        wx.showToast({ title: '未授权，报告仍可在订单详情查看', icon: 'none' });
        return false;
      }
      if (type === 'visit') {
        wx.setStorageSync(pendingKey, true);
        await api.call('order', 'subscribeVisitReport', { orderId: this.orderId }, options);
        wx.removeStorageSync(pendingKey);
      } else await api.call('vacant', 'subscribeReport', { orderId: this.orderId }, options);
      if (current()) wx.showToast({ title: '已订阅本次报告', icon: 'success' });
    });
  },
  previewVacant(event) {
    if (!this.currentOwner()) return;
    const urls = this.data.vacantPhotoGroups.flatMap(group => group.photos);
    return this.previewOrderPhoto(event.currentTarget.dataset.url, urls);
  },
  openChat() {
    if (!this.currentOwner()) return;
    if (this.data.order && this.data.order.canChat) wx.navigateTo({ url: '/chat/room/room?conversationId=' + encodeURIComponent(this.chatConversationId || '') +
      '&orderId=' + encodeURIComponent(this.orderId) });
  },
  form(event) {
    if (!this.currentOwner()) return;
    const field = event.currentTarget.dataset.field;
    if (['ratingScore', 'ratingText', 'complaintIndex', 'complaintText'].includes(field)) this.setData({ [field]: event.detail.value });
  },
  async serviceAction(event) {
    const order = this.data.order;
    const action = event.currentTarget.dataset.action;
    const flag = { confirm: 'canConfirm', rate: 'canRate', complain: 'canComplain' }[action];
    if (!flag || !this.actionAllowed(order, flag)) return;
    if (action === 'confirm') {
      const sequence = this.sequence;
      const answer = await new Promise(resolve => wx.showModal({ title: '确认完成', content: '请确认服务已经完成。', success: resolve }));
      if (!answer.confirm || !this.currentOwner(sequence)) return;
    }
    return this.runAction(order, flag, (_, options) => api.call('order', action, { orderId: this.orderId,
      score: Number(this.data.ratingScore), text: action === 'rate' ? this.data.ratingText : this.data.complaintText,
      reason: this.data.complaintReasons[Number(this.data.complaintIndex)] }, options));
  },
  preview(event) {
    const photos = this.data.order && this.data.order.photos;
    return this.previewOrderPhoto(event.currentTarget.dataset.url, photos);
  },
  previewOrderPhoto(current, urls) {
    const sequence = this.sequence;
    if (!this.currentOwner(sequence) || !urls || !urls.includes(current)) return;
    return require('../../utils/media-links').preview({ current, urls }, () => this.currentOwner(sequence));
  },
  openPetReports() {
    if (this.currentOwner() && this.data.order.serviceCode === 'pet') wx.navigateTo({ url: '/pet/reports?id=' + encodeURIComponent(this.orderId) });
  }
});
