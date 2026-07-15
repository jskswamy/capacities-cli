import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: false,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 80 },
    },
  },
})
