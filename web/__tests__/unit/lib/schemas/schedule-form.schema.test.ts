/**
 * フォームスキーマの検証テスト。
 *
 * このスキーマはセキュリティ境界ではない（DevTools から SDK を直接叩けば迂回できる）。
 * 実際の防壁は firestore.rules 側にあり、ここが担うのは
 * 「Rules に弾かれる前に、どの項目がなぜ駄目なのかを具体的に伝える」こと。
 *
 * したがって重要なのは、**Rules と同じ条件で落ちること**である。
 * 片方だけ緩いと「フォームは通ったのに保存できない」状態になる。
 */

import { scheduleFormSchema } from '@/lib/schemas/schedule-form.schema';

const valid = {
  title: 'ドズル社',
  uri: 'https://example.com/news',
  selector: '#newsList',
  slack: '#revolution',
  schedule: '0 * * * *',
};

describe('scheduleFormSchema', () => {
  it('accepts a valid form', () => {
    expect(scheduleFormSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an empty slack channel (means the webhook default)', () => {
    expect(scheduleFormSchema.safeParse({ ...valid, slack: '' }).success).toBe(true);
  });

  it('rejects a non-https uri, matching the rules', () => {
    // firestore.rules の uri.matches('^https://.*') と同じ条件。
    expect(scheduleFormSchema.safeParse({ ...valid, uri: 'http://example.com' }).success).toBe(
      false,
    );
  });

  it('rejects a javascript: uri', () => {
    expect(
      scheduleFormSchema.safeParse({ ...valid, uri: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('rejects a malformed uri', () => {
    expect(scheduleFormSchema.safeParse({ ...valid, uri: 'https://' }).success).toBe(false);
  });

  it.each([
    ['title', ''],
    ['selector', ''],
    ['schedule', ''],
  ])('rejects an empty %s', (field, value) => {
    expect(scheduleFormSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });

  it('rejects a slack channel without the leading hash', () => {
    expect(scheduleFormSchema.safeParse({ ...valid, slack: 'revolution' }).success).toBe(false);
  });

  it('rejects fields longer than the rules allow', () => {
    // firestore.rules の size() 上限と揃えてある。
    expect(scheduleFormSchema.safeParse({ ...valid, title: 'a'.repeat(200) }).success).toBe(
      false,
    );
    expect(
      scheduleFormSchema.safeParse({ ...valid, selector: 'a'.repeat(512) }).success,
    ).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    const result = scheduleFormSchema.safeParse({ ...valid, title: '  spaced  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('spaced');
    }
  });
});
