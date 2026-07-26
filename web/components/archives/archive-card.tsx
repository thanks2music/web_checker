import { formatJst } from '@/lib/utils/format-date';
import type { Archive } from '@/types/archive';

/**
 * 履歴 1 件。
 *
 * `content` は crawler が `fetchAsHtml: true` で取得した**生の HTML 断片**。
 * これをそのまま描画すると保存済みコンテンツ経由の XSS になるため、
 * 必ずテキストとして扱う。React は既定でエスケープするので `{content}` で足りるが、
 * `dangerouslySetInnerHTML` を使わないことは eslint の react/no-danger でも
 * 構造的に禁止している。
 *
 * 現行 detail.html も escapeHtml した文字列を `<pre>` に流しており、
 * 「HTML タグが文字として見える」のが意図した見た目。ここでも踏襲する。
 */
export function ArchiveCard({ archive }: { archive: Archive }) {
  return (
    <li className="rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold">{formatJst(archive.time)}</h3>

      {/*
        max-height を付けて 1 件が画面を占有しないようにする（現行の 300px を踏襲）。
        長い行は折り返し、単語途中でも切る。
      */}
      <pre className="mt-2 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {archive.content}
      </pre>
    </li>
  );
}
