import nock from 'nock';
import crawler from '../lib/crawler';

const HOST = 'https://example.test';

const buildHtml = (title: string, body: string): string =>
  `<html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
  nock.restore();
});

afterEach(() => {
  nock.cleanAll();
});

describe('crawler', () => {
  test('extracts <title> element text', async () => {
    nock(HOST).get('/').reply(200, buildHtml('Test Page', 'hello world'));

    await expect(crawler(`${HOST}/`, 'title')).resolves.toBe('Test Page');
  });

  test('extracts body content', async () => {
    nock(HOST).get('/').reply(200, buildHtml('Test Page', 'body content here'));

    const result = await crawler(`${HOST}/`, 'body');
    expect(result).toBeTruthy();
    expect(result).toContain('body content here');
  });

  test('returns HTML when fetchAsHtml is true', async () => {
    nock(HOST).get('/').reply(200, buildHtml('Test Page', '<p>inner</p>'));

    const result = await crawler(`${HOST}/`, 'body', true);
    expect(result).toContain('<p>inner</p>');
  });
});

describe('crawler error handling', () => {
  test('throws error for invalid URI', async () => {
    // @ts-expect-error: Testing invalid input
    await expect(crawler()).rejects.toThrow('invalid URI');
    await expect(crawler(null)).rejects.toThrow('invalid URI');
  });

  test('throws after exhausting retries on network failure', async () => {
    // The crawler retries up to 3 times, so mock 3 failures.
    nock(HOST).get('/').times(3).replyWithError('connection refused');

    await expect(crawler(`${HOST}/`)).rejects.toThrow();
  });
});
