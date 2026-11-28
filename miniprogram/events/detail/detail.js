const { lifecycle, currentVisit, currentUserAction, readList } = require('../../utils/visible-list');
const reportAction = require('../../utils/report');
const api = require('../../utils/api');
const { pay } = require('../../utils/payment');
const { yuan } = require('../../utils/money');
const { display } = require('../../utils/time');
const { signupStatusNames } = require('../../utils/status-labels');
Page({
  data: { missingRecord: false, checkinScene: false, loading: true, busy: false, error: '', reportError: '', item: null, signupStatusNames },
  onLoad(options = {}) {
    this.eventId = typeof options.id === 'string' ? options.id.trim() : '';
    let scene = '';
    try { scene = decodeURIComponent(options.scene || ''); } catch (_) { /* 无效扫码参数按缺少活动编号处理 */ }
    const checkinScene = !this.eventId && /^e=/.test(scene);
    this.setData({ checkinScene, missingRecord: !this.eventId && !checkinScene, loading: !!this.eventId });
  },
  ...lifecycle,
  onShow() {
    if (this._hidden) this.setData({ reportError: '', busy: false });
    return lifecycle.onShow.call(this);
  },
  onHide() { lifecycle.onHide.call(this); clearTimeout(this.deadlineTimer); },
  onUnload() { lifecycle.onUnload.call(this); clearTimeout(this.deadlineTimer); },
  refreshActions() {
    const item = this.data.item;
    if (!item || this._hidden || this._unloaded) return {};
    const actions = this.actionsFor(item);
    this.setData({ actions });
    return actions;
  },
  actionsFor(item) {
    clearTimeout(this.deadlineTimer);
    const now = Date.now();
    const deadline = new Date(item.signupDeadline).getTime();
    const start = new Date(item.startAt).getTime();
    const status = item.mySignup && item.mySignup.status;
    const published = item.status === 'published' && item.featureEnabled;
    const beforeDeadline = deadline > now;
    const canCancel = beforeDeadline && (status === 'signed' || status === 'pending_pay');
    const canPay = published && status === 'pending_pay';
    const canJoin = published && beforeDeadline && start > now && item.canSignup && item.remaining > 0;
    let reason = '';
    if (item.status !== 'published') reason = '活动当前不可报名';
    else if (!beforeDeadline || start <= now) reason = '活动报名已截止';
    else if (item.remaining <= 0 && item.canSignup) reason = '活动名额已满';
    if (!beforeDeadline && (status === 'signed' || status === 'pending_pay')) reason = '报名已截止，无法取消报名';
    const actions = { canJoin, canPay, canCancel, reason };
    const next = Math.min(...[deadline, start].filter(at => at > now));
    if (Number.isFinite(next)) {
      this.deadlineTimer = setTimeout(() => this.refreshActions(), Math.min(next - now, 2147483647));
    }
    return actions;
  },
  currentDetailAction() {
    const eventId = this.eventId;
    const read = this._readSequence;
    const visible = currentUserAction(currentVisit(this));
    return () => visible() && this.eventId === eventId && this._readSequence === read &&
      this.detailUserId === getApp().globalData.user?._id;
  },
  needsResidentRefresh() {
    return !this._hidden && !this._unloaded && this.detailUserId &&
      this.detailUserId !== getApp().globalData.user?._id;
  },
  async reportContent() {
    if (!this.eventId || !this.data.item || this.data.loading || this._hidden || this._unloaded) return;
    if (this.needsResidentRefresh()) return this.load();
    const active = this.currentDetailAction();
    if (this.reporting || !active()) return;
    this.reporting = active;
    try {
      const submitted = await reportAction.submit('event', this.eventId, active);
      if (submitted && active()) this.setData({ reportError: '' });
    } catch (error) {
      if (active()) this.setData({ reportError: error.message || '举报提交失败' });
    } finally {
      if (this.reporting === active) {
        this.reporting = null;
        if (this.needsResidentRefresh()) await this.load();
      }
    }
  },
  async load() {
    if (!this.eventId) return;
    clearTimeout(this.deadlineTimer);
    const initial = { item: null, actions: {}, busy: false, reportError: '' };
    this.reporting = null;
    this.detailUserId = null;
    return readList(this, initial, '活动加载失败', async (user, options) => {
      const pending = this.pendingSignup;
      if (pending && pending.userId === user._id) {
        await pending.promise.catch(() => {});
        if (!options.isActive()) return;
      }
      const item = await api.call('event', 'detail', { eventId: this.eventId }, options);
      if (!options.isActive()) return;
      if (!user?._id || user._id !== getApp().globalData.user?._id) throw Error('住户已切换，请重试读取活动');
      this.detailUserId = user._id;
      item.feeText = item.fee ? '¥' + yuan(item.fee) : '免费';
      item.startText = display(item.startAt); item.endText = display(item.endAt); item.deadlineText = display(item.signupDeadline);
      return { item, actions: this.actionsFor(item) };
    });
  },
  async reloadActionDetail() {
    const loading = this.load();
    const current = this.currentDetailAction();
    await loading;
    return current() && !!this.data.item;
  },
  async signup() {
    if (!this.eventId) return;
    if (this.needsResidentRefresh()) return this.load();
    if (this.data.busy || this.data.loading) return;
    const current = this.currentDetailAction();
    const read = this._readSequence;
    const allowed = () => {
      if (!current() || this.data.loading) return false;
      const actions = this.refreshActions();
      return actions.canJoin || actions.canPay;
    };
    if (!allowed()) return;
    this.setData({ busy: true, error: '' });
    try {
      const templates = await api.call('event', 'templates', {}, { loading: false, silent: true, isActive: current });
      if (!allowed()) return;
      if (templates.eventReminder && typeof wx.requestSubscribeMessage === 'function') {
        await new Promise(resolve => wx.requestSubscribeMessage({ tmplIds: [templates.eventReminder], success: resolve, fail: resolve }));
      }
      if (!allowed()) return;
      const pending = {
        userId: this.detailUserId,
        promise: api.call('event', 'signup', { eventId: this.eventId }, { isActive: current })
      };
      this.pendingSignup = pending;
      let result;
      try {
        result = await pending.promise;
      } catch (error) {
        if (current() && await this.reloadActionDetail()) {
          const status = this.data.item.mySignup?.status;
          if (status !== 'signed' && status !== 'checked_in') {
            this.setData({ error: status === 'pending_pay' ? '报名待付款，可继续支付' : (error.message || '报名未确认，请重试') });
          }
        }
        return;
      } finally {
        if (this.pendingSignup === pending) this.pendingSignup = null;
      }
      if (!current()) return;

      if (result.status === 'pending_pay') {
        try {
          await pay(result, current, { serviceNotifications: false });
        } catch (error) {
          if (current()) {
            if (await this.reloadActionDetail() && !String(error.errMsg || '').includes('cancel')) {
              this.setData({ error: error.message || '支付未完成，可继续支付' });
            }
          }
          return;
        }
      }
      if (!current() || !await this.reloadActionDetail()) return;
      const status = this.data.item.mySignup?.status;
      if (status === 'signed' || status === 'pending_pay') {
        wx.showToast({ title: status === 'signed' ? '报名成功' : '报名待付款，可继续支付', icon: 'none' });
      }
    } catch (error) { if (current()) this.setData({ error: error.message || '报名失败，请重试' }); }
    finally {
      if (current()) this.setData({ busy: false });
      else if (this._readSequence === read && this.needsResidentRefresh()) await this.load();
    }
  },
  async cancelSignup() {
    const eventId = this.eventId;
    const current = this.currentDetailAction();
    if (!eventId || !current() || this.data.busy || this.data.loading || !this.refreshActions().canCancel) return;
    this.setData({ busy: true, error: '' });
    try {
      const modal = await new Promise(resolve => wx.showModal({ title: '取消报名',
        content: '确认取消本次报名吗？截止前将按规则全额退款。', success: resolve, fail: () => resolve({ confirm: false }) }));
      if (!modal.confirm || !current() || !this.refreshActions().canCancel) return;
      await api.call('event', 'cancelSignup', { eventId }, { isActive: current });
      if (current()) await this.load();
    } catch (error) {
      if (current()) this.setData({ error: error.message || '取消失败' });
    } finally {
      if (current()) this.setData({ busy: false });
    }
  }
});
