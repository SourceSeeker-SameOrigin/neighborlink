const { canTransition, assertTransition, STATUS_TEXT } = require('../stateMachine');

const allowed = [
  ['pending_quote', 'pending_pay'], ['pending_quote', 'closed'],
  ['pending_pay', 'paid'], ['pending_pay', 'closed'], ['paid', 'accepted'], ['paid', 'cancelled'],
  ['accepted', 'in_service'], ['accepted', 'paid'], ['accepted', 'cancelled'],
  ['in_service', 'delivered'], ['in_service', 'cancelled'], ['delivered', 'completed'], ['delivered', 'disputed'],
  ['disputed', 'completed'], ['disputed', 'refunded'], ['completed', 'disputed']
];

test.each(allowed)('SPEC §8 合法转换 %s → %s', (from, to) => {
  expect(canTransition(from, to)).toBe(true);
  expect(() => assertTransition(from, to)).not.toThrow();
});

test.each([
  ['pending_pay', 'completed'], ['pending_pay', 'cancelled'], ['paid', 'in_service'],
  ['accepted', 'completed'], ['in_service', 'paid'], ['delivered', 'paid'],
  ['completed', 'refunded'], ['cancelled', 'paid'], ['closed', 'paid'], ['refunded', 'completed'],
  ['paid', 'paid'], ['toString', 'paid'], ['__proto__', 'paid'], [null, 'paid'], ['paid', undefined]
])('拒绝非法转换 %p → %p', (from, to) => {
  expect(canTransition(from, to)).toBe(false);
  expect(() => assertTransition(from, to)).toThrow(expect.objectContaining({ code: 'E_BAD_STATE' }));
});

test('闲置担保交付可直达待确认，普通订单仍须经过服务中', () => {
  expect(canTransition('accepted', 'delivered', 'idle_purchase')).toBe(true);
  expect(() => assertTransition('accepted', 'delivered', 'idle_purchase')).not.toThrow();
  expect(canTransition('accepted', 'delivered', 'service')).toBe(false);
  expect(() => assertTransition('accepted', 'delivered', 'service')).toThrow(expect.objectContaining({ code: 'E_BAD_STATE' }));
});

test('全部状态都有中文名称', () => {
  expect(STATUS_TEXT).toEqual({ pending_quote: '待报价', pending_pay: '待支付', paid: '待接单', accepted: '已接单', in_service: '服务中',
    delivered: '待确认', disputed: '售后处理中', completed: '已完成', cancelled: '已取消', closed: '已关闭', refunded: '已退款' });
});
