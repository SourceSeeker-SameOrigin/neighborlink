const { atomic, read, insert } = require('./transaction');
const { ensure, text, integer } = require('./validate');
const { newOrderConversation, orderConversationId, idleConversationId, newIdleConversation, idleReadOnly,
  readOnly, messageView, checkSendRate } = require('./chatData');
const { isEnabled } = require('./features');

async function ensureOrderConversation(server, order) {
  ensure(order && order.providerOpenid, '订单尚未指派服务员', 'E_BAD_STATE');
  const id = orderConversationId(order._id, order.providerOpenid);
  return atomic(server.db, async transaction => {
    const currentOrder = await read(transaction, 'orders', order._id);
    ensure(currentOrder && currentOrder.providerOpenid === order.providerOpenid,
      '订单服务员已变化，请刷新后重试', 'E_CONFLICT');
    const existing = await read(transaction, 'conversations', id);
    if (existing) return existing;
    const conversation = newOrderConversation(currentOrder);
    if (currentOrder.completedAt) {
      const config = await read(transaction, 'config', 'global');
      conversation.closeAt = new Date(new Date(currentOrder.completedAt).getTime() +
        Number(config.phoneVisibleHoursAfterDone) * 3600000);
      if (conversation.closeAt <= new Date()) conversation.closedAt = new Date();
    }
    await insert(transaction, 'conversations', conversation);
    return conversation;
  });
}

function createChatFlow(cloud, server) {
  const { db, command } = server;
  async function orderForMember(conversation, openid) {
    ensure(conversation && conversation.type === 'order' && conversation.members.includes(openid), '无权访问此会话', 'E_FORBIDDEN');
    const order = await server.get('orders', conversation.refId);
    ensure(order && (order.userOpenid === openid || order.providerOpenid === openid), '已不再参与此订单会话', 'E_FORBIDDEN');
    return order;
  }

  async function ensureWritable(order, conversation, config, now) {
    ensure(order.providerOpenid && conversation.members.includes(order.providerOpenid), '当前订单服务员不在会话中', 'E_FORBIDDEN');
    ensure(!readOnly(order, conversation, config, now), '该会话已关闭，只能查看历史消息', 'E_BAD_STATE');
    ensure(['accepted', 'in_service', 'delivered', 'disputed', 'completed'].includes(order.status), '当前订单状态不能发送消息', 'E_BAD_STATE');
  }

  async function idleForMember(conversation, openid) {
    ensure(conversation && conversation.type === 'idle' && conversation.members.includes(openid), '无权访问此会话', 'E_FORBIDDEN');
    const item = await server.get('idleItems', conversation.refId);
    ensure(item && conversation.members.includes(item.sellerOpenid), '已不再参与此闲置会话', 'E_FORBIDDEN');
    await ensureIdleAccess(item, openid);
    return item;
  }

  async function ensureIdleAccess(item, buyerOpenid, cache = null) {
    const config = cache && cache.config || await server.config();
    const buyer = cache && cache.buyer || await server.one('users', { openid: buyerOpenid });
    async function community(id) {
      if (cache && cache.communities.has(id)) return cache.communities.get(id);
      const value = await server.get('communities', id);
      if (cache) cache.communities.set(id, value);
      return value;
    }
    const buyerCommunity = buyer && await community(buyer.communityId);
    const sellerCommunity = await community(item.communityId);
    ensure(buyerCommunity && sellerCommunity && buyerCommunity.status === 'active' && sellerCommunity.status === 'active',
      '小区暂不可用', 'E_FORBIDDEN');
    const sameCommunity = buyerCommunity._id === sellerCommunity._id;
    const federation = item.scope === 'federation' && buyerCommunity.federationGroupId &&
      buyerCommunity.federationGroupId === sellerCommunity.federationGroupId &&
      isEnabled('federation', config, buyerCommunity) && isEnabled('federation', config, sellerCommunity);
    ensure(sameCommunity || federation, '无权访问此闲置会话', 'E_FORBIDDEN');
    ensure(isEnabled('idle', config, buyerCommunity) && isEnabled('idle', config, sellerCommunity) &&
      isEnabled('chat', config, buyerCommunity) && isEnabled('chat', config, sellerCommunity),
      '该功能暂未开放', 'E_FEATURE_OFF');
  }

  async function ensureIdleWritable(item, conversation) {
    ensure(!idleReadOnly(item, conversation), '该闲置会话已关闭，只能查看历史消息', 'E_BAD_STATE');
  }

  async function openOrder(event, { openid }) {
    text(event.orderId, '订单');
    const order = await server.get('orders', event.orderId);
    ensure(order && order.kind === 'service', '订单会话不存在');
    ensure(order.userOpenid === openid || order.providerOpenid === openid, '无权访问此订单会话', 'E_FORBIDDEN');
    ensure(order.providerOpenid, '服务员接单后即可聊天', 'E_BAD_STATE');
    const { community, settings } = await server.feature('chat', order.communityId);
    const conversation = await ensureOrderConversation(server, order);
    return { conversationId: conversation._id, readOnly: readOnly(order, conversation, settings),
      unread: conversation.unread && conversation.unread[openid] || 0, enabled: Boolean(community) };
  }

  async function openIdle(event, { openid }) {
    text(event.itemId, '闲置商品');
    const item = await server.get('idleItems', event.itemId);
    ensure(item && item.sellerOpenid !== openid && !item.moderationHidden, '商品不存在或不能与自己聊天', 'E_FORBIDDEN');
    await ensureIdleAccess(item, openid);
    const conversation = await atomic(db, async transaction => {
      const current = await read(transaction, 'idleItems', item._id);
      ensure(current && current.sellerOpenid !== openid && current.status === 'on_sale' &&
        current.tradeMode === 'offline' && !current.moderationHidden,
        '该闲置当前不可聊天', 'E_BAD_STATE');
      const id = idleConversationId(current._id, openid);
      const existing = await read(transaction, 'conversations', id);
      if (existing) return existing;
      const value = newIdleConversation(current, openid);
      await insert(transaction, 'conversations', value);
      return value;
    });
    return { conversationId: conversation._id, readOnly: idleReadOnly(item, conversation),
      unread: conversation.unread && conversation.unread[openid] || 0, enabled: true };
  }

  async function pullMessages(conversation, reference, openid, event, config, review = false) {
    const now = new Date();
    const isReadOnly = conversation.type === 'idle' ? idleReadOnly(reference, conversation) : readOnly(reference, conversation, config, now);
    if (isReadOnly && !conversation.closedAt) await db.collection('conversations').doc(conversation._id)
      .update({ data: { closedAt: now, updatedAt: now } });
    const mode = review ? 'legacy' : event.mode || 'legacy';
    ensure(['legacy', 'latest', 'older', 'newer'].includes(mode), '消息读取方式不正确');
    const afterId = !event.afterId ? '' : text(event.afterId, '消息游标', 100);
    const beforeId = !event.beforeId ? '' : text(event.beforeId, '消息游标', 100);
    if (mode === 'older') ensure(beforeId, '缺少较早消息游标');
    const filter = { convId: conversation._id };
    if (mode === 'older') filter._id = command.lt(beforeId);
    else if (afterId) filter._id = command.gt(afterId);
    const descending = mode === 'latest' || mode === 'older';
    const result = await db.collection('messages').where(filter).orderBy('_id', descending ? 'desc' : 'asc')
      .limit(mode === 'legacy' ? 50 : 51).get();
    const rows = result.data.slice(0, 50);
    if (descending) rows.reverse();
    return { conversationId: conversation._id, list: rows.map(item => messageView(item, openid, review)),
      hasMore: mode === 'legacy' ? result.data.length === 50 : result.data.length > 50,
      firstId: rows.length ? rows[0]._id : beforeId,
      lastId: rows.length ? rows[rows.length - 1]._id : afterId,
      readOnly: isReadOnly, unread: conversation.unread && conversation.unread[openid] || 0 };
  }

  async function pull(event, { openid }) {
    text(event.conversationId, '会话');
    const conversation = await server.get('conversations', event.conversationId);
    const reference = conversation && conversation.type === 'idle'
      ? await idleForMember(conversation, openid) : await orderForMember(conversation, openid);
    await server.feature('chat', reference.communityId);
    return pullMessages(conversation, reference, openid, event, await server.config());
  }

  async function send(event, { openid }) {
    text(event.conversationId, '会话');
    require('./ugc').ensureCanPublish(await server.user(openid));
    ensure(['text', 'image'].includes(event.type), '消息类型不正确');
    const conversation = await server.get('conversations', event.conversationId);
    const reference = conversation && conversation.type === 'idle'
      ? await idleForMember(conversation, openid) : await orderForMember(conversation, openid);
    const { settings: config } = await server.feature('chat', reference.communityId);
    const now = new Date();
    if (conversation.type === 'idle') await ensureIdleWritable(reference, conversation);
    else await ensureWritable(reference, conversation, config, now);
    let content = '';
    let fileId = null;
    if (event.type === 'text') {
      text(event.content, '消息内容', 500);
      const { checkText } = require('./ugc');
      content = await checkText(cloud, event.content, { blacklist: config.blacklist, type: 'message', openid });
    } else {
      fileId = text(event.fileId, '图片文件', 300);
      require('./providerData').fileInFolder(fileId, 'chat/' + conversation._id);
    }
    const recipient = conversation.members.find(member => member !== openid);
    ensure(recipient, '会话参与者不完整', 'E_CONFIG');
    const message = await atomic(db, async transaction => {
      const current = await read(transaction, 'conversations', conversation._id);
      ensure(current && current.members.includes(openid), '会话已变化，请刷新后重试', 'E_CONFLICT');
      const currentReference = current.type === 'idle'
        ? await read(transaction, 'idleItems', current.refId) : await read(transaction, 'orders', current.refId);
      ensure(currentReference, '关联内容不存在', 'E_FORBIDDEN');
      const [currentConfig, currentCommunity] = await Promise.all([read(transaction, 'config', 'global'),
        read(transaction, 'communities', currentReference.communityId)]);
      ensure(isEnabled('chat', currentConfig, currentCommunity), '该功能暂未开放', 'E_FEATURE_OFF');
      if (current.type === 'idle') {
        ensure(current.members.includes(currentReference.sellerOpenid), '会话卖家已变化', 'E_CONFLICT');
        await ensureIdleWritable(currentReference, current);
      } else {
        ensure(current.members.includes(currentReference.providerOpenid), '当前订单服务员不在会话中', 'E_FORBIDDEN');
        await ensureWritable(currentReference, current, currentConfig, now);
      }
      const lastSentAt = current.lastSentAt && current.lastSentAt[openid] ? new Date(current.lastSentAt[openid]) : null;
      checkSendRate(lastSentAt, now);
      const messageSeq = integer(current.messageSeq || 0, '消息序号', 0, Number.MAX_SAFE_INTEGER - 1) + 1;
      const id = current._id + '_' + String(messageSeq).padStart(12, '0');
      const value = { _id: id, convId: current._id, communityId: current.communityId, from: openid,
        type: event.type, content, fileId, status: event.type === 'image' ? 'pending' : 'ok', createdAt: now };
      await insert(transaction, 'messages', value);
      const unread = { ...(current.unread || {}), [recipient]: (current.unread && current.unread[recipient] || 0) + 1 };
      await transaction.collection('conversations').doc(current._id).update({ data: {
        lastMessage: event.type === 'image' ? '图片审核中' : content.slice(0, 100), lastAt: now, unread,
        lastSentAt: { ...(current.lastSentAt || {}), [openid]: now }, messageSeq, updatedAt: now
      } });
      return value;
    });
    if (event.type === 'image') {
      const { requestMediaCheck } = require('./ugc');
      try { await requestMediaCheck(cloud, db, { fileId, targetType: 'message', targetId: message._id,
        authorOpenid: openid, communityId: reference.communityId }); }
      catch (_) {
        await db.collection('messages').doc(message._id).update({ data: { status: 'blocked', moderationFailedAt: new Date() } });
        await db.collection('conversations').doc(conversation._id).update({ data: { lastMessage: '图片未通过审核', updatedAt: new Date() } });
      }
    }
    return { messageId: message._id, status: message.status };
  }

  async function list(event, { openid }) {
    await server.featureEntry('chat', await server.user(openid));
    const pageSize = event.limit === undefined ? 100 : integer(event.limit, '每页会话数', 1, 100);
    const cursor = event.cursor || null;
    if (cursor) {
      ensure(typeof cursor === 'object' && !Array.isArray(cursor) &&
        typeof cursor.id === 'string' && cursor.id.length > 0 && cursor.id.length <= 100 &&
        typeof cursor.lastAt === 'string' && Number.isFinite(Date.parse(cursor.lastAt)),
      '会话分页位置不正确');
    }
    const list = [];
    const config = await server.config();
    const idleCache = { config, buyer: null, communities: new Map() };
    const communityCache = new Map();
    const communityFor = id => {
      if (!communityCache.has(id)) communityCache.set(id, server.get('communities', id));
      return communityCache.get(id);
    };
    async function view(conversation) {
      if (conversation.type === 'order') {
        const order = await server.get('orders', conversation.refId);
        if (!order || (order.userOpenid !== openid && order.providerOpenid !== openid)) return null;
        const community = await communityFor(order.communityId);
        if (!isEnabled('chat', config, community)) return null;
        return { conversationId: conversation._id, type: conversation.type, refId: conversation.refId,
          serviceName: ({ express: '代取快递', trash: '代扔垃圾', buy: '周边代买', help: '帮把手' })[order.serviceCode] || '订单',
          lastMessage: conversation.lastMessage || '', lastAt: conversation.lastAt,
          unread: conversation.unread && conversation.unread[openid] || 0,
          readOnly: readOnly(order, conversation, config) };
      } else if (conversation.type === 'idle') {
        const item = await server.get('idleItems', conversation.refId);
        if (!item || !conversation.members.includes(openid)) return null;
        try {
          if (!idleCache.buyerLoaded) {
            idleCache.buyer = await server.one('users', { openid });
            idleCache.buyerLoaded = true;
          }
          await ensureIdleAccess(item, openid, idleCache);
        }
        catch (error) {
          if (['E_FORBIDDEN', 'E_FEATURE_OFF'].includes(error.code)) return null;
          throw error;
        }
        return { conversationId: conversation._id, type: conversation.type, refId: conversation.refId,
          serviceName: item.title, lastMessage: conversation.lastMessage || '', lastAt: conversation.lastAt,
          unread: conversation.unread && conversation.unread[openid] || 0,
          readOnly: idleReadOnly(item, conversation) };
      }
      return null;
    }
    let rawCursor = cursor && { lastAt: new Date(cursor.lastAt), id: cursor.id };
    let unreadTotal = cursor ? null : 0, hasMore = false, nextCursor = null;
    while (true) {
      const filter = rawCursor ? command.or([
        { members: openid, lastAt: command.lt(rawCursor.lastAt) },
        { members: openid, lastAt: rawCursor.lastAt, _id: command.lt(rawCursor.id) }
      ]) : { members: openid };
      const result = await db.collection('conversations').where(filter)
        .orderBy('lastAt', 'desc').orderBy('_id', 'desc').limit(100).get();
      const rows = result.data;
      for (let start = 0; start < rows.length; start += 8) {
        const group = rows.slice(start, start + 8);
        const visible = await Promise.all(group.map(view));
        for (let index = 0; index < group.length; index++) {
          const item = visible[index];
          if (!item) continue;
          if (!cursor) unreadTotal += item.unread;
          const conversation = group[index];
          if (list.length >= pageSize) { hasMore = true; continue; }
          list.push(item);
          nextCursor = { lastAt: new Date(conversation.lastAt).toISOString(), id: conversation._id };
        }
        if (cursor && hasMore) break;
      }
      if (cursor && hasMore || rows.length < 100) break;
      const last = rows[rows.length - 1];
      rawCursor = { lastAt: new Date(last.lastAt), id: last._id };
    }
    return { list, unreadTotal, hasMore, nextCursor: hasMore ? nextCursor : null };
  }

  async function markRead(event, { openid }) {
    text(event.conversationId, '会话');
    let seenSequence = null;
    if (event.seenMessageId !== undefined) {
      const id = text(event.seenMessageId, '已显示的消息', 100);
      ensure(id.startsWith(event.conversationId + '_') && /^\d{12}$/.test(id.slice(event.conversationId.length + 1)),
        '已显示的消息编号不正确');
      seenSequence = Number(id.slice(event.conversationId.length + 1));
    }
    const initial = await server.get('conversations', event.conversationId);
    const reference = initial && initial.type === 'idle'
      ? await idleForMember(initial, openid) : await orderForMember(initial, openid);
    await server.feature('chat', reference.communityId);
    await atomic(db, async transaction => {
      const conversation = await read(transaction, 'conversations', initial._id);
      ensure(conversation && conversation.members.includes(openid), '无权访问此会话', 'E_FORBIDDEN');
      if (seenSequence !== null) ensure((conversation.messageSeq || 0) <= seenSequence,
        '会话有新消息，请先读取', 'E_CONFLICT');
      await transaction.collection('conversations').doc(conversation._id)
        .update({ data: { ['unread.' + openid]: 0, updatedAt: new Date() } });
    });
    return { conversationId: initial._id, unread: 0 };
  }

  async function adminPull(event, { user, openid }) {
    ensure(user.roles.includes('admin'), '只有管理员可处理聊天举报或投诉', 'E_FORBIDDEN');
    let caseMessage = null;
    let conversation = event.conversationId ? await server.get('conversations', text(event.conversationId, '会话')) : null;
    if (!conversation && event.reportId) {
      const report = await server.get('reports', text(event.reportId, '举报记录'));
      ensure(report && report.targetType === 'message', '聊天举报不存在', 'E_FORBIDDEN');
      const message = await server.get('messages', report.targetId);
      if (message) { caseMessage = message; conversation = await server.get('conversations', message.convId); }
    }
    if (!conversation && event.orderId) {
      const order = await server.get('orders', text(event.orderId, '订单'));
      if (order && order.providerOpenid) conversation = await server.get('conversations',
        orderConversationId(order._id, order.providerOpenid));
    }
    ensure(conversation && ['order', 'idle'].includes(conversation.type), '会话不存在');
    const reference = await server.get(conversation.type === 'idle' ? 'idleItems' : 'orders', conversation.refId);
    ensure(reference, '关联业务不存在');
    let reason;
    let caseId;
    if (event.caseType === 'complaint') {
      ensure(conversation.type === 'order' && reference.status === 'disputed' && reference.complaint && !reference.complaint.resolution,
        '该订单当前没有待处理投诉', 'E_FORBIDDEN');
      reason = 'complaint'; caseId = reference._id;
    } else if (event.caseType === 'report') {
      text(event.reportId, '举报记录');
      const report = await server.get('reports', event.reportId);
      ensure(report && report.status === 'pending' && report.targetType === 'message', '该聊天举报已处理或无权查看', 'E_FORBIDDEN');
      const message = await server.get('messages', report.targetId);
      ensure(message && message.convId === conversation._id, '举报内容不属于此会话', 'E_FORBIDDEN');
      caseMessage = message;
      reason = 'report'; caseId = report._id;
    } else ensure(false, '请提供有效的投诉或举报案件', 'E_FORBIDDEN');
    await server.feature('chat', reference.communityId);
    await db.collection('auditLogs').add({ data: { action: 'chat_admin_view', actorOpenid: openid,
      ...(conversation.type === 'order' ? { orderId: reference._id } : { itemId: reference._id }), conversationId: conversation._id, caseType: reason, caseId, at: new Date() } });
    const result = await pullMessages(conversation, reference, openid, event, await server.config(), true);
    if (caseMessage && !result.list.some(item => item._id === caseMessage._id)) {
      result.list.push(messageView(caseMessage, openid, true));
      result.list.sort((left, right) => left._id.localeCompare(right._id));
    }
    const senderRows = await Promise.all(result.list.map(item => server.get('messages', item._id)));
    return { ...result, list: result.list.map((item, index) => ({ ...item,
      from: senderRows[index] && senderRows[index].from || '' })) };
  }

  return { openOrder, openIdle, pull, send, list, markRead, adminPull };
}

module.exports = { ensureOrderConversation, createChatFlow };
