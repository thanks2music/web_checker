import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.(test|spec).{js,jsx,ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Phase 1b 時点では shared/schemas を参照していないが、Phase 2 の移植で
    // パス（../../../shared/schemas）に直すだけで済むよう先に置いておく。
    '^@revolution/schemas/(.*)$': '<rootDir>/../../shared/schemas/$1',
  },
  testTimeout: 30000,
};

/**
 * next/jest が生成する transformIgnorePatterns を上書きする。
 *
 * @t3-oss/env-nextjs は ESM only で配布されており、既定の
 * `/node_modules/` 一括除外のままだと変換されずに構文エラーになる。
 * Revolution の apps/frontend が同じ理由で同じ回避策を入れている。
 * @see revolution/apps/frontend/jest.config.mjs
 */
export default async function jestConfig() {
  const resolved = await createJestConfig(config)();
  return {
    ...resolved,
    transformIgnorePatterns: [
      '/node_modules/\\.pnpm/(?!(@t3-oss\\+env-nextjs|@t3-oss\\+env-core)@)',
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
}
