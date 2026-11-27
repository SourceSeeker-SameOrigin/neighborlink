const api = require('../../utils/api');

Page({
  data: { loading: true, saving: false, authorizing: false, error: '', phoneError: '', communities: [], buildings: [], units: [],
    communityIndex: 0, buildingIndex: 0, unitIndex: 0, room: '', phone: '', manualPhone: '', phoneVerified: false, contactExpanded: false, contactName: '', contactPhone: '', agreed: false, locationHint: '' },
  onLoad() { this.load(); },
  onShow() { this.hidden = false; if (this.ownerId && !this.currentOwner()) this.load(); },
  onHide() { this.hidden = true; this.readSequence = (this.readSequence || 0) + 1; this.clearOwnerData(); },
  onUnload() { this.closed = true; this.readSequence = (this.readSequence || 0) + 1; this.clearOwnerData(); },
  currentOwner(sequence = this.readSequence) {
    const user = getApp().globalData.user;
    return !this.hidden && !this.closed && sequence === this.readSequence && !!this.ownerId &&
      user?._id === this.ownerId && user?.communityId === this.ownerCommunityId;
  },
  clearOwnerData() {
    this.setData({ communities: [], buildings: [], units: [], communityIndex: 0, buildingIndex: 0,
      unitIndex: 0, room: '', phone: '', manualPhone: '', phoneVerified: false,
      contactName: '', contactPhone: '', agreed: false });
  },
  async load() {
    const sequence = this.readSequence = (this.readSequence || 0) + 1;
    if (this.ownerId && (getApp().globalData.user?._id !== this.ownerId ||
        getApp().globalData.user?.communityId !== this.ownerCommunityId)) this.clearOwnerData();
    this.setData({ loading: true, error: '' });
    try {
      const user = await getApp().ensureSession();
      if (sequence !== this.readSequence || this.hidden || this.closed ||
          getApp().globalData.user?._id !== user._id) return;
      this.ownerId = user._id;
      this.ownerCommunityId = user.communityId;
      const communities = [];
      let page;
      do {
        page = await api.call('catalog', 'listCommunities', { offset: communities.length }, { loading: false, silent: true });
        if (!this.currentOwner(sequence)) return;
        communities.push(...page.list);
      } while (page.hasMore);
      const explicitCommunity = Boolean(user.communityId || wx.getStorageSync('scene'));
      if (!explicitCommunity && communities.some(item => item.location)) {
        try {
          const current = await new Promise((resolve, reject) => wx.getLocation({ type: 'gcj02', success: resolve, fail: reject }));
          if (!this.currentOwner(sequence)) return;
          const candidates = [];
          let nearbyPage, offset = 0;
          do {
            nearbyPage = await api.call('catalog', 'nearbyCommunities', {
              location: { lat: current.latitude, lng: current.longitude }, offset
            }, { loading: false, silent: true });
            if (!this.currentOwner(sequence)) return;
            candidates.push(...nearbyPage.list);
            offset = nearbyPage.nextOffset;
          } while (nearbyPage.hasMore);
          candidates.sort((a, b) => a.distanceKm - b.distanceKm);
          if (candidates.length) communities.splice(0, communities.length, ...candidates);
          else if (this.currentOwner(sequence)) this.setData({ locationHint: '附近 3 公里内暂未找到已配置定位的小区，可在完整列表中选择' });
        } catch (_) { if (this.currentOwner(sequence)) this.setData({ locationHint: '定位或附近查询暂不可用，已显示小区列表，可手动选择' }); }
      }
      communities.forEach(item => { item.displayName = Number.isFinite(item.distanceKm) ? `${item.name} · ${item.distanceKm.toFixed(1)} 公里` : item.name; });
      let selected = { communityId: user.communityId, buildingId: user.buildingId };
      const scene = wx.getStorageSync('scene');
      if (!user.communityId && scene) {
        try { selected = await api.call('catalog', 'resolveScene', { scene }, { loading: false, silent: true }); }
        catch (error) {
          if (error.code !== 'E_INVALID_PARAM') throw error;
          wx.removeStorageSync('scene');
          if (this.currentOwner(sequence)) this.setData({ error: '二维码已失效，请手动选择小区和楼栋' });
        }
      }
      const communityIndex = Math.max(0, communities.findIndex(item => item._id === selected.communityId));
      if (!this.currentOwner(sequence)) return;
      this.setData({ communities, communityIndex, room: user.room || '', phone: user.phone || '', phoneVerified: user.phoneVerified === true });
      if (communities.length) await this.loadBuildings(communities[communityIndex]._id, selected.buildingId, user.unit);
    } catch (error) { if (this.currentOwner(sequence)) this.setData({ error: error.message || '加载失败，请重试' }); }
    finally { if (this.currentOwner(sequence)) this.setData({ loading: false }); }
  },
  async loadBuildings(communityId, buildingId, unit) {
    const request = (this.buildingRequest || 0) + 1;
    this.buildingRequest = request;
    this.setData({ buildings: [], units: [] });
    const community = await api.call('catalog', 'getCommunity', { communityId });
    if (request !== this.buildingRequest || !this.currentOwner()) return;
    const buildings = community.buildings;
    const buildingIndex = Math.max(0, buildings.findIndex(item => item._id === buildingId));
    const units = buildings[buildingIndex] && buildings[buildingIndex].units || [];
    this.setData({ buildings, buildingIndex, units, unitIndex: Math.max(0, units.indexOf(unit)) });
  },
  async communityChange(event) {
    const communityIndex = Number(event.detail.value);
    this.setData({ communityIndex, error: '' });
    try { await this.loadBuildings(this.data.communities[communityIndex]._id); }
    catch (error) { this.setData({ error: error.message }); }
  },
  buildingChange(event) {
    const buildingIndex = Number(event.detail.value);
    this.setData({ buildingIndex, units: this.data.buildings[buildingIndex].units, unitIndex: 0 });
  },
  unitChange(event) { this.setData({ unitIndex: Number(event.detail.value) }); },
  roomChange(event) { this.setData({ room: event.detail.value }); },
  manualPhoneChange(event) { this.setData({ manualPhone: event.detail.value, phoneError: '' }); },
  toggleContact() { this.setData({ contactExpanded: !this.data.contactExpanded }); },
  contactNameChange(event) { this.setData({ contactName: event.detail.value }); },
  contactPhoneChange(event) { this.setData({ contactPhone: event.detail.value }); },
  agreementChange(event) { this.setData({ agreed: event.detail.value.includes('agree') }); },
  async phone(event) {
    if (!this.currentOwner() || this.data.authorizing || this.data.saving) return;
    const sequence = this.readSequence, ownerId = this.ownerId;
    const code = event.detail && event.detail.code;
    if (!code) { this.setData({ phoneError: '未取得手机号授权，可重试或返回首页稍后绑定' }); return; }
    this.setData({ authorizing: true, phoneError: '' });
    try {
      const user = await api.call('user', 'bindPhone', { code });
      if (!this.currentOwner(sequence) || user?._id !== ownerId) return;
      getApp().globalData.user = user;
      this.setData({ phone: user.phone, manualPhone: '', phoneVerified: user.phoneVerified === true, phoneError: '' });
    } catch (error) { if (this.currentOwner(sequence)) this.setData({ phoneError: error.message || '手机号授权失败，请重试' }); }
    finally { if (this.currentOwner(sequence)) this.setData({ authorizing: false }); }
  },
  backHome() { wx.switchTab({ url: '/pages/index/index' }); },
  async save() {
    if (!this.currentOwner() || this.data.saving || this.data.authorizing) return;
    const sequence = this.readSequence, ownerId = this.ownerId;
    if (!this.data.agreed || (!this.data.phone && !this.data.manualPhone.trim()) || !this.data.room.trim()) {
      this.setData({ error: '请先阅读并同意协议、填写联系电话和门牌号' }); return;
    }
    if (this.data.manualPhone && !/^1\d{10}$/.test(this.data.manualPhone.trim())) {
      this.setData({ phoneError: '请输入11位有效联系电话' }); return;
    }
    const { communities, communityIndex, buildings, buildingIndex, units, unitIndex, room, agreed } = this.data;
    if (!communities[communityIndex] || !buildings[buildingIndex] || !units[unitIndex]) {
      this.setData({ error: '请先选择有效的小区、楼栋和单元' }); return;
    }
    this.setData({ saving: true, error: '' });
    try {
      const user = await api.call('user', 'setAddress', { communityId: communities[communityIndex]._id,
        buildingId: buildings[buildingIndex]._id, unit: units[unitIndex], room, contactName: this.data.contactName,
        contactPhone: this.data.contactPhone, phone: this.data.manualPhone.trim() || undefined, privacyAgreed: agreed });
      if (!this.currentOwner(sequence) || user?._id !== ownerId) return;
      getApp().globalData.user = user;
      if (user.welcomeCouponStatus === 'pending') {
        await new Promise(resolve => wx.showModal({ title: '门牌已保存',
          content: '联系电话和门牌已保存。新人赠券暂未完成，可在“我的优惠券”点击“重试领取新人赠券”。',
          showCancel: false, confirmText: '知道了', complete: resolve }));
      }
      wx.switchTab({ url: '/pages/index/index' });
    } catch (error) { if (this.currentOwner(sequence)) this.setData({ error: error.message }); }
    finally { if (this.currentOwner(sequence)) this.setData({ saving: false }); }
  }
});
