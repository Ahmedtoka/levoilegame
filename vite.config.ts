import { defineConfig } from 'vite'

export default defineConfig({
  // Assets are referenced with absolute paths (/products, /brand, /models): deploy at the domain root.
  // PORT lets tooling (e.g. the preview pane) pick a free port; defaults stay 5173 / 4173.
  server: { host: true, port: Number(process.env.PORT) || 5173 },
  preview: { port: Number(process.env.PORT) || 4173 },
  build: {
    target: 'es2022',
    // three.js alone is ~600 kB minified.
    chunkSizeWarningLimit: 900,
  },
})
