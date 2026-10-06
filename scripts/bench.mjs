#!/usr/bin/env node
// District 122 bench harness: measures ms/frame, draw calls and texture memory at fixed
// spots (src/bench/spots.ts) on each quality tier, with screenshots, on a phone-sized
// viewport (844×390 @ DPR 2). Starts its own Vite dev server and its own Chrome
// (Playwright, channel "chrome", no browser download), so it never touches the app's
// preview pane.
//
//   npm run bench -- [--spots a,b,c] [--q low,medium,high] [--label name]
//                    [--compare docs/superpowers/notes/bench/other.json] [--docs] [--headed]
//                    [--override <dir>]
//
// --override <dir>: any request whose URL path exists as a file under <dir> is served from
// there instead of public/ (Playwright route, nothing written to the repo). For trying an
// asset before committing it, or working around a broken one on the base branch.
//
// Output: a markdown table on stdout, docs/superpowers/notes/bench/<label>.json, and
// screenshots/bench/<label>/<spot>-<q>.png (git-ignored). --docs also writes downscaled
// JPEGs (≤ 300 KB) to docs/superpowers/notes/bench/<label>/ for committing.
// Low runs with a 4× CPU throttle (CDP Emulation.setCPUThrottlingRate), applied once the
// page starts settling so the boot itself isn't throttled.
//
// Numbers on a loaded machine (several agents benching at once) are approximate: report
// them as measured; the integrator re-measures sequentially.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, createServer } from 'vite'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const VIEWPORT = { width: 844, height: 390 }
const DPR = 2
const LOW_CPU_THROTTLE = 4
const PAGE_TIMEOUT_MS = 180000
const BUDGET = { ms: { low: 33, medium: 16, high: 16 }, texMB: { low: 180, medium: 320, high: Infinity } }

const args = parseArgs(process.argv.slice(2))
const label = args.label ?? `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
const qualities = (args.q ?? 'low,medium,high').split(',').map((s) => s.trim()).filter(Boolean)
for (const q of qualities) if (!['low', 'medium', 'high'].includes(q)) die(`unknown quality "${q}"`)

// The spot list comes from src/bench/spots.ts (TypeScript, imports the layout). Vite's
// SSR module runner hangs on this project (transport timeout on fetchModule), so the module
// is bundled with the build API into a git-ignored cache and imported from there (~2 s).
const spotsMod = await loadSpots()
const allSpots = spotsMod.BENCH_SPOT_IDS
const callBudget = spotsMod.callBudget
const spots = args.spots ? args.spots.split(',').map((s) => s.trim()).filter(Boolean) : allSpots
for (const s of spots) if (!allSpots.includes(s)) die(`unknown spot "${s}" (known: ${allSpots.join(', ')})`)

const shotDir = join(root, 'screenshots', 'bench', label)
const notesDir = join(root, 'docs', 'superpowers', 'notes', 'bench')
const docsDir = join(notesDir, label)
mkdirSync(shotDir, { recursive: true })
mkdirSync(notesDir, { recursive: true })
if (args.docs) mkdirSync(docsDir, { recursive: true })

const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'warn',
  server: { host: '127.0.0.1', port: 5190, strictPort: false, open: false },
})
await server.listen()
const base = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}/`
console.log(`bench "${label}": ${spots.length} spot(s) × ${qualities.join('/')} at ${base}`)

const browser = await chromium.launch({
  channel: existsSync(CHROME) ? 'chrome' : undefined,
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  headless: !args.headed,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-unsafe-webgpu=false', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
})

const rows = []
const errors = []
try {
  for (const q of qualities) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, hasTouch: false, locale: 'en' })
    const page = await context.newPage()
    page.on('pageerror', (e) => errors.push({ q, error: String(e) }))
    if (args.override) {
      const dir = resolve(root, args.override)
      if (!existsSync(dir)) die(`--override ${args.override}: not found`)
      await page.route('**/*', (route) => {
        const file = join(dir, decodeURIComponent(new URL(route.request().url()).pathname))
        return existsSync(file) && statSync(file).isFile() ? route.fulfill({ path: file }) : route.continue()
      })
    }
    const cdp = await context.newCDPSession(page)
    for (const spot of spots) {
      const t0 = Date.now()
      process.stdout.write(`  ${spot} @ ${q} … `)
      let row
      try {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
        await page.goto(`${base}?bench=${encodeURIComponent(spot)}&q=${q}&nodemo&nolock`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
        if (q === 'low') {
          await page.waitForFunction(() => window.__benchPhase === 'settling' || window.__benchPhase === 'done', null, { timeout: PAGE_TIMEOUT_MS })
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: LOW_CPU_THROTTLE })
        }
        await page.waitForFunction(() => document.title.startsWith('BENCH '), null, { timeout: PAGE_TIMEOUT_MS })
        row = await page.evaluate(() => window.__bench)
        if (!row) row = JSON.parse((await page.title()).slice(6))
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
        const png = join(shotDir, `${spot}-${q}.png`)
        await page.screenshot({ path: png, type: 'png' })
        row.screenshot = rel(png)
        if (args.docs) {
          const jpg = join(docsDir, `${spot}-${q}.jpg`)
          for (const quality of [72, 58, 45, 32]) {
            await page.screenshot({ path: jpg, type: 'jpeg', quality, scale: 'css' })
            if (statSync(jpg).size <= 300 * 1024) break
          }
          row.docShot = rel(jpg)
        }
      } catch (e) {
        row = { spot, quality: q, zone: '', error: String(e).split('\n')[0] }
      }
      row.cpuThrottle = q === 'low' ? LOW_CPU_THROTTLE : 1
      row.wallS = Math.round((Date.now() - t0) / 100) / 10
      rows.push(row)
      console.log(row.error ? `ERROR ${row.error}` : `${row.msFrame} ms · ${row.calls} calls · ${row.textureMB} MB (${row.wallS}s)`)
    }
    await context.close()
  }
} finally {
  await browser.close()
  await server.close()
}

const out = { label, date: new Date().toISOString(), base, viewport: VIEWPORT, dpr: DPR, gpu: rows.find((r) => r.gpu)?.gpu ?? '', override: args.override ?? null, rows, errors }
const jsonPath = join(notesDir, `${label}.json`)
writeFileSync(jsonPath, JSON.stringify(out, null, 2))

console.log('')
console.log(table(rows))
if (errors.length) {
  console.log('\nPage errors:')
  for (const e of errors) console.log(`  [${e.q}] ${e.error}`)
}
if (args.compare) console.log('\n' + compare(rows, args.compare))
console.log(`\nJSON: ${rel(jsonPath)}\nScreenshots: ${rel(shotDir)}${args.docs ? `\nDoc shots: ${rel(docsDir)}` : ''}`)
const over = rows.filter((r) => overBudget(r).length)
console.log(over.length ? `\nOVER BUDGET: ${over.map((r) => `${r.spot}@${r.quality} (${overBudget(r).join(', ')})`).join('; ')}` : '\nAll rows within budget.')
process.exit(0)

// ----------------------------------------------------------------- helpers

async function loadSpots() {
  const out = join(root, 'node_modules', '.cache', 'district-bench')
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: { ssr: 'src/bench/spots.ts', outDir: out, emptyOutDir: true, minify: false, copyPublicDir: false, rollupOptions: { output: { format: 'es', entryFileNames: 'spots.mjs' } } },
  })
  return import(pathToFileURL(join(out, 'spots.mjs')).href)
}

function overBudget(r) {
  if (r.error) return ['error']
  const bad = []
  const cb = callBudget(r.zone || '')
  if (r.calls > cb) bad.push(`calls ${r.calls} > ${cb}`)
  if (r.msFrame > BUDGET.ms[r.quality]) bad.push(`ms ${r.msFrame} > ${BUDGET.ms[r.quality]}`)
  if (r.textureMB > BUDGET.texMB[r.quality]) bad.push(`tex ${r.textureMB} MB > ${BUDGET.texMB[r.quality]}`)
  return bad
}

function table(rows) {
  const head = ['spot', 'q', 'zone', 'ms/frame', 'p95', 'fps', 'calls', 'max', 'tris', 'tex MB', 'scene MB', 'settled', 'budget']
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`]
  for (const r of rows) {
    if (r.error) {
      lines.push(`| ${r.spot} | ${r.quality} | | ERROR: ${r.error} |`)
      continue
    }
    const bad = overBudget(r)
    lines.push(
      `| ${r.spot} | ${r.quality} | ${r.zone} | ${r.msFrame} | ${r.msP95} | ${r.fps} | ${r.calls} | ${r.callsMax} | ${fmtK(r.triangles)} | ${r.textureMB} | ${r.textureMBScene} | ${r.settled ? 'yes' : 'NO'} | ${bad.length ? 'OVER: ' + bad.join(', ') : 'ok'} |`,
    )
  }
  return lines.join('\n')
}

function compare(rows, otherPath) {
  const p = resolve(root, otherPath)
  if (!existsSync(p)) return `compare: ${otherPath} not found`
  const other = JSON.parse(readFileSync(p, 'utf8'))
  const key = (r) => `${r.spot}@${r.quality}`
  const prev = new Map(other.rows.map((r) => [key(r), r]))
  const head = ['spot', 'q', 'ms/frame', 'Δ ms', 'calls', 'Δ calls', 'tex MB', 'Δ MB', 'tris', 'Δ tris']
  const lines = [`Compared with ${other.label} (${other.date}):`, `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`]
  const d = (a, b, digits = 1) => (a == null || b == null ? '—' : fmtDelta(a - b, digits))
  for (const r of rows) {
    const o = prev.get(key(r))
    if (r.error || !o || o.error) {
      lines.push(`| ${r.spot} | ${r.quality} | ${r.error ? 'ERROR' : o ? 'baseline error' : 'no baseline'} |`)
      continue
    }
    lines.push(`| ${r.spot} | ${r.quality} | ${r.msFrame} | ${d(r.msFrame, o.msFrame, 2)} | ${r.calls} | ${d(r.calls, o.calls, 0)} | ${r.textureMB} | ${d(r.textureMB, o.textureMB, 1)} | ${fmtK(r.triangles)} | ${d(r.triangles, o.triangles, 0)} |`)
  }
  return lines.join('\n')
}

function fmtDelta(v, digits) {
  const s = v.toFixed(digits)
  return v > 0 ? `+${s}` : s
}

function fmtK(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0)
}

function rel(p) {
  return p.slice(root.length + 1).replace(/\\/g, '/')
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const k = a.slice(2)
    const eq = k.indexOf('=')
    if (eq >= 0) out[k.slice(0, eq)] = k.slice(eq + 1)
    else if (['docs', 'headed'].includes(k)) out[k] = true
    else out[k] = argv[++i]
  }
  return out
}

function die(msg) {
  console.error(`bench: ${msg}`)
  process.exit(1)
}
