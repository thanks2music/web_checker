/**
 * 読み込み中表示。
 *
 * 現行 public/index.html の `#loading` は `position: absolute` の
 * インラインスタイルで、オーバーレイになっておらず読み込み中もボタンを押せた。
 * ここでは呼び出し側がレイアウトを決められるようにし、
 * 支援技術向けに role と可視テキストを持たせている。
 */
export function Spinner({ label = '読み込み中' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-8">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
      />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
