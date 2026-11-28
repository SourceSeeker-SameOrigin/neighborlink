const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display } = require('../../utils/time');
const { pay } = require('../../utils/payment');
Page({
  data: { loading: true, ready: false, busy: false, error: '', plans: [], cards: [], addresses: [], addressIndex: 0,
    createdOrderId: '', navigating: false, navigationError: '',
    slots: ['早班', '中班', '晚班'], slotIndex: 2, entryOptions: ['密码入户', '交接钥匙', '物业钥匙柜'], entry: 'password', entryPassword: '' },
  onShow() { this.hidden = false; this.setData({ busy: !!this.purchasePending }); this.load(); },
  onHide() { this.hidden = true; this.sequence = (this.sequence || 0) + 1; this.clearOwnerData(); },
  onUnload() { this.closed = true; this.sequence = (this.sequence || 0) + 1; this.clearOwnerData(); },
  currentOwner(sequence = this.sequence) {
    return !this.closed && !this.hidden && sequence === this.sequence &&
      !!this.userId && getApp().globalData.user?._id === this.userId &&
      getApp().globalData.user?.communityId === this.ownerCommunityId;
  },
  clearOwnerData() {
    this.setData({ ready: false, plans: [], cards: [], addresses: [], addressIndex: 0,
      createdOrderId: '', navigationError: '', entryPassword: '' });
  },
  async load() {
    if (this.closed || this.hidden) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const current = () => !this.closed && !this.hidden && sequence === this.sequence;
    if (this.userId && (getApp().globalData.user?._id !== this.userId ||
        getApp().globalData.user?.communityId !== this.ownerCommunityId)) {
      this.receipt = null;
      this.request = null;
      this.clearOwnerData();
    }
    const selectedId = this.data.addresses[this.data.addressIndex]?.id;
    this.setData({ loading: true, ready: false, error: '', plans: [], cards: [] });
    try {
      const user = await getApp().ensureSession();
      if (!current() || getApp().globalData.user?._id !== user._id) return;
      this.userId = user._id;
      this.ownerCommunityId = user.communityId;
      this.receiptKey = 'membershipOrderReceipt:' + user._id;
      if (this.receipt && this.receipt.userId !== user._id) this.receipt = null;
      if (!this.receipt) {
        try {
          const saved = wx.getStorageSync(this.receiptKey);
          if (saved && saved.userId === user._id && typeof saved.orderId === 'string' && saved.orderId) this.receipt = saved;
        } catch (_) { /* Local storage failure must not discard an in-memory receipt. */ }
      }
      this.setData({ createdOrderId: this.receipt ? this.receipt.orderId : '', navigating: false, navigationError: '' });
      if (this.receipt) return;
      if (!user.buildingId && !(user.addresses && user.addresses.length)) { wx.redirectTo({ url: '/pages/bind/bind' }); return; }
      const addresses = user.addresses && user.addresses.length ? user.addresses : [{ id: '', communityId: user.communityId,
        buildingId: user.buildingId, buildingName: user.buildingName, unit: user.unit, room: user.room, isDefault: true }];
      const previousIndex = selectedId === undefined ? -1 : addresses.findIndex(item => item.id === selectedId);
      const addressIndex = previousIndex >= 0 ? previousIndex : Math.max(0, addresses.findIndex(item => item.isDefault));
      this.setData({ addresses: addresses.map(address => ({ ...address, pickerLabel: this.addressLabel(address) })),
        addressIndex, addressText: this.addressLabel(addresses[addressIndex]) });
      const [plans, mine] = await Promise.all([api.call('membership', 'plans', { addressId: addresses[addressIndex].id || undefined }, { loading: false, silent: true }),
        api.call('membership', 'mine', {}, { loading: false, silent: true })]);
      if (!current() || !this.currentOwner(sequence)) return;
      this.setData({ ready: true, plans: plans.list.map(plan => ({ ...plan, priceText: yuan(plan.payAmount), originalText: yuan(plan.price) })),
        cards: mine.list.map(card => ({ ...card, startText: display(card.startAt), endText: display(card.endAt),
          statusText: { active: '使用中', expired: '已到期', refunded: '已作废' }[card.status] })) });
    } catch (error) { if (current() && this.currentOwner(sequence)) this.setData({ error: error.message || '月卡加载失败，请重试' }); }
    finally { if (current() && this.currentOwner(sequence)) this.setData({ loading: false }); }
  },
  addressLabel(address) {
    return [address.buildingName, address.unit, address.room].filter(Boolean).join(' ');
  },
  async addressChange(event) {
    if (!this.currentOwner() || this.data.busy || this.receipt) return;
    const addressIndex = Number(event.detail.value);
    const address = this.data.addresses[addressIndex];
    if (!address) return;
    if (addressIndex === this.data.addressIndex && this.data.ready && !this.data.loading) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const current = () => this.currentOwner(sequence);
    this.request = null;
    this.setData({ addressIndex, addressText: this.addressLabel(address), loading: true, ready: false, plans: [], error: '' });
    try {
      const [plans, mine] = await Promise.all([
        api.call('membership', 'plans', { addressId: address.id || undefined }, { loading: false, silent: true }),
        api.call('membership', 'mine', {}, { loading: false, silent: true })]);
      if (!current()) return;
      this.setData({ ready: true, plans: plans.list.map(plan => ({ ...plan, priceText: yuan(plan.payAmount), originalText: yuan(plan.price) })),
        cards: mine.list.map(card => ({ ...card, startText: display(card.startAt), endText: display(card.endAt),
          statusText: { active: '使用中', expired: '已到期', refunded: '已作废' }[card.status] })) });
    } catch (error) { if (current()) this.setData({ error: error.message || '月卡方案加载失败' }); }
    finally { if (current()) this.setData({ loading: false }); }
  },
  slot(event) { this.setData({ slotIndex: Number(event.detail.value) }); },
  entry(event) { this.setData({ entry: ['password', 'key_handover', 'property_keybox'][Number(event.detail.value)], entryPassword: '' }); },
  entryPassword(event) { this.setData({ entryPassword: event.detail.value }); },
  openCreatedOrder() {
    const receipt = this.receipt;
    if (!receipt || receipt.userId !== this.userId || !this.currentOwner() || this.data.navigating) return;
    const sequence = this.sequence;
    const key = 'membershipOrderReceipt:' + receipt.userId;
    this.setData({ navigating: true, navigationError: '' });
    const fail = () => {
      if (this.currentOwner(sequence)) this.setData({ navigating: false,
        navigationError: '月卡订单已创建，暂未打开详情，请点击下方按钮重试。不会重复购买。' });
    };
    try {
      wx.navigateTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(receipt.orderId), fail,
        success: () => {
          try {
            const saved = wx.getStorageSync(key);
            if (saved && saved.userId === receipt.userId && saved.orderId === receipt.orderId) wx.removeStorageSync(key);
          } catch (_) { /* A retained receipt can safely reopen the same order. */ }
          if (this.receipt === receipt) this.receipt = null;
        } });
    } catch (_) { fail(); }
  },
  async buy(event) {
    if (!this.currentOwner() || this.data.busy) return;
    if (this.receipt) { this.openCreatedOrder(); return; }
    if (this.data.loading || !this.data.ready) return;
    const planCode = event.currentTarget.dataset.code;
    if (!this.data.plans.some(plan => plan.code === planCode)) return;
    const slot = planCode === 'vacant_monthly' ? null : ['morning', 'afternoon', 'evening'][this.data.slotIndex];
    const address = this.data.addresses[this.data.addressIndex];
    const addressId = address && address.id || undefined;
    const userId = this.userId;
    const receiptKey = this.receiptKey;
    const sequence = this.sequence;
    const current = () => !this.closed && !this.hidden && this.sequence === sequence &&
      getApp().globalData.user?._id === userId && this.userId === userId &&
      getApp().globalData.user?.communityId === this.ownerCommunityId;
    this.purchasePending = true;
    this.setData({ busy: true, error: '' });
    try {
      const fields = { planCode, slot, addressId, entry: this.data.entry, entryPassword: this.data.entryPassword };
      if (!this.request || JSON.stringify(this.request.fields) !== JSON.stringify(fields)) this.request = {
        fields, requestId: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) };
      const requestBody = { planCode, slot, addressId, requestId: this.request.requestId };
      if (planCode === 'vacant_monthly') Object.assign(requestBody, { entry: this.data.entry, entryPassword: this.data.entryPassword });
      const created = await api.call('membership', 'buy', requestBody);
      if (!created || typeof created.orderId !== 'string' || !created.orderId) throw Error('未取得订单编号，请重试');
      const receipt = { userId, orderId: created.orderId };
      if (this.userId === userId) this.receipt = receipt;
      this.request = null;
      try { wx.setStorageSync(receiptKey, receipt); } catch (_) { /* Keep the in-memory lock even when storage fails. */ }
      if (!current()) return;
      this.setData({ createdOrderId: receipt.orderId, entryPassword: '', navigationError: '' });
      try { await pay(created, current); }
      catch (error) { if (current()) wx.showToast({ title: error.message || '支付未完成，可到订单页重试', icon: 'none' }); }
      if (current()) this.openCreatedOrder();
    } catch (error) { if (current()) this.setData({ error: error.message }); }
    finally { this.purchasePending = false; if (current()) this.setData({ busy: false }); }
  },
  async skip(event) {
    if (!this.currentOwner() || this.data.busy || this.data.loading || !this.data.ready) return;
    const sequence = this.sequence;
    const userId = this.userId;
    const membershipId = event.currentTarget.dataset.id;
    if (!this.data.cards.some(card => card._id === membershipId || card.id === membershipId)) return;
    const answer = await new Promise(resolve => wx.showModal({ title: '今天不用来', content: '仅能跳过尚未接单的今日垃圾月卡任务。确认今天不用上门吗？', success: resolve }));
    if (!answer.confirm || !this.currentOwner(sequence) || this.userId !== userId || this.data.busy || this.data.loading || !this.data.ready) return;
    this.setData({ busy: true });
    try { await api.call('membership', 'skipToday', { membershipId }); if (this.currentOwner(sequence)) await this.load(); }
    catch (error) { if (this.currentOwner(sequence)) this.setData({ error: error.message }); }
    finally { if (this.currentOwner()) this.setData({ busy: false }); }
  }
});
