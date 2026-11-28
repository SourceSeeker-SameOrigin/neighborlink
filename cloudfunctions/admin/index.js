const cloud = require('wx-server-sdk');
const { createServer } = require('./lib/shared/server');
const { adminProviderActions } = require('./lib/shared/adminProviders');
const { adminOrderActions } = require('./lib/shared/adminOrders');
const { publicTemplates } = require('./lib/shared/notificationData');
const { requireRole } = require('./lib/shared/auth');
const { createAdminDashboard } = require('./lib/shared/adminDashboard');
const { adminSettlementActions } = require('./lib/shared/adminSettlements');
const { period } = require('./lib/shared/settlementData');
const { recyclerStatement, recyclerStatementCsv } = require('./lib/shared/recycle');
const { ensure } = require('./lib/shared/validate');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const dashboardActions = createAdminDashboard(cloud, server);
const settlementActions = adminSettlementActions(cloud, server);
async function notificationTemplates(event, { user }) {
  requireRole(user, ['admin']);
  return publicTemplates(await server.config());
}
async function exportRecyclerStatement(event, { user }) {
  requireRole(user, ['admin']);
  const range = period(event);
  const community = await server.get('communities', event.communityId);
  ensure(community && community.status === 'active', '小区不存在或已停用');
  await server.feature('recycle', community._id);
  const orders = await server.all('orders', { communityId: community._id, serviceCode: 'recycle', status: 'completed',
    completedAt: server.command.gte(range.from).and(server.command.lt(range.to)) });
  const result = recyclerStatement(orders, range.from, range.to);
  const recyclerIds = [...new Set(result.rows.map(row => row.recyclerId))];
  const merchants = await Promise.all(recyclerIds.map(id => server.get('merchants', id)));
  const names = new Map(merchants.map(item => [item && item._id, item && item.name || '']));
  result.rows.forEach(row => { row.recyclerName = names.get(row.recyclerId) || ''; });
  const file = await cloud.uploadFile({ cloudPath: `exports/recycle/${community._id}/${Date.now()}.csv`,
    fileContent: Buffer.from(recyclerStatementCsv(result, event.from, event.to), 'utf8') });
  const urls = await cloud.getTempFileURL({ fileList: [file.fileID] });
  ensure(urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL, '对账文件生成失败', 'E_INTERNAL');
  return { fileId: file.fileID, tempFileURL: urls.fileList[0].tempFileURL, count: result.rows.length, totalFen: result.totalFen };
}
exports.main = server.entry({ ...adminProviderActions(cloud, server), ...adminOrderActions(cloud, server),
  ...dashboardActions, ...settlementActions, notificationTemplates, exportRecyclerStatement }, ['admin', 'property'], 'admin');
