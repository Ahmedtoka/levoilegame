import { defineConfig, type Plugin } from 'vite'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** Ships only the WebP derivatives: drops every jpg/png under dist/products that has a .webp sibling, plus all cutout.png (valid ones ship as .webp, failed ones are unused). */
function pruneProductSources(): Plugin {
  return {
    name: 'prune-product-sources',
    apply: 'build',
    closeBundle() {
      const root = join(process.cwd(), 'dist', 'products')
      if (!existsSync(root)) return
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name)
          if (e.isDirectory()) walk(p)
          else if (e.name === 'cutout.png' || (/\.(jpe?g|png)$/i.test(e.name) && existsSync(p.replace(/\.(jpe?g|png)$/i, '.webp')))) rmSync(p)
        }
      }
      walk(root)
    },
  }
}

export default defineConfig({
  plugins: [pruneProductSources()],
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
