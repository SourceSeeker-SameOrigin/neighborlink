Component({
  properties: { couponChoice: { type: String, value: '__auto' }, couponOptions: { type: Array, value: [] }, couponsEnabled: { type: Boolean, value: false },
    pointsEnabled: { type: Boolean, value: false }, pointsBalance: { type: Number, value: 0 }, pointsToUse: { type: Number, value: 0 } },
  methods: {
    coupon(event) {
      const option = this.data.options[Number(event.detail.value)];
      this.triggerEvent('couponchange', { value: option.value });
    },
    points(event) { this.triggerEvent('pointschange', { value: event.detail.value }); }
  },
  observers: {
    'couponOptions,couponChoice': function (options, choice) {
      const items = [{ label: '自动选择最优惠', value: '__auto' }, { label: '不使用优惠券', value: '' },
        ...(options || []).map(item => ({ label: item.label, value: item.couponId }))];
      const selected = items.findIndex(item => item.value === choice);
      this.setData({ options: items, selectedIndex: Math.max(0, selected), selectedLabel: selected < 0 ? '原选优惠券暂不可用' : items[selected].label });
    }
  },
  data: { selectedIndex: 0, selectedLabel: '自动选择最优惠', options: [{ label: '自动选择最优惠', value: '__auto' }, { label: '不使用优惠券', value: '' }] }
});
