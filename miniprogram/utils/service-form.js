const api = require('./api');
const { yuan, toFen } = require('./money');
const { slotText, ymd, addDays } = require('./time');
const { pay } = require('./payment');

const defaults = { express: { pickupText: '', largeCount: '0', stationIndex: 0, placementIndex: 0 },
  trash: { bags: '1', sorted: false }, buy: { shop: '就近便利店', items: '', goodsYuan: '50' },
  meal: { canteenIndex: 0, items: '', goodsYuan: '50' },
  escort: { hospital: '', department: '', date: '', start: '09:00', blocks: '1', pickup: false },
  help: { categoryIndex: 0, desc: '', blocks: '1' },
  pet: { dates: [], visitsPerDay: '1', catCount: '1', dogCount: '0', otherCount: '0', tasks: ['feed','water'], entryIndex: 1, entryPassword: '' } };

const petTasks = [
  { value: 'feed', label: '喂食' }, { value: 'water', label: '换水' },
  { value: 'litter', label: '清理猫砂' }, { value: 'walk', label: '遛狗' }, { value: 'play', label: '陪玩' }
];

function petTaskChoices(selected) {
  return petTasks.map(task => ({ ...task, checked: selected.includes(task.value) }));
}

// Only known, non-secret fields may survive a page session.
function draftForm(serviceCode, form) {
  const keys = Object.keys(defaults[serviceCode]).filter(key => key !== 'entryPassword').concat('note');
  return Object.fromEntries(keys.filter(key => Object.prototype.hasOwnProperty.call(form, key)).map(key => [key, form[key]]));
}

module.exports = function serviceForm(serviceCode, escortStartHint) {
  const place = {
    express: { list: 'stations', field: 'stationIndex', prompt: '请选择取件驿站' },
    meal: { list: 'canteens', field: 'canteenIndex', prompt: '请选择合作食堂' }
  }[serviceCode];
  return {
    data: { placeOptions: [], placeNeedsSelection: false, serviceCode, loading: true, error: '', quoteError: '', saving: false, quoteLoading: false,
      createdOrderId: '', recoveryHint: '', couponChoice: '__auto', navigating: false, navigationError: '',
      community: null, addressText: '', addresses: [], addressIndex: 0, form: { ...defaults[serviceCode], note: '' }, slots: [], slotIndex: 0,
      quote: null, amount: '--', couponOptions: [], couponsEnabled: false, pointsEnabled: false, pointsBalance: 0,
      pointsToUse: 0, visitsPerDayOptions: [1,2], entryMethods: ['门锁密码','当面交钥匙','物业钥匙盒'],
      taskChoices: petTaskChoices(defaults.pet.tasks),
      petDateStart: '', petHasExpiredDates: false, placements: ['放门口', '当面交'], categories: ['搬重物 / 桶装水上楼', '陪老人线下办事', '其他'] },
    onLoad(options) {
      if (serviceCode === 'help' && options && options.idleTitle) {
        const title = options.idleTitle;
        const desc = options.idleDesc || '';
        this.idlePrefill = { categoryIndex: 0,
          desc: ('请帮忙搬运：' + title + (desc ? '。' + desc : '')).slice(0, 200) };
      }
    },
    onShow() { this.hidden = false; this.load(); },
    invalidateRequests() {
      clearTimeout(this.bookingMidnightTimer);
      clearTimeout(this.quoteTimer);
      this.quoteSequence = (this.quoteSequence || 0) + 1;
      this.addressSequence = (this.addressSequence || 0) + 1;
      this.loadSequence = (this.loadSequence || 0) + 1;
    },
    onHide() { this.hidden = true; this.invalidateRequests(); },
    onUnload() { this.unloaded = true; this.invalidateRequests(); },
    currentOwner() {
      const user = getApp().globalData.user;
      return !this.hidden && !this.unloaded && !!this.ownerId && user?._id === this.ownerId &&
        user?.communityId === this.ownerCommunityId;
    },
    async load() {
      this.invalidateRequests();
      const sequence = this.loadSequence;
      if (this.ownerId && (getApp().globalData.user?._id !== this.ownerId ||
          getApp().globalData.user?.communityId !== this.ownerCommunityId)) {
        this.createdOrderId = ''; this.request = null; this.pendingSlot = null; this.draftPlace = undefined;
        this.setData({ createdOrderId: '', form: { ...defaults[serviceCode], note: '' }, addresses: [],
          recoveryHint: '', restoredDraft: false, couponChoice: '__auto', pointsToUse: 0,
          ...(serviceCode === 'pet' ? { taskChoices: petTaskChoices(defaults.pet.tasks) } : {}) });
      }
      this.setData({ loading: true, error: '', community: null, quote: null, amount: '--' });
      try {
        const user = await getApp().ensureSession();
        if (sequence !== this.loadSequence || this.hidden || this.unloaded ||
            getApp().globalData.user?._id !== user._id || getApp().globalData.user?.communityId !== user.communityId) return;
        const key = 'orderDraft:' + user._id + ':' + serviceCode;
        if (this.draftKey && key !== this.draftKey) {
          this.createdOrderId = ''; this.request = null; this.pendingSlot = null; this.draftPlace = undefined;
          this.setData({ createdOrderId: '', form: { ...defaults[serviceCode], note: '' }, addresses: [],
            ...(serviceCode === 'pet' ? { taskChoices: petTaskChoices(defaults.pet.tasks) } : {}),
            recoveryHint: '', restoredDraft: false, couponChoice: '__auto', pointsToUse: 0, saving: false });
        }
        this.draftKey = key;
        this.ownerId = user._id;
        this.ownerCommunityId = user.communityId;
        const selection = this.restoreDraft(user);
        if (this.createdOrderId) return;
        if (this.request) {
          const result = await api.call('order', 'lookupRequest', { requestId: this.request.id }, { loading: false, silent: true, redirectOnForbidden: false });
          if (sequence !== this.loadSequence || !this.currentOwner()) return;
          if (this.createdOrderId) return;
          if (!result || !Object.prototype.hasOwnProperty.call(result, 'orderId') ||
              (result.orderId !== null && (typeof result.orderId !== 'string' || !result.orderId))) throw Error('未能核实上次提交，请重新查询');
          if (result.orderId) {
            this.createdOrderId = result.orderId;
            this.request = null;
            this.setData({ createdOrderId: result.orderId });
            try { this.saveDraft(); } catch (_) { /* The request ID is still saved. */ }
            this.openCreatedOrder();
            return;
          }
          this.setData({ recoveryHint: '暂未查到上次订单。请核对地址、时段和金额，再确认提交。' +
            (serviceCode === 'pet' && Number(this.data.form.entryIndex) === 0 ? '请重新填写入户密码。' : '') });
        }
        if (!user.buildingId) { wx.redirectTo({ url: '/pages/bind/bind' }); return; }
        if (serviceCode === 'escort' || serviceCode === 'pet') this.watchBookingDates();
        if (this.idlePrefill && !this.request) this.setData({ form: { ...this.data.form, ...this.idlePrefill } });
        const addresses = user.addresses && user.addresses.length ? user.addresses : [{ id: '', communityId: user.communityId,
          buildingId: user.buildingId, buildingName: user.buildingName, unit: user.unit, room: user.room,
          contactName: '', contactPhone: user.phone, isDefault: true }];
        const selected = selection || this.data.addresses[this.data.addressIndex];
        const previousIndex = selected ? addresses.findIndex(item => item.id === selected.id && item.communityId === selected.communityId) : -1;
        const addressIndex = previousIndex >= 0 ? previousIndex : Math.max(0, addresses.findIndex(item => item.isDefault));
        this.setData({ addresses, addressIndex });
        if (this.request && selected && previousIndex < 0) this.setData({ recoveryHint: '原服务地址已不可用，请核对当前地址后再提交。' });
        await this.addressChange({ detail: { value: addressIndex } });
      } catch (error) { if (sequence === this.loadSequence && this.currentOwner()) this.setData({ error: error.message || '加载失败，请重试' }); }
      finally { if (sequence === this.loadSequence && this.currentOwner()) this.setData({ loading: false }); }
    },
    restoreDraft(user) {
      if (this.createdOrderId) { this.setData({ createdOrderId: this.createdOrderId, navigating: false }); return; }
      const draft = wx.getStorageSync(this.draftKey);
      if (draft && draft.userId === user._id && typeof draft.createdOrderId === 'string' && draft.createdOrderId) {
        this.createdOrderId = draft.createdOrderId;
        this.setData({ createdOrderId: draft.createdOrderId });
        return;
      }
      // A missing create response can outlive an ordinary 24-hour form draft.
      if (!draft || draft.userId !== user._id || (!draft.request &&
          (draft.communityId !== user.communityId || Date.now() - draft.savedAt > 86400000))) {
        if (draft) wx.removeStorageSync(this.draftKey);
        this.request = null;
        this.draftPlace = undefined;
        return;
      }
      const form = draftForm(serviceCode, draft.form || {});
      if (place) this.draftPlace = draft.place || null;
      const request = draft.request && typeof draft.request.id === 'string' ? { id: draft.request.id } : null;
      let selection = draft.selection || {};
      if (request && !draft.selection && typeof draft.request.signature === 'string') {
        try { selection = JSON.parse(draft.request.signature) || {}; } catch (_) { /* Look up by ID first. */ }
      }
      const { addressId, communityId, couponId, pointsToUse } = selection;
      this.request = request;
      this.pendingSlot = draft.slot;
      if (request && serviceCode === 'pet') this.setData({ 'form.entryPassword': '' });
      const restoredForm = { ...this.data.form, ...form };
      this.setData({ form: restoredForm, restoredDraft: true,
        ...(serviceCode === 'pet' ? { taskChoices: petTaskChoices(restoredForm.tasks) } : {}),
        couponChoice: couponId ?? '__auto', pointsToUse: pointsToUse ?? 0 });
      wx.setStorageSync(this.draftKey, { userId: user._id, communityId: draft.communityId,
        savedAt: draft.savedAt, form, slot: draft.slot, request, ...(place ? { place: this.draftPlace } : {}), selection: { addressId, communityId, couponId, pointsToUse } });
      return communityId ? { id: addressId || '', communityId } : null;
    },
    saveDraft() {
      const user = getApp().globalData.user;
      if (!this.draftKey || !user || !user._id || (this.ownerId && this.ownerId !== user._id) ||
          (this.ownerCommunityId && this.ownerCommunityId !== user.communityId)) return;
      if (this.createdOrderId) {
        wx.setStorageSync(this.draftKey, { userId: user._id, createdOrderId: this.createdOrderId });
        return;
      }
      const slot = this.data.slots[this.data.slotIndex] && this.data.slots[this.data.slotIndex].value;
      const address = this.data.addresses[this.data.addressIndex];
      wx.setStorageSync(this.draftKey, { userId: user._id, communityId: user.communityId, savedAt: Date.now(),
        form: draftForm(serviceCode, this.data.form), ...(place ? { place: this.draftPlace || null } : {}), slot, request: this.request ? {id: this.request.id} : null,
        selection: { addressId: address && address.id, communityId: address && address.communityId,
          couponId: this.data.couponChoice === '__auto' ? null : this.data.couponChoice, pointsToUse: this.data.pointsToUse } });
    },
    address() { wx.navigateTo({ url: '/pages/bind/bind' }); },
    couponChange(event) {
      this.setData({ couponChoice: event.detail.value });
      this.saveDraft();
      this.queueQuote();
    },
    pointsChange(event) {
      const value = event.detail.value === '' ? 0 : Number(event.detail.value);
      this.setData({ pointsToUse: value, quote: null, amount: '--' });
      this.saveDraft();
      this.queueQuote();
    },
    checkEscortDate(now = new Date()) {
      const start = ymd(now), end = ymd(addDays(now, 30));
      const date = this.data.form.date || ymd(addDays(now, 1));
      const reselect = date < start || date > end;
      if (start !== this.data.escortDateStart || date !== this.data.form.date || reselect !== this.data.escortDateNeedsSelection) {
        this.setData({ escortDateStart: start, escortDateEnd: end, 'form.date': date, escortDateNeedsSelection: reselect });
      }
      if (escortStartHint && this.data.community) {
        const hint = reselect ? '' : escortStartHint(this.data.community.dutyWindows, date, this.data.form.blocks, now);
        if (hint !== this.data.escortStartHint) this.setData({ escortStartHint: hint });
      }
      if (reselect) {
        this.quoteSequence = (this.quoteSequence || 0) + 1;
        this.setData({ quote: null, amount: '--', quoteLoading: false, quoteError: '' });
      }
      return !reselect;
    },
    checkBookingDates(now = new Date()) {
      if (serviceCode === 'escort') return this.checkEscortDate(now);
      if (serviceCode !== 'pet') return true;
      const tomorrow = ymd(addDays(now, 1));
      const expired = this.data.form.dates.some(date => date < tomorrow);
      if (tomorrow !== this.data.petDateStart || expired !== this.data.petHasExpiredDates) {
        this.setData({ petDateStart: tomorrow, petHasExpiredDates: expired });
      }
      if (expired) {
        this.quoteSequence = (this.quoteSequence || 0) + 1;
        this.setData({ quote: null, amount: '--', quoteLoading: false, quoteError: '' });
      }
      return !expired;
    },
    watchBookingDates() {
      const now = new Date();
      this.checkBookingDates(now);
      const midnight = Date.parse(ymd(addDays(now, 1)) + 'T00:00:00+08:00');
      const delay = serviceCode === 'escort' && this.data.form.date === ymd(now)
        ? 60000 - (now.getTime() % 60000) : midnight - now.getTime();
      clearTimeout(this.bookingMidnightTimer);
      this.bookingMidnightTimer = setTimeout(() => {
        if (!this.hidden && !this.unloaded && !this.createdOrderId) this.watchBookingDates();
      }, delay);
    },
    placeFields(community) {
      if (!place) return {};
      const options = community[place.list] || [];
      const saved = this.draftPlace;
      let index = options.length ? 0 : -1;
      if (saved !== undefined) {
        index = saved && saved.communityId === community._id ? options.findIndex(item => item.code === saved.code) : -1;
      }
      if (index >= 0) this.draftPlace = { communityId: community._id, code: options[index].code };
      return { ['form.' + place.field]: index, placeNeedsSelection: index < 0,
        placeOptions: [place.prompt, ...options.map(item => item.name)] };
    },
    selectPlace(event) {
      this.change({ currentTarget: { dataset: { field: place.field } }, detail: { value: Number(event.detail.value) - 1 } });
    },
    async addressChange(event) {
      const addressIndex = Number(event.detail.value);
      const address = this.data.addresses[addressIndex];
      if (!address) return;
      clearTimeout(this.quoteTimer);
      this.quoteSequence = (this.quoteSequence || 0) + 1;
      const sequence = this.addressSequence = (this.addressSequence || 0) + 1;
      const current = () => sequence === this.addressSequence && !this.hidden && !this.unloaded;
      this.setData({ addressIndex, community: null, quote: null, amount: '--', addressText: '',
        slots: [], slotIndex: 0, error: '', quoteError: '', quoteLoading: true });
      try {
        const community = await api.call('catalog', 'getCommunity', { communityId: address.communityId }, { loading: false, silent: true });
        if (!current()) return;
        this.setData({ community, ...this.placeFields(community), addressText: community.name + ' ' + address.buildingName + ' ' + address.unit + ' ' + address.room });
        if (serviceCode === 'escort') this.checkEscortDate();
        this.queueQuote();
      } catch (error) {
        if (current()) this.setData({ error: error.message || '地址加载失败', quoteLoading: false });
      }
    },
    change(event) {
      const key = event.currentTarget.dataset.field;
      if (!Object.prototype.hasOwnProperty.call(this.data.form, key)) return;
      if (place && key === place.field) {
        const community = this.data.community;
        if (!community) return;
        const chosen = (community[place.list] || [])[Number(event.detail.value)];
        this.draftPlace = chosen ? { communityId: community._id, code: chosen.code } : null;
        this.setData({ placeNeedsSelection: !chosen });
      }
      const value = place && key === place.field ? Number(event.detail.value) : key === 'sorted' ? event.detail.value.includes('sorted') :
        key === 'visitsPerDay' ? String(Number(event.detail.value) + 1) :
        key === 'entryIndex' ? Number(event.detail.value) : event.detail.value;
      this.setData({ ['form.' + key]: value, quote: null, amount: '--', quoteError: '',
        ...(key === 'tasks' ? { taskChoices: petTaskChoices(value) } : {}) });
      if (serviceCode === 'escort' && key === 'date') this.watchBookingDates();
      if (serviceCode === 'escort' && key === 'blocks') this.checkEscortDate();
      this.saveDraft();
      this.queueQuote();
    },
    addPetDate(event) {
      if (serviceCode !== 'pet') return;
      this.checkBookingDates();
      const date = event.detail.value;
      const original = event.currentTarget?.dataset?.date;
      const dates = this.data.form.dates;
      if (!date || date < this.data.petDateStart) {
        wx.showToast({ title: '请选择北京时间明天或之后的日期', icon: 'none' });
        return;
      }
      if (original && (!dates.includes(original) || original >= this.data.petDateStart)) return;
      if (dates.includes(date)) {
        wx.showToast({ title: '该服务日期已选', icon: 'none' });
        return;
      }
      if (!original && dates.length >= 15) {
        wx.showToast({ title: '最多选择 15 个服务日期', icon: 'none' });
        return;
      }
      this.setPetDates([...dates.filter(item => item !== original), date].sort());
    },
    removePetDate(event) {
      this.setPetDates(this.data.form.dates.filter(date => date !== event.currentTarget.dataset.date));
    },
    setPetDates(dates) {
      this.setData({ 'form.dates': dates, quote: null, amount: '--', quoteError: '' });
      this.saveDraft();
      if (this.checkBookingDates()) this.queueQuote();
    },
    slotChange(event) { this.setData({ slotIndex: Number(event.detail.value), quote: null, amount: '--' }); this.saveDraft(); this.queueQuote(); },
    queueQuote() {
      clearTimeout(this.quoteTimer);
      this.quoteSequence = (this.quoteSequence || 0) + 1;
      this.setData({ quote: null, amount: '--', quoteLoading: true });
      this.quoteTimer = setTimeout(() => this.refreshQuote(), 300);
    },
    params() {
      const form = this.data.form;
      const community = this.data.community;
      let detail;
      if (serviceCode === 'express') detail = { stationCode: ((community.stations || [])[Number(form.stationIndex)] || {}).code || '',
        pickupCodes: form.pickupText.split(/[\n,，]/).map(value => value.trim()).filter(Boolean),
        largeCount: Number(form.largeCount), placement: Number(form.placementIndex) === 1 ? 'hand' : 'door' };
      if (serviceCode === 'trash') detail = { bags: Number(form.bags), sorted: form.sorted, placement: 'door' };
      if (serviceCode === 'buy') detail = { shop: form.shop, items: form.items, goodsCap: toFen(form.goodsYuan) };
      if (serviceCode === 'meal') detail = { canteenCode: ((community.canteens || [])[Number(form.canteenIndex)] || {}).code || '',
        items: form.items, goodsCap: toFen(form.goodsYuan) };
      if (serviceCode === 'escort') detail = { hospital: form.hospital, department: form.department, date: form.date,
        start: form.start, blocks: Number(form.blocks), pickup: form.pickup };
      if (serviceCode === 'pet') {
        const pets = [{ kind: 'cat', count: Number(form.catCount) }, { kind: 'dog', count: Number(form.dogCount) },
          { kind: 'other', count: Number(form.otherCount) }].filter(item => item.count > 0);
        detail = { dates: form.dates, visitsPerDay: Number(form.visitsPerDay), pets, tasks: form.tasks,
          entry: ['password','key_handover','property_keybox'][Number(form.entryIndex)], entryPassword: form.entryPassword };
      }
      if (serviceCode === 'help') {
        const help = community.prices && community.prices.help || {};
        detail = { category: ['carry', 'elder', 'other'][Number(form.categoryIndex)], desc: form.desc,
          ...(help.billingMode === 'per_visit' ? { billingMode: 'per_visit', includedMinutes: help.includedMinutes } : { blocks: Number(form.blocks) }) };
      }
      const address = this.data.addresses[this.data.addressIndex];
      const params = { communityId: community._id, addressId: address && address.id || undefined, serviceCode, detail, note: form.note,
        slot: serviceCode === 'escort' ? undefined : (this.data.slots[this.data.slotIndex] ? this.data.slots[this.data.slotIndex].value : undefined) };
      if (this.data.couponChoice !== '__auto') params.couponId = this.data.couponChoice;
      if (this.data.pointsEnabled || this.data.pointsToUse) params.pointsToUse = Number(this.data.pointsToUse || 0);
      return params;
    },
    async refreshQuote() {
      if (!this.data.community || !this.currentOwner()) return;
      if (!this.checkBookingDates()) return;
      const sequence = (this.quoteSequence || 0) + 1;
      this.quoteSequence = sequence;
      this.setData({ quoteLoading: true, quoteError: '' });
      try {
        // metadata 模式允许未填完表单时先取得有效时段及月卡提示，不生成订单。
        const result = await api.call('order', 'quote', { ...this.params(), metadata: true }, { loading: false, silent: true });
        if (sequence !== this.quoteSequence || !this.currentOwner()) return;
        const selected = this.data.slots[this.data.slotIndex];
        const slots = (result.onDutyCount > 0 ? [{ label: '尽快上门', value: null }] : [])
          .concat(result.slots.map(value => ({ label: slotText(value), value })));
        const sameSlot = selected ? slots.findIndex(item => JSON.stringify(item.value) === JSON.stringify(selected.value)) : 0;
        this.setData({ slots, slotIndex: Math.max(0, sameSlot), hasTrashMembership: result.hasTrashMembership,
          couponOptions: (result.couponOptions || []).map(item => ({ ...item, label: item.name + ' · 减 ¥' + yuan(item.discount) })),
          couponsEnabled: result.couponsEnabled === true, pointsEnabled: result.pointsEnabled === true,
          pointsBalance: result.pointsBalance || 0,
          dutyHint: result.onDutyCount > 0 ? '' : slots.length ? '当前暂无服务员值班，可选择服务时段预约，实际服务以接单确认为准' : '暂时没有可预约时段',
          quote: result.pricing, amount: result.pricing ? yuan(result.pricing.payAmount + result.pricing.goodsCap) : '--', quoteError: result.validationMessage || '' });
        if (this.pendingSlot) {
          const restoredIndex = slots.findIndex(item => JSON.stringify(item.value) === JSON.stringify(this.pendingSlot));
          this.pendingSlot = null;
          if (restoredIndex >= 0 && restoredIndex !== this.data.slotIndex) {
            this.setData({ slotIndex: restoredIndex, quote: null, amount: '--' });
            await this.refreshQuote();
            return;
          }
          if (restoredIndex < 0 && this.request) this.setData({ recoveryHint: this.data.recoveryHint + ' 原时段已不可用，请核对新的时段。' });
        }
      } catch (error) {
        if (sequence === this.quoteSequence && this.currentOwner()) this.setData({ quote: null, amount: '--', quoteError: error.message || '报价失败，请重试' });
      } finally { if (sequence === this.quoteSequence && this.currentOwner()) this.setData({ quoteLoading: false }); }
    },
    retryQuote() { return this.data.community ? this.refreshQuote() : this.addressChange({ detail: { value: this.data.addressIndex } }); },
    openCreatedOrder() {
      if (!this.createdOrderId || this.data.navigating || !this.currentOwner()) return;
      this.setData({ navigating: true, navigationError: '' });
      const key = this.draftKey;
      const orderId = this.createdOrderId;
      const failed = () => {
        if (this.currentOwner()) this.setData({ navigating: false,
          navigationError: '订单已创建，暂未打开详情，请点击下方按钮重试。不会重复下单。' });
      };
      try {
        wx.redirectTo({ url: '/pages/orders/detail?id=' + encodeURIComponent(this.createdOrderId),
          success: () => {
            // A newer page may already own this draft key. Only clear our own receipt.
            try {
              const saved = key && wx.getStorageSync(key);
              if (saved && saved.createdOrderId === orderId) wx.removeStorageSync(key);
            } catch (_) { /* Keep the receipt for recovery if local storage is unavailable. */ }
          }, fail: failed });
      } catch (_) { failed(); }
    },
    async submit() {
      if (this.data.saving || this.hidden || this.unloaded) return;
      if (this.createdOrderId) { this.openCreatedOrder(); return; }
      if (!this.checkBookingDates()) return;
      if (serviceCode === 'pet' && !this.data.form.dates.length) return;
      if (!this.data.community || this.data.loading || this.data.placeNeedsSelection || !this.data.quote || this.data.quoteLoading) return;
      const user = getApp().globalData.user;
      const key = this.draftKey;
      if (!key || !user || !user._id || (this.ownerId && this.ownerId !== user._id) ||
          (this.ownerCommunityId && this.ownerCommunityId !== user.communityId)) return;
      const sameSession = () => this.draftKey === key && getApp().globalData.user?._id === user._id &&
        getApp().globalData.user?.communityId === user.communityId;
      const sequence = this.loadSequence;
      const visible = () => sameSession() && !this.hidden && !this.unloaded && sequence === this.loadSequence;
      this.setData({ saving: true, error: '' });
      try {
        const params = this.params();
        if (!this.request) this.request = {
          id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) };
        this.saveDraft();
        const requestId = this.request.id;
        const created = await api.call('order', 'create', { ...params, requestId }, { isActive: visible });
        if (!created || typeof created.orderId !== 'string' || !created.orderId) throw Error('未取得订单编号，请重试');
        try {
          const saved = wx.getStorageSync(key);
          if (saved?.userId === user._id && saved.request?.id === requestId) {
            wx.setStorageSync(key, { userId: user._id, createdOrderId: created.orderId });
          }
        } catch (_) { /* The pending request can still recover the order. */ }
        if (!sameSession() || this.createdOrderId) return;
        this.createdOrderId = created.orderId;
        this.request = null;
        if (!visible()) return;
        this.setData({ createdOrderId: created.orderId, navigationError: '' });
        try { await pay(created, visible); }
        catch (error) { if (visible()) wx.showToast({ title: error.message || '支付未完成，可到订单详情继续支付', icon: 'none' }); }
        if (visible()) this.openCreatedOrder();
      } catch (error) { if (visible()) this.setData({ error: error.message || '下单失败，请重试' }); }
      finally { if (sameSession() && !this.unloaded) this.setData({ saving: false }); }
    }
  };
};
