'use client';

import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';

/**
 * 削除確認ダイアログ。
 *
 * 現行実装はネイティブの `confirm()` を使っており、押すまで画面全体が
 * ブロックされたうえ、成功時にも `alert('削除されました')` で二度止まっていた。
 *
 * `<dialog>` を使うのは、フォーカストラップと Esc での閉じをブラウザに任せられるため。
 * 自前で実装すると必ず抜けが出る。
 */
export function DeleteDialog({
  title,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // showModal() でないとフォーカストラップも ::backdrop も効かない。
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="rounded-md border border-border p-6 backdrop:bg-black/40"
      onCancel={(event) => {
        // Esc。保存中に閉じられると状態が読めなくなるので抑止する。
        if (busy) event.preventDefault();
        else onCancel();
      }}
    >
      <h2 className="text-lg font-semibold">スケジュールを削除しますか？</h2>
      <p className="mt-2 text-sm">
        <span className="font-medium">{title}</span> を削除します。この操作は取り消せません。
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        これまでの更新履歴は残りますが、画面からは参照できなくなります。
      </p>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          キャンセル
        </Button>
        <Button variant="destructive" disabled={busy} onClick={onConfirm}>
          {busy ? '削除中…' : '削除する'}
        </Button>
      </div>
    </dialog>
  );
}
