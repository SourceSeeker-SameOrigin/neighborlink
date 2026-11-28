const { parseAddressLines, deliveryItem, skippedItem, batchStatus, deliveredCount, billing, statement, statementCsv,
  providerBatchView, providerBatchDetail } = require('../station');

test('解析多行楼栋、单元和门牌，忽略空行并拒绝重复地址', () => {
  expect(parseAddressLines('1栋-1单元-302\n\n2栋-2单元-501')).toEqual([
    { buildingName: '1栋', unit: '1单元', room: '302' },
    { buildingName: '2栋', unit: '2单元', room: '501' }
  ]);
  expect(() => parseAddressLines('1栋-1单元-302\n1栋-1单元-302')).toThrow('重复');
  expect(() => parseAddressLines('1栋-302')).toThrow('楼栋-单元-门牌');
});

test('逐户送达需上传本批次照片；失败项记录原因', () => {
  const item = { status: 'pending' };
  const now = new Date('2026-11-07T01:00:00Z');
  expect(deliveryItem(item, { status: 'delivered', photoFileId: 'cloud://env/station/b1/photo.jpg' }, 'b1', now))
    .toEqual({ status: 'delivered', photoFileId: 'cloud://env/station/b1/photo.jpg', at: now });
  expect(() => deliveryItem(item, { status: 'delivered', photoFileId: 'cloud://env/station/b2/photo.jpg' }, 'b1', now))
    .toThrow('本批次');
  expect(deliveryItem(item, { status: 'failed', reason: '无人应答' }, 'b1', now))
    .toEqual({ status: 'failed', failReason: '无人应答', at: now });
});

test('撤回授权后标记跳过并记录原因，不当作送达计费', () => {
  const now = new Date('2026-11-07T01:00:00Z');
  const skipped = skippedItem({ status: 'pending' }, '住户已撤回送上门授权', now);
  expect(skipped).toEqual({ status: 'skipped', failReason: '住户已撤回送上门授权', at: now });
  expect(deliveredCount([{ status: 'delivered' }, skipped])).toBe(1);
  expect(batchStatus([{ status: 'delivered' }, skipped])).toBe('done');
});

test('只在所有门牌均已处理后结束批次，计费件数只统计送达项', () => {
  const items = [{ status: 'delivered' }, { status: 'failed' }, { status: 'pending' }];
  expect(batchStatus(items)).toBe('assigned');
  expect(deliveredCount(items)).toBe(1);
  expect(batchStatus(items.slice(0, 2))).toBe('done');
});

test('驿站按实际送达件数计费，默认驿站费用50分、服务员40分', () => {
  expect(billing(20)).toEqual({ gross: 1000, provider: 800, property: 0, platform: 200, goods: 0 });
  expect(billing(3, { perPiece: 60, perPiecePayout: 45 })).toEqual({
    gross: 180, provider: 135, property: 0, platform: 45, goods: 0
  });
  expect(() => billing(2, { perPiece: 40, perPiecePayout: 50 })).toThrow('服务员计件');
});

test('月度对账仅统计完成批次的实际送达件数并输出公式安全CSV', () => {
  const from = new Date('2026-11-01T00:00:00Z');
  const to = new Date('2026-12-01T00:00:00Z');
  const result = statement([{ _id: 'b1', stationCode: '=S1', providerId: 'p1', status: 'done',
    completedAt: new Date('2026-11-20T00:00:00Z'), priceSnapshot: {},
      items: [{ consented: true, status: 'delivered' }, { consented: true, status: 'failed' }, { consented: true, status: 'skipped' },
      { consented: false, status: 'delivered' }] },
  { _id: 'b2', status: 'assigned', completedAt: new Date('2026-11-21T00:00:00Z'), items: [] }], from, to);
  expect(result).toMatchObject({ gross: 50, provider: 40 });
  expect(result.rows[0].skipped).toBe(1);
  expect(result.rows).toHaveLength(1);
  const csv = statementCsv(result);
  expect(csv).toContain("'=S1");
  expect(csv).toContain('"纳入门牌数"');
  expect(csv).toContain('"b1","\'=S1","p1","2026-11-20T00:00:00.000Z","3","1","1","1","50","40"');
});

test('服务员批次响应只包含同意配送的履约字段', () => {
  const batch = { _id: 'b1', communityId: 'private-community', stationCode: 'S1', providerId: 'p1',
    providerOpenid: 'private-openid', priceSnapshot: {}, createdAt: new Date(), status: 'assigned',
    items: [{ _id: 'i1', userId: 'private-user', consented: true, buildingName: '3号楼', unit: '1单元', room: '302', status: 'pending' },
      { _id: 'i2', consented: false, buildingName: '3号楼', unit: '1单元', room: '303', status: 'pending' }] };
  expect(providerBatchView(batch).itemCount).toBe(1);
  const view = providerBatchDetail(batch);
  expect(view.items).toHaveLength(1);
  expect(view.items[0]).toMatchObject({ buildingName: '3号楼', room: '302', status: 'pending' });
  expect(JSON.stringify(view)).not.toMatch(/private-user|private-openid|private-community/);
});
