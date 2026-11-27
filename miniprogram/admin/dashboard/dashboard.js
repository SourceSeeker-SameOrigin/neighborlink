const api = require('../../utils/api');
const listAll = require('../../utils/list-all');
const { yuan } = require('../../utils/money');
const { STATUS_TEXT } = require('../../utils/status');
const MODULE_LABELS = { express: '代取快递', trash: '代扔垃圾', buy: '周边代买', help: '帮把手', custom: '悬赏任务', meal: '助老送餐', visit: '独居探访', escort: '陪诊', pet: '上门喂宠', vacant: '空置房巡检', recycle: '回收上门', merchant: '商家预约', event_signup: '活动报名', idle_purchase: '闲置担保成交' };
Page({
  data: { loading: true, ready: false, error: '', metrics: null, communities: [], communityIndex: 0, scope: 'community', canFederate: false, isAdmin: false, authorized: false, from: '', to: '' },
  onShow() { this._hidden = false; this.load(); },
  onHide() { this.invalidate(); },
  onUnload() { this.invalidate(); this._unloaded = true; },
  invalidate() {
    this._hidden = true;
    this._loadSequence = (this._loadSequence || 0) + 1;
    this.refreshSequence = (this.refreshSequence || 0) + 1;
    this.user = null;
    this.setData({ loading: false, ready: false, authorized: false, isAdmin: false, metrics: null, communities: [], canFederate: false, error: '' });
  },
  async load() {
    if (this._hidden || this._unloaded) return;
    const sequence = this._loadSequence = (this._loadSequence || 0) + 1;
    this.refreshSequence = (this.refreshSequence || 0) + 1;
    const active = () => !this._hidden && !this._unloaded && sequence === this._loadSequence;
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const from = this.data.from || today, to = this.data.to || today;
    const validRange = from <= to ? { from, to } : (this._lastValidRange || { from: today, to: today });
    this.user = null;
    this.setData({ loading: true, ready: false, error: '', authorized: false, isAdmin: false, metrics: null, canFederate: false, communities: [], scope: 'community', from: validRange.from, to: validRange.to });
    try {
      const user = await getApp().ensureSession();
      if (!active() || getApp().globalData.user?._id !== user._id) return;
      if (!user.roles.includes('admin') && !user.roles.includes('property')) throw new Error('无权查看管理看板');
      this.user = user;
      if (user.roles.includes('admin')) {
        const communities = await listAll('catalog', 'listCommunities', {},
          { redirectOnForbidden: false, isActive: () => active() && getApp().globalData.user?._id === user._id });
        if (!active() || getApp().globalData.user?._id !== user._id) return;
        const communityIndex = Math.max(0, communities.findIndex(item => item._id === user.communityId));
        this.setData({ communities, communityIndex, isAdmin: true, canFederate: Boolean(communities[communityIndex] && communities[communityIndex].federationGroupId) });
        const templates = await api.call('admin', 'notificationTemplates', {},
          { loading: false, silent: true, redirectOnForbidden: false,
            isActive: () => active() && getApp().globalData.user?._id === user._id });
        if (!active() || getApp().globalData.user?._id !== user._id) return;
        if (templates.unaccepted) await new Promise(resolve => wx.requestSubscribeMessage({ tmplIds: [templates.unaccepted], success: resolve, fail: resolve }));
      }
      if (!active() || getApp().globalData.user?._id !== user._id) return;
      this.setData({ authorized: true, isAdmin: user.roles.includes('admin') });
      await this.refresh();
    } catch (error) { if (active()) this.setData({ error: error.message || '看板加载失败' }); }
    finally { if (active()) this.setData({ loading: false }); }
  },
  async refresh() {
    const sequence=this.refreshSequence=(this.refreshSequence||0)+1;
    const user = this.user;
    const userId = user?._id;
    const active = () => !this._hidden && !this._unloaded && sequence === this.refreshSequence &&
      this.data.authorized && userId && getApp().globalData.user?._id === userId;
    if (!active()) {
      this.user = null;
      this.setData({ authorized: false, isAdmin: false, ready: false, metrics: null, communities: [], canFederate: false });
      return;
    }
    this.setData({metrics:null, ready:false});
    const communityId = user.roles.includes('admin') ? (this.data.communities[this.data.communityIndex] || {})._id : user.communityId;
    try {
      if (!communityId) throw new Error('没有可查看的小区');
      if (this.data.from > this.data.to) throw new Error('开始日期不能晚于结束日期，请调整日期');
      const metrics = await api.call('admin', 'dashboard', { communityId, scope: this.data.scope, from: this.data.from, to: this.data.to }, { loading: false, silent: true, isActive: active });
      if (!active()) {
        if (!this._hidden && !this._unloaded && sequence === this.refreshSequence && getApp().globalData.user?._id !== userId) {
          this.user = null;
          this.setData({ authorized: false, isAdmin: false, ready: false, metrics: null, communities: [], canFederate: false });
        }
        return;
      }
      this._lastValidRange = { from: this.data.from, to: this.data.to };
    this.setData({ error: '', ready: true, metrics: { ...metrics, turnoverYuan: yuan(metrics.serviceFeeTurnover), actualYuan: yuan(metrics.actualIncome),
      goodsReceivedYuan: yuan(metrics.goodsReceived || 0), goodsRefundedYuan: yuan(metrics.goodsRefunded || 0), goodsNetYuan: yuan(metrics.goodsNet || 0), refundYuan: yuan(metrics.refundTotal), complaintRateText: (metrics.complaintRate / 100).toFixed(1) + '%',
      membershipRows: Object.entries(metrics.memberships || {}).map(([code, count]) => ({ code, count, label: ({ trash: '垃圾月卡', express: '快递月卡', visit: '探访月卡', vacant: '巡检月卡' })[code] || code })), acceptRateText: (metrics.acceptRate15m / 100).toFixed(1) + '%',
      extensionRows: (metrics.extensions.modules || []).map(item => ({ ...item, label: MODULE_LABELS[item.code] || item.code,
        paidAmountYuan: yuan(item.paidAmount) })),
      payoutRows: (metrics.extensions.payoutStatus || []).map(item => ({ ...item,
        label: ({ success: '成功', failed: '失败', cancelled: '已取消', processing: '处理中', wait_user_confirm: '待用户确认', created: '待发起' })[item.status] || item.status,
        amountYuan: yuan(item.amount) })),
      statusRows: Object.entries(metrics.orders).map(([status, count]) => ({ status, count, label: STATUS_TEXT[status] || status })) } });
    } catch (error) {
      if (active()) this.setData({ error: error.message || '看板加载失败', ready: false, metrics: null });
    }
  },
  chooseDate(event) {
    if (!this.data.authorized || this._hidden || this._unloaded) return;
    const field = event.currentTarget.dataset.field;
    if (field !== 'from' && field !== 'to') return;
    this.setData({ [field]: event.detail.value });
    this.refresh();
  },
  chooseCommunity(event) {
    if (!this.data.authorized || this._hidden || this._unloaded) return;
    const communityIndex = Number(event.detail.value), community = this.data.communities[communityIndex];
    this.setData({ communityIndex, scope: 'community', canFederate: Boolean(community && community.federationGroupId) });
    this.refresh();
  },
  chooseScope(event) { if (!this.data.authorized || this._hidden || this._unloaded) return; this.setData({ scope: event.currentTarget.dataset.scope }); this.refresh(); }
});
