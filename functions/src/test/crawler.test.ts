import crawler from '../lib/crawler';

// 注意: このテストは外部サービス（Google）に依存しています
// CI/CD では nock や msw を使用したモックの導入を推奨

describe('crawler', () => {
  test('fetches title from external site', async () => {
    // Google のタイトルを取得
    await expect(crawler('https://www.google.com/?hl=ja', 'title')).resolves.toBe('Google');
  }, 30000);

  test('fetches body content', async () => {
    // body セレクタでコンテンツを取得（内容は変わる可能性があるため、存在確認のみ）
    const result = await crawler('https://www.google.com/?hl=ja', 'body');
    expect(result).toBeTruthy();
    expect(result!.length).toBeGreaterThan(0);
  }, 30000);
});

describe('crawler error handling', () => {
  test('throws error for invalid URI', async () => {
    // @ts-expect-error: Testing invalid input
    await expect(crawler()).rejects.toThrow('invalid URI');
    await expect(crawler(null)).rejects.toThrow('invalid URI');
  });

  test('throws error when http access fails', async () => {
    await expect(crawler('http://non-existent-domain-12345.invalid')).rejects.toThrow();
  }, 30000);
});
