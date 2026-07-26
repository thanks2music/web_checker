import type { ButtonHTMLAttributes } from 'react';

/**
 * 最小限の Button。
 *
 * shadcn/ui を入れていないのは、本アプリで必要な UI プリミティブが
 * Button / Input / Alert / Spinner 程度しかないため。CLI と components.json を
 * 抱えるより手書きの方が軽い。将来入れたくなったら差し替えられるよう、
 * API は shadcn の Button（variant / size）に寄せてある。
 */

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
  ghost: 'bg-transparent text-foreground hover:bg-accent',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      // 明示しないと form 内で submit になり、意図しない送信が起きる。
      type={type}
      className={[
        'inline-flex items-center justify-center rounded-md px-4 py-2',
        'text-sm font-medium transition',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        VARIANT_CLASS[variant],
        className,
      ].join(' ')}
      {...props}
    />
  );
}
