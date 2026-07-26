import * as fs from 'fs';
import * as path from 'path';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

/**
 * Firestore Rules unit tests.
 *
 * Run via `pnpm test:rules`, which starts the Firestore emulator
 * (see functions/package.json + firebase.json emulators.firestore.port).
 */

const PROJECT_ID = 'web-checker-rules-test';
const RULES_PATH = path.resolve(__dirname, '../../../firestore.rules');

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8808,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const seedScheduleAsOwner = async (ownerUid: string, scheduleId = 'sched-1') => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'schedules', scheduleId), {
      uri: 'https://example.com',
      selector: '#content',
      title: 'example',
      createdUser: ownerUid,
      createdAt: 0,
    });
  });
  return scheduleId;
};

describe('Firestore Rules — schedules collection', () => {
  test('unauthenticated user cannot read schedules', async () => {
    await seedScheduleAsOwner('owner');
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'schedules', 'sched-1')));
  });

  test('authenticated but unapproved user cannot read schedules', async () => {
    await seedScheduleAsOwner('owner');
    const db = testEnv.authenticatedContext('u1', {}).firestore();
    await assertFails(getDoc(doc(db, 'schedules', 'sched-1')));
  });

  test('approved user can read any schedule', async () => {
    await seedScheduleAsOwner('owner');
    const db = testEnv.authenticatedContext('reader', { approved: true }).firestore();
    await assertSucceeds(getDoc(doc(db, 'schedules', 'sched-1')));
  });

  test('approved user CANNOT update another user\'s schedule', async () => {
    await seedScheduleAsOwner('owner');
    const db = testEnv.authenticatedContext('someone-else', { approved: true }).firestore();
    await assertFails(updateDoc(doc(db, 'schedules', 'sched-1'), { title: 'hijacked' }));
  });

  test('approved user CANNOT delete another user\'s schedule', async () => {
    await seedScheduleAsOwner('owner');
    const db = testEnv.authenticatedContext('someone-else', { approved: true }).firestore();
    await assertFails(deleteDoc(doc(db, 'schedules', 'sched-1')));
  });

  test('approved owner CAN update their own schedule', async () => {
    await seedScheduleAsOwner('owner');
    const db = testEnv.authenticatedContext('owner', { approved: true }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'schedules', 'sched-1'), { title: 'renamed' }));
  });

  test('approved user CANNOT write archives directly', async () => {
    await seedScheduleAsOwner('owner');
    const db = testEnv.authenticatedContext('owner', { approved: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'schedules', 'sched-1', 'archives', 'a-1'), {
        content: 'x',
        time: 0,
      }),
    );
  });

  test('approved user CAN read archives', async () => {
    await seedScheduleAsOwner('owner');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schedules', 'sched-1', 'archives', 'a-1'), {
        content: 'x',
        time: 0,
      });
    });
    const db = testEnv.authenticatedContext('reader', { approved: true }).firestore();
    await assertSucceeds(getDoc(doc(db, 'schedules', 'sched-1', 'archives', 'a-1')));
  });
});

/**
 * create のガード。
 *
 * 強化前の suite には create のケースが 1 件も無く、「クライアントが送るペイロードが
 * そもそもルールを通るのか」が検証されていなかった。最初のテストは現行フロントエンド
 * (public/index.html) が実際に送る形をそのまま使う契約テストになっており、
 * ルール強化で既存 UI を壊していないことを保証する。
 */
describe('Firestore Rules — schedules create guards', () => {
  /** 現行フロントエンドが `db.collection('schedules').add()` に渡す形と同一。 */
  const clientCreatePayload = (uid: string) => ({
    schedule: '0 * * * *',
    uri: 'https://example.com',
    title: 'example',
    selector: '#content',
    slack: '',
    createdUser: uid,
    createdAt: 1_700_000_000_000,
    // NOTE: 契約上クライアントが書くべきではないが、現行 UI が書いている。
    // create に hasOnly を掛けていないため通る。Phase 1b のフロント書き換えで除去する。
    checkedAt: 1_700_000_000_000,
  });

  test('approved user CAN create with the payload the current UI sends', async () => {
    const db = testEnv.authenticatedContext('me', { approved: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'schedules', 'new-1'), clientCreatePayload('me')),
    );
  });

  test('unapproved user CANNOT create', async () => {
    const db = testEnv.authenticatedContext('me', {}).firestore();
    await assertFails(setDoc(doc(db, 'schedules', 'new-1'), clientCreatePayload('me')));
  });

  test('CANNOT create a schedule owned by someone else', async () => {
    const db = testEnv.authenticatedContext('me', { approved: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'schedules', 'new-1'), clientCreatePayload('someone-else')),
    );
  });

  test('CANNOT create with a non-https uri', async () => {
    const db = testEnv.authenticatedContext('me', { approved: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'schedules', 'new-1'), {
        ...clientCreatePayload('me'),
        uri: 'http://internal.example',
      }),
    );
  });

  test('CANNOT create without a title', async () => {
    const withoutTitle: Record<string, unknown> = clientCreatePayload('me');
    delete withoutTitle.title;
    const db = testEnv.authenticatedContext('me', { approved: true }).firestore();
    await assertFails(setDoc(doc(db, 'schedules', 'new-1'), withoutTitle));
  });
});

/**
 * update のガード。
 *
 * 強化前は `isApproved() && isOwner()` のみでフィールド検証が無く、承認済みユーザーが
 * DevTools から所有権の付け替え・createdAt の改変・checkedAt の未来値書き込みを
 * 実行できた。いずれもクライアントからは元に戻せない破壊なので、回帰テストとして固定する。
 */
describe('Firestore Rules — schedules update guards', () => {
  const ownerDb = () =>
    testEnv.authenticatedContext('owner', { approved: true }).firestore();

  test('owner CAN update the full field set the current UI saves', async () => {
    await seedScheduleAsOwner('owner');
    // 現行フロントエンドの save ハンドラが書く 6 フィールド。
    await assertSucceeds(
      updateDoc(doc(ownerDb(), 'schedules', 'sched-1'), {
        schedule: '0 */3 * * *',
        uri: 'https://example.com/changed',
        title: 'renamed',
        selector: '#main',
        slack: '#alerts',
        updatedUser: 'owner',
      }),
    );
  });

  test('owner CANNOT reassign createdUser (would permanently lock the document)', async () => {
    await seedScheduleAsOwner('owner');
    await assertFails(
      updateDoc(doc(ownerDb(), 'schedules', 'sched-1'), { createdUser: 'someone-else' }),
    );
  });

  test('owner CANNOT alter createdAt (would drop the doc out of the list query)', async () => {
    await seedScheduleAsOwner('owner');
    await assertFails(
      updateDoc(doc(ownerDb(), 'schedules', 'sched-1'), { createdAt: 9_999_999_999_999 }),
    );
  });

  test('owner CANNOT write checkedAt (would silently halt monitoring)', async () => {
    await seedScheduleAsOwner('owner');
    await assertFails(
      updateDoc(doc(ownerDb(), 'schedules', 'sched-1'), { checkedAt: 9_999_999_999_999 }),
    );
  });

  test('owner CANNOT add an arbitrary field', async () => {
    await seedScheduleAsOwner('owner');
    await assertFails(
      updateDoc(doc(ownerDb(), 'schedules', 'sched-1'), { injected: 'x' }),
    );
  });

  test('owner CANNOT change uri to a non-https scheme', async () => {
    await seedScheduleAsOwner('owner');
    await assertFails(
      updateDoc(doc(ownerDb(), 'schedules', 'sched-1'), { uri: 'http://169.254.169.254/' }),
    );
  });
});
