const { decorateMedia, filesInView, matchesFolder } = require('../mediaAccess');
const { createServer } = require('../server');
const id = path => 'cloud://test-bucket/' + path;
function fixture(records = {}) {
  const cloud = { getTempFileURL: jest.fn(async ({ fileList }) => ({ fileList: fileList.map(row => ({
    fileID: row.fileID, tempFileURL: 'https://example.test/' + encodeURIComponent(row.fileID), status: 0 })) })) };
  const server = { get: jest.fn(async (table, key) => records[table + '/' + key] || null),
    one: jest.fn(async (_, query) => records['users/' + query.openid] || null) };
  return { cloud, server };
}
test('媒体字段白名单不把备注和审核内部列表作为签发输入', () => {
  expect([...filesInView({ note: id('kyc/u/x'), moderationPendingFileIds: [id('kyc/u/x')],
    images: [id('board/u/a')] })]).toEqual([id('board/u/a')]);
});
test.each(['../kyc/u/a', '%2e%2e/kyc/u/a', '%2e%2e%2fkyc/u/a', 'a\\b', 'a?x', 'a#x'])('目录穿越和参数不签发 %s', path => {
  expect(matchesFolder(id('orders/o/' + path), ['orders/o'])).toBe(false);
});
test('相关订单图片签发 600 秒，伪造身份证引用被拒，保留原 fileID', async () => {
  const { cloud, server } = fixture({ 'orders/o': { _id: 'o' } });
  const view = { _id: 'o', photos: [id('orders/o/a'), id('kyc/u/a')] };
  const result = await decorateMedia(cloud, server, 'order', 'detail', { fileList: [id('kyc/u/a')] }, view);
  expect(cloud.getTempFileURL).toHaveBeenCalledWith({ fileList: [{ fileID: id('orders/o/a'), maxAge: 600 }] });
  expect(result.photos).toEqual(view.photos);
  expect(result._media[id('kyc/u/a')].url).toBe('');
});
test('旧记录与所属作者目录不一致时不签发，不自动移动删除', async () => {
  const { cloud, server } = fixture({ 'posts/p': { _id: 'p', authorUserId: 'owner' } });
  const result = await decorateMedia(cloud, server, 'board', 'detail', {}, { post: { _id: 'p', images: [id('board/other/a')] } });
  expect(result._media[id('board/other/a')].url).toBe('');
  expect(cloud.getTempFileURL).not.toHaveBeenCalled();
});
test('审核状态变化后不再给证件签发新链接', async () => {
  for (const status of ['pending', 'approved', 'rejected']) {
    const { cloud, server } = fixture({ 'providers/p': { _id: 'p', userId: 'u', status } });
    await decorateMedia(cloud, server, 'admin', 'listProviders', {}, { list: [{ _id: 'p', kycFileIds: [id('kyc/u/a')] }] });
    expect(cloud.getTempFileURL.mock.calls.length).toBe(status === 'pending' ? 1 : 0);
  }
});
test('未出现在业务裁剪视图的待审图片不会签发', async () => {
  const { cloud, server } = fixture({ 'posts/p': { _id: 'p', authorUserId: 'u', images: [id('board/u/a'), id('board/u/pending')] } });
  await decorateMedia(cloud, server, 'board', 'detail', {}, { post: { _id: 'p', images: [id('board/u/a')] } });
  expect(cloud.getTempFileURL.mock.calls[0][0].fileList).toHaveLength(1);
});
test('每批至多 50 个文件，去重，失败不导致业务详情丢失', async () => {
  const { cloud, server } = fixture();
  const photos = Array.from({ length: 101 }, (_, i) => id('pet/o/' + i));
  cloud.getTempFileURL.mockRejectedValueOnce(Error('offline'));
  const result = await decorateMedia(cloud, server, 'pet', 'listVisits', { orderId: 'o' }, { list: [{ photos: [...photos, photos[0]] }] });
  expect(cloud.getTempFileURL.mock.calls.map(call => call[0].fileList.length)).toEqual([50, 50, 1]);
  expect(result.list[0].photos).toHaveLength(102);
  expect(result._media[photos[0]].url).toBe('');
  expect(result._media[photos[100]].url).toMatch(/^https:/);
});
test('未知接口和写入响应不产生签名', async () => {
  const { cloud, server } = fixture();
  await decorateMedia(cloud, server, 'board', 'create', {}, { images: [id('board/u/a')] });
  expect(cloud.getTempFileURL).not.toHaveBeenCalled();
});
test('鉴权拒绝时签发和业务处理均不运行', async () => {
  const cloud = { database: () => ({ command: {}, collection() { throw Error('unexpected DB'); } }),
    getWXContext: () => ({}), getTempFileURL: jest.fn() };
  const handler = jest.fn();
  const result = await createServer(cloud).entry({ detail: handler }, null, 'order')({ action: 'detail', openid: 'forged' });
  expect(result.code).toBe('E_FORBIDDEN'); expect(handler).not.toHaveBeenCalled(); expect(cloud.getTempFileURL).not.toHaveBeenCalled();
});
test('旧媒体字段中的外部链接无法证明归属，不透传为可展示链接', async () => {
  const { cloud, server } = fixture({ 'posts/p': { _id: 'p', authorUserId: 'u' } });
  const file = 'https://unverified.example/image.jpg';
  const result = await decorateMedia(cloud, server, 'board', 'detail', {}, { post: { _id: 'p', images: [file] } });
  expect(result._media[file].url).toBe(''); expect(cloud.getTempFileURL).not.toHaveBeenCalled();
});
test('巡检分项照片也经过订单目录校验与签发', async () => {
  const { cloud, server } = fixture({ 'orders/o': { _id: 'o', serviceCode: 'vacant' } });
  const good = id('vacant/o/windows/a'), bad = id('vacant/other/windows/a');
  const result = await decorateMedia(cloud, server, 'order', 'detail', {}, { _id: 'o', vacantReport: { photoByItem: { windows: [good], utilities: [bad] } } });
  expect(result._media[good].url).toMatch(/^https:/); expect(result._media[bad].url).toBe('');
  expect(cloud.getTempFileURL).toHaveBeenCalledTimes(1);
});
