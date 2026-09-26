import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Las e2e comparten cafeta_test y la limpian con TRUNCATE: una a la vez.
    fileParallelism: false,
  },
});
