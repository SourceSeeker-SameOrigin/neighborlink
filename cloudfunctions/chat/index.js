const cloud = require('wx-server-sdk');
const { createServer } = require('./lib/shared/server');
const { createChatFlow } = require('./lib/shared/chatFlow');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const server = createServer(cloud);
const chat = createChatFlow(cloud, server);

async function open(event, context) { return chat.openOrder(event, context); }
async function openIdle(event, context) { return chat.openIdle(event, context); }

exports.main = server.entry({ open, openIdle, pull: chat.pull, send: chat.send, list: chat.list,
  markRead: chat.markRead, adminPull: chat.adminPull }, ['resident', 'admin', 'property'], 'chat');
