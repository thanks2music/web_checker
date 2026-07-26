/**
 * cron 検証テスト。
 *
 * backend と同じ cron-parser v4・同じ tz で判定していることを確認する。
 * ここがずれると「保存できたのに設定した時刻に動かない」サイレント故障になる。
 *
 * 併せて「cron の発火時刻」と「実際にチェックが走る時刻」の差も固定する。
 * スケジューラは毎時 05 分にしか起動しないので、cron が 9:00 を指していても
 * 実行は 9:05。ここを取り違えると UI の予告が実挙動とずれる。
 */

import { validateCron } from '@/lib/schedule/cron';

describe('validateCron', () => {
  it('accepts the default hourly cron and reports the next check', async () => {
    const result = await validateCron('0 * * * *');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextCheckAt).toBeInstanceOf(Date);
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

  it('reports the scheduler tick, not the raw cron fire time', async () => {
    // cron は毎時 00 分を指すが、webFetcher は毎時 05 分にしか起動しない。
    // 予告として意味があるのは後者。
    const result = await validateCron('0 * * * *');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextCheckAt.getMinutes()).toBe(5);
      expect(result.nextCheckAt.getSeconds()).toBe(0);
    }
  });

  it('pushes a late-in-the-hour cron to the following tick', async () => {
    // 30 分を指す cron は、その時間の :05 を過ぎているので次の時間の :05 になる。
    const result = await validateCron('30 * * * *');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextCheckAt.getMinutes()).toBe(5);
    }
  });

  it('evaluates in Asia/Tokyo, matching the backend', async () => {
    // 「毎日 9 時」を JST として解釈していることを確認する。
    // JST 09:00 の cron 発火 → 実行は JST 09:05 = UTC 00:05。
    const result = await validateCron('0 9 * * *');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextCheckAt.getUTCHours()).toBe(0);
      expect(result.nextCheckAt.getUTCMinutes()).toBe(5);
    }
  });
});
