// Public directory metadata; opening a route still requires effective features and service details.
module.exports = [
  { code: 'elder', feature: 'elder', url: '/elder/meal', name: '助老送餐', icon: 'elder', description: '提供助老送餐、陪诊预约及独居探访月卡。具体服务以所在小区开通情况为准。' },
  { code: 'pet', feature: 'pet', url: '/pet/order', name: '上门喂宠', icon: 'pet', description: '预约上门喂食、换水、清洁及遛狗，可查看服务记录。' },
  { code: 'recycle', feature: 'recycle', url: '/recycle/order/order', name: '回收上门', icon: 'recycle', description: '预约上门回收，按小区分类标准登记重量和环保积分。' },
  { code: 'vacantHome', feature: 'vacantHome', url: '/pages/membership/index', name: '空房巡检', icon: 'vacant', description: '通过空置房巡检月卡安排巡检，查看分项检查与照片记录。' },
  { code: 'merchants', feature: 'merchants', url: '/shops/list/list', name: '周边商家', icon: 'shop', description: '查看小区周边已审核商家及服务，按商家提供的项目预约。' },
  { code: 'idle', feature: 'idle', url: '/idle/list/list', name: '闲置交易', icon: 'idle', description: '查看和发布邻里闲置物品；担保交易是否开放由小区另行配置。' },
  { code: 'events', feature: 'events', url: '/events/list/list', name: '社区活动', icon: 'events', description: '查看小区活动详情，参与已开放的社区活动。' },
  { code: 'board', feature: 'board', url: '/board/list/list', name: '邻里互助', icon: 'board', description: '在需求广场发布求助或悬赏，与邻居互帮互助。' },
  { code: 'travelCarry', feature: 'travelCarry', url: '/board/list/list?type=carry', name: '出行帮带', icon: 'travel', description: '在需求广场查看或发布出行帮带信息，遵守平台禁止事项。' }
  ,{ code: 'escort', feature: 'elder', name: '陪诊预约', icon: 'elder', url: '/elder/escort', description: '由具备资格的服务员提供陪诊协助，预约须匹配值班时段。' }
  ,{ code: 'visit', feature: 'elder', name: '独居探访', icon: 'elder', url: '/pages/membership/index', description: '按月卡计划安排上门探访，查看逐次报告。' }
  ,{ code: 'coupons', feature: 'coupons', name: '优惠券', icon: 'coupon', url: '/coupons/center/center', description: '领取适用优惠券；已有券在我的优惠券查看。' }
  ,{ code: 'chat', feature: 'chat', name: '邻里消息', icon: 'chat', url: '/chat/list/list', description: '查看已有业务会话，不公开陌生人的联系方式。' }
  ,{ code: 'notices', feature: 'notices', name: '物业公告', icon: 'notice', url: '/notices/list/list', description: '查看本小区已发布的物业公告。' }
  ,{ code: 'stationDelivery', feature: 'stationDelivery', name: '驿站送上门', icon: 'express', url: '/pages/me/me', tab: true, description: '在我的页面自主开启或撤回快递送上门同意。' }
  ,{ code: 'points', feature: 'points', name: '环保积分', icon: 'recycle', url: '/pages/me/me', tab: true, description: '回收获得积分，可在支持的订单中抵扣；余额在我的页面查看。' }
  ,{ code: 'idleEscrow', feature: 'idleEscrow', name: '闲置担保', icon: 'idle', url: '/idle/list/list', description: '进入闲置列表，按商品支持的方式发起担保交易。' }
  ,{ code: 'federation', feature: 'federation', name: '联合社区', icon: 'home', description: '在已开放的需求广场、闲置或活动页面切换联合社区范围。' }
  ,{ code: 'autoPayout', feature: 'autoPayout', name: '收入提现', icon: 'ticket', url: '/pages/me/me', tab: true, description: '前往我的页面，服务员从收入页、卖家从我的闲置进入提现，仍须满足收款资格。' }
];
