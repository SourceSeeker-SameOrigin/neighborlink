const api = require('../../utils/api');
Page({
  data: { loading: true, error: '', user: null, community: null, provider: null, merchant: null,
    stationApplication: null, merchantError: '', stationError: '', merchantLoading: false,
    stationLoading: false, manage: false, doorDeliveryBusy: false },
  onShow() { this._hidden = false; return this.load(); },
  onHide() {
    this._hidden = true;
    this.invalidateReads();
    this.setData({ user: null, community: null, provider: null, merchant: null, stationApplication: null,
      unreadTotal: 0, manage: false, canManageEvents: false, isAdmin: false, isProperty: false,
      isMerchant: false, isStation: false, doorDeliveryBusy: false, loading: false });
  },
  onUnload() { this.onHide(); this._closed = true; },
  visible() { return !this._closed && !this._hidden; },
  currentUser(sequence = this.sequence) {
    const user = getApp().globalData.user;
    return this.visible() && this._ready && sequence === this.sequence && this.data.user?._id &&
      user?._id === this.data.user._id && user.communityId === this.data.user.communityId;
  },
  invalidateReads() { this.sequence = (this.sequence || 0) + 1; this._ready = false; },
  async load() {
    if (!this.visible()) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const current = () => this.visible() && sequence === this.sequence;
    this._ready = false;
    this.setData({ loading: true, error: '', merchantError: '', stationError: '',
      merchantLoading: false, stationLoading: false, doorDeliveryBusy: false,
      user: null, community: null, provider: null, merchant: null, stationApplication: null,
      unreadTotal: 0, manage: false, canManageEvents: false, isAdmin: false, isProperty: false,
      isMerchant: false, isStation: false });
    try {
      const app = getApp();
      const user = await app.ensureSession(true);
      if (!current()) return;
      if (app.globalData.user?._id !== user._id || app.globalData.user?.communityId !== user.communityId) return;
      const community = app.globalData.community, provider = app.globalData.provider;
      this._ready = true;
      this.setData({ user, community, provider, merchant: null, stationApplication: null, unreadTotal: 0,
        loading: false, doorDelivery: Boolean(user.prefs && user.prefs.doorDelivery),
        isStation: user.roles.includes('station'), isAdmin: user.roles.includes('admin'),
        isProperty: user.roles.includes('property'), isMerchant: user.roles.includes('merchant'),
        manage: user.roles.includes('admin') || user.roles.includes('property'),
        canManageEvents: user.roles.includes('admin') || user.roles.includes('property') || user.roles.includes('merchant') });
      await Promise.all([this.refreshUnread(sequence), this.loadApplication('merchant'), this.loadApplication('station')]);
    } catch (error) { if (current()) this.setData({ error: error.message || '加载失败，请重试' }); }
    finally { if (current()) this.setData({ loading: false }); }
  },
  async refreshUnread(sequence) {
    const current = () => this.currentUser(sequence);
    try {
      const result = await api.call('chat', 'list', {}, { loading: false, silent: true, isActive: current });
      if (current()) this.setData({ unreadTotal: result.unreadTotal || 0 });
    } catch (_) { if (current()) this.setData({ unreadTotal: 0 }); }
  },
  async loadApplication(code) {
    if (!this.visible() || !this._ready || !['merchant', 'station'].includes(code)) return;
    const busyKey = code + 'Loading', errorKey = code + 'Error';
    if (this.data[busyKey]) return;
    const features = this.data.community && this.data.community.enabledFeatures || {};
    if (!(code === 'merchant' ? features.merchants : features.stationDelivery) ||
      (code === 'station' && this.data.isStation)) return;
    const sequence = this.sequence;
    const current = () => this.currentUser(sequence);
    this.setData({ [busyKey]: true, [errorKey]: '' });
    try {
      const result = await api.call(code, 'myApplication', {}, { loading: false, silent: true, isActive: current });
      if (!current()) return;
      this.setData(code === 'merchant' ? { merchant: result.merchant } : { stationApplication: result.application });
    } catch (error) {
      if (current()) this.setData({ [errorKey]: error.message || '状态读取失败，请重试' });
    } finally { if (current()) this.setData({ [busyKey]: false }); }
  },
  retryApplication(event) { return this.loadApplication(event.currentTarget.dataset.code); },
  openWorkspace(event) {
    const code = event.currentTarget.dataset.code;
    const user = this.data.user;
    if (!this.currentUser() || this.data.loading || !user) {
      this.setData({ user: null, provider: null, community: null, manage: false, canManageEvents: false });
      return;
    }
    const features = this.data.community && this.data.community.enabledFeatures || {};
    const routes = { provider: '/provider/workbench/workbench', merchant: '/merchant/workbench/workbench', station: '/station/workbench/workbench', admin: '/admin/dashboard/dashboard', property: '/admin/dashboard/dashboard' };
    const permitted = code === 'provider' ? this.data.provider && this.data.provider.status === 'approved' : user.roles.includes(code);
    if (permitted && routes[code]) { wx.navigateTo({ url: routes[code] }); return; }
    if (code === 'admin' || code === 'property') {
      wx.showModal({ title: code === 'admin' ? '管理员资格' : '物业资格', content: '由运营方核验身份并分配角色及小区范围，扫码不会自动获得权限。请联系运营方。', showCancel: false }); return;
    }
    if (!user.communityId || !user.buildingId) { wx.navigateTo({ url: '/pages/bind/bind' }); return; }
    const feature = code === 'merchant' ? 'merchants' : code === 'station' ? 'stationDelivery' : null;
    if (feature && !features[feature]) {
      wx.showModal({ title: '本小区暂未开通', content: '该工作台需先开放对应服务，再提交申请并由管理员审核。请联系运营方。', showCancel: false }); return;
    }
    if (this.data[code + 'Loading']) return;
    if (this.data[code + 'Error']) return this.loadApplication(code);
    const apply = { provider: '/provider/apply/apply', merchant: '/merchant/apply/apply', station: '/station/apply/apply' };
    if (apply[code]) wx.navigateTo({ url: apply[code] });
  },
  callHotline() {
    if (!this.currentUser()) return;
    const phoneNumber = getApp().globalData.community && getApp().globalData.community.hotline;
    if (phoneNumber && phoneNumber !== '400-000-0000') wx.makePhoneCall({ phoneNumber });
    else wx.showToast({ title: '请在首页查看客服电话', icon: 'none' });
  },
  async doorDeliveryChange(event) {
    if (!this.currentUser() || this.data.doorDeliveryBusy) return;
    const sequence = this.sequence, userId = this.data.user._id;
    const active = () => this.currentUser(sequence) && this.data.user._id === userId;
    this.setData({ doorDeliveryBusy: true, error: '' });
    try {
      await api.call('station', 'setDoorDelivery', { enabled: event.detail.value === true },
        { silent: true, redirectOnForbidden: false, isActive: active });
      if (!active()) return;
      const user = await getApp().ensureSession(true);
      if (active() && user._id === userId) this.setData({ user, doorDelivery: Boolean(user.prefs && user.prefs.doorDelivery) });
    } catch (error) {
      if (active()) {
        this.setData({ error: error.message || '保存结果待核对', doorDeliveryBusy: false });
        await this.load();
      }
    } finally { if (active()) this.setData({ doorDeliveryBusy: false }); }
  }
});
