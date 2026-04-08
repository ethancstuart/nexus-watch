import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    manifest: true,
    chunkSizeWarningLimit: 1100, // MapLibre is ~1MB, expected
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          neon: ['@neondatabase/serverless'],
        },
      },
    },
  },
  test: { environment: 'happy-dom' },
});
