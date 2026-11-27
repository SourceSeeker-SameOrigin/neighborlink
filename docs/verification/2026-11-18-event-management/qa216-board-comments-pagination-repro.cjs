// Actual board.detail cloud entry and P39 page, with synthetic comments only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('../2026-11-09-remediation/cloud-fixture.cjs');
const { runtime } = require('../2026-11-09-remediation/page-fixture.cjs');

async function scenario(hideFirstHundred) {
  const comments = Array.from({ length: 101 }, (_, index) => ({
    _id: `comment-${String(index + 1).padStart(3, '0')}`,
    postId: 'post-1', status: 'ok', authorOpenid: 'another-resident',
    content: `合成评论 ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)),
    moderationHidden: hideFirstHundred && index < 100
  }));
  const post = { _id: 'post-1', communityId: 'c', authorOpenid: 'actor',
    authorUserId: 'u', scope: 'community', type: 'ask', title: '合成求助',
    content: '仅供分页隔离测试', status: 'open', commentsCount: 101,
    images: [], createdAt: new Date(Date.UTC(2026, 10, 1)),
    expireAt: new Date(Date.UTC(2027, 0, 1)) };
  const backend = fixture({ global: true, local: true, orderedQueries: true,
    records: { posts: [post], comments } });
  const ui = runtime(async (name, action, input) => {
    const result = await backend.call(name, action, input);
    if (!result.ok) throw Object.assign(Error(result.message), { code: result.code });
    return result.data;
  });
  ui.app.globalData.user = backend.data.users[0];
  ui.wx.setNavigationBarTitle = () => {};
  const page = ui.instance('miniprogram/board/detail/detail.js');
  page.onLoad({ id: 'post-1' });
  await page.onShow();
  const detail = await backend.call('board', 'detail', { postId: 'post-1' });
  assert.equal(detail.ok, true, JSON.stringify(detail));
  assert.equal(page.data.error, '');
  assert.equal(page.data.post.commentsCount, 101);
  assert.equal(page.data.comments.length, hideFirstHundred ? 0 : 100);
  assert.equal(detail.data.comments.some(item => item._id === 'comment-101'), false);
  assert.equal(typeof page.moreComments, 'undefined');
  assert.equal(backend.writes.length, 0);
  return { hideFirstHundred, totalComments: 101,
    displayed: page.data.comments.length,
    lastVisibleCommentReachable: page.data.comments.some(item => item._id === 'comment-101'),
    loadMoreEntry: typeof page.moreComments === 'function', cloudWrites: backend.writes.length };
}

(async () => {
  const template = fs.readFileSync(path.resolve(__dirname,
    '../../../miniprogram/board/detail/detail.wxml'), 'utf8');
  assert.doesNotMatch(template, /加载更多评论/);
  const cases = [await scenario(false), await scenario(true)];
  console.log(JSON.stringify({ scope: 'actual P39 page and board.detail; synthetic database only',
    cases, realCloudWrites: 0 }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
