const { AppError, wrap } = require('./errors');
const { requireRole } = require('./auth');
const { ensure } = require('./validate');
const { isEnabled } = require('./features');

// 云函数运行边界；cloud 由各入口注入，模块加载时不初始化 SDK、不发请求。
function createServer(cloud) {
  const db = cloud.database({ throwOnNotFound: false });
  const command = db.command;
  async function one(collection, filter) {
    const result = await db.collection(collection).where(filter).limit(1).get();
    return result.data[0] || null;
  }
  const get = (collection, id) => typeof id === 'string' && id ? one(collection, { _id: id }) : Promise.resolve(null);
  async function all(collection, filter) {
    const rows = [];
    let page;
    do {
      page = await db.collection(collection).where(filter).orderBy('_id', 'asc').skip(rows.length).limit(100).get();
      rows.push(...page.data);
    } while (page.data.length === 100);
    return rows;
  }
  function openid() {
    const id = cloud.getWXContext().OPENID;
    ensure(typeof id === 'string' && id.length > 0, '请在微信小程序内登录', 'E_FORBIDDEN');
    return id;
  }
  async function user(id = openid()) {
    const profile = await one('users', { openid: id });
    ensure(profile && profile.blocked !== true, '请先登录或联系管理员', 'E_FORBIDDEN');
    return profile;
  }
  async function config() {
    const value = await get('config', 'global');
    ensure(value, '请先初始化全局配置', 'E_CONFIG');
    return value;
  }
  async function feature(name, communityId) {
    const [settings, community] = await Promise.all([config(), get('communities', communityId)]);
    ensure(isEnabled(name, settings, community), '该功能暂未开放', 'E_FEATURE_OFF');
    return { settings, community };
  }
  async function featureEntry(name, actor, communityId = actor && actor.communityId) {
    const result = await feature(name, communityId);
    ensure(communityId, '请先绑定小区门牌');
    ensure(result.community && result.community.status === 'active', '小区暂不可用');
    return result;
  }
  // 每个业务入口均从微信上下文取身份，不采信 event.openid/roles。
  function entry(actions, roles = null, mediaDomain = null) {
    return wrap(async (event = {}) => {
      ensure(event && typeof event === 'object' && !Array.isArray(event), '请求格式不正确');
      if (typeof event.action !== 'string' || !Object.prototype.hasOwnProperty.call(actions, event.action)) {
        throw new AppError('E_UNKNOWN_ACTION', '暂不支持此操作');
      }
      const id = openid();
      const actor = roles ? await user(id) : null;
      if (roles) requireRole(actor, roles);
      const result = await actions[event.action](event, { openid: id, user: actor });
      return mediaDomain ? require('./mediaAccess').decorateMedia(cloud,
        { get, one }, mediaDomain, event.action, event, result) : result;
    });
  }
  return { db, command, one, get, all, openid, user, config, feature, featureEntry, entry };
}

module.exports = { createServer };
