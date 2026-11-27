const fs = require('node:fs');
const path = require('node:path');
const { allOff } = require('../features');

const root = path.resolve(__dirname, '../../../database');
function readSeed(name) {
  return fs.readFileSync(path.join(root, 'seed', name + '.json'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
}

test.each(['communities', 'buildings', 'config'])('种子 %s 的每行都是独立 JSON 对象且 ID 唯一', name => {
  const documents = readSeed(name);
  expect(documents.length).toBeGreaterThan(0);
  expect(documents.every(doc => doc && typeof doc === 'object' && !Array.isArray(doc) && typeof doc._id === 'string')).toBe(true);
  expect(new Set(documents.map(doc => doc._id)).size).toBe(documents.length);
});

test('小区字段完整且价格、费率、月卡与 SPEC 一致', () => {
  const communities = readSeed('communities');
  expect(communities).toHaveLength(1);
  const community = communities[0];
  for (const field of ['_id', 'name', 'city', 'district', 'address', 'status', 'propertyName', 'rates', 'dutyWindows', 'stations', 'canteens', 'prices', 'cardPlans', 'createdAt', 'updatedAt']) {
    expect(community).toHaveProperty(field);
  }
  expect(community.prices).toEqual({ express: { base: 250, extraParcel: 100, largeSurcharge: 200, maxParcels: 10 },
    trash: { single: 500 }, buy: { serviceFee: 400, goodsCapMax: 20000, goodsCapMin: 1000 },
    meal: { serviceFee: 300 }, help: { per15min: 1000, maxBlocks: 8 }, firstOrderPrice: 100, membershipTaskPayout: 120 });
  expect(community.rates).toEqual({ platform: 0.2, property: 0.05 });
  expect(community.cardPlans).toEqual([
    { code: 'trash_monthly', name: '垃圾月卡', serviceCode: 'trash', price: 4900, firstPeriodPrice: 2500, days: 30 },
    { code: 'express_monthly', name: '快递月卡', serviceCode: 'express', price: 3900, firstPeriodPrice: 1900, days: 30, dailyParcelQuota: 3 },
    { code: 'visit_monthly', name: '独居探访月卡', serviceCode: 'visit', price: 19900, firstPeriodPrice: 19900, days: 30,
      schedule: { type: 'weekly', weekdays: [2, 5] } },
    { code: 'vacant_monthly', name: '空置房巡检月卡', serviceCode: 'vacant', price: 9900, firstPeriodPrice: 9900, days: 30,
      schedule: { type: 'monthly', days: [1, 15] } }
  ]);
  expect(Number.isNaN(Date.parse(community.createdAt.$date))).toBe(false);
});

test('三栋楼两单元，短码无易混字符，关联到同一小区', () => {
  const community = readSeed('communities')[0];
  const buildings = readSeed('buildings');
  expect(buildings).toHaveLength(3);
  expect(new Set(buildings.map(building => building.shortCode)).size).toBe(3);
  buildings.forEach(building => {
    expect(building.communityId).toBe(community._id);
    expect(building.units).toEqual(['1单元', '2单元']);
    expect(building.shortCode).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(building.posterFileId).toBeNull();
    expect(Number.isNaN(Date.parse(building.createdAt.$date))).toBe(false);
  });
});

test('全局配置默认 mock、禁用推荐奖励且不含真实凭据', () => {
  expect(readSeed('config')).toEqual([{
    _id: 'global', hotline: '400-000-0000', payMode: 'mock',
    templateIds: { newTask: '', accepted: '', delivered: '', unaccepted: '', eventReminder: '', visitReport: '' }, adminOpenids: [],
    blacklist: ['香烟', '卷烟', '烟草', '电子烟', '烟弹', '雪茄', '烟丝', '处方药', '银行卡', '电话卡', '手机卡', 'U盾', '代收现金'],
    idleBlacklist: ['烟草', '酒类', '药品', '医疗器械', '活体动物', '管制刀具', '自制食品', '贴身衣物', '虚拟账号'],
    idleCommissionRate: 0, autoConfirmHours: 24, acceptAlertMinutes: 10, payTimeoutMinutes: 15, complaintWindowHours: 24,
    phoneVisibleHoursAfterDone: 24, referralBonus: 0, features: allOff()
  }]);
});

test('仅两个公共集合前端可读，所有集合前端不可写', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'security-rules.json'), 'utf8'));
  expect(Object.keys(rules).sort()).toEqual(['users', 'communities', 'buildings', 'providers', 'orders', 'memberships', 'ledger', 'settlements', 'payouts', 'events', 'signups', 'eventCancelJobs', 'eventCancelTasks', 'config', 'reports', 'auditLogs', 'mediaChecks', 'conversations', 'messages', 'posts', 'comments', 'couponTemplates', 'couponIssueBatches', 'coupons', 'pointsLedger', 'idleItems', 'ads', 'notices', 'visits', 'secrets', 'merchants', 'merchantServices', 'deliveryBatches', 'stationApplications'].sort());
  for (const [collection, rule] of Object.entries(rules)) {
    expect(rule).toEqual({ read: ['communities', 'buildings'].includes(collection), write: false });
  }
});
