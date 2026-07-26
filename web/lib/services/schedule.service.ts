import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  startAfter,
  updateDoc,
} from 'firebase/firestore';

import { getFirebaseDb } from '@/lib/firebase/client';
import { toSchedule } from '@/lib/firestore/mappers';
import type {
  CreateScheduleInput,
  Schedule,
  UpdateScheduleInput,
} from '@/types/schedule';

/**
 * `schedules` コレクションへのアクセス。
 *
 * Revolution の apps/ai-writer が採る「static メソッドのみを持つ Service クラス」に
 * 揃えている（同リポジトリに hooks や Server Action の前例が無いため）。
 * @see revolution/apps/ai-writer/lib/services/rss-feed.service.ts
 *
 * ## この層が守っている契約（破ると戻せない）
 *
 * 1. **`checkedAt` を書かない。** backend 専有のフィールドで、クライアントが
 *    未来の値を書くと `isAlreadyChecked()` が恒久的に true を返し、定期監視が
 *    エラーも通知も無いまま停止する。型（CreateScheduleInput / UpdateScheduleInput）
 *    でも除外してあるが、意図を明示するためここにも書いておく。
 *
 * 2. **`setDoc` を使わない。** merge なしの全置換は `createdUser` を消し、
 *    Rules の `isOwner()` が永久に false になって Admin SDK でしか復旧できなくなる。
 *    `updateDoc` なら (a) 存在しない doc への書き込みが失敗するので typo で
 *    幽霊 doc を作らない、(b) merge フラグ付け忘れという事故モードが構造的に無い。
 *    この 2 点は __tests__ で回帰テストとして固定している。
 *
 * 3. **タイムスタンプは `Date.now()`（number）。** `serverTimestamp()` を使うと
 *    Firestore Timestamp 型になり、backend の `new Date(...)` が Invalid Date になる。
 *
 * @see web/types/schedule.ts
 * @see firestore.rules
 */

const COLLECTION_NAME = 'schedules';

export interface SchedulePage {
  items: Schedule[];
  /** 次ページ取得に渡すカーソル。これ以上無ければ null */
  nextCursorCreatedAt: number | null;
  hasMore: boolean;
}

export class ScheduleService {
  /**
   * `createdAt` 降順で 1 ページ取得する。
   *
   * カーソルは `QueryDocumentSnapshot` ではなく `createdAt` の値を使う。
   * snapshot を持ち回すと Service が firebase の型をコンポーネントへ漏らし、
   * React state に snapshot を持たせることになるため。
   * ms 精度の `createdAt` が完全一致する doc が複数あると取りこぼす理屈だが、
   * 人間が UI から作る限り実質衝突しないので許容する。
   *
   * `limit(n + 1)` で 1 件多く取って `hasMore` を判定している。
   * `getCountFromServer()` を使わずに済み、追加の読み取り課金が 1 件で済む。
   *
   * NOTE: `orderBy('createdAt')` は当該フィールドを持たない doc を Firestore の
   * 仕様上クエリ結果から除外する。作成時に必ず `createdAt` を書くこと。
   */
  static async listPage(params: {
    limit: number;
    cursorCreatedAt?: number;
  }): Promise<SchedulePage> {
    const db = getFirebaseDb();
    const constraints = [
      orderBy('createdAt', 'desc'),
      ...(params.cursorCreatedAt === undefined
        ? []
        : [startAfter(params.cursorCreatedAt)]),
      limitTo(params.limit + 1),
    ];

    const snapshot = await getDocs(query(collection(db, COLLECTION_NAME), ...constraints));
    const all = snapshot.docs.map((entry) => toSchedule(entry.id, entry.data()));

    const hasMore = all.length > params.limit;
    const items = hasMore ? all.slice(0, params.limit) : all;
    const last = items.at(-1);

    return {
      items,
      hasMore,
      nextCursorCreatedAt: hasMore ? (last?.createdAt ?? null) : null,
    };
  }

  /**
   * 新規作成する。
   *
   * `createdUser` には呼び出し元の UID をそのまま入れる。Rules の create 条件
   * `createdUser == request.auth.uid` に直結するので、他人の UID を渡すと拒否される。
   *
   * 作成すると `webCrawlerOnWrite` が発火して初回クロールが走り、その中で
   * backend が `checkedAt` を設定する。だからクライアントは書かなくてよい。
   */
  static async create(input: CreateScheduleInput, uid: string): Promise<string> {
    const db = getFirebaseDb();
    const now = Date.now();

    const created = await addDoc(collection(db, COLLECTION_NAME), {
      uri: input.uri,
      selector: input.selector,
      title: input.title,
      schedule: input.schedule,
      slack: input.slack,
      createdUser: uid,
      createdAt: now,
    });

    return created.id;
  }

  /**
   * 更新する。
   *
   * `uri` または `selector` が変わると `webCrawlerOnWrite` が発火して**即座に
   * 再クロールが走る**。`title` / `slack` / `schedule` だけの変更では走らない。
   * UI 側でもこの挙動を利用者に伝えること。
   */
  static async update(
    id: string,
    input: UpdateScheduleInput,
    uid: string,
  ): Promise<void> {
    const db = getFirebaseDb();

    await updateDoc(doc(db, COLLECTION_NAME, id), {
      uri: input.uri,
      selector: input.selector,
      title: input.title,
      schedule: input.schedule,
      slack: input.slack,
      updatedUser: uid,
    });
  }

  /**
   * 削除する。
   *
   * NOTE: 配下の `archives` サブコレクションは Firestore の仕様上、親 doc を
   * 消しても残る。クライアントには archives の write 権限が無いため掃除もできない。
   * 既知の未対応事項で、必要になったら Admin SDK 側で対処する。
   */
  static async remove(id: string): Promise<void> {
    const db = getFirebaseDb();
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
}
