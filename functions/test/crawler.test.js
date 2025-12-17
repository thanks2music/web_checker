const crawler = require('../lib/crawler');

// 注意: このテストは外部サービス（Google）に依存しています
// CI/CD では nock や msw を使用したモックの導入を推奨
test('crawler fetches title from external site', async () => {
  // Google のタイトルを取得
  await expect(crawler('https://www.google.com/?hl=ja', 'title')).resolves.toBe('Google');
}, 30000);

test('crawler fetches body content', async () => {
  // body セレクタでコンテンツを取得（内容は変わる可能性があるため、存在確認のみ）
  const result = await crawler('https://www.google.com/?hl=ja', 'body');
  expect(result).toBeTruthy();
  expect(result.length).toBeGreaterThan(0);
}, 30000);

test('throw error invalidURI', async () => {
  await expect(crawler()).rejects.toThrow('invalid URI');
  await expect(crawler(null)).rejects.toThrow('invalid URI');
});

test('throw error when http access is failed', async () => {
  await expect(crawler('http://non-existent-domain-12345.invalid')).rejects.toThrow();
}, 30000);
