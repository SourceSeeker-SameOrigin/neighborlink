const { publicCommunity } = require('../profile');
const { KEYS } = require('../features');
test.each(KEYS)('公共小区 %s 的全局默认和本地覆盖契约一致', key => {
  for (const global of [true, false]) for (const local of [undefined, true, false]) {
    const community = { _id: 'c', prices: { express: 200 }, location: { lat: 1, lng: 2 }, locationGeo: { internal: true },
      features: local === undefined ? {} : { [key]: local } };
    const view = publicCommunity(community, { features: { [key]: global }, hotline: 'fixture' });
    expect(view.enabledFeatures[key]).toBe(local === undefined ? global : local);
    expect(view.features).toEqual(view.enabledFeatures);
    expect(view).not.toHaveProperty('locationGeo');
    expect(view.prices).toEqual(community.prices);
    expect(view.location).toEqual(community.location);
  }
});
test('未绑定没有公共小区', () => expect(publicCommunity(null, null)).toBeNull());
