/**
 * マッパの防御的正規化テスト。
 *
 * Firestore は歴史的に書かれたドキュメントの型を保証しない。ここで想定している
 * 「欠けている」「型が違う」ケースは、いずれも一覧画面を丸ごと落としうるので、
 * 例外を投げずに読める形へ倒すことを回帰テストで固定する。
 */

import { DEFAULT_CRON, toArchive, toSchedule } from '@/lib/firestore/mappers';

const complete = {
  uri: 'https://example.com',
  selector: '#content',
  title: 'example',
  schedule: '0 9 * * *',
  slack: '#alerts',
  checkedAt: 1_700_000_000_000,
  createdAt: 1_600_000_000_000,
  createdUser: 'uid-1',
  updatedUser: 'uid-2',
};

describe('toSchedule', () => {
  it('passes a fully populated document through unchanged', () => {
    expect(toSchedule('sched-1', complete)).toEqual({ id: 'sched-1', ...complete });
  });

  it('falls back to the default cron when schedule is missing or empty', () => {
    // backend も `schedule.schedule || DEFAULT_CRON` で同じ既定値に倒すので、
    // 画面表示と実際の挙動が一致する。
    expect(toSchedule('s', { ...complete, schedule: undefined }).schedule).toBe(DEFAULT_CRON);
    expect(toSchedule('s', { ...complete, schedule: '' }).schedule).toBe(DEFAULT_CRON);
  });

  it('normalizes a missing slack to an empty string', () => {
    // '' は「Webhook の既定チャンネルへ通知」という正当な意味を持つ。
    expect(toSchedule('s', { ...complete, slack: undefined }).slack).toBe('');
  });

  it('returns null for a missing createdAt instead of throwing', () => {
    // createdAt を持たない doc は orderBy から除外されるので一覧には出ないが、
    // 単体で読んだ場合に画面を壊さないこと。
    expect(toSchedule('s', { ...complete, createdAt: undefined }).createdAt).toBeNull();
  });

  it('converts a Timestamp-shaped value to epoch milliseconds', () => {
    // 過去に serverTimestamp() が書かれていた場合の保険。
    // この経路を通るデータが実在したら書き込み側にバグがある。
    const timestampLike = { toMillis: () => 1_650_000_000_000 };
    expect(toSchedule('s', { ...complete, checkedAt: timestampLike }).checkedAt).toBe(
      1_650_000_000_000,
    );
  });

  it('returns null for an unparseable timestamp rather than NaN', () => {
    expect(toSchedule('s', { ...complete, checkedAt: 'yesterday' }).checkedAt).toBeNull();
    expect(toSchedule('s', { ...complete, checkedAt: Number.NaN }).checkedAt).toBeNull();
  });

  it('returns null for a missing createdUser (legacy documents predate it)', () => {
    expect(toSchedule('s', { ...complete, createdUser: undefined }).createdUser).toBeNull();
  });

  it('survives a completely empty document', () => {
    const result = toSchedule('s', {});
    expect(result.title).toBe('');
    expect(result.schedule).toBe(DEFAULT_CRON);
    expect(result.createdAt).toBeNull();
  });
});

describe('toArchive', () => {
  it('maps content and time', () => {
    expect(toArchive('a-1', { content: '<p>x</p>', time: 1_700_000_000_000 })).toEqual({
      id: 'a-1',
      content: '<p>x</p>',
      time: 1_700_000_000_000,
    });
  });

  it('falls back to epoch 0 for a broken time instead of throwing', () => {
    // 並び順の基準は失うが、履歴画面ごと落とすよりはよい。
    expect(toArchive('a-1', { content: 'x', time: undefined }).time).toBe(0);
  });
});
