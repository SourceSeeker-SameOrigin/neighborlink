const { newOrderConversation, orderConversationId, newIdleConversation, idleConversationId, idleReadOnly,
  readOnly, messageView, checkSendRate } = require('../chatData');

const order = { _id: 'o1', kind: 'service', status: 'accepted', userOpenid: 'u1', providerOpenid: 'p1', communityId: 'c1' };

test('订单接单后创建成员受限的确定性会话；换服务员产生独立会话', () => {
  const first = newOrderConversation(order, new Date('2026-11-07T00:00:00Z'));
  expect(first).toMatchObject({ _id: orderConversationId('o1', 'p1'), type: 'order', refId: 'o1',
    members: ['u1', 'p1'], unread: { u1: 0, p1: 0 } });
  expect(orderConversationId('o1', 'p2')).not.toBe(first._id);
  expect(() => newOrderConversation({ ...order, status: 'paid' })).toThrow('尚未接单');
});

test('闲置会话由商品与买家确定，售出后转只读', () => {
  const item = { _id: 'i1', communityId: 'c1', sellerOpenid: 'seller', tradeMode: 'offline', status: 'on_sale' };
  const conversation = newIdleConversation(item, 'buyer', new Date('2026-11-07T00:00:00Z'));
  expect(conversation._id).toBe(idleConversationId('i1', 'buyer'));
  expect(conversation.members).toEqual(['buyer', 'seller']);
  expect(idleReadOnly(item, conversation)).toBe(false);
  expect(idleReadOnly({ ...item, status: 'sold' }, conversation)).toBe(true);
  expect(idleReadOnly({ ...item, moderationHidden: true }, conversation)).toBe(true);
  expect(() => newIdleConversation({ ...item, sellerOpenid: 'buyer' }, 'buyer')).toThrow('不完整');
});

test('完成后按配置时长转只读，取消订单立即只读', () => {
  const conversation = { closedAt: null };
  const config = { phoneVisibleHoursAfterDone: 24 };
  const completed = { ...order, status: 'completed', completedAt: new Date('2026-11-07T00:00:00Z') };
  expect(readOnly(completed, conversation, config, new Date('2026-11-07T23:59:59Z'))).toBe(false);
  expect(readOnly(completed, conversation, config, new Date('2026-11-08T00:00:00Z'))).toBe(true);
  expect(readOnly({ ...order, status: 'cancelled' }, conversation, config)).toBe(true);
  expect(readOnly(order, { closedAt: new Date() }, config)).toBe(true);
});

test('待审核图片仅发送者可见文件地址，审核通过后会话成员可见', () => {
  const message = { _id: 'm1', from: 'u1', type: 'image', fileId: 'cloud://secret', status: 'pending' };
  expect(messageView(message, 'u1')).toMatchObject({ mine: true, fileId: 'cloud://secret' });
  expect(messageView(message, 'p1')).toEqual(expect.objectContaining({ content: '图片审核中', mine: false }));
  expect(messageView(message, 'p1')).not.toHaveProperty('fileId');
  expect(messageView({ ...message, status: 'ok' }, 'p1').fileId).toBe('cloud://secret');
  expect(messageView({ ...message, status: 'blocked' }, 'u1')).not.toHaveProperty('fileId');
});

test('同一用户发消息需间隔至少 1 秒', () => {
  const previous = new Date('2026-11-07T00:00:00.000Z');
  expect(checkSendRate(previous, new Date(previous.getTime() + 1000))).toBe(true);
  expect(() => checkSendRate(previous, new Date(previous.getTime() + 999))).toThrow('发送太快');
});

test('moderation-hidden text and images expose only a placeholder to participants',()=>{
 for(const type of ['text','image']) {const raw={_id:'m',from:'sender',type,status:'ok',content:'hidden original',fileId:'cloud://private',moderationHidden:true};for(const viewer of ['sender','reader']){const view=messageView(raw,viewer);expect(view.content).not.toBe(raw.content);expect(view.fileId).toBeUndefined();expect(view.status).toBe('hidden');}expect(messageView(raw,'admin',true)[type==='text'?'content':'fileId']).toBe(type==='text'?raw.content:raw.fileId);}
});
