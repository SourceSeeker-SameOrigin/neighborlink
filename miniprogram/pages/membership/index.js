const api = require('../../utils/api');
const { yuan } = require('../../utils/money');
const { display } = require('../../utils/time');
const { pay } = require('../../utils/payment');
Page({
  data: { loading: true, ready: false, busy: false, error: '', plans: [], cards: [], addresses: [], addressIndex: 0,
    createdOrderId: '', navigating: false, navigationError: '',
    recoveryPending: false, recoveryHint: '', recoveryPlanName: '', recoveryCanRetry: false,
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
      createdOrderId: '', navigationError: '', recoveryPending: false, recoveryHint: '',
      recoveryPlanName: '', recoveryCanRetry: false, entryPassword: '' });
  },
  async load() {
    if (this.closed || this.hidden) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    const current = () => !this.closed && !this.hidden && sequence === this.sequence;
    if (this.userId && (getApp().globalData.user?._id !== this.userId ||
        getApp().globalData.user?.communityId !== this.ownerCommunityId)) {
      this.receipt = null;
      this.request = null;
      this.pendingPurchase = null;
      this.clearOwnerData();
    }
    const selectedId = this.data.addresses[this.data.addressIndex]?.id;
    this.setData({ loading: true, ready: false, error: '', plans: [], cards: [] });
    try {
      const user = await getApp().ensureSession();
      if (!current()) return;
      if (!user?._id || getApp().globalData.user?._id !== user._id ||
          getApp().globalData.user?.communityId !== user.communityId) throw Error('登录资料已变化，请重试');
      this.userId = user._id;
      this.ownerCommunityId = user.communityId;
      this.receiptKey = 'membershipOrderReceipt:' + user._id;
      this.pendingKey = 'membershipPurchasePending:' + user._id + ':' + (user.communityId || '');
      if (this.receipt && this.receipt.userId !== user._id) this.receipt = null;
      if (!this.receipt) {
        try {
          const saved = wx.getStorageSync(this.receiptKey);
          if (saved && saved.userId === user._id && typeof saved.orderId === 'string' && saved.orderId) this.receipt = saved;
        } catch (_) { /* Local storage failure must not discard an in-memory receipt. */ }
      }
      this.setData({ createdOrderId: this.receipt ? this.receipt.orderId : '', navigating: false, navigationError: '' });
      if (this.receipt) return;
      if (!this.pendingPurchase) {
        try {
          const saved = wx.getStorageSync(this.pendingKey);
          if (saved?.userId === user._id && saved.communityId === user.communityId &&
              typeof saved.requestId === 'string' && saved.requestId) this.pendingPurchase = saved;
        } catch (_) { /* An in-memory request remains available during this page instance. */ }
      }
      if (this.pendingPurchase) {
        const found = await this.lookupPending(sequence);
        if (!this.currentOwner(sequence) || found) return;
      }
      if (!user.buildingId && !(user.addresses && user.addresses.length)) { wx.redirectTo({ url: '/pages/bind/bind' }); return; }
      const addresses = user.addresses && user.addresses.length ? user.addresses : [{ id: '', communityId: user.communityId,
        buildingId: user.buildingId, buildingName: user.buildingName, unit: user.unit, room: user.room, isDefault: true }];
      const pendingAddressValid = !this.pendingPurchase || addresses.some(item =>
        (item.id || null) === (this.pendingPurchase.addressId || null) &&
        item.communityId === this.pendingPurchase.purchaseCommunityId);
      const restoredId = this.pendingPurchase?.addressId || selectedId;
      const previousIndex = restoredId === undefined ? -1 : addresses.findIndex(item => item.id === restoredId);
      const addressIndex = previousIndex >= 0 ? previousIndex : Math.max(0, addresses.findIndex(item => item.isDefault));
      this.setData({ addresses: addresses.map(address => ({ ...address, pickerLabel: this.addressLabel(address) })),
        addressIndex, addressText: this.addressLabel(addresses[addressIndex]),
        slotIndex: this.pendingPurchase?.slot ? Math.max(0, ['morning', 'afternoon', 'evening'].indexOf(this.pendingPurchase.slot)) : this.data.slotIndex,
        entry: this.pendingPurchase?.entry || this.data.entry, entryPassword: '' });
      const [plans, mine] = await Promise.all([api.call('membership', 'plans', { addressId: addresses[addressIndex].id || undefined }, { loading: false, silent: true }),
        api.call('membership', 'mine', {}, { loading: false, silent: true })]);
      if (!current() || !this.currentOwner(sequence)) return;
      const pendingPlan = plans.list.find(plan => plan.code === this.pendingPurchase?.planCode);
      this.setData({ ready: true, plans: plans.list.map(plan => ({ ...plan, priceText: yuan(plan.payAmount), originalText: yuan(plan.price) })),
        recoveryPlanName: pendingPlan?.name || '', recoveryCanRetry: pendingAddressValid && !!pendingPlan,
        recoveryHint: this.pendingPurchase && (!pendingAddressValid || !pendingPlan)
          ? '原地址或计划目前不可用，暂不能再次提交，请联系客服核对上次购买结果。' : this.data.recoveryHint,
        cards: mine.list.map(card => ({ ...card, startText: display(card.startAt), endText: display(card.endAt),
          statusText: { active: '使用中', expired: '已到期', refunded: '已作废' }[card.status] })) });
    } catch (error) { if (current()) {
      this.clearOwnerData();
      this.setData({ error: error.message || '月卡加载失败，请重试' });
    } }
    finally { if (current()) this.setData({ loading: false }); }
  },
  addressLabel(address) {
    return [address.buildingName, address.unit, address.room].filter(Boolean).join(' ');
  },
  async addressChange(event) {
    if (!this.currentOwner() || this.data.busy || this.receipt || this.pendingPurchase) return;
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
  slot(event) { if (!this.pendingPurchase) this.setData({ slotIndex: Number(event.detail.value) }); },
  entry(event) { if (!this.pendingPurchase) this.setData({ entry: ['password', 'key_handover', 'property_keybox'][Number(event.detail.value)], entryPassword: '' }); },
  entryPassword(event) { this.setData({ entryPassword: event.detail.value }); },
  async lookupPending(sequence = this.sequence) {
    const pending = this.pendingPurchase;
    if (!pending || !this.currentOwner(sequence)) return false;
    const found = await api.call('membership', 'lookupBuy', { requestId: pending.requestId },
      { loading: false, silent: true, redirectOnForbidden: false,
        isActive: () => this.currentOwner(sequence) && this.pendingPurchase === pending });
    if (!this.currentOwner(sequence) || this.pendingPurchase !== pending) return false;
    if (!found?.orderId) {
      const plan = this.data.plans.find(item => item.code === pending.planCode);
      const addressValid = this.data.addresses.some(item =>
        (item.id || null) === (pending.addressId || null) && item.communityId === pending.purchaseCommunityId);
      this.setData({ recoveryPending: true,
        recoveryPlanName: plan?.name || '', recoveryCanRetry: !!plan && addressValid,
        recoveryHint: '暂未查到上次月卡订单。请核对原计划、地址和时段，再用原编号确认提交。' });
      return false;
    }
    if (found.planCode !== pending.planCode || found.communityId !== pending.purchaseCommunityId ||
        (found.addressId || null) !== (pending.addressId || null) ||
        (found.slot || null) !== (pending.slot || null) ||
        (found.entry || null) !== (pending.entry || null))
      throw Error('原请求编号对应的月卡内容不一致，请联系客服核对');
    const receipt = { userId: pending.userId, orderId: found.orderId };
    this.receipt = receipt;
    this.pendingPurchase = null;
    try {
      const saved = wx.getStorageSync(this.pendingKey);
      if (saved?.requestId === pending.requestId) wx.removeStorageSync(this.pendingKey);
      wx.setStorageSync(this.receiptKey, receipt);
    } catch (_) { /* The in-memory receipt still blocks a second purchase. */ }
    this.setData({ createdOrderId: receipt.orderId, recoveryPending: false, recoveryHint: '', entryPassword: '' });
    this.openCreatedOrder();
    return true;
  },
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
  buy(event) { return this.purchase(event.currentTarget.dataset.code, false); },
  retryPending() { if (this.data.recoveryCanRetry) return this.purchase(this.pendingPurchase?.planCode, true); },
  async purchase(planCode, retry) {
    if (!this.currentOwner() || this.data.busy) return;
    if (this.receipt) { this.openCreatedOrder(); return; }
    if (this.data.loading || !this.data.ready) return;
    if (!this.data.plans.some(plan => plan.code === planCode)) return;
    const slot = ['trash_monthly', 'visit_monthly'].includes(planCode)
      ? ['morning', 'afternoon', 'evening'][this.data.slotIndex] : null;
    const address = this.data.addresses[this.data.addressIndex];
    const addressId = address && address.id || undefined;
    const userId = this.userId;
    const receiptKey = this.receiptKey;
    const pendingKey = this.pendingKey;
    const sequence = this.sequence;
    const current = () => !this.closed && !this.hidden && this.sequence === sequence &&
      getApp().globalData.user?._id === userId && this.userId === userId &&
      getApp().globalData.user?.communityId === this.ownerCommunityId;
    this.purchasePending = true;
    this.setData({ busy: true, error: '' });
    try {
      const fields = { planCode, slot, addressId, entry: this.data.entry, entryPassword: this.data.entryPassword };
      if (this.pendingPurchase && !retry) throw Error('请先核对上次月卡购买结果');
      if (retry && (!this.pendingPurchase || !this.data.recoveryPending ||
          this.pendingPurchase.planCode !== planCode || this.pendingPurchase.slot !== slot ||
          (this.pendingPurchase.addressId || null) !== (addressId || null) ||
          this.pendingPurchase.entry !== (planCode === 'vacant_monthly' ? this.data.entry : null)))
        throw Error('原月卡信息已变化，请恢复原选择后重试');
      if (retry && planCode === 'vacant_monthly' && this.data.entry === 'password' && !this.data.entryPassword)
        throw Error('请重新填写入户密码后确认');
      if (!this.request || JSON.stringify(this.request.fields) !== JSON.stringify(fields)) this.request = {
        fields, requestId: retry ? this.pendingPurchase.requestId : Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) };
      if (!this.pendingPurchase) this.pendingPurchase = {
        userId, communityId: this.ownerCommunityId, purchaseCommunityId: address?.communityId || this.ownerCommunityId,
        requestId: this.request.requestId, planCode, slot, addressId: addressId || null,
        entry: planCode === 'vacant_monthly' ? this.data.entry : null
      };
      try { wx.setStorageSync(pendingKey, this.pendingPurchase); }
      catch (_) { this.pendingPurchase = null; this.request = null;
        throw Error('无法保存本次购买编号，请稍后重试'); }
      const requestBody = { planCode, slot, addressId, requestId: this.request.requestId };
      if (planCode === 'vacant_monthly') Object.assign(requestBody, { entry: this.data.entry, entryPassword: this.data.entryPassword });
      const created = await api.call('membership', 'buy', requestBody);
      if (!created || typeof created.orderId !== 'string' || !created.orderId) throw Error('未取得订单编号，请重试');
      const receipt = { userId, orderId: created.orderId };
      if (this.userId === userId) this.receipt = receipt;
      this.request = null;
      const pending = this.pendingPurchase;
      this.pendingPurchase = null;
      try {
        const saved = wx.getStorageSync(pendingKey);
        if (saved?.requestId === pending?.requestId) wx.removeStorageSync(pendingKey);
      } catch (_) { /* Rechecking the same request remains safe if local removal fails. */ }
      try { wx.setStorageSync(receiptKey, receipt); } catch (_) { /* Keep the in-memory lock even when storage fails. */ }
      if (!current()) return;
      this.setData({ createdOrderId: receipt.orderId, recoveryPending: false, recoveryHint: '', entryPassword: '', navigationError: '' });
      try { await pay(created, current); }
      catch (error) { if (current()) wx.showToast({ title: error.message || '支付未完成，可到订单页重试', icon: 'none' }); }
      if (current()) this.openCreatedOrder();
    } catch (error) { if (current()) {
      this.setData({ error: error.message });
      if (this.pendingPurchase) {
        try { await this.lookupPending(sequence); }
        catch (_) { if (current()) this.setData({ ready: false, error: '购买结果待核对，请点击重新加载' }); }
      }
    } }
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
