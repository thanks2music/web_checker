/**
 * 履歴パネル。
 *
 * この画面は Slack 通知のリンクから直接開かれるので、パラメータが壊れていても
 * 落ちずに戻り道を示すことが重要。現行 detail.html も同じ配慮をしている。
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ArchivePanel } from '@/components/archives/archive-panel';
import type { Archive } from '@/types/archive';

const archiveListPageMock = jest.fn();
const scheduleGetMock = jest.fn();

jest.mock('@/lib/services/archive.service', () => ({
  ArchiveService: {
    listPage: (...args: unknown[]) => archiveListPageMock(...args) as unknown,
  },
}));

jest.mock('@/lib/services/schedule.service', () => ({
  ScheduleService: {
    get: (...args: unknown[]) => scheduleGetMock(...args) as unknown,
  },
}));

let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

const archiveAt = (index: number): Archive => ({
  id: `arc-${index}`,
  content: `<p>更新 ${index}</p>`,
  time: 1_700_000_000_000 - index * 1_000,
});

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams('scheduleId=dQ6o7fHbui3IffNAsSNP');
  scheduleGetMock.mockResolvedValue(null);
});

describe('ArchivePanel — parameter handling', () => {
  it('shows a way back when scheduleId is missing', () => {
    searchParams = new URLSearchParams();

    render(<ArchivePanel />);

    expect(screen.getByText('無効なパラメータです')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '一覧に戻る' })).toBeInTheDocument();
    // 不正な値で Firestore を叩かないこと。
    expect(archiveListPageMock).not.toHaveBeenCalled();
  });

  it('rejects a scheduleId containing a path separator', () => {
    searchParams = new URLSearchParams('scheduleId=a/b');

    render(<ArchivePanel />);

    expect(screen.getByText('無効なパラメータです')).toBeInTheDocument();
    expect(archiveListPageMock).not.toHaveBeenCalled();
  });
});

describe('ArchivePanel — listing', () => {
  it('renders archives newest first', async () => {
    archiveListPageMock.mockResolvedValue({
      items: [archiveAt(0), archiveAt(1)],
      hasMore: false,
      nextCursorTime: null,
    });

    render(<ArchivePanel />);

    expect(await screen.findByText('<p>更新 0</p>')).toBeInTheDocument();
    expect(screen.getByText('<p>更新 1</p>')).toBeInTheDocument();
  });

  it('renders the raw html as text, never as markup', async () => {
    // content は crawler が保存した生の HTML。描画したら保存型 XSS になる。
    archiveListPageMock.mockResolvedValue({
      items: [{ id: 'a', content: '<img src=x onerror=alert(1)>', time: 0 }],
      hasMore: false,
      nextCursorTime: null,
    });

    const { container } = render(<ArchivePanel />);

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('says so when there is no history yet', async () => {
    archiveListPageMock.mockResolvedValue({ items: [], hasMore: false, nextCursorTime: null });

    render(<ArchivePanel />);

    expect(await screen.findByText('履歴がありません。')).toBeInTheDocument();
  });

  it('surfaces a read failure with a retry', async () => {
    archiveListPageMock.mockRejectedValue({ code: 'unavailable', message: 'boom' });

    render(<ArchivePanel />);

    expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('履歴がありません。')).not.toBeInTheDocument();
  });

  it('appends the next page and forwards the cursor', async () => {
    archiveListPageMock
      .mockResolvedValueOnce({ items: [archiveAt(0)], hasMore: true, nextCursorTime: 555 })
      .mockResolvedValueOnce({ items: [archiveAt(1)], hasMore: false, nextCursorTime: null });

    render(<ArchivePanel />);
    await screen.findByText('<p>更新 0</p>');

    await userEvent.click(screen.getByRole('button', { name: 'もっと読む' }));

    await waitFor(() => expect(screen.getByText('<p>更新 1</p>')).toBeInTheDocument());
    expect(screen.getByText('<p>更新 0</p>')).toBeInTheDocument();
    expect(archiveListPageMock).toHaveBeenLastCalledWith('dQ6o7fHbui3IffNAsSNP', {
      limit: 10,
      cursorTime: 555,
    });
  });
});

describe('ArchivePanel — schedule header', () => {
  it('shows which schedule is being viewed', async () => {
    // Slack のリンクから直接来ると文脈がないため、見出しで補う。
    scheduleGetMock.mockResolvedValue({
      id: 'dQ6o7fHbui3IffNAsSNP',
      title: '日常組',
      uri: 'https://nichijo.world/news/',
      selector: '#newsList',
      schedule: '0 * * * *',
      slack: '',
      checkedAt: null,
      createdAt: 1,
      createdUser: 'uid-1',
      updatedUser: null,
    });
    archiveListPageMock.mockResolvedValue({ items: [], hasMore: false, nextCursorTime: null });

    render(<ArchivePanel />);

    expect(await screen.findByText('日常組')).toBeInTheDocument();
  });

  it('still lists archives when the schedule itself cannot be read', async () => {
    // 見出しが取れないだけで履歴まで諦めない。
    scheduleGetMock.mockRejectedValue(new Error('nope'));
    archiveListPageMock.mockResolvedValue({
      items: [archiveAt(0)],
      hasMore: false,
      nextCursorTime: null,
    });

    render(<ArchivePanel />);

    expect(await screen.findByText('<p>更新 0</p>')).toBeInTheDocument();
  });
});
