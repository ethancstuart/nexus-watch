import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
  test: { environment: 'happy-dom' },
});
