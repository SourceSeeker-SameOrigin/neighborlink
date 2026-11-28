const { isEnabled } = require('./features');
const { ensure } = require('./validate');

// Only gate new user-driven business operations. Callbacks and compensation do not call this module.
function requiredFeatures(order) {
  const names = new Set();
  const kind = { idle_purchase: ['idle', 'idleEscrow'], merchant: ['merchants'], event_signup: ['events'] };
  for (const name of kind[order.kind] || []) names.add(name);
  const service = { meal: 'elder', visit: 'elder', escort: 'elder', pet: 'pet', recycle: 'recycle', vacant: 'vacantHome', custom: 'board' };
  if (service[order.serviceCode]) names.add(service[order.serviceCode]);
  if (order.taskPostId) names.add('board');
  if (order.planCode === 'visit_monthly') names.add('elder');
  if (order.planCode === 'vacant_monthly') names.add('vacantHome');
  return [...names];
}
function orderEnabled(order, config, community) {
  return requiredFeatures(order).every(name => isEnabled(name, config, community));
}
async function requireOrderFeatures(server, order) {
  for (const name of requiredFeatures(order)) await server.feature(name, order.communityId);
}
async function requireLedgerFeatures(get, row) {
  let names;
  if (['order', 'idle_sale', 'merchant_order', 'membership_sale'].includes(row.refType)) {
    const order = await get('orders', row.refId);
    ensure(order && order.communityId === row.communityId, '账目来源订单无法核实，请联系管理员', 'E_CONFIG');
    names = requiredFeatures(order);
  } else names = { sponsorship: ['events'], ad: ['ads'] }[row.refType] || [];
  if (!names.length) return;
  const [config, community] = await Promise.all([get('config', 'global'), get('communities', row.communityId)]);
  ensure(names.every(name => isEnabled(name, config, community)), '该账目所属功能暂未开放', 'E_FEATURE_OFF');
}
module.exports = { requiredFeatures, orderEnabled, requireOrderFeatures, requireLedgerFeatures };
