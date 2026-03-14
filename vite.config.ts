import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'globe': ['globe.gl'],
        },
      },
    },
  },
  test: { environment: 'happy-dom' },
});
