// Presentation only. Business conditions continue using the original status codes.
module.exports = {
  merchantStatusNames: { pending: '待审核', approved: '已通过', rejected: '已拒绝', suspended: '已停用' },
  eventStatusNames: { draft: '草稿', published: '已发布', ended: '已结束', cancelled: '已取消' },
  signupStatusNames: { pending_pay: '待付款', signed: '已报名', cancelled: '已取消', refunded: '已退款' },
  refundJobStatusNames: { queued: '等待处理', processing: '处理中', completed: '已完成', attention: '需人工处理' }
};
