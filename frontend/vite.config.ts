import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ─── Vite Config ─────────────────────────────────────────────────────────────
//
// SECURITY NOTE: The worker URL below is only used during local development
// (npm run dev). It is never embedded in the production build.
// Replace the target with your actual Worker URL if it ever changes.

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': {
        // Local dev only — proxy to your deployed Worker
        target: 'https://mwportal-worker.mwcrewportal.workers.dev',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,   // never ship sourcemaps to production
    // Minify and tree-shake — removes dead code and comments
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Hash-based filenames for cache-busting
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },
  },
})