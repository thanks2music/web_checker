const axios = require('axios');
const cheerio = require('cheerio');
const jschardet = require('jschardet');
const iconv = require('iconv-lite');

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const crawler = async (uri, selector, fetchAsHtml) => {
  console.log('crawl: ', uri);

  if (typeof uri === 'undefined' || uri === null) {
    throw new Error('invalid URI');
  }
  if (typeof selector === 'undefined' || selector === null) {
    selector = 'body';
  }

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(uri, {
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

      const $ = cheerio.load(html, { decodeEntities: false });

      if (fetchAsHtml) {
        return $(selector).html();
      } else {
        const result = [];
        $(selector).each((i, dom) => {
          result.push($(dom).text());
        });
        return result.join("\n");
      }
    } catch (err) {
      lastError = err;
      console.error(`crawl attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }

  throw lastError;
};

module.exports = crawler;
