/**
 * ScheduleService の契約回帰テスト。
 *
 * このファイルが守っているのは「壊れたら気付けず、気付いても戻せない」2 つの事故:
 *
 *   1. クライアントが `checkedAt` を書くと、backend の isAlreadyChecked() が
 *      恒久的に「チェック済み」と判定して定期監視が止まる。エラーも通知も出ない。
 *   2. `setDoc` で全置換すると `createdUser` が消え、Rules の isOwner() が
 *      永久に false になってドキュメントが誰にも編集・削除できなくなる。
 *
 * どちらも UI を目視しても分からないので、呼び出し引数を直接検証する。
 */

import { ScheduleService } from '@/lib/services/schedule.service';

const addDocMock = jest.fn();
const updateDocMock = jest.fn();
const deleteDocMock = jest.fn();
const setDocMock = jest.fn();
const getDocsMock = jest.fn();

jest.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  collection: (...args: unknown[]) => ({ __type: 'collection', args }),
  doc: (...args: unknown[]) => ({ __type: 'doc', args }),
  query: (...args: unknown[]) => ({ __type: 'query', args }),
  orderBy: (...args: unknown[]) => ({ __type: 'orderBy', args }),
  startAfter: (...args: unknown[]) => ({ __type: 'startAfter', args }),
  limit: (...args: unknown[]) => ({ __type: 'limit', args }),
}));

jest.mock('@/lib/firebase/client', () => ({
  getFirebaseDb: () => ({ __type: 'db' }),
}));

const validInput = {
  uri: 'https://example.com',
  selector: '#content',
  title: 'example',
  schedule: '0 * * * *',
  slack: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  addDocMock.mockResolvedValue({ id: 'generated-id' });
  updateDocMock.mockResolvedValue(undefined);
  deleteDocMock.mockResolvedValue(undefined);
});

describe('ScheduleService.create', () => {
  it('never writes checkedAt (would permanently halt monitoring)', async () => {
    await ScheduleService.create(validInput, 'uid-1');

    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('checkedAt');
  });

  it('writes createdAt as a plain number, not a Firestore Timestamp', async () => {
    // serverTimestamp() を使うと Timestamp 型になり、backend の
    // `new Date(schedule.checkedAt)` や cron 比較が Invalid Date になる。
    await ScheduleService.create(validInput, 'uid-1');

    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(typeof payload.createdAt).toBe('number');
  });

  it('always writes createdAt (orderBy would otherwise hide the document)', async () => {
    await ScheduleService.create(validInput, 'uid-1');

    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.createdAt).toBeGreaterThan(0);
  });

  it('sets createdUser to the caller uid (required by the rules)', async () => {
    await ScheduleService.create(validInput, 'uid-1');

    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.createdUser).toBe('uid-1');
  });

  it('writes exactly the expected key set', async () => {
    await ScheduleService.create(validInput, 'uid-1');

    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['createdAt', 'createdUser', 'schedule', 'selector', 'slack', 'title', 'uri'].sort(),
    );
  });
});

describe('ScheduleService.update', () => {
  it('uses updateDoc and never setDoc (a full overwrite would drop createdUser)', async () => {
    await ScheduleService.update('sched-1', validInput, 'uid-1');

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('never touches the immutable or backend-owned fields', async () => {
    await ScheduleService.update('sched-1', validInput, 'uid-1');

    const payload = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('createdUser');
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('checkedAt');
  });

  it('writes exactly the six keys the rules allow', async () => {
    // firestore.rules の hasOnly([...]) と一致していること。
    await ScheduleService.update('sched-1', validInput, 'uid-1');

    const payload = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['schedule', 'selector', 'slack', 'title', 'updatedUser', 'uri'].sort(),
    );
  });
});

describe('ScheduleService.listPage', () => {
  const snapshotOf = (count: number) => ({
    docs: Array.from({ length: count }, (_unused, index) => ({
      id: `doc-${index}`,
      data: () => ({
        uri: 'https://example.com',
        selector: '#content',
        title: `title-${index}`,
        schedule: '0 * * * *',
        slack: '',
        createdAt: 1_000 - index,
        createdUser: 'uid-1',
      }),
    })),
  });

  it('reports hasMore and trims the extra probe row', async () => {
    // limit(n + 1) で 1 件多く取り、n 件だけ返して hasMore を判定する。
    getDocsMock.mockResolvedValue(snapshotOf(3));

    const page = await ScheduleService.listPage({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursorCreatedAt).toBe(999);
  });

  it('reports no more pages when the probe row is absent', async () => {
    getDocsMock.mockResolvedValue(snapshotOf(2));

    const page = await ScheduleService.listPage({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursorCreatedAt).toBeNull();
  });
});
