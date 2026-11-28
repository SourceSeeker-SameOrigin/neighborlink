const { AppError } = require('./errors');

const TRANSITIONS = {
  pending_quote: ['pending_pay', 'closed'],
  pending_pay: ['paid', 'closed'],
  paid: ['accepted', 'cancelled'],
  accepted: ['in_service', 'paid', 'cancelled'],
  in_service: ['delivered', 'cancelled'],
  delivered: ['completed', 'disputed'],
  disputed: ['completed', 'refunded'],
  completed: ['disputed'],
  cancelled: [],
  closed: [],
  refunded: []
};

const STATUS_TEXT = Object.freeze({
  pending_quote: '待报价', pending_pay: '待支付', paid: '待接单', accepted: '已接单', in_service: '服务中',
  delivered: '待确认', disputed: '售后处理中', completed: '已完成',
  cancelled: '已取消', closed: '已关闭', refunded: '已退款'
});

function canTransition(from, to, kind) {
  if (kind === 'idle_purchase' && from === 'accepted' && to === 'delivered') return true;
  return typeof from === 'string' && typeof to === 'string' &&
    Object.prototype.hasOwnProperty.call(TRANSITIONS, from) && TRANSITIONS[from].includes(to);
}

// 这里只校验状态边，角色、投诉期限及数据库条件更新由对应云函数负责。
function assertTransition(from, to, kind) {
  if (!canTransition(from, to, kind)) throw new AppError('E_BAD_STATE', '订单状态已变化，无法执行此操作');
}

module.exports = { canTransition, assertTransition, STATUS_TEXT };
