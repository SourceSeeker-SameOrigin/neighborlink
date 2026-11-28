const { contactPhone, publicUser } = require('../profile');

test('手填号码只记录为未验证，不从号码推断微信认证', () => {
  expect(contactPhone(' 13800000000 ', { phoneSource: 'wechat', phoneVerified: true }))
    .toEqual({ phone: '13800000000', phoneSource: 'manual', phoneVerified: false });
});
test.each([null, 13800000000, {}, [], '138****0000', '123', 'abcdefghijk', '23800000000', ' '])('拒绝非法号码 %p', value => {
  expect(() => contactPhone(value, {})).toThrow();
});
test.each([undefined, ''])('没有已有号码也没有输入时不保存 %p', value => {
  expect(() => contactPhone(value, {})).toThrow();
});
test('不换号时保留已有真实微信来源；更换同号仍属于手填', () => {
  const verified = { phone: '13800000000', phoneSource: 'wechat', phoneVerified: true };
  expect(contactPhone(undefined, verified)).toEqual(verified);
  expect(contactPhone('', verified)).toEqual(verified);
  expect(contactPhone(verified.phone, verified).phoneVerified).toBe(false);
});
test('旧号码不自动补记已验证，手填号码不能提升认证', () => {
  expect(contactPhone(undefined, { phone: '13800000000' })).toEqual({ phone: '13800000000', phoneSource: 'unknown', phoneVerified: false });
  expect(publicUser({ phone: '13800000000', phoneSource: 'manual', phoneVerified: true }).phoneVerified).toBe(false);
  expect(publicUser({ phone: '13800000000', phoneVerified: true }).phoneVerified).toBe(false);
});
test('返回前端的手填号码仍打码，保持角色不变', () => {
  const result = publicUser({ _id: 'u', roles: ['resident'], phone: '13800000000', phoneSource: 'manual', phoneVerified: false });
  expect(result.phone).toBe('138****0000');
  expect(result.roles).toEqual(['resident']);
  expect(result.phoneSource).toBe('manual');
  expect(result.phoneVerified).toBe(false);
});
