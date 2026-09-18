import { defineConfig } from 'vitest/config';

// Web game portal (CrazyGames) submission constraints:
// - relative base so the build runs from any path, including file://
// - no external CDN: everything is emitted into ./assets
// - single index.html entry
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
