// Style-B "campaign boutique" interior for a brand shop of any tier (spec
// 2026-10-06-shop-tiers-design §4): lightbox walls grouped by section with
// plaques, a hero campaign wall, standees on marble plinths, oak islands with
// product cut-outs, an "All products" screen, the 122 Coins counter, ceiling
// slot lights and (flagships) a fitting room. Positions come from the pure
// plan (config/boutiquePlan.ts); everything static is batched, every product
// face set is one atlas mesh.

import { Group, Mesh, PlaneGeometry } from 'three'
import { atlasSize, placeOnRuns, planBoutique, type BoutiquePlan, type Spot } from '../config/boutiquePlan'
import { allocate, type Tier } from '../config/layoutMath'
import type { BrandDef } from '../config/mall'
import { MALL } from '../config/layout'
import { BLOOM_WEIGHT, registerBloom } from '../engine/bloom'
import { canvasTexture, loadImage, loadProductTexture, makeCanvas } from '../engine/textures'
import { hasCutout, type Product, type Section } from '../data/types'
import { t } from '../i18n/i18n'
import { store } from '../state/store'
import type { BatchFrame } from '../engine/batcher'
import { BRAND } from '../config/brand'
import { addCone } from './glow'
import { MAT, imageMat, tintMat } from './materials'
import { blobShadow } from './props'
import { labelSign } from './signage'
import { buildLightboxes, buildSectionPlaques, type PlacedProduct, type SectionPlaque } from './lightbox'
import { showcaseMesh, type ShowcaseItem } from './showcase'
import { rewardsCounter, type ShopContext, type ShopHandles } from './shop'
import { BRONZE, OAK, OAK_DARK } from './displays'

export interface BoutiqueOpts {
  tier: Tier
  front: number
  depth: number
  /** Shift of this boutique inside the unit's frame (Le Voile's hall is one half of its flagship). */
  offsetX: number
  products: Product[]
  /** The brand's own sections (for grouping and plaques); one section = no plaques split. */
  sections: Section[]
  brand: BrandDef
  /** Leave out the 122 Coins counter (Le Voile's hall: the boutique half has one). */
  skipCounter?: boolean
}

export function buildBoutique(ctx: ShopContext, f: BatchFrame, handles: ShopHandles, loaders: (() => Promise<unknown>)[], o: BoutiqueOpts): void {
  const plan = planBoutique(o.tier, o.front, o.depth)
  const ox = o.offsetX
  const g = new Group()
  g.position.x = ox
  g.updateMatrix()
  handles.interior.add(g)
  const gf = ctx.batcher.frame(f.base.clone().multiply(g.matrix), ctx.colliders)
  const SH = MALL.shopHeight

  walls(gf, o, plan)
  slotLights(gf, plan, SH)

  // ------------------------------------------------ lightboxes by section
  const groups = sectionGroups(o)
  const capacity = placeOnRuns(plan.runs, 9999).length
  const counts = allocate(groups.map((s) => s.items.length), capacity)
  const picked = groups.flatMap((s, i) => s.items.slice(0, counts[i]).map((p) => ({ p, section: s.section })))
  const spots = placeOnRuns(plan.runs, picked.length)
  const placed: PlacedProduct[] = spots.map((s, i) => ({ product: picked[i].p, ...s }))
  const lctx = { interaction: ctx.interaction, loaders, atlas: atlasSize(ctx.bakedTextureMax()) }
  buildLightboxes(lctx, gf, g, placed)
  if (groups.length > 1) buildSectionPlaques(lctx, g, plaquesFor(spots, picked.map((x) => x.section)))

  // ---------------------------------------------------------------- hero
  const heroProduct = o.products.find((p) => p.modelOutfit) ?? o.products[0]
  if (heroProduct) hero(ctx, gf, g, plan, o.brand, heroProduct, loaders)

  // ------------------------------------------------ standees + islands
  const used = new Set(placed.map((x) => x.product.id))
  const rank = (p: Product) => (hasCutout(p) ? (p.modelOutfit ? 0 : 1) : 2)
  const standeeProducts = [...o.products].sort((a, b) => rank(a) - rank(b))
  const standees: ShowcaseItem[] = plan.standees.map((s, i) => {
    plinth(gf, s.x, s.z, ctx)
    const w = f.toWorld(s.x + ox, 0, s.z)
    addCone(w.x, SH - 0.05, w.z, SH - 2.0, 0.5, 0, 0)
    const sh = blobShadow(1.1, 1.1, 0.5)
    sh.position.set(s.x, 0.005, s.z)
    g.add(sh)
    return { product: standeeProducts[i % standeeProducts.length], x: s.x, y: 0.12 + 0.9, z: s.z, yaw: s.yaw, w: 0.9, h: 1.8 }
  })
  const islandPool = [...o.products.filter((p) => hasCutout(p) && !used.has(p.id)), ...o.products.filter((p) => hasCutout(p))]
  const islandItems: ShowcaseItem[] = []
  plan.islands.forEach((is, k) => {
    island(gf, is, o.brand.color)
    const n = Math.max(2, Math.min(4, Math.floor(is.w / 0.55)))
    for (let j = 0; j < n && islandPool.length; j++) {
      const p = islandPool[(k * 4 + j) % islandPool.length]
      const x = is.x + (j - (n - 1) / 2) * (is.w / n)
      gf.block(tintMat('#f3ece4', 1, 0.8), x, 0.79, is.z, 0.36, 0.08, 0.3)
      islandItems.push({ product: p, x, y: 0.87 + 0.25, z: is.z, yaw: 0, w: 0.42, h: 0.5 })
    }
  })
  const tm = ctx.textureMax()
  showcaseMesh({ interaction: ctx.interaction, loaders }, g, standees, tm / 2)
  showcaseMesh({ interaction: ctx.interaction, loaders }, g, islandItems, tm / 4)

  // --------------------------------------------- screen, counter, fitting
  screen(ctx, gf, g, plan.screen, o, loaders)
  if (!o.skipCounter) rewardsCounter(ctx, gf, g, o.brand.id, o.brand.color, plan.counter.x, plan.counter.z)
  if (plan.fitting) fitting(gf, g, plan.fitting)

  // ------------------------------------------------ models + assistant
  const modelProducts = o.products.filter((p) => p.modelOutfit)
  plan.models.slice(0, modelProducts.length).forEach((s, i) => {
    plinth(gf, s.x, s.z, ctx)
    const w = f.toWorld(s.x + ox, 0, s.z)
    handles.modelSpots.push({ x: w.x, z: w.z, yaw: handles.layout.yaw + s.yaw, product: modelProducts[i] })
  })
  if (!handles.staffSpot) {
    const w = f.toWorld(plan.staff.x + ox, 0, plan.staff.z)
    handles.staffSpot = { x: w.x, z: w.z, yaw: handles.layout.yaw + plan.staff.yaw }
  }
}

// ---------------------------------------------------------------------------

function sectionGroups(o: BoutiqueOpts): { section: Section; items: Product[] }[] {
  const byId = new Map(o.products.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const out = o.sections
    .map((section) => ({
      section,
      items: section.productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p && !seen.has(p.id) && (seen.add(p.id), true)),
    }))
    .filter((s) => s.items.length)
  const rest = o.products.filter((p) => !seen.has(p.id))
  if (rest.length) {
    const fallback = out[0]?.section ?? o.sections[0]
    if (out[0]) out[0].items.push(...rest)
    else if (fallback) out.push({ section: fallback, items: rest })
  }
  return out
}

/** One plaque over each run's contiguous stretch of the same section. */
function plaquesFor(spots: Spot[], sections: Section[]): SectionPlaque[] {
  const out: SectionPlaque[] = []
  let i = 0
  while (i < spots.length) {
    let j = i
    while (
      j + 1 < spots.length &&
      sections[j + 1] === sections[i] &&
      spots[j + 1].yaw === spots[i].yaw &&
      Math.hypot(spots[j + 1].x - spots[j].x, spots[j + 1].z - spots[j].z) < 1.2
    )
      j++
    const n = j - i + 1
    const a = spots[i]
    const b = spots[j]
    out.push({ section: sections[i], x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, yaw: a.yaw, w: Math.min(2.6, n * 1.1 - 0.15) })
    i = j + 1
  }
  return out
}

function walls(f: BatchFrame, o: BoutiqueOpts, plan: BoutiquePlan): void {
  const h = o.front / 2
  const SH = MALL.shopHeight
  const plaster = tintMat('#efe6d8', 1, 0.92)
  // Cream plaster on the inside faces (1 cm proud of the shell), bronze shadow-gap at the top.
  f.box(plaster, 0, SH / 2, -o.depth + 0.16, o.front - 0.3, SH, 0.02)
  for (const sx of [-1, 1]) {
    f.box(plaster, sx * (h - 0.16), SH / 2, -o.depth / 2 - 0.15, 0.02, SH, o.depth - 0.6)
    f.box(MAT.brass, sx * (h - 0.17), SH - 0.32, -o.depth / 2 - 0.15, 0.02, 0.03, o.depth - 0.6)
  }
  f.box(MAT.brass, 0, SH - 0.32, -o.depth + 0.17, o.front - 0.3, 0.03, 0.02)
  // Free-standing lightbox walls (flagships): oak plinth, cream body, bronze cap.
  for (const w of plan.freeWalls) {
    f.block(OAK_DARK, w.x, 0, w.z, 0.24, 0.12, w.len + 0.1, { collide: true })
    f.block(tintMat('#f3ece4', 1, 0.85), w.x, 0.12, w.z, 0.12, 2.42, w.len)
    f.box(BRONZE, w.x, 2.56, w.z, 0.16, 0.04, w.len + 0.04)
  }
}

function slotLights(f: BatchFrame, plan: BoutiquePlan, SH: number): void {
  for (const l of plan.lights) {
    const len = Math.hypot(l.x1 - l.x0, l.z1 - l.z0)
    const alongZ = Math.abs(l.z1 - l.z0) > Math.abs(l.x1 - l.x0)
    const x = (l.x0 + l.x1) / 2
    const z = (l.z0 + l.z1) / 2
    f.box(MAT.lightWarm, x, SH - 0.03, z, alongZ ? 0.06 : len, 0.02, alongZ ? len : 0.06)
  }
}

function plinth(f: BatchFrame, x: number, z: number, ctx: ShopContext): void {
  f.cyl(MAT.brass, x, 0, z, 0.47, 0.03)
  f.cyl(MAT.marbleTop, x, 0.03, z, 0.45, 0.09)
  const w = f.toWorld(x, 0, z)
  ctx.colliders.circles.push({ x: w.x, z: w.z, r: 0.5 })
}

function island(f: BatchFrame, is: { x: number; z: number; w: number; d: number }, color: string): void {
  f.block(OAK_DARK, is.x, 0, is.z, is.w - 0.1, 0.06, is.d - 0.1, { collide: true })
  f.block(OAK, is.x, 0.06, is.z, is.w, 0.68, is.d)
  f.block(MAT.marbleTop, is.x, 0.74, is.z, is.w + 0.04, 0.05, is.d + 0.04)
  f.box(BRONZE, is.x, 0.765, is.z + is.d / 2 + 0.021, is.w + 0.04, 0.05, 0.004)
  // Brand-colour inlay strip on the front face.
  f.box(tintMat(color, 1, 0.5), is.x, 0.42, is.z + is.d / 2 + 0.002, is.w * 0.8, 0.05, 0.004)
}

function hero(ctx: ShopContext, f: BatchFrame, g: Group, plan: BoutiquePlan, brand: BrandDef, p: Product, loaders: (() => Promise<unknown>)[]): void {
  const H = plan.hero
  f.box(MAT.brass, H.x, H.y, H.z - 0.02, H.w + 0.12, H.h + 0.12, 0.06)
  f.box(tintMat(brand.color, 1, 0.5), H.x, H.y - H.h / 2 - 0.08, H.z + 0.012, H.w + 0.12, 0.02, 0.004)
  const plane = new Mesh(new PlaneGeometry(H.w, H.h), imageMat(null, { color: '#f3ead9' }))
  plane.position.set(H.x, H.y, H.z + 0.015)
  g.add(plane)
  ctx.interaction.add({
    object: plane,
    kind: 'product',
    label: () => `${brand.name} · ${p.title}`,
    onInteract: () => store.getState().openProduct(p.id),
    maxDist: 6,
  })
  loaders.push(async () => {
    const W = 1024
    const Hh = Math.round((W * H.h) / H.w)
    const [c, cg] = makeCanvas(W, Hh)
    const { image } = await loadProductTexture(p.images[1] ?? p.images[0], 1024)
    const im = image as HTMLCanvasElement
    const s = Math.max(W / im.width, Hh / im.height)
    cg.drawImage(im, (W - im.width * s) / 2, (Hh - im.height * s) * 0.3, im.width * s, im.height * s)
    // Brand band along the bottom.
    const bh = Math.round(Hh * 0.18)
    cg.fillStyle = brand.color
    cg.globalAlpha = 0.92
    cg.fillRect(0, Hh - bh, W, bh)
    cg.globalAlpha = 1
    cg.fillStyle = '#fbf6ef'
    cg.textAlign = 'center'
    cg.textBaseline = 'middle'
    if (brand.logo) {
      try {
        const logo = await loadImage(brand.logo)
        const k = Math.min((W * 0.4) / logo.width, (bh * 0.7) / logo.height)
        cg.drawImage(logo, W / 2 - (logo.width * k) / 2, Hh - bh / 2 - (logo.height * k) / 2, logo.width * k, logo.height * k)
      } catch {
        cg.font = `600 ${Math.round(bh * 0.5)}px ${BRAND.fontLatin}`
        cg.fillText(brand.name.toUpperCase(), W / 2, Hh - bh / 2)
      }
    } else {
      cg.font = `600 ${Math.round(bh * 0.5)}px ${BRAND.fontLatin}`
      cg.fillText(brand.name.toUpperCase(), W / 2, Hh - bh / 2)
    }
    const mat = imageMat(canvasTexture(c))
    registerBloom(mat, BLOOM_WEIGHT.lightbox)
    plane.material = mat
  })
}

function screen(ctx: ShopContext, f: BatchFrame, g: Group, s: Spot, o: BoutiqueOpts, loaders: (() => Promise<unknown>)[]): void {
  const W = 0.9
  const H = 1.6
  const y = 1.5
  const c = Math.cos(s.yaw)
  const sn = Math.sin(s.yaw)
  f.box(MAT.brass, s.x - 0.03 * sn, y, s.z - 0.03 * c, W + 0.08, H + 0.08, 0.05, { rotY: s.yaw })
  const plane = new Mesh(new PlaneGeometry(W, H), imageMat(null, { color: '#1f1a17' }))
  plane.position.set(s.x, y, s.z)
  plane.rotation.y = s.yaw
  g.add(plane)
  ctx.interaction.add({
    object: plane,
    kind: 'catalog',
    label: () => t('browseAll', store.getState().lang),
    onInteract: () => store.getState().set({ overlay: 'brandCatalog', catalogBrand: o.brand.id }),
    maxDist: 3.6,
  })
  loaders.push(async () => {
    const [cv, cg] = makeCanvas(512, 910)
    cg.fillStyle = '#1f1a17'
    cg.fillRect(0, 0, 512, 910)
    cg.textAlign = 'center'
    cg.textBaseline = 'middle'
    cg.fillStyle = '#f4ede3'
    cg.font = `600 40px ${BRAND.fontLatin}`
    cg.fillText(o.brand.name.toUpperCase(), 256, 70)
    cg.fillStyle = '#e8c27a'
    cg.font = `500 26px ${BRAND.fontLatin}`
    cg.fillText(`ALL ${o.products.length} PRODUCTS`, 256, 118)
    cg.direction = 'rtl'
    cg.font = `700 30px ${BRAND.fontUi}`
    cg.fillText('كل المنتجات', 256, 160)
    cg.direction = 'ltr'
    const thumbs = o.products.slice(0, 9)
    const imgs = await Promise.all(thumbs.map((p) => loadProductTexture(p.images[0], 256).then((r) => r.image as HTMLCanvasElement).catch(() => null)))
    imgs.forEach((im, i) => {
      if (!im) return
      const cw = 150
      const x = 31 + (i % 3) * (cw + 10)
      const yy = 200 + Math.floor(i / 3) * (cw * 1.2 + 10)
      const sc = Math.max(cw / im.width, (cw * 1.2) / im.height)
      cg.save()
      cg.beginPath()
      cg.rect(x, yy, cw, cw * 1.2)
      cg.clip()
      cg.drawImage(im, x + (cw - im.width * sc) / 2, yy + (cw * 1.2 - im.height * sc) / 2, im.width * sc, im.height * sc)
      cg.restore()
    })
    cg.fillStyle = BRAND.magenta
    cg.fillRect(96, 830, 320, 56)
    cg.fillStyle = '#fff'
    cg.font = `700 26px ${BRAND.fontUi}`
    cg.fillText('TAP TO BROWSE', 256, 858)
    const mat = imageMat(canvasTexture(cv))
    registerBloom(mat, BLOOM_WEIGHT.screen)
    plane.material = mat
  })
}

function fitting(f: BatchFrame, g: Group, r: { x0: number; z0: number; x1: number; z1: number }): void {
  const curtain = tintMat('#6d3d8f', 1, 0.95)
  const zf = r.z1 // booth fronts face the shop (+z)
  const n = 2
  const bw = (r.x1 - r.x0) / n
  for (let i = 0; i <= n; i++) f.block(OAK, r.x0 + i * bw, 0, (r.z0 + zf) / 2, 0.08, 2.4, zf - r.z0, { collide: true })
  f.box(OAK, (r.x0 + r.x1) / 2, 2.44, zf, r.x1 - r.x0 + 0.08, 0.08, 0.08)
  for (let i = 0; i < n; i++) {
    const cx = r.x0 + (i + 0.5) * bw
    f.box(curtain, cx, 1.22, zf - 0.04, bw - 0.12, 2.3, 0.04, { collide: true })
  }
  f.cyl(tintMat('#c9b8a6', 1, 0.9), (r.x0 + r.x1) / 2, 0, zf + 1.1, 0.32, 0.42, { collide: true })
  const sign = new Mesh(new PlaneGeometry(1.4, 0.35), imageMat(labelSign('FITTING', 'البروفة', { bg: '#f4ede3', fg: '#6b4f35', w: 1024, h: 256 })))
  sign.position.set((r.x0 + r.x1) / 2, 2.75, zf + 0.05)
  g.add(sign)
}
