// Actual P39 page and board.comment against an isolated synthetic database.
const assert = require('node:assert/strict');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

function setup() {
  const post = { _id: 'post-1', communityId: 'c', authorOpenid: 'author',
    authorUserId: 'author-user', scope: 'community', type: 'ask',
    title: '合成求助', content: '仅供隔离测试', status: 'open',
    commentsCount: 0, images: [], createdAt: new Date(Date.UTC(2026, 10, 1)),
    expireAt: new Date(Date.UTC(2027, 0, 1)) };
  const backend = fixture({ global: true, local: true, allowWrites: true,
    securityResult: { result: { suggest: 'pass' } },
    records: { posts: [post], comments: [] } });
  let loseFirstResponse = true;
  const ui = runtime(async (name, action, input) => {
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    if (name === 'board' && action === 'comment' && loseFirstResponse) {
      loseFirstResponse = false;
      throw Error('合成评论响应丢失');
    }
    return result.data;
  });
  ui.app.globalData.user = backend.data.users[0];
  ui.wx.setNavigationBarTitle = () => {};
  async function page() {
    const instance = ui.instance('miniprogram/board/detail/detail.js');
    instance.onLoad({ id: 'post-1' });
    await instance.onShow();
    assert.equal(instance.data.post?._id, 'post-1');
    instance.setData({ commentText: '合成评论正文' });
    return instance;
  }
  return { backend, ui, page };
}

(async () => {
  const same = setup();
  const original = await same.page();
  await original.comment();
  assert.equal(same.backend.data.comments.length, 1);
  // The fixture stores command.inc as a sentinel; emulate the database's increment.
  same.backend.data.posts[0].commentsCount = 1;
  const firstRequestId = original.commentRequestId;
  assert.equal(original.data.commentRecovery, 'found');
  await original.comment();
  assert.equal(same.backend.data.comments.length, 1);
  assert.equal(original.commentRequestId, firstRequestId);

  const reentry = setup();
  const first = await reentry.page();
  await first.comment();
  assert.equal(reentry.backend.data.comments.length, 1);
  reentry.backend.data.posts[0].commentsCount = 1;
  const lostRequestId = first.commentRequestId;
  assert.equal(first.data.commentRecovery, 'found');
  first.onUnload();
  const reopened = await reentry.page();
  assert.equal(reopened.data.commentRecovery, 'found');
  await reopened.comment();
  assert.equal(reentry.backend.data.comments.length, 1);
  const replay = await reentry.backend.call('board', 'comment', { postId: 'post-1',
    requestId: lostRequestId, content: '合成评论正文' });
  assert.equal(replay.ok, true);
  assert.equal(replay.data.duplicate, true);
  assert.equal(reentry.backend.data.comments.length, 1);
  const conflict = await reentry.backend.call('board', 'comment', { postId: 'post-1',
    requestId: lostRequestId, content: '不同内容' });
  assert.equal(conflict.code, 'E_CONFLICT');
  const otherUser = reentry.backend.data.users[0];
  reentry.ui.app.globalData.user = { ...otherUser, _id: 'other-user', openid: 'other-openid' };
  const otherPage = reentry.ui.instance('miniprogram/board/detail/detail.js');
  otherPage.onLoad({ id: 'post-1' });
  await otherPage.onShow();
  assert.equal(otherPage.data.commentRecovery, '');
  console.log(JSON.stringify({ scope: 'actual P39 and board.comment; isolated synthetic database',
    samePageComments: same.backend.data.comments.length,
    reentryComments: reentry.backend.data.comments.length,
    originalRequestRecoveredOnReentry: reopened.commentReceipt.requestId === lostRequestId,
    serverReplayOfOriginalIsIdempotent: replay.data.duplicate,
    realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
