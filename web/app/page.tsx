/**
 * スケジュール一覧のプレースホルダ。
 *
 * このファイルが存在することで static export が out/index.html を生成し、
 * 現行 public/index.html と同じ URL を占められることを scaffold 段階で確認できる。
 * 実装は後続 PR（認証 → 一覧 → 作成/編集 → 履歴）で入れ替える。
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">WEB CHECKER</h1>
      <p className="mt-2 text-muted-foreground">
        Web ページの変更を監視して Slack に通知します。
      </p>
    </main>
  );
}
