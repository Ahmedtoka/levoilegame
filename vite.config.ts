import { defineConfig } from 'vite'

export default defineConfig({
  // Assets are referenced with absolute paths (/products, /brand, /models): deploy at the domain root.
  server: { host: true },
  build: {
    target: 'es2022',
    // three.js alone is ~600 kB minified.
    chunkSizeWarningLimit: 900,
  },
})
