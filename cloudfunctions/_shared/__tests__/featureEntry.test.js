const { createServer } = require('../server');
function make(config, community) {
  const db = { command: {}, collection: name => ({ where: () => ({ limit: () => ({
    get: async () => ({ data: (name === 'config' ? [config] : community ? [community] : []) })
  }) }) }) };
  return createServer({ database: () => db });
}
test.each([true, false])('未绑定列表先判全局开关 %s，开启才要求绑定', async enabled => {
  const server = make({ features: { chat: enabled } });
  await expect(server.featureEntry('chat', { communityId: null })).rejects.toMatchObject({ code: enabled ? 'E_INVALID_PARAM' : 'E_FEATURE_OFF' });
});
test.each([[false, true], [true, false], [true, undefined], [false, undefined]])('列表按小区覆盖全局 %s/%s', async (global, local) => {
  const server = make({ features: { chat: global } }, { _id: 'c', status: 'active', features: local === undefined ? {} : { chat: local } });
  if (local === undefined ? global : local) await expect(server.featureEntry('chat', { communityId: 'c' })).resolves.toHaveProperty('community._id', 'c');
  else await expect(server.featureEntry('chat', { communityId: 'c' })).rejects.toHaveProperty('code', 'E_FEATURE_OFF');
});
