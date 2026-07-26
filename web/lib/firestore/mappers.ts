import type { DocumentData } from 'firebase/firestore';

import type { Archive } from '@/types/archive';
import type { Schedule } from '@/types/schedule';

/**
 * Firestore のスナップショットをアプリの型へ正規化する。
 *
 * ## なぜ読み取りに Zod を当てないのか
 *
 * 書き込み（フォーム入力）には Zod を使うが、読み取りには使わない。Firestore は
 * 歴史的に書かれたドキュメントの型を保証せず、`createdAt` が無い doc や、
 * 誰かが過去に `serverTimestamp()` を書いてしまった doc が現実に存在しうる。
 * ここで `parse()` すると 1 件の壊れた doc が一覧全体を落とすし、`safeParse()` に
 * しても「表示できない行がある」ことに変わりはない。
 *
 * 監視ダッシュボードにとって「多少欠けていても全件見える」ことは
 * 「型が厳密である」ことより優先度が高い。だから欠損は既定値へ、
 * 想定外の型は読める形へ倒す方針を採る。
 *
 * ## 同時に、これは契約のドキュメントでもある
 *
 * `asEpochMillis` が Timestamp らしきオブジェクトを受け付けるのは保険であって、
 * 推奨ではない。書き込み側は必ず `Date.now()`（number）を使うこと。
 * @see web/types/schedule.ts
 */

/** cron が空・未設定の場合に backend が使う既定値と揃える。 */
export const DEFAULT_CRON = '0 * * * *';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * ms epoch の number に正規化する。
 *
 * number ならそのまま。`toMillis()` を持つオブジェクト（Firestore Timestamp）なら
 * 変換する。それ以外（undefined / null / 文字列など）は null。
 *
 * Timestamp を受け付けるのは過去の書き込み事故に対する保険で、この経路を
 * 通ったデータが存在したら書き込み側にバグがある。
 */
function asEpochMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    const millis = (value as { toMillis: () => unknown }).toMillis();
    return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
  }

  return null;
}

export function toSchedule(id: string, data: DocumentData): Schedule {
  return {
    id,
    uri: asString(data.uri),
    selector: asString(data.selector),
    title: asString(data.title),
    // 空文字も既定 cron に倒す。backend も `schedule.schedule || DEFAULT_CRON` で
    // 同じフォールバックをしているので、画面表示と実際の挙動が一致する。
    schedule: asString(data.schedule) || DEFAULT_CRON,
    // slack は undefined と '' を区別しない。どちらも「既定チャンネルへ通知」を意味する。
    slack: asString(data.slack),
    checkedAt: asEpochMillis(data.checkedAt),
    createdAt: asEpochMillis(data.createdAt),
    createdUser: asStringOrNull(data.createdUser),
    updatedUser: asStringOrNull(data.updatedUser),
  };
}

export function toArchive(id: string, data: DocumentData): Archive {
  return {
    id,
    content: asString(data.content),
    // time が壊れている doc は並び順の基準を失うが、表示は 0（epoch）で続行する。
    // ここで例外を投げると履歴画面ごと落ちるため。
    time: asEpochMillis(data.time) ?? 0,
  };
}
