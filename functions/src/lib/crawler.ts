import axios from 'axios';
import * as cheerio from 'cheerio';
import jschardet from 'jschardet';
import iconv from 'iconv-lite';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * 指定された URL からコンテンツを取得する
 * @param uri 取得対象の URL
 * @param selector CSS セレクタ（省略時は 'body'）
 * @param fetchAsHtml true の場合は HTML、false の場合はテキストを返す
 * @returns 取得したコンテンツ（HTML またはテキスト）、要素が見つからない場合は null
 */
const crawler = async (
  uri: string | null | undefined,
  selector?: string | null,
  fetchAsHtml?: boolean
): Promise<string | null> => {
  console.log('crawl: ', uri);

  if (typeof uri === 'undefined' || uri === null) {
    throw new Error('invalid URI');
  }

  const effectiveSelector = (typeof selector === 'undefined' || selector === null)
    ? 'body'
    : selector;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get<Buffer>(uri, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        maxRedirects: 10,
        timeout: 30000,
      });

      // 文字コード検出と変換
      const detected = jschardet.detect(response.data);
      const encoding = detected.encoding || 'utf-8';
      const html = iconv.decode(response.data, encoding);

      const $ = cheerio.load(html, { decodeEntities: false } as cheerio.CheerioOptions);

      if (fetchAsHtml) {
        return $(effectiveSelector).html();
      } else {
        const result: string[] = [];
        $(effectiveSelector).each((_i, dom) => {
          result.push($(dom).text());
        });
        return result.join("\n");
      }
    } catch (err) {
      lastError = err as Error;
      console.error(`crawl attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }

  throw lastError ?? new Error('crawl failed with no error captured');
};

export default crawler;
