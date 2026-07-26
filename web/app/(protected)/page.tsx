import { ScheduleList } from '@/components/schedules/schedule-list';

/**
 * スケジュール一覧ページ。static export で out/index.html になる。
 *
 * 作成・編集・削除は PR F で追加する。
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ScheduleList />
    </main>
  );
}
