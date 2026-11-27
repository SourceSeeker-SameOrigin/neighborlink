const api = require('../../utils/api');
const { display } = require('../../utils/time');
const { yuan } = require('../../utils/money');
const { lifecycle, readList } = require('../../utils/visible-list');

Page({
  ...lifecycle,
  data: { loading: false, error: '', needsBinding: true, list: [], scope: 'community', federationEnabled: false, hasMore: false },
  onHide() { lifecycle.onHide.call(this); this.setData({ list: [], hasMore: false, needsBinding: true }); },
  onUnload() { lifecycle.onUnload.call(this); this.setData({ list: [], hasMore: false, needsBinding: true }); },
  load(reset = true) {
    const append = reset === false;
    const { scope, list } = this.data;
    const owner = getApp().globalData.user;
    const sameOwner = this.listOwnerId === owner?._id && this.listCommunityId === owner?.communityId;
    return readList(this, append && sameOwner ? {} : { list: [], hasMore: false, federationEnabled: false }, '闲置列表加载失败', async (user, options) => {
      const { communityId, buildingId } = user;
      if (!communityId || !buildingId) {
        return { needsBinding: true, list: [], hasMore: false, federationEnabled: false, scope: 'community' };
      }
      this.setData({ needsBinding: false });
      if (append && !sameOwner) {
        this.setData({ list: [], hasMore: false, federationEnabled: false });
      }
      const community = await api.call('catalog', 'getCommunity', { communityId }, options);
      if (!options.isActive()) return;
      if (!community.enabledFeatures.idle) throw new Error('闲置交易暂未开放');
      const federationEnabled = !!community.enabledFeatures.federation;
      const selectedScope = federationEnabled ? scope : 'community';
      const sameList = append && this.listOwnerId === user._id && this.listCommunityId === communityId && scope === selectedScope;
      if (!sameList) this.setData({ list: [], hasMore: false, scope: selectedScope });
      const previous = sameList ? list : [];
      const result = await api.call('idle', 'list', { scope: selectedScope, offset: previous.length }, options);
      if (!options.isActive()) return;
      this.listCommunityId = communityId;
      this.listOwnerId = user._id;
      const rows = result.list.map(item => ({ ...item, timeText: display(item.createdAt), priceText: yuan(item.price) }));
      return { federationEnabled, list: previous.concat(rows), hasMore: result.hasMore };
    }, null, { list: [], hasMore: false, federationEnabled: false, needsBinding: true });
  },
  scope(event) { this.setData({ scope: event.currentTarget.dataset.scope }); this.load(true); },
  currentList() { const user = getApp().globalData.user; return !this._hidden && !this._unloaded && this.listOwnerId === user?._id && this.listCommunityId === user?.communityId; },
  open(event) { if (this.currentList() && this.data.list.some(item => item._id === event.currentTarget.dataset.id)) wx.navigateTo({ url: '/idle/detail/detail?id=' + encodeURIComponent(event.currentTarget.dataset.id) }); },
  bindAddress() { wx.navigateTo({ url: '/pages/bind/bind' }); },
  create() { if (!this.currentList() || this.data.needsBinding) return this.bindAddress(); wx.navigateTo({ url: '/idle/create/create' }); },
  mine() { if (!this.currentList() || this.data.needsBinding) return this.bindAddress(); wx.navigateTo({ url: '/idle/mine/mine' }); },
  more() { if (!this.data.loading && this.data.hasMore) return this.load(false); }
});
