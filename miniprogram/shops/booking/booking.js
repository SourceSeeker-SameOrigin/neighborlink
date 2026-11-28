const api = require('../../utils/api');
const { pay } = require('../../utils/payment');

Page({
  data: { missingRecord: false, ready: false, loading: true, loadError: false,
    recovery: '', legacyReceipt: false, busy: false, error: '', requirement: '', addresses: [], addressIndex: 0 },
  onLoad(options = {}) {
    this.serviceId = typeof options.serviceId === 'string' ? options.serviceId.trim() : '';
    this.setData({ missingRecord: !this.serviceId, loading: !!this.serviceId });
  },
  onShow() {
    this.hidden = false;
    this.setData({ ready: false, busy: !!this.submitting });
    return this.load();
  },
  onHide() { this.hidden = true; this.invalidateReads(); this.setData({ ready: false }); },
  onUnload() { this.closed = true; this.invalidateReads(); },
  invalidateReads() {
    this.viewVersion = (this.viewVersion || 0) + 1;
    this.loadSequence = (this.loadSequence || 0) + 1;
    this.initializing = false;
  },
  ensureOwner() {
    if (!this.userId) return false;
    const user = getApp().globalData.user;
    if (this.userId === user?._id && this.communityId === user?.communityId) return true;
    this.invalidateReads();
    this.orderId = '';
    this.receipt = null;
    this.userId = '';
    this.communityId = '';
    this.storageKey = '';
    this.scopedStorageKey = '';
    this.legacySkipKey = '';
    this.legacyReceipt = false;
    this.setData({ ready: false, recovery: '', legacyReceipt: false, requirement: '', addresses: [], addressIndex: 0 });
    this.load();
    return false;
  },
  async load() {
    if (!this.serviceId || this.closed || this.hidden || this.initializing || this.submitting) return;
    const sequence = this.loadSequence = (this.loadSequence || 0) + 1;
    let ownerId = '', ownerCommunityId = '';
    const current = () => !this.closed && !this.hidden && sequence === this.loadSequence &&
      (!ownerId || (getApp().globalData.user?._id === ownerId &&
        getApp().globalData.user?.communityId === ownerCommunityId));
    const selected = this.data.addresses[this.data.addressIndex];
    this.initializing = true;
    this.setData({ ready: false, loading: true, loadError: false, error: '', recovery: '' });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      if (!user || !user._id) throw new Error('登录状态不可用，请重试');
      if (getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) {
        this.orderId = '';
        this.receipt = null;
        this.userId = '';
        this.communityId = '';
        this.storageKey = '';
        this.scopedStorageKey = '';
        this.legacySkipKey = '';
        this.setData({ ready: false, requirement: '', addresses: [], addressIndex: 0, recovery: '',
          loadError: true, error: '登录身份或小区已变化，请重新加载' });
        return;
      }
      ownerId = user._id;
      ownerCommunityId = user.communityId;
      if (!current()) return;
      const changed = this.userId && (this.userId !== user._id || this.communityId !== user.communityId);
      if (changed) {
        this.orderId = '';
        this.setData({ requirement: '', addresses: [], addressIndex: 0 });
      }
      this.userId = user._id;
      this.communityId = user.communityId;
      this.scopedStorageKey = 'merchant-booking:' + encodeURIComponent(user._id) + ':' +
        encodeURIComponent(user.communityId || '') + ':' + encodeURIComponent(this.serviceId);
      this.legacySkipKey = this.scopedStorageKey + ':legacy-skip';
      const legacyKey = 'merchant-booking:' + encodeURIComponent(user._id) + ':' + encodeURIComponent(this.serviceId);
      const scopedReceipt = wx.getStorageSync(this.scopedStorageKey);
      const oldReceipt = scopedReceipt ? null : wx.getStorageSync(legacyKey);
      const legacyReceipt = oldReceipt?.requestId && wx.getStorageSync(this.legacySkipKey) === oldReceipt.requestId
        ? null : oldReceipt;
      this.legacyReceipt = !!legacyReceipt;
      this.storageKey = legacyReceipt ? legacyKey : this.scopedStorageKey;
      this.receipt = scopedReceipt || legacyReceipt || null;
      this.setData({ legacyReceipt: this.legacyReceipt });
      let recovery = '';
      if (this.orderId) recovery = 'found';
      else if (this.receipt) {
        const found = await api.call('merchant', 'lookupBooking', {
          serviceId: this.serviceId, requestId: this.receipt.requestId
        }, { silent: true, redirectOnForbidden: false, isActive: current });
        if (!current()) return;
        if (!found || (found.orderId !== null && !found.orderId)) throw new Error('原预约结果暂不可用');
        if (found.orderId) {
          this.orderId = found.orderId;
          this.setData({ ready: true, recovery: 'found' });
          this.openOrder();
          return;
        }
        recovery = 'confirm';
      }
      let addresses = user.addresses || [];
      if (!Array.isArray(addresses)) throw new Error('地址加载失败，请重试');
      const selectedId = this.receipt ? this.receipt.addressId : !changed && selected && selected.id;
      if (recovery === 'confirm' && !selectedId && addresses.length) {
        addresses = [{ id: '', label: '当前绑定门牌地址' }, ...addresses];
      }
      const index = selectedId ? addresses.findIndex(item => item.id === selectedId) : 0;
      this.setData({ ready: true, recovery, addressIndex: index < 0 && !this.receipt ? 0 : index,
        addresses: addresses.map(item => ({ ...item, label: !item.id ? '当前绑定门牌地址' : [item.buildingName, item.unit, item.room, item.contactName]
          .filter(value => typeof value === 'string' && value.trim()).join(' · ') || '已绑定地址' })) });
    } catch (error) {
      if (current()) this.setData({ ready: false, loadError: true, error: error.message || '预约信息读取失败' });
    } finally {
      if (current()) { this.initializing = false; this.setData({ loading: false }); }
    }
  },
  canEdit() {
    return !this.closed && !this.hidden && this.ensureOwner() && this.data.ready && !this.data.loading && !this.data.busy &&
      (!this.data.recovery || this.data.recovery === 'confirm');
  },
  input(event) { if (this.canEdit()) this.setData({ requirement: event.detail.value }); },
  startNewBooking() {
    if (!this.legacyReceipt || !this.canEdit()) return;
    wx.setStorageSync(this.legacySkipKey, this.receipt.requestId);
    this.receipt = null;
    this.legacyReceipt = false;
    this.storageKey = this.scopedStorageKey;
    this.setData({ recovery: '', legacyReceipt: false, requirement: '', error: '' });
  },
  address(event) {
    const addressIndex = Number(event.detail.value);
    if (this.canEdit() && Number.isInteger(addressIndex) && this.data.addresses[addressIndex]) this.setData({ addressIndex });
  },
  openOrder() {
    if (!this.data.ready || !this.orderId || this.closed || this.hidden || this.navigating || !this.ensureOwner()) return;
    const key = this.storageKey, receipt = this.receipt, version = this.viewVersion;
    this.navigating = true;
    wx.redirectTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(this.orderId),
      success: () => {
        if (receipt && wx.getStorageSync(key)?.requestId === receipt.requestId) wx.removeStorageSync(key);
      },
      fail: () => {
        if (!this.closed && !this.hidden && version === this.viewVersion) this.setData({ error: '订单已建立，请重新打开详情' });
      },
      complete: () => { this.navigating = false; }
    });
  },
  async submit() {
    if (this.submitting || this.hidden || this.closed) return;
    if (!this.ensureOwner()) return;
    if (this.data.recovery === 'lookup') return this.load();
    if (this.data.recovery === 'found') return this.openOrder();
    if (!this.serviceId || !this.canEdit()) return;
    const requirement = this.data.requirement.trim();
    const selected = this.data.addresses[this.data.addressIndex];
    if (this.receipt?.hadRequirement && !requirement) {
      this.setData({ error: '请重新填写并确认原预约需求' }); return;
    }
    if (this.receipt?.addressId && this.data.addresses.length && !selected) {
      this.setData({ error: '原预约地址不可用，请先确认有效地址' }); return;
    }
    const version = this.viewVersion;
    const userId = this.userId;
    const communityId = this.communityId;
    const current = () => !this.closed && !this.hidden && this.viewVersion === version &&
      getApp().globalData.user?._id === userId && getApp().globalData.user?.communityId === communityId;
    this.submitting = true;
    this.setData({ busy: true, error: '' });
    try {
      const saved = wx.getStorageSync(this.storageKey);
      if (saved && saved.requestId !== this.receipt?.requestId) {
        this.setData({ recovery: 'lookup', error: '有一笔预约需要先核对' });
        return;
      }
      const requestId = this.receipt?.requestId || 'merchant_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      const receipt = { requestId, communityId, addressId: selected?.id || '', hadRequirement: !!requirement };
      wx.setStorageSync(this.storageKey, receipt);
      this.receipt = receipt;
      const result = await api.call('merchant', 'createBooking', { serviceId: this.serviceId, requirement,
        ...(selected?.id ? { addressId: selected.id } : {}), requestId }, { silent: true, redirectOnForbidden: false, isActive: current });
      if (!result?.orderId) throw new Error('预约结果暂不可用');
      if (!current()) return;
      this.orderId = result.orderId;
      this.setData({ recovery: 'found' });
      if (result.status === 'pending_quote') wx.showToast({ title: '已提交，等待商家报价', icon: 'success' });
      else if (result.paymentError) wx.showToast({ title: '订单已建立，请在详情重试支付', icon: 'none' });
      else {
        const paid = await pay(result, current);
        if (!current()) return;
        if (paid) wx.showToast({ title: '预约已提交', icon: 'success' });
      }
      this.openOrder();
    } catch (error) {
      if (!current()) return;
      this.setData({ error: error.message || '预约未完成，请重试', recovery: this.orderId ? 'found' : this.receipt ? 'lookup' : '' });
      if (this.orderId) this.openOrder();
    } finally {
      this.submitting = false;
      if (!this.closed && !this.hidden) {
        this.setData({ busy: false });
        if (!current()) await this.load();
      }
    }
  }
});
