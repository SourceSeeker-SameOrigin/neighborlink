const api = require('../../utils/api');
const { display } = require('../../utils/time');
const { yuan } = require('../../utils/money');
const { lifecycle, readList } = require('../../utils/visible-list');

Page({
  ...lifecycle,
  data: { loading: false, error: '', needsBinding: true, list: [], scope: 'community', federationEnabled: false, hasMore: false },
  onHide() { lifecycle.onHide.call(this); this.nextOffset = 0; this.setData({ list: [], hasMore: false, needsBinding: true }); },
  onUnload() { lifecycle.onUnload.call(this); this.nextOffset = 0; this.setData({ list: [], hasMore: false, needsBinding: true }); },
  load(reset = true) {
    const append = reset === false;
    const { scope, list } = this.data;
    const owner = getApp().globalData.user;
    const sameOwner = this.listOwnerId === owner?._id && this.listCommunityId === owner?.communityId;
    if (!append) this.nextOffset = 0;
    this.pageError = append && sameOwner;
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
      let nextOffset = sameList ? this.nextOffset : 0;
      let hasMore = true;
      const found = [];
      for (let scan = 0; scan < 5 && hasMore && !found.length; scan++) {
        const result = await api.call('idle', 'list', { scope: selectedScope, offset: nextOffset }, options);
        if (!options.isActive()) return;
        found.push(...result.list);
        const after = Number.isInteger(result.nextOffset) ? result.nextOffset : nextOffset + result.list.length;
        if (after <= nextOffset && result.hasMore) throw Error('闲置分页结果异常，请重试');
        nextOffset = after;
        hasMore = !!result.hasMore;
      }
      if (!options.isActive()) return;
      this.listCommunityId = communityId;
      this.listOwnerId = user._id;
      const seen = new Set(previous.map(item => item._id));
      const rows = found.filter(item => !seen.has(item._id)).map(item => ({ ...item,
        timeText: display(item.createdAt), priceText: yuan(item.price) }));
      this.nextOffset = nextOffset;
      this.pageError = false;
      return { federationEnabled, list: previous.concat(rows), hasMore };
    }, null, { list: [], hasMore: false, federationEnabled: false, needsBinding: true });
  },
  scope(event) { this.setData({ scope: event.currentTarget.dataset.scope }); this.load(true); },
  currentList() { const user = getApp().globalData.user; return !this._hidden && !this._unloaded && this.listOwnerId === user?._id && this.listCommunityId === user?.communityId; },
  retry() { return this.load(!this.pageError); },
  open(event) { if (this.currentList() && this.data.list.some(item => item._id === event.currentTarget.dataset.id)) wx.navigateTo({ url: '/idle/detail/detail?id=' + encodeURIComponent(event.currentTarget.dataset.id) }); },
  bindAddress() { wx.navigateTo({ url: '/pages/bind/bind' }); },
  create() { if (!this.currentList() || this.data.needsBinding) return this.bindAddress(); wx.navigateTo({ url: '/idle/create/create' }); },
  mine() { if (!this.currentList() || this.data.needsBinding) return this.bindAddress(); wx.navigateTo({ url: '/idle/mine/mine' }); },
  more() { if (!this.data.loading && this.data.hasMore) return this.load(false); }
});
