#!/usr/bin/env node
// Collects each 122 Mall brand's real catalogue from its public Shopify store.
//
//   node scripts/fetch-brands.mjs                  all brands
//   node scripts/fetch-brands.mjs --only axis jeno only these brands
//   node scripts/fetch-brands.mjs --check          print the section plan, no files written
//   node scripts/fetch-brands.mjs --apply-cutouts  after remove-bg.py --brands: set `cutout` on
//                                                  products whose cut-out passed QA
//
// Sections are the store's collections as shown in its header menu (promo / "all"
// collections dropped), max MAX_SECTIONS; MIN..MAX_PER products each, a product
// lives in one section only. Manual picks in scripts/brand-sections.json win.
//
// Output: src/data/brands/<brandId>.remote.json   (Shopify CDN urls, source for re-fetching)
//         src/data/brands/<brandId>.json          (Catalog shape, local image paths)
//         public/products/<productId>/<n>.jpg     (productId = <brandId>--<collection>-NN)
//         scripts/brand-scrape-report.json

import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'src/data/brands')
const PUBLIC_DIR = path.join(ROOT, 'public')
const REPORT = path.join(ROOT, 'scripts/brand-scrape-report.json')
const OVERRIDES = path.join(ROOT, 'scripts/brand-sections.json')

const STORES = {
  axis: 'yzgu07-cj',
  'the-cause-wear': 'f5qabu-7i',
  dnd: '9a2ddd-b9',
  nourhan: '67919d-09',
  pistage: 'pistage1',
  'slip-and-go': 'vcmq59-ab',
  bezravoga: 'hapf1i-rz',
  nanosh: 'hrvpua-ec',
  scarfest: 'wyznpf-17',
  jeno: '3e8506-3',
  hashbag: 'rx15zw-gg',
  'rwan-designs': 'rwanagiza',
  'fashion-avenue': 'de78a8-fa',
  'noha-collection': 'nohaa-collection',
  promax: 'newndy-ta',
}

const MAX_SECTIONS = 8
const MIN_PER = 5
const MAX_PER = 10
const MAX_IMAGES = 2
const IMAGE_WIDTH = 1080
const GAP_MS = 500 // ≤ 2 requests/second per site
const UA = 'Mozilla/5.0 (122Mall catalogue collector)'

const args = process.argv.slice(2)
const CHECK = args.includes('--check')
const APPLY_CUTOUTS = args.includes('--apply-cutouts')
const onlyIdx = args.indexOf('--only')
const ONLY = onlyIdx >= 0 ? args.slice(onlyIdx + 1).filter((a) => !a.startsWith('--')) : null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Per-site polite fetcher: one request at a time, GAP_MS apart, 3 tries. */
function siteFetcher() {
  let last = 0
  return async function get(url, { json = false, accept } = {}) {
    let err
    for (let attempt = 1; attempt <= 3; attempt++) {
      const wait = last + GAP_MS - Date.now()
      if (wait > 0) await sleep(wait)
      last = Date.now()
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, ...(accept ? { Accept: accept } : {}) },
          redirect: 'follow',
          signal: AbortSignal.timeout(30_000),
        })
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
        if (!res.ok) return { status: res.status, url: res.url, body: null }
        return { status: res.status, url: res.url, body: json ? await res.json() : await res.text() }
      } catch (e) {
        err = e
        await sleep(1000 * attempt)
      }
    }
    throw err
  }
}

// Collections that are promotions, "everything" lists or theme plumbing, not real sections.
const PROMO =
  /(^|-)(sale|sales|off|offers?|deals?|discounts?|friday|flash|clearance|buy|get|lucky|mega|restock(ed)?|end50|saleupto\d+|frontpage|featured|trending|picks|copy|old|example|black|white|home|shop|all|products?|best|sellers?|seller|bezravoga|fashion-avenue|women|clothing|latest)(-|$)|^\d|-\d+$/i

/** Collection handles linked from the page, in document order (header menu comes first). */
function menuHandles(html) {
  const out = []
  for (const m of html.matchAll(/href="(?:https?:\/\/[^"/]+)?(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/collections\/([^"/?#]+)"/gi)) {
    const h = decodeURIComponent(m[1]).toLowerCase()
    if (h !== 'all' && !out.includes(h)) out.push(h)
  }
  return out
}

const COLOR_HEX = {
  black: '#1d1d1f', white: '#f4f2ee', offwhite: '#efe9df', 'off white': '#efe9df', ivory: '#efe8d8', cream: '#ece3d2',
  beige: '#d8c6a8', camel: '#b98a5a', brown: '#6b4a33', 'dark brown': '#4a3224', coffee: '#5b3f2e', mocha: '#7a5a46',
  havan: '#8a6a4a', tan: '#c09a6b', nude: '#d9b8a0', grey: '#8d8d8f', gray: '#8d8d8f', 'light grey': '#c4c4c6',
  'dark grey': '#4c4c50', charcoal: '#3c3c40', silver: '#c0c0c4', navy: '#24304e', blue: '#2f5d9a', 'baby blue': '#a9c8e6',
  'light blue': '#a9c8e6', denim: '#4a6a90', sky: '#8fbde3', turquoise: '#2fa6a0', teal: '#1f7a78', green: '#3f7a4a',
  olive: '#6f6f3a', mint: '#a8d8c0', 'dark green': '#2a4a32', khaki: '#a89a6a', sage: '#9aae94', red: '#b8302f',
  burgundy: '#6e1f2e', maroon: '#6e1f2e', wine: '#6e1f2e', pink: '#e8a3b8', 'baby pink': '#f2c6d2', rose: '#d88a9a',
  fuchsia: '#c2307a', purple: '#6a3f8a', lilac: '#c4a8d8', lavender: '#bfaee0', mauve: '#b08ea0', orange: '#e07a2a',
  peach: '#f0b89a', coral: '#e8786a', yellow: '#e8c840', mustard: '#c89a2a', gold: '#c9a24a', rust: '#a8502a',
  brick: '#9a4a3a', taupe: '#8a7a6a', stone: '#b8ae9e', sand: '#d6c4a4', petrol: '#2a5a6a', indigo: '#3a3f7a',
}
const COLOR_AR = {
  black: 'أسود', white: 'أبيض', offwhite: 'أوف وايت', 'off white': 'أوف وايت', ivory: 'أوف وايت', cream: 'كريمي',
  beige: 'بيج', camel: 'جملي', brown: 'بني', 'dark brown': 'بني غامق', coffee: 'قهوة', mocha: 'موكا', havan: 'هافان',
  tan: 'بيج غامق', nude: 'نود', grey: 'رمادي', gray: 'رمادي', 'light grey': 'رمادي فاتح', 'dark grey': 'رمادي غامق',
  charcoal: 'فحمي', silver: 'فضي', navy: 'كحلي', blue: 'أزرق', 'baby blue': 'لبني', 'light blue': 'لبني', denim: 'جينز',
  sky: 'سماوي', turquoise: 'تركواز', teal: 'تيل', green: 'أخضر', olive: 'زيتي', mint: 'مِنت', 'dark green': 'أخضر غامق',
  khaki: 'كاكي', sage: 'سيج', red: 'أحمر', burgundy: 'نبيتي', maroon: 'نبيتي', wine: 'نبيتي', pink: 'بينك',
  'baby pink': 'بيبي بينك', rose: 'روز', fuchsia: 'فوشيا', purple: 'موف', lilac: 'ليلكي', lavender: 'لافندر',
  mauve: 'موف فاتح', orange: 'برتقالي', peach: 'خوخي', coral: 'كورال', yellow: 'أصفر', mustard: 'مستردة', gold: 'دهبي',
  rust: 'صدئي', brick: 'طوبي', taupe: 'توب', stone: 'ستون', sand: 'رملي', petrol: 'بترولي', indigo: 'نيلي',
}
const NEUTRAL_HEX = '#d9cfc7'

function colorOption(name) {
  const key = name.trim().toLowerCase()
  const hit = COLOR_HEX[key] ? key : Object.keys(COLOR_HEX).find((k) => key.includes(k))
  return { name: name.trim(), nameAr: (hit && COLOR_AR[hit]) || name.trim(), hex: (hit && COLOR_HEX[hit]) || NEUTRAL_HEX }
}

const isSize = (n) => /size|مقاس|المقاس/i.test(n)
const isColor = (n) => /colou?r|لون|اللون/i.test(n)

function slug(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function collectBrand(brandId, sub, overrides) {
  const get = siteFetcher()
  const base = `https://${sub}.myshopify.com`
  const report = { brandId, myshopify: base, site: null, currency: null, sections: [], dropped: [], problems: [] }

  const home = await get(`${base}/`)
  const site = new URL(home.url).origin
  report.site = site
  if (/\/password/.test(home.url)) {
    report.problems.push('store is password-protected')
    return { report }
  }
  const cart = await get(`${site}/cart.js`, { json: true }).catch(() => null)
  report.currency = cart?.body?.currency ?? 'unknown'
  if (report.currency !== 'EGP') report.problems.push(`store currency is ${report.currency}`)

  // All collections with their product counts.
  const cols = []
  for (let page = 1; page < 10; page++) {
    const r = await get(`${site}/collections.json?limit=250&page=${page}`, { json: true })
    const list = r.body?.collections ?? []
    cols.push(...list)
    if (list.length < 250) break
  }
  const byHandle = new Map(cols.map((c) => [c.handle, c]))
  const maxCount = Math.max(...cols.map((c) => c.products_count), 1)

  // Section order: manual override, else the menu order filtered to real, non-promo collections.
  let picks = overrides[brandId]
  const menu = menuHandles(home.body ?? '')
  report.menu = menu
  if (!picks) {
    picks = []
    for (const h of menu) {
      const c = byHandle.get(h)
      if (!c) continue
      const why = !c.products_count
        ? 'empty'
        : PROMO.test(h)
          ? 'promo / catch-all'
          : c.products_count >= 0.8 * maxCount && maxCount > 30
            ? 'catch-all (almost every product)'
            : null
      if (why) report.dropped.push({ handle: h, why })
      else picks.push(h)
    }
    if (picks.length > MAX_SECTIONS) {
      const keep = new Set(
        [...picks].sort((a, b) => byHandle.get(b).products_count - byHandle.get(a).products_count).slice(0, MAX_SECTIONS),
      )
      for (const h of picks) if (!keep.has(h)) report.dropped.push({ handle: h, why: `over ${MAX_SECTIONS} sections (smaller)` })
      picks = picks.filter((h) => keep.has(h))
    }
  }
  picks = picks.map((p) => (typeof p === 'string' ? { handle: p } : p))
  if (CHECK) {
    report.plan = picks.map((p) => `${p.handle}(${byHandle.get(p.handle)?.products_count ?? '?'})`)
    return { report }
  }

  const seen = new Set()
  const sections = []
  const products = []
  for (const pick of picks) {
    const col = byHandle.get(pick.handle)
    if (!col) {
      report.problems.push(`collection ${pick.handle} not found`)
      continue
    }
    const r = await get(`${site}/collections/${encodeURIComponent(pick.handle)}/products.json?limit=250`, { json: true })
    const raw = r.body?.products ?? []
    // Arabic collection title when the store publishes an /ar locale with a translation.
    let titleAr = pick.titleAr ?? null
    if (!titleAr) {
      const ar = await get(`${site}/ar/collections/${encodeURIComponent(pick.handle)}.json`, { json: true }).catch(() => null)
      const t = ar?.body?.collection?.title
      if (t && /[؀-ۿ]/.test(t)) titleAr = t
    }
    const secSlug = slug(pick.handle) || `s${sections.length + 1}`
    const sectionId = `${brandId}--${secSlug}`
    const list = []
    // In-stock products first; sold-out ones only top a section up to MIN_PER.
    const fresh = raw.filter((p) => !seen.has(p.id) && p.images?.length)
    const inStock = fresh.filter((p) => p.variants.some((v) => v.available))
    const soldOut = fresh.filter((p) => !p.variants.some((v) => v.available))
    const chosen = [...inStock.slice(0, MAX_PER), ...soldOut.slice(0, Math.max(0, MIN_PER - inStock.length))]
    for (const p of chosen) {
      const variant = p.variants.find((v) => v.available) ?? p.variants[0]
      seen.add(p.id)
      const n = String(list.length + 1).padStart(2, '0')
      const id = `${sectionId}-${n}`
      const price = Number(variant.price)
      const cmp = variant.compare_at_price ? Number(variant.compare_at_price) : null
      const sizeOpt = p.options.find((o) => isSize(o.name))
      const colorOpt = p.options.find((o) => isColor(o.name))
      const remoteImages = p.images.slice(0, MAX_IMAGES).map((im) => im.src)
      list.push({
        id,
        handle: p.handle,
        title: p.title.trim(),
        price,
        compareAtPrice: cmp && cmp > price ? cmp : null,
        currency: 'EGP',
        images: remoteImages,
        cutout: null,
        sizes: sizeOpt ? sizeOpt.values.filter((v) => !/default title/i.test(v)) : [],
        colors: colorOpt ? colorOpt.values.map(colorOption) : [],
        section: sectionId,
        modelOutfit: false,
        url: `${site}/products/${p.handle}`,
      })
    }
    const entry = { handle: pick.handle, title: col.title.trim(), titleAr, products: list.length }
    if (list.length < MIN_PER) report.problems.push(`${pick.handle}: only ${list.length} products`)
    const out = list.length - Math.min(inStock.length, MAX_PER)
    if (out > 0) report.problems.push(`${pick.handle}: ${out} sold-out products added to reach ${MIN_PER}`)
    report.sections.push(entry)
    if (!list.length) continue
    sections.push({ id: sectionId, title: col.title.trim(), titleAr: titleAr ?? col.title.trim(), productIds: list.map((p) => p.id) })
    products.push(...list)
  }
  return { report, sections, products }
}

/** Downloads every remote image to public/products/<id>/<n>.jpg; returns the local catalogue. */
async function downloadImages(brandId, products, report) {
  const jobs = []
  const local = products.map((p) => ({
    ...p,
    images: p.images.map((src, i) => {
      const rel = `/products/${p.id}/${i + 1}.jpg`
      jobs.push({ src, file: path.join(PUBLIC_DIR, rel) })
      return rel
    }),
  }))
  const failed = new Set()
  let next = 0
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]
      if (existsSync(job.file)) continue
      const url = new URL(job.src.startsWith('//') ? `https:${job.src}` : job.src)
      url.searchParams.set('width', String(IMAGE_WIDTH))
      url.searchParams.set('format', 'pjpg')
      try {
        let res
        for (let a = 1; a <= 3; a++) {
          res = await fetch(url, {
            headers: { 'User-Agent': UA, Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5' },
            signal: AbortSignal.timeout(90_000),
          }).catch((e) => ({ ok: false, status: e.message }))
          if (res.ok) break
          await sleep(500 * a)
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await fs.mkdir(path.dirname(job.file), { recursive: true })
        await fs.writeFile(job.file, Buffer.from(await res.arrayBuffer()))
      } catch (e) {
        failed.add(job.file)
        report.problems.push(`image failed: ${job.src} (${e.message})`)
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker))
  // Drop images that failed; drop products left with none.
  return local
    .map((p) => ({ ...p, images: p.images.filter((rel) => !failed.has(path.join(PUBLIC_DIR, rel))) }))
    .filter((p) => p.images.length)
}

// Cut-out QA (metrics from scripts/remove-bg.py): reject masks that lost the subject,
// kept the background, are mostly semi-transparent, or bleed into the frame edges.
const CUTOUT_REPORT = path.join(ROOT, 'scripts/cutout-report-brands.json')
const REJECT_IDS = path.join(ROOT, 'scripts/brand-cutout-reject.json') // manual visual-QA rejects
const cutoutOk = (m) => m.coverage >= 0.05 && m.coverage <= 0.92 && m.soft <= 0.3 && m.edgeTouch <= 0.5

async function applyCutouts() {
  const metrics = new Map(JSON.parse(readFileSync(CUTOUT_REPORT, 'utf8')).products.map((r) => [r.id, r]))
  const rejects = new Set(existsSync(REJECT_IDS) ? JSON.parse(readFileSync(REJECT_IDS, 'utf8')) : [])
  for (const f of await fs.readdir(OUT_DIR)) {
    if (!f.endsWith('.json') || f.endsWith('.remote.json')) continue
    if (ONLY && !ONLY.includes(f.replace(/\.json$/, ''))) continue
    const file = path.join(OUT_DIR, f)
    const data = JSON.parse(readFileSync(file, 'utf8'))
    let ok = 0
    for (const p of data.products) {
      const m = metrics.get(p.id)
      const has = existsSync(path.join(PUBLIC_DIR, 'products', p.id, 'cutout.png'))
      p.cutout = has && m && cutoutOk(m) && !rejects.has(p.id) ? `/products/${p.id}/cutout.png` : null
      if (p.cutout) ok++
    }
    await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n')
    console.log(`${f}: ${ok}/${data.products.length} cut-outs`)
  }
}

async function main() {
  if (APPLY_CUTOUTS) return applyCutouts()
  const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {}
  const ids = Object.keys(STORES).filter((id) => !ONLY || ONLY.includes(id))
  await fs.mkdir(OUT_DIR, { recursive: true })
  const prev = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : {}
  const reports = { ...prev }

  // Different sites in parallel; each site is rate-limited on its own.
  await Promise.all(
    ids.map(async (id) => {
      try {
        const { report, sections, products } = await collectBrand(id, STORES[id], overrides)
        if (CHECK) {
          console.log(`\n${id}  ${report.site}  ${report.currency}\n  menu: ${report.menu.join(' ')}\n  plan: ${report.plan.join(' ')}`)
          return
        }
        if (!sections?.length) {
          reports[id] = report
          console.log(`${id}: no sections (${report.problems.join('; ')})`)
          return
        }
        const remote = { brandId: id, site: report.site, sections, products }
        await fs.writeFile(path.join(OUT_DIR, `${id}.remote.json`), JSON.stringify(remote, null, 2) + '\n')
        const localProducts = await downloadImages(id, products, report)
        const keep = new Set(localProducts.map((p) => p.id))
        const localSections = sections
          .map((s) => ({ ...s, productIds: s.productIds.filter((pid) => keep.has(pid)) }))
          .filter((s) => s.productIds.length)
        await fs.writeFile(
          path.join(OUT_DIR, `${id}.json`),
          JSON.stringify({ brandId: id, site: report.site, sections: localSections, products: localProducts }, null, 2) + '\n',
        )
        // Remove image folders of this brand's products that are no longer in the catalogue.
        for (const dir of await fs.readdir(path.join(PUBLIC_DIR, 'products'))) {
          if (dir.startsWith(`${id}--`) && !keep.has(dir)) await fs.rm(path.join(PUBLIC_DIR, 'products', dir), { recursive: true })
        }
        reports[id] = report
        console.log(`${id}: ${localSections.length} sections, ${localProducts.length} products${report.problems.length ? `, ${report.problems.length} problems` : ''}`)
      } catch (e) {
        reports[id] = { brandId: id, problems: [`failed: ${e.message}`] }
        console.log(`${id}: FAILED ${e.message}`)
      }
    }),
  )
  if (!CHECK) await fs.writeFile(REPORT, JSON.stringify(reports, null, 2) + '\n')
}

main()
