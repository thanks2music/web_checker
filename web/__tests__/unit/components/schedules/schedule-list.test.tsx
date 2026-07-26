/**
 * 一覧の読み込み・ページング・エラー表示。
 *
 * 特に固定したいのは「取得失敗を空の一覧として見せない」こと。
 * 現行 UI は alert() を出したうえで一覧を空のまま残しており、
 * 「登録 0 件」と「読み込み失敗」が画面上で区別できなかった。
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ScheduleList } from '@/components/schedules/schedule-list';
import type { Schedule } from '@/types/schedule';

const listPageMock = jest.fn();
jest.mock('@/lib/services/schedule.service', () => ({
  ScheduleService: {
    listPage: (...args: unknown[]) => listPageMock(...args) as unknown,
  },
}));

const scheduleAt = (index: number): Schedule => ({
  id: `sched-${index}`,
  uri: `https://example.com/${index}`,
  selector: '#content',
  title: `監視 ${index}`,
  schedule: '0 * * * *',
  slack: '',
  checkedAt: null,
  createdAt: 1_000 - index,
  createdUser: 'uid-1',
  updatedUser: null,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ScheduleList', () => {
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
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
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
    // 追記型なので 1 件目も残っていること。
    expect(screen.getByText('監視 1')).toBeInTheDocument();
    // カーソルが次ページ取得に渡っていること。
    expect(listPageMock).toHaveBeenLastCalledWith({ limit: 20, cursorCreatedAt: 999 });
  });

  it('hides the load-more control when there is nothing left', async () => {
    listPageMock.mockResolvedValue({
      items: [scheduleAt(1)],
      hasMore: false,
      nextCursorCreatedAt: null,
    });

    render(<ScheduleList />);
    await screen.findByText('監視 1');

    expect(screen.queryByRole('button', { name: 'もっと読む' })).not.toBeInTheDocument();
  });
});
