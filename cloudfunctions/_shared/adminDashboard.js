const { validateCommunityPatch, validateGlobalPatch, changedCardEntitlements } = require('./communityConfig');
const { ensure, integer, text } = require('./validate');
const { requireRole, requireCommunityAccess } = require('./auth');
const { parseDate, addDays, ymd } = require('./time');
const { validateFeatures } = require('./features');
const { visibleCommunityIds } = require('./visibility');
const { extensionMetrics, revenueMetrics } = require('./dashboardMetrics');
const { payoutCommunityAmounts } = require('./payout');
const crypto = require('crypto');
const { atomic, read, insert } = require('./transaction');
const { codeEnvVersion } = require('./qrEnv');

function createAdminDashboard(cloud, server) {
  const { db, command } = server;
  async function dashboard(event, { user }) {
    const communityId = user.roles.includes('admin') ? event.communityId || user.communityId : user.communityId;
    ensure(communityId, '请先选择小区');
    requireCommunityAccess(user, communityId);
    let communityIds = [communityId];
    if (event.scope === 'federation') {
      requireRole(user, ['admin']);
      await server.feature('federation', communityId);
      const communities = await server.all('communities', { status: 'active' });
      const selected = communities.find(item => item._id === communityId);
      communityIds = visibleCommunityIds('federation', selected, communities);
    } else ensure(!event.scope || event.scope === 'community', '统计范围不正确');
    const today = ymd(new Date());
    const from = event.from || today;
    const to = event.to || today;
    const start = parseDate(from);
    const end = addDays(parseDate(to), 1);
    ensure(end > start && end - start <= 366 * 86400000, '统计日期范围不能超过一年');
    const communityFilter = command.in(communityIds);
    const orders = await server.all('orders', { communityId: communityFilter, createdAt: command.gte(start).and(command.lt(end)) });
    const providers = await server.all('providers', { communityId: communityFilter });
    const [cards, duty, events, activities, payouts] = await Promise.all([
      server.all('memberships', { communityId: communityFilter, status: 'active', startAt: command.lt(end), endAt: command.gt(start) }),
      db.collection('providers').where({ communityId: communityFilter, status: 'approved', onDuty: true, insuranceUntil: command.gt(new Date()) }).count(),
      server.all('events', { communityId: communityFilter, at: command.gte(start).and(command.lt(end)) }),
      server.all('events', { communityIds: command.in(communityIds), status: command.in(['draft', 'published', 'ended', 'cancelled']),
        startAt: command.gte(start).and(command.lt(end)) }),
      user.roles.includes('admin') ? server.all('payouts', { createdAt: command.gte(start).and(command.lt(end)) }) : Promise.resolve([])
    ]);
    const statusCounts = {};
    const uniqueResidents = new Set();
    const revenue = revenueMetrics(orders);
    let complaints = 0, alerted = 0;
    let acceptMs = 0, acceptedCount = 0;
    for (const order of orders) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      uniqueResidents.add(order.userOpenid);
      if (order.complaint) complaints++;
      if (order.alertedAt) alerted++;
      if (order.acceptedAt && order.payment && order.payment.paidAt) {
        acceptMs += new Date(order.acceptedAt) - new Date(order.payment.paidAt); acceptedCount++;
      }
    }
    const completed = orders.filter(item => item.completedAt);
    const members = cards.reduce((totals, card) => {
      totals[card.serviceCode] = (totals[card.serviceCode] || 0) + 1; return totals;
    }, {});
    const source = { scan: new Set(), bind: new Set(), first_paid: new Set(), second_paid: new Set() };
    const adStats = { views: 0, clicks: 0 };
    const byBuilding = new Map();
    const byProvider = new Map();
    function addFunnel(map, key, type, openid) {
      if (!key) return;
      if (!map.has(key)) map.set(key, { scan: new Set(), bind: new Set(), first_paid: new Set(), second_paid: new Set() });
      if (map.get(key)[type]) map.get(key)[type].add(openid);
    }
    for (const eventItem of events) {
      if (source[eventItem.type]) source[eventItem.type].add(eventItem.openid);
      if (eventItem.type === 'ad_view') adStats.views++;
      if (eventItem.type === 'ad_click') adStats.clicks++;
    }
    for (const eventItem of events) {
      addFunnel(byBuilding, eventItem.buildingId, eventItem.type, eventItem.openid);
      addFunnel(byProvider, eventItem.referrerProviderId, eventItem.type, eventItem.openid);
    }
    const funnelRows = map => [...map].map(([id, counts]) => ({ id, scans: counts.scan.size, binds: counts.bind.size,
      firstPaid: counts.first_paid.size, secondPaid: counts.second_paid.size }));
    const scopedPayouts = [];
    for (const payout of payouts) {
      // Older cross-community records can be reconstructed from their immutable ledger allocations.
      const ledgerRows = !payout.communityAmounts && !payout.communityId ?
        await Promise.all((payout.ledgerIds || []).map(id => server.get('ledger', id))) : [];
      const communityAmounts = payoutCommunityAmounts(payout, ledgerRows.filter(Boolean));
      if (communityAmounts.some(item => communityIds.includes(item.communityId))) scopedPayouts.push({ ...payout, communityAmounts });
    }
    const extensions = extensionMetrics(orders, activities, scopedPayouts, communityIds);
    return { communityId, communityIds, scope: event.scope === 'federation' ? 'federation' : 'community', from, to, readOnly: !user.roles.includes('admin'), orders: statusCounts,
      totalOrders: orders.length, ...revenue,
      residentCount: uniqueResidents.size, newFirstPaidResidents: source.first_paid.size,
      secondPaidResidents: source.second_paid.size, acceptRate15m: acceptedCount ?
        Math.floor(orders.filter(item => item.payment && item.payment.paidAt && item.acceptedAt &&
          new Date(item.acceptedAt) - new Date(item.payment.paidAt) <= 15 * 60000).length * 10000 /
          Math.max(1, orders.filter(item => item.payment && item.payment.paidAt).length)) : 0,
      averageAcceptMinutes: acceptedCount ? Math.round(acceptMs / acceptedCount / 60000) : 0,
      unacceptedAlerts: alerted, complaintCount: complaints, complaintRate: orders.length ? Math.floor(complaints * 10000 / orders.length) : 0,
      memberships: members, onDutyProviders: duty.total,
      providerStats: providers.map(provider => ({ id: provider._id, name: provider.realName, completed: provider.stats.completed,
        averageRating: provider.stats.ratingCount ? (provider.stats.ratingSum / provider.stats.ratingCount).toFixed(1) : '暂无' })),
      funnel: { scans: source.scan.size, binds: source.bind.size, firstPaid: source.first_paid.size, secondPaid: source.second_paid.size },
      funnelByBuilding: funnelRows(byBuilding), funnelByProvider: funnelRows(byProvider), adStats, extensions };
  }

  async function updateCommunity(event, { user }) {
    requireRole(user, ['admin']);
    text(event.communityId, '小区');
    const current = await server.get('communities', event.communityId);
    ensure(current, '小区不存在');
    const allowed = ['name', 'city', 'district', 'address', 'propertyName', 'status', 'rates', 'dutyWindows', 'stations', 'prices', 'cardPlans', 'features', 'federationGroupId', 'location', 'canteens', 'requiredCerts'];
    const patch = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(event, key)) patch[key] = event[key];
    ensure(Object.keys(patch).length > 0, '没有可保存的配置');
    if (patch.status !== undefined) ensure(['active', 'paused'].includes(patch.status), '小区状态不正确');
    if (patch.federationGroupId !== undefined) {
      ensure(patch.federationGroupId === null || typeof patch.federationGroupId === 'string', '联合社区组 ID 格式不正确');
      if (typeof patch.federationGroupId === 'string') patch.federationGroupId = patch.federationGroupId.trim() || null;
      ensure(patch.federationGroupId === null || patch.federationGroupId.length <= 100, '联合社区组 ID 不能超过 100 字');
    }
    if (patch.location !== undefined) {
      const { validatePoint, toGeoPoint } = require('./geo');
      patch.location = validatePoint(patch.location, '小区');
      patch.locationGeo = toGeoPoint(db, patch.location);
    }
    if (patch.canteens !== undefined) {
      ensure(Array.isArray(patch.canteens) && patch.canteens.length <= 50, '合作食堂配置必须为最多 50 项的列表');
      const codes = new Set();
      for (const canteen of patch.canteens) {
        ensure(canteen && typeof canteen === 'object', '合作食堂配置不正确');
        const code = text(canteen.code, '食堂代码', 40).trim();
        text(canteen.name, '食堂名称', 80);
        ensure(!codes.has(code), '食堂代码不能重复');
        codes.add(code);
        if (canteen.merchantId !== undefined && canteen.merchantId !== null) text(canteen.merchantId, '食堂商家编号', 100);
      }
    }
    if (patch.requiredCerts !== undefined) ensure(Array.isArray(patch.requiredCerts) && patch.requiredCerts.every(cert => ['pet','escort'].includes(cert)), '服务资质配置不正确');
    if (patch.features) {
      const config = await server.config();
      validateFeatures({ ...(config.features || {}), ...(current.features || {}), ...patch.features });
    }
    if (patch.rates) ensure(Number.isFinite(patch.rates.platform) && Number.isFinite(patch.rates.property) &&
      patch.rates.platform >= 0 && patch.rates.property >= 0 && patch.rates.platform + patch.rates.property <= 1,
    '分账费率配置不正确');
    validateCommunityPatch(patch);
    patch.updatedAt = new Date();
    if (patch.cardPlans !== undefined) {
      const { atomic, read, sameSnapshot } = require('./transaction');
      const { nextMembershipRevision } = require('./membershipRevision');
      // CloudBase transactions support doc operations, not where queries.
      // A concurrent purchase or activation bumps the same community revision.
      for (const code of changedCardEntitlements(current.cardPlans, patch.cardPlans)) {
        const active = await server.one('memberships', {communityId: current._id, planCode: code, status: 'active', endAt: command.gt(new Date())});
        const pending = await server.one('orders', {communityId: current._id, kind: 'membership_purchase', planCode: code, status: 'pending_pay'});
        ensure(!active && !pending, '存在有效月卡或待付款月卡订单，不能删除计划或修改排期、额度和有效天数；可调整新购价格', 'E_CONFLICT');
      }
      await atomic(db, async transaction => {
        const fresh = await read(transaction, 'communities', current._id);
        sameSnapshot(fresh, current, ['status', 'cardPlans', 'updatedAt', 'membershipRevision']);
        await transaction.collection('communities').doc(current._id).update({data:{...patch, membershipRevision:nextMembershipRevision(fresh)}});
      });
    } else {
      const result = await db.collection('communities').where({ _id: current._id, status: current.status }).update({ data: patch });
      ensure(result.stats.updated === 1, '小区配置已变化，请刷新', 'E_CONFLICT');
    }
    return { communityId: current._id };
  }

  async function upsertBuilding(event, { user }) {
    requireRole(user, ['admin']);
    const name = text(event.name, '楼栋名称', 40).trim();
    const community = await server.get('communities', event.communityId);
    ensure(community, '小区不存在');
    const units = event.units;
    ensure(Array.isArray(units) && units.length > 0 && units.length <= 30 && units.every(item => typeof item === 'string' && item.trim()), '请填写有效单元列表');
    const data = { communityId: community._id, name, units: [...new Set(units.map(item => item.trim()))], updatedAt: new Date() };
    if (event.buildingId) {
      const current = await server.get('buildings', event.buildingId);
      ensure(current && current.communityId === community._id, '楼栋不存在');
      const result = await db.collection('buildings').where({ _id: current._id, communityId: community._id }).update({ data });
      ensure(result.stats.updated === 1, '楼栋配置已变化', 'E_CONFLICT');
      return { buildingId: current._id };
    }
    const { shortCode } = require('./ids');
    if (event.requestId) {
      const requestId = text(event.requestId, '请求编号', 80);
      ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(requestId), '请求编号不正确');
      const buildingId = 'b_' + crypto.createHash('sha256').update(user.openid + ':' + community._id + ':' + requestId)
        .digest('hex').slice(0, 32);
      return atomic(db, async transaction => {
        const existing = await read(transaction, 'buildings', buildingId);
        if (existing) {
          ensure(existing.communityId === community._id && existing.name === name &&
            JSON.stringify(existing.units) === JSON.stringify(data.units), '请求编号已用于其他楼栋', 'E_CONFLICT');
          return { buildingId, duplicate: true };
        }
        await insert(transaction, 'buildings', { _id: buildingId, ...data, shortCode: shortCode(),
          posterFileId: null, createdAt: new Date() });
        return { buildingId, duplicate: false };
      });
    }
    const buildingId = 'b_' + crypto.randomBytes(16).toString('hex');
    await db.collection('buildings').add({ data: { _id: buildingId, ...data, shortCode: shortCode(), posterFileId: null, createdAt: new Date() } });
    return { buildingId };
  }

  async function lookupBuildingCreate(event, { user }) {
    requireRole(user, ['admin']);
    const communityId = text(event.communityId, '小区');
    const requestId = text(event.requestId, '请求编号', 80);
    ensure(/^[a-zA-Z0-9_-]{8,80}$/.test(requestId), '请求编号不正确');
    const buildingId = 'b_' + crypto.createHash('sha256').update(user.openid + ':' + communityId + ':' + requestId)
      .digest('hex').slice(0, 32);
    const existing = await server.get('buildings', buildingId);
    if (!existing) return { buildingId: null };
    ensure(existing.communityId === communityId, '无权查看此创建结果', 'E_FORBIDDEN');
    return { buildingId, name: existing.name, units: existing.units };
  }

  async function updateConfig(event, { user }) {
    requireRole(user, ['admin']);
    const current = await server.get('config', 'global');
    ensure(current, '全局配置不存在', 'E_CONFIG');
    const allowed = ['hotline', 'payMode', 'templateIds', 'templateFields', 'adminOpenids', 'blacklist',
      'autoConfirmHours', 'acceptAlertMinutes', 'payTimeoutMinutes', 'complaintWindowHours', 'phoneVisibleHoursAfterDone', 'referralBonus', 'features', 'idleBlacklist', 'carryBlacklist', 'contentBlacklist'];
    const patch = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(event, key)) patch[key] = event[key];
    ensure(Object.keys(patch).length, '没有可保存的配置');
    if (patch.payMode !== undefined) ensure(['mock', 'wechat'].includes(patch.payMode), '支付模式不正确');
    if (patch.blacklist !== undefined) ensure(Array.isArray(patch.blacklist) && patch.blacklist.every(item => typeof item === 'string'), '黑名单格式不正确');
    if (patch.adminOpenids !== undefined) ensure(Array.isArray(patch.adminOpenids) && patch.adminOpenids.every(item => typeof item === 'string'), '管理员列表格式不正确');
    if (patch.features) {
      const nextFeatures = { ...(current.features || {}), ...patch.features };
      validateFeatures(nextFeatures);
      const communities = await server.all('communities', {});
      for (const community of communities) validateFeatures({ ...nextFeatures, ...(community.features || {}) });
    }
    validateGlobalPatch(patch);
    patch.updatedAt = new Date();
    await db.collection('config').doc('global').update({ data: patch });
    return { updated: Object.keys(patch).filter(key => key !== 'updatedAt') };
  }

  async function getFeatures(event, { user }) {
    requireRole(user, ['admin']);
    const [config, community] = await Promise.all([server.config(), server.get('communities', event.communityId || user.communityId)]);
    return { global: config.features || {}, community: community && community.features || {},
      communityId: community && community._id };
  }

  async function managementConfig(event, { user }) {
    requireRole(user, ['admin']);
    const config = await server.config();
    const keys = ['hotline','blacklist','idleBlacklist','carryBlacklist','contentBlacklist','autoConfirmHours','acceptAlertMinutes','payTimeoutMinutes','complaintWindowHours','phoneVisibleHoursAfterDone','referralBonus'];
    const global = Object.fromEntries(keys.filter(key => config[key] !== undefined).map(key => [key,config[key]]));
    const communities = (await server.all('communities', {})).map(item => ({ _id:item._id, name:item.name, status:item.status }));
    const id = event.communityId || user.communityId || (communities[0] || {})._id;
    const raw = id ? await server.get('communities', id) : null;
    const community = raw ? { ...raw, buildings: await server.all('buildings',{communityId:id}) } : null;
    if (community) delete community.locationGeo;
    return { global, communities, community };
  }

  async function genPoster(event, { user }) {
    requireRole(user, ['admin']);
    let scene, page, collection, id;
    if (event.buildingId) {
      const building = await server.get('buildings', event.buildingId);
      ensure(building, '楼栋不存在');
      scene = 'b=' + building.shortCode; page = 'pages/index/index'; collection = 'buildings'; id = building._id;
    } else if (event.providerId) {
      const provider = await server.get('providers', event.providerId);
      ensure(provider && provider.status === 'approved', '服务员不存在或未通过审核');
      scene = 'r=' + provider.referralCode; page = 'pages/index/index'; collection = 'providers'; id = provider._id;
    } else ensure(false, '请选择楼栋或服务员');
    const envVersion = codeEnvVersion();
    const response = await cloud.openapi.wxacode.getUnlimited({ scene, page, checkPath: false, envVersion, width: 430 });
    ensure(response && response.buffer, '小程序码生成失败', 'E_INTERNAL');
    const file = await cloud.uploadFile({ cloudPath: 'posters/' + id + '/' + envVersion + '-' + Date.now() + '.png', fileContent: response.buffer });
    await db.collection(collection).doc(id).update({ data: { posterFileId: file.fileID, posterScene: scene,
      posterEnvVersion: envVersion, posterUpdatedAt: new Date() } });
    const fresh = await cloud.getTempFileURL({ fileList: [file.fileID] });
    return { fileId: file.fileID, tempFileURL: fresh.fileList[0].tempFileURL, scene, envVersion };
  }

  return { managementConfig, dashboard, updateCommunity, upsertBuilding, lookupBuildingCreate, updateConfig, getFeatures, genPoster };
}

module.exports = { createAdminDashboard };
