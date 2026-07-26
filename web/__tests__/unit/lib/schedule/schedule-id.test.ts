/**
 * scheduleId の検証。
 *
 * この値は Slack 通知のリンク（`/detail.html?scheduleId=...`）経由で
 * 外から渡ってくる。Firestore のパスに直接使うので、`/` を含む値を
 * 通すとサブコレクションのパスが壊れる。
 */

import { isValidScheduleId } from '@/lib/schedule/schedule-id';

describe('isValidScheduleId', () => {
  it('accepts a Firestore auto-generated id', () => {
    // 20 文字の英数字。実データの形。
    expect(isValidScheduleId('dQ6o7fHbui3IffNAsSNP')).toBe(true);
  });

  it.each([
    ['hyphens', 'my-schedule'],
    ['underscores', 'my_schedule'],
    ['a single character', 'a'],
  ])('accepts an id with %s', (_label, value) => {
    expect(isValidScheduleId(value)).toBe(true);
  });

  it('rejects a path separator, which would break the subcollection path', () => {
    expect(isValidScheduleId('a/b')).toBe(false);
    expect(isValidScheduleId('../other')).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(isValidScheduleId(value)).toBe(false);
  });

  it('rejects an id longer than the Firestore limit', () => {
    expect(isValidScheduleId('a'.repeat(1501))).toBe(false);
    expect(isValidScheduleId('a'.repeat(1500))).toBe(true);
  });

  it('rejects characters outside the allowed set', () => {
    expect(isValidScheduleId('id with space')).toBe(false);
    expect(isValidScheduleId('id<script>')).toBe(false);
  });
});
