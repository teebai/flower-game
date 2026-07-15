import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    deps: {
      optimizer: {
        web: {
          include: ['boardgame.io'],
        },
      },
    },
  },
  resolve: {
    alias: {
      // Ensure consistent module resolution in tests
    },
  },
});
