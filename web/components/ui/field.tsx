import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';

/**
 * ラベル・補足・エラーをまとめた入力欄。
 *
 * 現行実装には `<label>` が 1 つも無く、入力欄の意味は placeholder と
 * テーブル見出しからしか読み取れなかった（スクリーンリーダーでは対応関係が失われる）。
 * また `<form>` 要素も無かったので Enter 送信もネイティブ検証も効かなかった。
 *
 * ここでは label を必須にし、補足とエラーを aria-describedby で結び付ける。
 */

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>

      {children({ inputId, describedBy })}

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_CLASS = [
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

export function TextField({
  label,
  hint,
  error,
  ...props
}: { label: string; hint?: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ inputId, describedBy }) => (
        <input
          id={inputId}
          type="text"
          aria-describedby={describedBy}
          // 検証エラーを支援技術にも伝える。視覚的な赤字だけでは届かない。
          aria-invalid={error ? true : undefined}
          className={[CONTROL_CLASS, error ? 'border-destructive' : ''].join(' ')}
          {...props}
        />
      )}
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ inputId, describedBy }) => (
        <select
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={[CONTROL_CLASS, error ? 'border-destructive' : ''].join(' ')}
          {...props}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}
