import { z } from 'zod';

/**
 * スケジュール入力フォームのバリデーション。
 *
 * ## これはセキュリティ境界ではない
 *
 * 承認済みユーザーは DevTools から `updateDoc()` を直接呼べるので、ここを何行
 * 書いてもアクセス制御にはならない。実際の防壁は firestore.rules 側にあり、
 * 所有権・不変フィールド・https 限定・サイズ上限はすべてそちらで強制している。
 * @see firestore.rules
 *
 * このスキーマの役割はデータ品質と UX、すなわち「Rules に弾かれる前に、
 * どの項目がなぜ駄目なのかをユーザーへ具体的に伝える」ことにある。
 * Rules は permission-denied しか返さないので、これが無いと利用者は
 * 何を直せばよいか分からない。
 *
 * ## Rules の制約と数値を揃えてある
 *
 * uri の https 限定、各フィールドの長さ上限は firestore.rules と同じ値にしている。
 * 片方だけ緩めると「フォームは通ったのに保存できない」状態になるため、
 * 変更する際は必ず両方を合わせること。
 */

/** firestore.rules の `uri.size() < 2048` と対応 */
const URI_MAX = 2047;
/** firestore.rules の `selector.size() < 512` と対応 */
const SELECTOR_MAX = 511;
/** firestore.rules の `title.size() < 200` と対応 */
const TITLE_MAX = 199;

export const scheduleFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'タイトルを入力してください')
    .max(TITLE_MAX, `タイトルは ${TITLE_MAX} 文字以内で入力してください`),

  // https 限定は Rules と同じ制約。crawler にスキーム検証も private IP ブロックも
  // 無く、uri を変更すると webCrawlerOnWrite が Admin 権限で即座に fetch するため。
  uri: z
    .string()
    .trim()
    .min(1, 'URL を入力してください')
    .max(URI_MAX, `URL は ${URI_MAX} 文字以内で入力してください`)
    .refine((value) => value.startsWith('https://'), {
      message: 'URL は https:// で始まる必要があります',
    })
    .refine(
      (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'URL の形式が正しくありません' },
    ),

  selector: z
    .string()
    .trim()
    .min(1, 'CSS セレクタを入力してください')
    .max(SELECTOR_MAX, `セレクタは ${SELECTOR_MAX} 文字以内で入力してください`),

  // 空文字は「Webhook の既定チャンネルへ通知」を意味する正当な値。
  // 指定する場合は Slack のチャンネル名形式に限る。
  slack: z
    .string()
    .trim()
    .regex(/^(#[\w.-]+)?$/, 'Slack チャンネル名は #channel-name の形式で入力してください'),

  // cron の厳密な妥当性は cron-parser で非同期に検証する（lib/schedule/cron.ts）。
  // ここでは同期的に判定できる「空でない」ことだけを見る。
  schedule: z.string().trim().min(1, '実行頻度を指定してください'),
});

export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;
