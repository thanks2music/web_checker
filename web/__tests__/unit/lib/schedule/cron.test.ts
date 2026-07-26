/**
 * cron 検証テスト。
 *
 * backend と同じ cron-parser v4・同じ tz で判定していることを確認する。
 * ここがずれると「保存できたのに設定した時刻に動かない」サイレント故障になる。
 */

import { validateCron } from '@/lib/schedule/cron';

describe('validateCron', () => {
  it('accepts the default hourly cron and reports the next run', async () => {
    const result = await validateCron('0 * * * *');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextRun).toBeInstanceOf(Date);
    }
  });

  it.each([
    ['every three hours', '0 */3 * * *'],
    ['weekdays at 9', '0 9 * * 1-5'],
    ['weekly on monday', '0 9 * * 1'],
    ['six fields with seconds', '0 0 9 * * *'],
  ])('accepts %s', async (_label, expression) => {
    await expect(validateCron(expression)).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ['an out-of-range hour', '0 25 * * *'],
    ['gibberish', 'not a cron'],
    ['too few fields', '0 *'],
  ])('rejects %s', async (_label, expression) => {
    await expect(validateCron(expression)).resolves.toMatchObject({ ok: false });
  });

  it('rejects an empty expression with a user-facing message', async () => {
    const result = await validateCron('   ');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('実行頻度を入力してください');
    }
  });

  it('evaluates in Asia/Tokyo, matching the backend', async () => {
    // 「毎日 9 時」を JST として解釈していることを、UTC 表現から逆算して確かめる。
    // JST 09:00 は UTC 00:00 なので、次回実行の UTC 時刻は 0 時ちょうどになる。
    const result = await validateCron('0 9 * * *');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextRun.getUTCHours()).toBe(0);
      expect(result.nextRun.getUTCMinutes()).toBe(0);
    }
  });
});
