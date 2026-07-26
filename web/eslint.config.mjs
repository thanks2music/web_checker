import next from 'eslint-config-next';

/**
 * Phase 2 で Revolution monorepo へ移す際は、この import を
 * `import rootConfig from '../../../eslint.config.mjs'` に差し替えて spread する。
 * （apps/ai-writer は '../../' だが、apps/web-checker/web は 1 階層深い）
 */
export default [
  ...next,
  {
    // 設定ファイル自身は対象外。匿名の default export はこれらの形式が要求する書き方で、
    // import/no-anonymous-default-export と本質的に噛み合わない。
    ignores: [
      '.next/**',
      'out/**',
      'next-env.d.ts',
      'node_modules/**',
      'eslint.config.mjs',
      'postcss.config.mjs',
      'jest.config.mjs',
      'next.config.ts',
      'tailwind.config.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // archives.content は Functions が保存した生の HTML 文字列で、これを
      // そのまま描画すると保存済みコンテンツ経由の XSS になる。現行 public/detail.html は
      // エスケープして <pre> にテキストとして流しており、React 化後も同じ扱いを維持する。
      // 構造的に踏めないよう error にする。
      'react/no-danger': 'error',
    },
  },
];
