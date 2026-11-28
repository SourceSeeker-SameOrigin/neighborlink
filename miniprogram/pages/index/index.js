const api = require('../../utils/api');
const { lifecycle, readList } = require('../../utils/visible-list');
const serviceCatalog = require('../../utils/service-catalog');
const CORE_SERVICES = [
  { code: 'express', name: '代取快递', icon: 'express', subtitle: '取件送到门口' },
  { code: 'trash', name: '代扔垃圾', icon: 'trash', subtitle: '省心清理日常' },
  { code: 'buy', name: '周边代买', icon: 'buy', subtitle: '生活所需代买' },
  { code: 'help', name: '帮把手', icon: 'help', subtitle: '搬运与生活协助' }
];
Page({
  data: { loading: true, error: '', community: null, firstOrder: false,
    notice: null, ads: [], needsBinding: true, eventsEnabled: false,
    services: CORE_SERVICES, serviceCatalog },
  ...lifecycle,
  currentHome() {
    const user = getApp().globalData.user;
    return !this._hidden && !this._unloaded && this.homeOwnerId === user?._id &&
      this.homeCommunityId === user?.communityId && (this.data.needsBinding || this.data.community?._id === this.homeCommunityId);
  },
  load() {
    const initial = { community: null, notice: null, ads: [], needsBinding: true, firstOrder: false,
      eventsEnabled: false, services: CORE_SERVICES, serviceCatalog: serviceCatalog.map(item => ({ ...item, statusText: '待完善资料' })) };
    this.homeOwnerId = null;
    this.homeCommunityId = null;
    getApp().globalData.community = null;
    return readList(this, initial, '加载失败，请重试', async (user, options) => {
      const app = getApp();
      if (!user.communityId || !user.buildingId) {
        app.globalData.community = null;
        this.homeOwnerId = user._id;
        this.homeCommunityId = user.communityId;
        return { needsBinding: true, services: CORE_SERVICES.map(item => ({ ...item, url: '/pages/bind/bind' })) };
      }
      const community = await api.call('catalog', 'getCommunity', { communityId: user.communityId }, options);
      if (!options.isActive()) return;
      let homeContent = { notice: null, ads: [] };
      try { homeContent = await api.call('content', 'homeContent', { communityId: community._id }, options); } catch (_) {}
      if (!options.isActive()) return;
      const features = community.enabledFeatures || {};
      const services = [...CORE_SERVICES];
      if (features.recycle) services.push({ code: 'recycle', name: '回收上门', icon: 'recycle', subtitle: '预约分类回收', url: '/recycle/order/order' });
      app.globalData.community = community;
      this.homeOwnerId = user._id;
      this.homeCommunityId = user.communityId;
      return { community, needsBinding: false, firstOrder: !user.firstPaidAt, services, eventsEnabled: features.events === true,
        notice: homeContent.notice, ads: homeContent.ads || [], serviceCatalog: serviceCatalog.map(item => ({ ...item, statusText: features[item.feature] ? '可使用' : '未开通' })) };
    });
  },
  introduce(event) {
    if (!this.currentHome()) return;
    const item = serviceCatalog.find(service => service.code === event.currentTarget.dataset.code);
    if (!item) return;
    if (this.data.needsBinding) { wx.navigateTo({ url: '/pages/bind/bind' }); return; }
    const features = this.data.community && this.data.community.enabledFeatures || {};
    if (!features[item.feature]) {
      wx.showModal({ title: item.name + '暂未开通', content: item.description + '\n本小区尚未开放此功能，请联系运营方了解进度。', showCancel: false, confirmText: '知道了', confirmColor: '#1F7A5C' });
      return;
    }
    if (item.code === 'federation') {
      const url = features.board ? '/board/list/list' : features.idle ? '/idle/list/list' : features.events ? '/events/list/list' : '';
      if (url) wx.navigateTo({ url });
      return;
    }
    if (item.tab) wx.switchTab({ url: item.url });
    else wx.navigateTo({ url: item.url });
  },
  callHotline() {
    if (!this.currentHome()) return;
    const phoneNumber = this.data.community && this.data.community.hotline;
    if (phoneNumber && phoneNumber !== '400-000-0000') wx.makePhoneCall({ phoneNumber });
    else wx.showToast({ title: '客服电话暂未配置', icon: 'none' });
  },
  recordAd(event) {
    if (!this.currentHome()) return;
    const adId = event.currentTarget.dataset.id;
    const type = event.type === 'tap' ? 'ad_click' : 'ad_view';
    const communityId = this.data.community && this.data.community._id;
    if (adId && communityId && this.data.ads.some(item => item._id === adId)) api.call('content', 'adEvent', { adId, communityId, type }, { loading: false, silent: true }).catch(() => {});
  },
  openAd(event) {
    if (!this.currentHome()) return;
    const ad = this.data.ads.find(item => item._id === event.currentTarget.dataset.id);
    if (!ad || !ad.target) return;
    this.recordAd(event);
    if (ad.target.type === 'page' && ad.target.path) wx.navigateTo({ url: ad.target.path });
    else if (ad.target.type === 'merchant' && ad.target.id) wx.navigateTo({ url: '/shops/detail/detail?merchantId=' + encodeURIComponent(ad.target.id) });
    else if (ad.target.type === 'event' && ad.target.id) wx.navigateTo({ url: '/events/detail/detail?id=' + encodeURIComponent(ad.target.id) });
    else wx.showToast({ title: '该广告目标暂不可用', icon: 'none' });
  },
  openNotices() { if (this.currentHome()) wx.navigateTo({ url: '/notices/list/list' }); }
});
