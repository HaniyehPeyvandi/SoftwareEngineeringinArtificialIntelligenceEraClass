import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    isolate: true,
    watch: false,
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    passWithNoTests: false,
    env: {
      NODE_ENV: 'test',
      // Never inherit a demo database path. T009 fixtures must supply their own
      // fresh temporary SQLite files through explicit application configuration.
      DATABASE_PATH: '',
    },
  },
});
