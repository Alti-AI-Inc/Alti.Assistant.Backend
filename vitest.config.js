import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    forks: {
      singleFork: true,
    },
    include: ['tests/**/*.test.js'],
    setupFiles: ['./vitest.setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js', 'config/**/*.js'],
    },
    testTimeout: 10000,
  },
});
