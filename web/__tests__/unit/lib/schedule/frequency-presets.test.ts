/**
 * プリセットのラウンドトリップ検証。
 *
 * 守りたいのは「編集画面を開いて保存しただけで実行頻度が変わる」事故。
 * プリセットに無い cron を勝手に丸めると、ユーザーが意図せず監視頻度を変えてしまう。
 */

import { DEFAULT_CRON } from '@/lib/firestore/mappers';
import { FREQUENCY_PRESETS, matchPreset } from '@/lib/schedule/frequency-presets';

describe('matchPreset', () => {
  it('round-trips every preset', () => {
    for (const preset of FREQUENCY_PRESETS) {
      expect(matchPreset(preset.cron)).toEqual(preset);
    }
  });

  it('treats an unknown cron as custom rather than coercing it', () => {
    expect(matchPreset('15 3 * * 2')).toBeUndefined();
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(matchPreset('  0   *   *   *   *  ')?.cron).toBe(DEFAULT_CRON);
  });

  it('uses the shared default cron for the first preset', () => {
    // backend のフォールバック値とプリセット既定値がずれないこと。
    expect(FREQUENCY_PRESETS[0].cron).toBe(DEFAULT_CRON);
  });
});
