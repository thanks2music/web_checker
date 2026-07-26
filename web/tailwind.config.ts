import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS 3.4。
 *
 * Revolution monorepo の apps/ai-writer / apps/frontend が両方 3.4 系のため、
 * Phase 2 の移植時に PostCSS 設定・CSS ディレクティブ・テーマ定義を書き換えずに済むよう
 * バージョンを揃えている。v4 を先取りしないのは、v3 → v4 は公式の移行ツール
 * (`npx @tailwindcss/upgrade`) が一方向で用意されている一方、v4 → v3 の自動移行手段が
 * 存在しないため。後で揃える必要が生じたときのコストが低い側を選んでいる。
 * @see docs/plan/2026-07-25-modernization-and-integration-plan.md
 */
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

export default config;
