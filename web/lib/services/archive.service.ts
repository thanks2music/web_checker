import {
  collection,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';

import { getFirebaseDb } from '@/lib/firebase/client';
import { toArchive } from '@/lib/firestore/mappers';
import type { Archive } from '@/types/archive';

/**
 * `schedules/{scheduleId}/archives` サブコレクションへのアクセス。
 *
 * **読み取り専用。** firestore.rules が `allow write: if false` としており、
 * 書き込むのは webCrawler（Admin SDK）だけ。create / update / delete を
 * そもそも定義しないことで、API 表面そのものを契約の表現にしている。
 *
 * @see firestore.rules
 * @see functions/src/webCrawler.ts
 */

export interface ArchivePage {
  items: Archive[];
  /** 次ページ取得に渡すカーソル。これ以上無ければ null */
  nextCursorTime: number | null;
  hasMore: boolean;
}

export class ArchiveService {
  /**
   * `time` 降順で 1 ページ取得する。
   *
   * ページサイズは schedules より小さめを想定している。`content` は
   * クロールしたページの HTML 断片そのもので、1 件が数十 KB になりうるため。
   */
  static async listPage(
    scheduleId: string,
    params: { limit: number; cursorTime?: number },
  ): Promise<ArchivePage> {
    const db = getFirebaseDb();
    const constraints = [
      orderBy('time', 'desc'),
      ...(params.cursorTime === undefined ? [] : [startAfter(params.cursorTime)]),
      limitTo(params.limit + 1),
    ];

    const snapshot = await getDocs(
      query(collection(db, 'schedules', scheduleId, 'archives'), ...constraints),
    );
    const all = snapshot.docs.map((entry) => toArchive(entry.id, entry.data()));

    const hasMore = all.length > params.limit;
    const items = hasMore ? all.slice(0, params.limit) : all;
    const last = items.at(-1);

    return {
      items,
      hasMore,
      nextCursorTime: hasMore ? (last?.time ?? null) : null,
    };
  }
}
