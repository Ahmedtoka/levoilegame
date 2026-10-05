// Builds the 122 Mall catalogue: one Section per open brand. Le Voile keeps
// its real catalogue (products.json, all its sections merged into one shop);
// brands with a real catalogue in src/data/brands/<id>.json (scripts/fetch-brands.mjs)
// get theirs merged the same way; the rest keep placeholder products with
// generated SVG photos.

import { BRANDS, type BrandDef, type ProductKind } from '../config/mall'
import { DEFAULT_APPAREL_SIZES, DEFAULT_COLOR, FREE_SIZE } from './defaults'
import type { Catalog, Product, Section } from './types'

/** A brand's real catalogue as written by scripts/fetch-brands.mjs. */
export interface BrandCatalogFile {
  brandId: string
  site: string
  sections: Section[]
  products: Product[]
}

// Lazy chunks: the brand catalogues only load when the mall boots.
const BRAND_FILES = import.meta.glob<BrandCatalogFile>(['./brands/*.json', '!./brands/*.remote.json'], { import: 'default' })

/** Loads every brand catalogue file, keyed by brand id (a file that fails is skipped). */
export async function loadBrandCatalogs(): Promise<Record<string, BrandCatalogFile>> {
  const out: Record<string, BrandCatalogFile> = {}
  await Promise.all(
    Object.values(BRAND_FILES).map((load) =>
      load()
        .then((file) => {
          out[file.brandId] = file
        })
        .catch((err) => console.warn('Brand catalogue failed to load', err)),
    ),
  )
  return out
}

const NAMES: Record<ProductKind, string[]> = {
  dress: ['Flow Maxi Dress', 'Pleated Midi Dress', 'Linen Shirt Dress', 'Satin Wrap Dress', 'Tiered Maxi Dress'],
  abaya: ['Classic Open Abaya', 'Crepe Kimono Abaya', 'Embroidered Abaya', 'Belted Abaya', 'Everyday Abaya'],
  blouse: ['Oversized Shirt', 'Ruffle Blouse', 'Linen Tunic', 'Knit Top', 'Poplin Shirt'],
  pants: ['Wide-Leg Trousers', 'Pleated Pants', 'Palazzo Pants', 'Straight Jeans', 'Linen Culottes'],
  cardigan: ['Long Cardigan', 'Knit Duster', 'Cropped Cardigan', 'Kimono Jacket', 'Soft Blazer'],
  scarf: ['Modal Scarf', 'Chiffon Shawl', 'Printed Silk Scarf', 'Jersey Hijab', 'Crinkle Scarf', 'Cotton Wrap'],
  bag: ['Tote Bag', 'Crossbody Bag', 'Mini Shoulder Bag', 'Weekender', 'Bucket Bag', 'Clutch'],
  shoes: ['Leather Loafers', 'Comfort Slides', 'Ballet Flats', 'Chunky Sneakers', 'Block Heels', 'Mules'],
  box: ['Gift Box', 'Signature Set', 'Starter Pack', 'Family Box', 'Travel Kit', 'Bundle'],
}

const PRICES: Record<ProductKind, [number, number]> = {
  dress: [690, 1650],
  abaya: [850, 1950],
  blouse: [390, 890],
  pants: [450, 990],
  cardigan: [590, 1290],
  scarf: [180, 520],
  bag: [450, 1600],
  shoes: [550, 1450],
  box: [250, 900],
}

/** Garment silhouettes on a 1080×1306 artboard. */
const SHAPES: Record<ProductKind, string> = {
  dress: 'M450 170 L630 170 L660 250 L720 300 L700 360 L650 340 L700 1140 L380 1140 L430 340 L380 360 L360 300 L420 250 Z',
  abaya: 'M440 160 L640 160 L700 230 L840 640 L780 660 L700 470 L760 1170 L320 1170 L380 470 L300 660 L240 640 L380 230 Z',
  blouse: 'M420 300 L660 300 L800 380 L760 520 L690 480 L700 860 L380 860 L390 480 L320 520 L280 380 Z',
  pants: 'M400 260 L680 260 L720 1150 L580 1150 L540 520 L500 1150 L360 1150 Z',
  cardigan: 'M420 220 L660 220 L820 320 L860 900 L760 910 L720 520 L740 1080 L560 1080 L540 360 L520 1080 L340 1080 L360 520 L320 910 L220 900 L260 320 Z',
  scarf: 'M300 300 Q540 220 780 300 L740 900 Q620 960 560 1100 L520 1100 Q460 960 340 900 Z',
  bag: 'M330 560 L750 560 L800 1060 L280 1060 Z M430 560 Q430 380 540 380 Q650 380 650 560 L610 560 Q610 420 540 420 Q470 420 470 560 Z',
  shoes: 'M260 860 Q260 760 380 760 L560 760 Q640 760 700 820 L820 880 Q860 900 860 960 L860 1000 L260 1000 Z',
  box: 'M300 520 L780 520 L780 1040 L300 1040 Z M280 440 L800 440 L800 540 L280 540 Z M520 440 L560 440 L560 1040 L520 1040 Z',
}

function rnd(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

const SWATCHES = ['#2f3b4e', '#c9b29b', '#7b8a6a', '#e8dccf', '#8c3a52', '#3c3a47', '#b98a6e', '#d9b8c6', '#5d4b60', '#1d1d1f']

function photo(brand: BrandDef, kind: ProductKind, fill: string, title: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1306" width="1080" height="1306">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f3ef"/><stop offset="1" stop-color="#e9e2db"/></linearGradient></defs>
<rect width="1080" height="1306" fill="url(#g)"/>
<ellipse cx="540" cy="1190" rx="300" ry="34" fill="#000" opacity=".08"/>
<path d="${SHAPES[kind]}" fill="${fill}" fill-rule="evenodd" stroke="rgba(0,0,0,.12)" stroke-width="4"/>
<circle cx="140" cy="140" r="64" fill="none" stroke="${brand.color}" stroke-width="7"/>
<text x="140" y="160" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="54" fill="${brand.color}">${brand.initials}</text>
<text x="540" y="1270" text-anchor="middle" font-family="Georgia, serif" font-size="40" fill="#6b5a4e">${title.replace(/&/g, '&amp;')}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function placeholderProducts(brand: BrandDef): Product[] {
  const r = rnd(hash(brand.id))
  return brand.kinds.map((kind, i) => {
    const names = NAMES[kind]
    const title = names[Math.floor(r() * names.length)]
    const [lo, hi] = PRICES[kind]
    const price = Math.round((lo + r() * (hi - lo)) / 10) * 10
    const onSale = r() < 0.2
    const fills = [SWATCHES[Math.floor(r() * SWATCHES.length)], SWATCHES[Math.floor(r() * SWATCHES.length)]]
    const apparel = ['dress', 'abaya', 'blouse', 'pants', 'cardigan'].includes(kind)
    const id = `${brand.id}-${String(i + 1).padStart(2, '0')}`
    return {
      id,
      handle: id,
      title,
      price,
      compareAtPrice: onSale ? Math.round((price * 1.3) / 10) * 10 : null,
      currency: 'EGP',
      images: fills.map((f) => photo(brand, kind, f, title)),
      cutout: null,
      sizes: apparel ? [...DEFAULT_APPAREL_SIZES] : [FREE_SIZE],
      colors: [DEFAULT_COLOR],
      section: brand.id,
      modelOutfit: apparel && i < 2,
      url: brand.site ?? '#',
    }
  })
}

let levoileSections: Section[] = []
/** Le Voile's own sections (dresses, scarves…) for the stations inside its store. */
export function levoileSubsections(): Section[] {
  return levoileSections
}

const brandSections = new Map<string, Section[]>()
/** A brand's own sections (from its store's collections); empty for placeholder brands. */
export function brandSubsections(brandId: string): Section[] {
  return brandId === 'levoile' ? levoileSections : (brandSections.get(brandId) ?? [])
}

const APPAREL_KINDS: ProductKind[] = ['dress', 'abaya', 'blouse', 'pants', 'cardigan']

/** A brand's real products as one shop; apparel brands get showcase models from the first cut-out pieces. */
function realBrandProducts(b: BrandDef, file: BrandCatalogFile): Product[] {
  brandSections.set(b.id, file.sections)
  const apparel = b.kinds.some((k) => APPAREL_KINDS.includes(k))
  let models = 0
  return file.products.map((p) => {
    const model = apparel && p.cutout !== null && models < 2
    if (model) models++
    return { ...p, section: b.id, modelOutfit: model }
  })
}

/** Turns the Le Voile catalogue into the 122 Mall catalogue (one section per open brand). */
export function buildMallCatalog(levoile: Catalog, brandFiles: Record<string, BrandCatalogFile> = {}): Catalog {
  levoileSections = levoile.sections
  brandSections.clear()
  const products: Product[] = []
  const sections: Section[] = []
  for (const b of BRANDS) {
    if (b.status !== 'open') continue
    let list: Product[]
    const file = brandFiles[b.id]
    if (file?.products.length) list = realBrandProducts(b, file)
    else if (b.realCatalog) {
      // All Le Voile sections become one shop; keep its showcase models (max 3).
      let models = 0
      list = levoile.products.map((p) => {
        const keep = p.modelOutfit && models < 3
        if (keep) models++
        return { ...p, section: b.id, modelOutfit: keep }
      })
    } else list = placeholderProducts(b)
    products.push(...list)
    sections.push({ id: b.id, title: b.name, titleAr: b.nameAr, productIds: list.map((p) => p.id) })
  }
  return { sections, products, byId: new Map(products.map((p) => [p.id, p])) }
}
