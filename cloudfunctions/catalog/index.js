const cloud = require('wx-server-sdk');
const { createServer } = require('./lib/shared/server');
const { parseScene, publicCommunity } = require('./lib/shared/profile');
const { nextDutyWindow } = require('./lib/shared/time');
const { ensure, text, integer } = require('./lib/shared/validate');
const { publicTemplates } = require('./lib/shared/notificationData');
const { isEnabled } = require('./lib/shared/features');
const { validatePoint, toGeoPoint, distanceKm } = require('./lib/shared/geo');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const server = createServer(cloud);
const { db, one, get } = server;

async function listCommunities(event) {
  const offset = event.offset === undefined ? 0 : integer(event.offset, '页码', 0, 10000);
  const result = await db.collection('communities').where({ status: 'active' }).orderBy('_id', 'asc').skip(offset).limit(100).get();
  const config = await server.config();
  return { list: result.data.map(({ _id, name, city, district, address, federationGroupId, location, features }) => ({ _id, name, city, district, address,
    federationGroupId: federationGroupId || null,
    ...(location && isEnabled('location', config, { features }) ? { location } : {}) })),
    hasMore: result.data.length === 100 };
}

async function getCommunity(event) {
  text(event.communityId, '小区');
  const community = await get('communities', event.communityId);
  ensure(community && community.status === 'active', '该小区暂不可用');
  const buildings = await server.all('buildings', { communityId: community._id });
  const duty = await db.collection('providers').where({ communityId: community._id, status: 'approved', onDuty: true,
    insuranceUntil: server.command.gt(new Date()) }).count();
  const config = await server.config();
  return { ...publicCommunity(community, config), buildings, onDutyCount: duty.total,
    nextDutyWindow: nextDutyWindow(community.dutyWindows, new Date()), hotline: config.hotline, templateIds: publicTemplates(config) };
}

async function nearbyCommunities(event) {
  const point = validatePoint(event.location);
  const offset = event.offset === undefined ? 0 : integer(event.offset, '页码', 0, 10000);
  const config = await server.config();
  if (!isEnabled('location', config)) {
    const enabled = await db.collection('communities').where({ status: 'active', 'features.location': true }).limit(1).get();
    ensure(enabled.data.length > 0, '该功能暂未开放', 'E_FEATURE_OFF');
  }
  const rows = await db.collection('communities').where({ status: 'active',
    locationGeo: server.command.geoNear({ geometry: toGeoPoint(db, point), maxDistance: 3000 })
  }).skip(offset).limit(100).get();
  const list = rows.data.filter(item => item.location && isEnabled('location', config, item))
    .map(({ _id, name, city, district, address, federationGroupId, location }) => ({
      _id, name, city, district, address, federationGroupId: federationGroupId || null,
      location, distanceKm: distanceKm(point, location)
    }));
  return { list, hasMore: rows.data.length === 100, nextOffset: offset + rows.data.length };
}

async function resolveScene(event) {
  const scene = parseScene(event.scene);
  ensure(scene, '二维码内容不正确');
  const target = scene.type === 'b' ? await one('buildings', { shortCode: scene.code })
    : await one('providers', { referralCode: scene.code, status: 'approved' });
  ensure(target, '二维码已失效');
  const community = await get('communities', target.communityId);
  ensure(community && community.status === 'active', '小区暂不可用');
  return { communityId: community._id, buildingId: scene.type === 'b' ? target._id : null };
}

async function templates() { return publicTemplates(await server.config()); }
exports.main = server.entry({ listCommunities, nearbyCommunities, getCommunity, resolveScene, templates });
