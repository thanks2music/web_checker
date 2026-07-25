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
});
