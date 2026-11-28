const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display } = require('../../utils/time');
Page({
  data: { loading: false, ready: false, loadError: false, creatingPayout: false, error: '', rows: [], payouts: [], pending: '0.00', settled: '0.00',
    available: '0.00', canWithdraw: false, payoutEnabled: false, hasMore: true,
    payoutHasMore: false, payoutNextOffset: 0, payoutPaging: false, payoutError: '' },
  onShow() { this.visible = true; return this.load(true, { preserveNative: true }); },
  clearContext() {
    this.context = null; this.operation = null; this.read = (this.read || 0) + 1;
    this.setData({ ready: false, rows: [], payouts: [], pending: '0.00', settled: '0.00', available: '0.00',
      canWithdraw: false, payoutEnabled: false, hasMore: true, creatingPayout: !!this.nativePayout,
      payoutHasMore: false, payoutNextOffset: 0, payoutPaging: false, payoutError: '' });
  },
  onHide() { this.visible = false; this.clearContext(); },
  onUnload() { this.nativePayout = null; this.onHide(); },
  current(context) { return Boolean(context && this.visible && context.read === this.read && getApp().globalData.user?._id === context.userId); },
  onReachBottom() { if (this.data.ready && this.data.hasMore && !this.data.loading) this.load(); },
  retry() { return this.load(!this.pageError); },
  async load(reset = false, options = {}) {
    if (!this.visible || (!reset && (this.data.loading || this.data.creatingPayout || !this.data.hasMore))) return;
    if (!reset && !this.current(this.context)) return this.load(true);
    if (!options.preserveNative) this.nativePayout = null;
    if (reset) this.clearContext();
    else { this.operation = null; this.read++; }
    const read = this.read;
    let userId, communityId;
    const pageCurrent = () => this.visible && this.read === read;
    const current = () => pageCurrent() && (!userId || (getApp().globalData.user?._id === userId &&
      getApp().globalData.user?.communityId === communityId));
    const apiOptions = { loading: false, silent: true, redirectOnForbidden: false, isActive: current };
    this.pageError = false;
    this.setData({ loading: true, ready: false, loadError: false, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      userId = user?._id; communityId = user?.communityId;
      if (!userId) throw Error('登录资料暂不可用，请重试');
      if (!current()) return;
      if (this.nativePayout && this.nativePayout.userId !== userId) this.nativePayout = null;
      const [result, payoutResult] = await Promise.all([
        api.call('provider', 'earnings', { offset: reset ? 0 : this.data.rows.length }, apiOptions),
        reset ? api.call('payout', 'list', { payeeType: 'provider', offset: 0 }, apiOptions) : Promise.resolve({ list: this.data.payouts })
      ]);
      if (!current()) return;
      const rows = result.list.map(row => ({ ...row, amountText: yuan(row.amount), time: display(row.createdAt) }));
      const payouts = (payoutResult.list || []).filter(item => item.payeeType === 'provider').map(item => ({ ...item, amountText: yuan(item.amount),
        time: display(item.createdAt), stateText: this.payoutStateText(item.state) }));
      this.context = { userId, read };
      this.setData({ rows: reset ? rows : [...this.data.rows, ...rows], payouts, pending: yuan(result.pending),
        settled: yuan(result.settled), available: yuan(result.available || 0), canWithdraw: result.canWithdraw === true,
        payoutEnabled: result.payoutEnabled === true, hasMore: result.hasMore, ready: true, creatingPayout: !!this.nativePayout,
        ...(reset ? { payoutHasMore: payoutResult.hasMore === true,
          payoutNextOffset: payoutResult.nextOffset ?? (payoutResult.list || []).length } : {}) });
      return this.context;
    } catch (error) {
      if (current()) {
        this.pageError = !reset && error.code !== 'E_FORBIDDEN';
        if (error.code === 'E_FORBIDDEN') this.clearContext();
        else if (!reset) this.context = { userId, read };
        this.nativePayout = null;
        this.setData({ loading: false, creatingPayout: false, loadError: true, error: error.message || '收入加载失败' });
      }
    } finally {
      if (current()) { this.setData({ loading: false }); this.applyPayoutResult(); }
      else if (pageCurrent() && userId) this.setData({ loading: false, error: '登录身份已变化，请重新加载' });
    }
  },
  payoutStateText(state) { return ({ created: '处理中', processing: '处理中', wait_user_confirm: '待确认收款',
    success: '已到账', failed: '失败，收入已解锁', cancelled: '已撤销，收入已解锁' })[state] || '处理中'; },
  async morePayouts() {
    const context = this.context;
    if (!this.current(context) || !this.data.ready || !this.data.payoutHasMore || this.data.payoutPaging) return;
    const offset = this.data.payoutNextOffset;
    this.setData({ payoutPaging: true, payoutError: '' });
    try {
      const result = await api.call('payout', 'list', { payeeType: 'provider', offset },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: () => this.current(context) });
      if (!this.current(context)) return;
      const seen = new Set(this.data.payouts.map(item => item.payoutId));
      this.setData({ payouts: [...this.data.payouts, ...(result.list || [])
        .filter(item => item.payeeType === 'provider' && !seen.has(item.payoutId))
        .map(item => ({ ...item, amountText: yuan(item.amount), time: display(item.createdAt),
          stateText: this.payoutStateText(item.state) }))],
      payoutHasMore: result.hasMore === true, payoutNextOffset: result.nextOffset ?? offset + (result.list || []).length });
    } catch (error) {
      if (this.current(context)) this.setData({ payoutError: error.message || '提现记录加载失败' });
    } finally { if (this.current(context)) this.setData({ payoutPaging: false }); }
  },
  applyPayoutResult() {
    const request = this.nativePayout;
    if (!request || !request.result || !this.current(this.context) || !this.data.ready || this.data.loading) return;
    this.nativePayout = null;
    if (request.userId !== this.context.userId) return;
    this.setData({ creatingPayout: false, error: request.result.error || '' });
    if (!request.result.error) wx.showToast({ title: '提现状态已更新', icon: 'none' });
  },
  async createPayout() {
    if (!this.visible || !this.data.ready || this.data.loading || this.data.creatingPayout || !this.data.payoutEnabled || !this.data.canWithdraw) return;
    const context = this.context;
    if (!this.current(context)) return this.load(true);
    const operation = this.operation = {};
    const current = () => this.operation === operation && this.context === context && this.current(context) && this.data.ready;
    this.setData({ creatingPayout: true, error: '' });
    try {
      const requestId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      const payout = await api.call('payout', 'create', { requestId },
        { loading: false, silent: true, redirectOnForbidden: false, isActive: current });
      if (!current()) return;
      if (payout.packageInfo) {
        if (!wx.canIUse('requestMerchantTransfer')) throw new Error('请升级微信后再确认收款');
        const request = this.nativePayout = { userId: context.userId };
        const finish = async result => {
          if (this.nativePayout !== request) return;
          if (getApp().globalData.user?._id !== request.userId) { this.nativePayout = null; return; }
          request.result = result;
          // 系统收款返回只核对收入与提现记录，不再创建提现。
          if (this.visible) await this.load(true, { preserveNative: true });
        };
        await new Promise(resolve => {
          const done = result => { finish(result).finally(resolve); };
          try { wx.requestMerchantTransfer({ mchId: payout.mchId, appId: payout.appId, package: payout.packageInfo,
            success: () => done({}), fail: error => done({ error: error.errMsg || '收款确认未完成，请查看提现记录' }) }); }
          catch (error) { done({ error: error.message || '无法打开收款确认，请查看提现记录' }); }
        });
      } else {
        const refreshed = await this.load(true);
        if (this.current(refreshed) && refreshed.userId === context.userId) wx.showToast({ title: payout.state === 'success' ? '提现已到账' : '提现状态已更新', icon: 'none' });
      }
    } catch (error) { if (current()) this.setData({ error: error.message || '提现未完成，请刷新收入状态' }); }
    finally { if (current()) { this.operation = null; this.setData({ creatingPayout: false }); } }
  }
});
