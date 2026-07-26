/**
 * 一覧の読み込み・ページング・CRUD・排他編集。
 *
 * 固定したいこと:
 *
 *   1. 取得失敗を空の一覧として見せない。現行 UI は alert() を出したうえで
 *      一覧を空のまま残しており、「0 件」と「読み込み失敗」が区別できなかった。
 *   2. 同時に編集できるのは 1 行だけ。
 *   3. 所有者でない行に編集・削除を出さない。現行は全行に出していて、
 *      押すと Rules に弾かれて初めて失敗が分かる作りだった。
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ScheduleList } from '@/components/schedules/schedule-list';
import type { Schedule } from '@/types/schedule';

const listPageMock = jest.fn();
const removeMock = jest.fn();
const updateMock = jest.fn();
const createMock = jest.fn();

jest.mock('@/lib/services/schedule.service', () => ({
  ScheduleService: {
    listPage: (...args: unknown[]) => listPageMock(...args) as unknown,
    remove: (...args: unknown[]) => removeMock(...args) as unknown,
    update: (...args: unknown[]) => updateMock(...args) as unknown,
    create: (...args: unknown[]) => createMock(...args) as unknown,
  },
}));

const CURRENT_UID = 'uid-me';
jest.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({ uid: CURRENT_UID }),
}));

// jsdom は <dialog> の showModal を実装していない。no-op で潰すと `open` が
// 立たず、閉じたダイアログとしてアクセシビリティツリーから外れてしまうため、
// 属性まで再現する。
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

const scheduleAt = (index: number, owner = CURRENT_UID): Schedule => ({
  id: `sched-${index}`,
  uri: `https://example.com/${index}`,
  selector: '#content',
  title: `監視 ${index}`,
  schedule: '0 * * * *',
  slack: '',
  checkedAt: null,
  createdAt: 1_000 - index,
  createdUser: owner,
  updatedUser: null,
});

const rowFor = (title: string) => screen.getByText(title).closest('li') as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  removeMock.mockResolvedValue(undefined);
  updateMock.mockResolvedValue(undefined);
});

describe('ScheduleList — reading', () => {
  it('renders the fetched schedules', async () => {
    listPageMock.mockResolvedValue({
      items: [scheduleAt(1), scheduleAt(2)],
      hasMore: false,
      nextCursorCreatedAt: null,
    });

    render(<ScheduleList />);

    expect(await screen.findByText('監視 1')).toBeInTheDocument();
    expect(screen.getByText('監視 2')).toBeInTheDocument();
  });

  it('distinguishes an empty collection from a failed read', async () => {
    listPageMock.mockResolvedValue({ items: [], hasMore: false, nextCursorCreatedAt: null });

    render(<ScheduleList />);

    expect(
      await screen.findByText('登録されているスケジュールはありません。'),
    ).toBeInTheDocument();
  });

  it('surfaces a read failure with a retry instead of showing an empty list', async () => {
    listPageMock.mockRejectedValue({ code: 'unavailable', message: 'boom' });

    render(<ScheduleList />);

    expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument();
    expect(
      screen.queryByText('登録されているスケジュールはありません。'),
    ).not.toBeInTheDocument();
  });

  it('appends the next page rather than replacing the current one', async () => {
    listPageMock
      .mockResolvedValueOnce({
        items: [scheduleAt(1)],
        hasMore: true,
        nextCursorCreatedAt: 999,
      })
      .mockResolvedValueOnce({
        items: [scheduleAt(2)],
        hasMore: false,
        nextCursorCreatedAt: null,
      });

    render(<ScheduleList />);
    await screen.findByText('監視 1');

    await userEvent.click(screen.getByRole('button', { name: 'もっと読む' }));

    await waitFor(() => expect(screen.getByText('監視 2')).toBeInTheDocument());
    expect(screen.getByText('監視 1')).toBeInTheDocument();
    expect(listPageMock).toHaveBeenLastCalledWith({ limit: 20, cursorCreatedAt: 999 });
  });
});

describe('ScheduleList — ownership', () => {
  it('offers edit and delete on rows the user owns', async () => {
    listPageMock.mockResolvedValue({
      items: [scheduleAt(1)],
      hasMore: false,
      nextCursorCreatedAt: null,
    });

    render(<ScheduleList />);
    await screen.findByText('監視 1');

    const row = rowFor('監視 1');
    expect(within(row).getByRole('button', { name: '編集' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '削除' })).toBeInTheDocument();
  });

  it('hides them on rows owned by someone else (the rules would reject anyway)', async () => {
    listPageMock.mockResolvedValue({
      items: [scheduleAt(1, 'someone-else')],
      hasMore: false,
      nextCursorCreatedAt: null,
    });

    render(<ScheduleList />);
    await screen.findByText('監視 1');

    const row = rowFor('監視 1');
    expect(within(row).queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    // 履歴は誰でも見られる（Rules も read は承認済み全員に許可している）。
    expect(within(row).getByRole('link', { name: '履歴' })).toBeInTheDocument();
  });
});

describe('ScheduleList — exclusive editing', () => {
  beforeEach(() => {
    listPageMock.mockResolvedValue({
      items: [scheduleAt(1), scheduleAt(2)],
      hasMore: false,
      nextCursorCreatedAt: null,
    });
  });

  it('disables the other rows while one is being edited', async () => {
    render(<ScheduleList />);
    await screen.findByText('監視 1');

    await userEvent.click(within(rowFor('監視 1')).getByRole('button', { name: '編集' }));

    expect(await screen.findByText('スケジュールを編集')).toBeInTheDocument();

    const otherRow = rowFor('監視 2');
    expect(within(otherRow).getByRole('button', { name: '編集' })).toBeDisabled();
    expect(within(otherRow).getByRole('button', { name: '削除' })).toBeDisabled();
  });

  it('hides the create form while editing so there is only one draft at a time', async () => {
    render(<ScheduleList />);
    await screen.findByText('監視 1');

    expect(screen.getByRole('button', { name: 'スケジュールを追加' })).toBeInTheDocument();

    await userEvent.click(within(rowFor('監視 1')).getByRole('button', { name: '編集' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'スケジュールを追加' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('discards the draft on cancel without writing anything', async () => {
    render(<ScheduleList />);
    await screen.findByText('監視 1');

    await userEvent.click(within(rowFor('監視 1')).getByRole('button', { name: '編集' }));
    await screen.findByText('スケジュールを編集');

    const titleInput = screen.getByLabelText('タイトル');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '書き換えた');

    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    // 元の値のまま戻ること。現行実装は data-value からの手動復元で、ここがバグ源だった。
    await waitFor(() => expect(screen.getByText('監視 1')).toBeInTheDocument());
    expect(screen.queryByText('書き換えた')).not.toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('ScheduleList — delete', () => {
  beforeEach(() => {
    listPageMock.mockResolvedValue({
      items: [scheduleAt(1)],
      hasMore: false,
      nextCursorCreatedAt: null,
    });
  });

  it('asks for confirmation before deleting', async () => {
    render(<ScheduleList />);
    await screen.findByText('監視 1');

    await userEvent.click(within(rowFor('監視 1')).getByRole('button', { name: '削除' }));

    expect(await screen.findByText('スケジュールを削除しますか？')).toBeInTheDocument();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('removes the row locally after a confirmed delete', async () => {
    render(<ScheduleList />);
    await screen.findByText('監視 1');

    await userEvent.click(within(rowFor('監視 1')).getByRole('button', { name: '削除' }));
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));

    await waitFor(() => expect(screen.queryByText('監視 1')).not.toBeInTheDocument());
    expect(removeMock).toHaveBeenCalledWith('sched-1');
    // 現行は削除後にページ全体をリロードしていた。再取得していないこと。
    expect(listPageMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the row and reports the failure when the delete is rejected', async () => {
    removeMock.mockRejectedValue({ code: 'permission-denied', message: 'nope' });

    render(<ScheduleList />);
    await screen.findByText('監視 1');

    await userEvent.click(within(rowFor('監視 1')).getByRole('button', { name: '削除' }));
    await userEvent.click(await screen.findByRole('button', { name: '削除する' }));

    expect(await screen.findByText('削除に失敗しました')).toBeInTheDocument();
    // 行が消えていないこと。失敗時もダイアログは開いたままなので、
    // タイトルは一覧とダイアログの両方に現れる。ここでは一覧側だけを見る。
    expect(screen.getByRole('list')).toHaveTextContent('監視 1');
    expect(removeMock).toHaveBeenCalledWith('sched-1');
  });
});
