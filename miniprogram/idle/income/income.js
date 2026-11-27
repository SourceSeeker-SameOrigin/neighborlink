const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display } = require('../../utils/time');

Page({
  data: { loading: false, ready: false, loadError: false, busy: false, error: '', pending: '0.00', settled: '0.00', available: '0.00',
    payoutEnabled: false, canWithdraw: false, payouts: [] },
  onShow() { this.visible = true; return this.load({ preserveNative: true }); },
  onHide() { this.visible = false; this.clearContext(); },
  onUnload() { this.nativePayout = null; this.onHide(); },
  clearContext() {
    this.context = null;
    this.operation = null;
    this.read = (this.read || 0) + 1;
    this.setData({ ready: false, pending: '0.00', settled: '0.00', available: '0.00',
      payoutEnabled: false, canWithdraw: false, payouts: [], busy: !!this.nativePayout });
  },
  current(context) {
    return Boolean(context && this.visible !== false && context.read === this.read &&
      getApp().globalData.user?._id === context.userId);
  },
  async load(options = {}) {
    if (this.visible === false || (this.data.loading && this.loadingRead === this.read)) return;
    if (!options.preserveNative) this.nativePayout = null;
    this.clearContext();
    const read = this.read;
    this.loadingRead = read;
    let userId;
    const current = () => this.visible !== false && this.read === read &&
      (!userId || getApp().globalData.user?._id === userId);
    const apiOptions = { loading: false, silent: true, redirectOnForbidden: false, isActive: current };
    this.setData({ loading: true, loadError: false, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user?._id;
      if (!userId) throw new Error('登录资料暂不可用，请重试');
      if (!current()) return;
      if (this.nativePayout && this.nativePayout.userId !== userId) this.nativePayout = null;
      const [income, payoutResult] = await Promise.all([
        api.call('idle', 'earnings', {}, apiOptions),
        api.call('payout', 'list', {}, apiOptions)
      ]);
      if (!current()) return;
      const stateText = { created: '处理中', processing: '处理中', wait_user_confirm: '待确认收款',
        success: '已到账', failed: '失败，收入已解锁', cancelled: '已撤销，收入已解锁' };
      this.context = { userId, read };
      this.setData({ pending: yuan(income.pending), settled: yuan(income.settled), available: yuan(income.available),
        payoutEnabled: income.payoutEnabled === true, canWithdraw: income.canWithdraw === true,
        payouts: (payoutResult.list || []).filter(item => item.payeeType === 'seller')
          .map(item => ({ ...item, amountText: yuan(item.amount), timeText: display(item.createdAt),
            stateText: stateText[item.state] || '处理中' })), ready: true, busy: !!this.nativePayout });
      return this.context;
    } catch (error) {
      if (current()) {
        this.nativePayout = null;
        this.setData({ loadError: true, busy: false, error: error.message || '收入加载失败' });
      }
    } finally {
      if (current()) {
        this.setData({ loading: false });
        this.applyPayoutResult();
      }
    }
  },
  applyPayoutResult() {
    const request = this.nativePayout;
    if (!request || !request.result || !this.current(this.context) || !this.data.ready || this.data.loading) return;
    this.nativePayout = null;
    if (request.userId !== this.context.userId) return;
    this.setData({ busy: false, error: request.result.error || '' });
    if (!request.result.error) wx.showToast({ title: '打款状态已更新', icon: 'none' });
  },
  async withdraw() {
    if (this.visible === false || !this.data.ready || this.data.loading || this.data.busy ||
      !this.data.payoutEnabled || !this.data.canWithdraw) return;
    const context = this.context;
    if (!this.current(context)) return this.load();
    const operation = this.operation = {};
    const current = () => this.operation === operation && this.context === context &&
      this.current(context) && this.data.ready;
    this.setData({ busy: true, error: '' });
    try {
      const payout = await api.call('payout', 'create', { payeeType: 'seller',
        requestId: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9) },
      { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      if (payout.packageInfo) {
        if (!wx.canIUse('requestMerchantTransfer')) throw new Error('请升级微信后再确认收款');
        const request = this.nativePayout = { userId: context.userId };
        const finish = async result => {
          if (this.nativePayout !== request) return;
          if (getApp().globalData.user?._id !== request.userId) { this.nativePayout = null; return; }
          request.result = result;
          // 系统收款页返回后只核对原有提现，不再次创建。
          if (this.visible !== false) await this.load({ preserveNative: true });
        };
        await new Promise(resolve => {
          const done = result => { finish(result).finally(resolve); };
          try { wx.requestMerchantTransfer({ mchId: payout.mchId, appId: payout.appId, package: payout.packageInfo,
            success: () => done({}), fail: error => done({ error: error.errMsg || '收款确认未完成，请查看打款记录' }) }); }
          catch (error) { done({ error: error.message || '无法打开收款确认，请查看打款记录' }); }
        });
      } else {
        const refreshed = await this.load();
        if (this.current(refreshed) && refreshed.userId === context.userId) {
          wx.showToast({ title: payout.state === 'success' ? '已到账' : '打款状态已更新', icon: 'none' });
        }
      }
    } catch (error) {
      if (current()) this.setData({ error: error.message || '打款未完成，请刷新收入状态' });
    } finally {
      if (current()) {
        this.operation = null;
        this.setData({ busy: false });
      }
    }
  }
});
