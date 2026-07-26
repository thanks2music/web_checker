import type { ReactNode } from 'react';

/**
 * 通知表示。
 *
 * 現行実装は成功も失敗も `alert()` / `confirm()` で出しており、
 * OK を押すまで画面がブロックされていた。ここではインライン表示にし、
 * `aria-live` で支援技術にも伝わるようにする。
 */
type Tone = 'info' | 'warning' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  info: 'border-border bg-secondary text-secondary-foreground',
  warning: 'border-yellow-300 bg-yellow-50 text-yellow-900',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      // danger は即座に読み上げ、それ以外は読み上げ中の内容を遮らない。
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      className={['rounded-md border px-4 py-3 text-sm', TONE_CLASS[tone]].join(' ')}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
    </div>
  );
}
