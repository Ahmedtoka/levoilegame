// One shop per section, built in a local frame:
//   origin = centre of the opening on the boulevard, local -Z goes into the
//   shop (depth 0..14), local X runs along the front (-6..6), +Z faces the
//   boulevard. Products are laid out according to SectionStyle.display.

import {
  BoxGeometry,
  Color,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
  type Object3D,
} from 'three'
import { BRAND } from '../config/brand'
import { MALL, type ShopLayout } from '../config/layout'
import type { Batcher, BatchFrame } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import { canvasTexture, loadProductTexture, makeCanvas } from '../engine/textures'
import { withinGate } from '../engine/hysteresis'
import { BLOOM_WEIGHT, registerBloom } from '../engine/bloom'
import { MIRROR_LAYER } from '../engine/layers'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { discountPercent, displayImage, hasCutout, type Catalog, type Product, type Section } from '../data/types'
import { formatPrice, t } from '../i18n/i18n'
import { store } from '../state/store'
import type { Interaction } from '../interact/interaction'
import { imageMat, MAT, tintMat } from './materials'
import { blobShadow, framedPlane, plant, slimPlant, v3 } from './props'
import { bladeSign, comingSoonTexture, labelSign, lightboxBlade, lightboxFascia, logoTexture, priceTagTexture, shopFascia, type Monogram } from './signage'
import { addCone, addRectHalo } from './glow'
import { aoFloorJunction } from './aoStrips'
import { windowGlass } from './finish'
import type { Kit } from './kit'
import type { DisplayKind } from '../config/sections'
import { cardPanel, easelRow, loadCards, lookbookStand, registerCards, type Card } from './displays'

export interface ShopContext {
  root: Object3D
  batcher: Batcher
  colliders: CollisionWorld
  interaction: Interaction
  catalog: Catalog
  textureMax: () => number
  /** Longest side of baked-store atlases (the Le Voile glTF) for the current quality. */
  bakedTextureMax: () => number
  /** Baked décor kit (null → procedural props). */
  kit?: Kit | null
  /** Opens checkout (shops with their own cash desk). */
  onCheckout?: () => void
  /** Bespoke interiors by brand id (e.g. Le Voile's baked boutique). Returns false to fall back. */
  bespoke?: Record<string, (ctx: ShopContext, f: BatchFrame, handles: ShopHandles, loaders: (() => Promise<unknown>)[]) => boolean>
}

/** Where a showcase model stands (world space), filled by the people builder. */
export interface ModelSpot {
  x: number
  z: number
  yaw: number
  product: Product
  /** Height of the base the model stands on (default 0.12). */
  plinth?: number
}

export interface ShopHandles {
  layout: ShopLayout
  /** Everything behind the storefront (culled with the shop). */
  interior: Group
  modelSpots: ModelSpot[]
  staffSpot: { x: number; z: number; yaw: number } | null
  /** False when the player can't see inside (culls products, tags and characters). */
  interiorVisible: boolean
  /**
   * True unless the player is inside another shop: the shop's characters stay drawn
   * (as LODs beyond the rig distance) whenever its opening can be seen, independent
   * of the interior-detail culling.
   */
  seenFrom: boolean
  /** Lazy-loads images when the player gets close and culls the interior. */
  update(px: number, pz: number, insideShop: boolean): void
  /** Force-load (teleport target). */
  load(): void
}

const PANEL_W = 1.0
const PANEL_H = PANEL_W * (1306 / 1080)
const HL_MAT = new MeshBasicMaterial({ color: BRAND.magenta, toneMapped: false })
const PLACEHOLDER: Material = new MeshStandardMaterial({ color: '#efe6ea', roughness: 0.9 })

export function openProductLabel(p: Product): string {
  return `${t('view', store.getState().lang)} · ${p.title}`
}

export function priceTag(p: Product): Mesh {
  // Baked into a texture once, so use Latin digits that read well in both languages.
  const L = 'en'
  const off = discountPercent(p)
  const tex = priceTagTexture(
    p.title,
    formatPrice(p.price, L),
    p.compareAtPrice && off ? formatPrice(p.compareAtPrice, L) : null,
    off ? `-${off}%` : null,
  )
  return new Mesh(new PlaneGeometry(0.56, 0.28), imageMat(tex))
}

export function buildShop(ctx: ShopContext, shop: ShopLayout): ShopHandles {
  const base = new Matrix4().makeRotationY(shop.yaw).setPosition(shop.entrance.x, 0, shop.entrance.z)
  const f = ctx.batcher.frame(base, ctx.colliders)
  const group = new Group()
  group.name = `shop:${shop.id}`
  group.matrixAutoUpdate = false
  group.matrix.copy(base)
  group.matrixWorldNeedsUpdate = true
  ctx.root.add(group)
  // Everything behind the storefront; hidden when it can't be seen.
  const interior = new Group()
  interior.name = 'interior'
  group.add(interior)

  const loaders: (() => Promise<unknown>)[] = []
  let loaded = false
  const load = () => {
    if (loaded) return
    loaded = true
    for (const l of loaders) l().catch((e) => console.warn(e))
  }
  const r = shop.rect
  const handles: ShopHandles = {
    layout: shop,
    interior,
    modelSpots: [],
    staffSpot: null,
    interiorVisible: true,
    seenFrom: true,
    update(px, pz, insideShop) {
      if (!loaded && Math.hypot(px - shop.center.x, pz - shop.center.z) < 34) load()
      // Inside a shop you only see that shop; from the boulevard, shops near you.
      const inside = px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1
      // Hysteresis: shown within 19 m, hidden again only past 22 m (no flicker at the edge).
      const near = withinGate(handles.interiorVisible, Math.hypot(px - shop.entrance.x, pz - shop.entrance.z), 19, 3)
      handles.seenFrom = inside || !insideShop
      const v = inside || (!insideShop && near)
      if (v !== handles.interiorVisible) {
        handles.interiorVisible = v
        interior.visible = v
      }
    },
    load,
  }

  const depth = MALL.shopDepth
  const half = MALL.shopLen / 2

  if (shop.kind === 'soon') {
    // Empty unit: hoarding across the closed front, nothing inside.
    const hoarding = new Mesh(new PlaneGeometry(MALL.shopLen - 0.6, 3.75), imageMat(comingSoonTexture()))
    hoarding.position.set(0, 1.9, 0.03)
    group.add(hoarding)
    f.box(MAT.brass, 0, 3.8, 0.02, MALL.shopLen - 0.5, 0.06, 0.04)
    interior.visible = false
    handles.update = () => {}
    handles.interiorVisible = false
    return handles
  }

  if (shop.kind === 'lounge' || !shop.section || !shop.style) {
    buildLounge(f, interior, loaders, ctx.kit ?? null, ctx.colliders)
    if (shop.amenity === 'lounge') {
      const sign = new Mesh(new PlaneGeometry(4.2, 1.05), imageMat(labelSign('District Lounge', 'استراحة ديستريكت', { bg: '#f4ede3', fg: '#6b4f35' })))
      sign.position.set(0, 4.55, 0.06)
      group.add(sign)
    }
    return handles
  }

  const section = shop.section
  const style = shop.style
  const mono = shop.brand ? { initials: shop.brand.initials, color: shop.brand.color, logo: shop.brand.logo } : undefined
  const tint = style.tint
  const accent = tintMat('#ece3d6', 1, 0.9)
  const accentDeep = tintMat('#a57b52', 1, 0.6)
  const products = section.productIds.map((id) => ctx.catalog.byId.get(id)).filter((p): p is Product => !!p)

  // ---------------------------------------------------------- storefront
  if (mono) storefront(f, group, shop, section, mono, products, loaders, ctx.textureMax())
  else {
    const fascia = new Mesh(new PlaneGeometry(5.8, 1.45), imageMat(shopFascia(section, tint, mono)))
    fascia.position.set(0, 4.95, 0.03)
    group.add(fascia)
    f.box(MAT.brass, 0, 4.95, 0.015, 5.95, 1.6, 0.02)
    const bladeTex = bladeSign(section, mono)
    for (const side of [1, -1]) {
      const blade = new Mesh(new PlaneGeometry(1.1, 1.1), imageMat(bladeTex))
      blade.position.set(-half + 0.9 + side * 0.022, 4.2, 1.0)
      blade.rotation.y = (side * Math.PI) / 2
      group.add(blade)
    }
    f.bar(MAT.brass, v3(-half + 0.9, 4.85, 0), v3(-half + 0.9, 4.85, 1.65), 0.025)
    f.box(MAT.brass, -half + 0.9, 4.2, 1.0, 0.03, 1.2, 1.2)
  }

  // Window posters on both sides of the entrance (second photo when available);
  // with a display window they hang inside it as the backdrop.
  products.slice(0, 2).forEach((p, i) => {
    const x = (i === 0 ? -1 : 1) * (mono ? WIN.poster : 4.55)
    const w = mono ? 1.38 : 2.0
    const h = w * (1306 / 1080)
    const y = mono ? 1.95 : 1.75
    const poster = new Mesh(new PlaneGeometry(w, h), PLACEHOLDER)
    poster.position.set(x, y, 0.04)
    group.add(poster)
    framedPlane(f, x, y, 0.03, w, h, MAT.brass, 0.05)
    const src = p.images[1] ?? p.images[0]
    loaders.push(() =>
      loadProductTexture(src, ctx.textureMax()).then(({ texture }) => {
        poster.material = imageMat(texture)
      }),
    )
    ctx.interaction.add({
      object: poster,
      kind: 'product',
      label: () => openProductLabel(p),
      onInteract: () => store.getState().openProduct(p.id),
      maxDist: 4,
    })
  })

  // --------------------------------------------------------------- interior
  // Bespoke interiors (e.g. Le Voile's baked boutique) replace the generic furnishing.
  if (shop.brand && ctx.bespoke?.[shop.brand.id]?.(ctx, f, handles, loaders)) return handles

  // Tinted back wall with a brass line, wainscot on the side walls.
  f.box(accent, 0, MALL.shopHeight / 2, -depth + 0.03, MALL.shopLen - 0.2, MALL.shopHeight, 0.04)
  f.box(MAT.brass, 0, 3.35, -depth + 0.06, MALL.shopLen - 0.2, 0.04, 0.03)
  for (const sx of [-1, 1]) {
    f.box(accentDeep, sx * (half - 0.03), 0.5, -depth / 2, 0.04, 1.0, depth - 0.4)
    f.box(MAT.brass, sx * (half - 0.05), 1.0, -depth / 2, 0.03, 0.03, depth - 0.4)
  }
  // Section name inside, above the back display
  const inner = new Mesh(new PlaneGeometry(3.6, 0.9), imageMat(shopFascia(section, tint, mono)))
  inner.position.set(0, 3.85, -depth + 0.07)
  interior.add(inner)

  if (!ctx.kit?.place('plant', interior, -half + 0.7, -0.9, 0.6, ctx.colliders)) slimPlant(f, -half + 0.6, -0.9, shop.index * 3 + 1)
  if (!ctx.kit?.place('plant', interior, half - 0.7, -0.9, -0.6, ctx.colliders)) slimPlant(f, half - 0.6, -0.9, shop.index * 3 + 2)

  const kit = ctx.kit ?? null
  const display = new ProductDisplay(ctx, f, interior, loaders)
  if (kit) {
    furnishWithKit(kit, ctx, f, interior, style.display, section, products, loaders, mono)
  } else switch (style.display) {
    case 'rack':
      rackDisplay(display, products, tint)
      break
    case 'shelf':
      shelfDisplay(display, products, tint)
      break
    case 'gallery':
      galleryDisplay(display, products)
      break
    case 'boxes':
      boxesDisplay(display, products, tint)
      break
  }

  // Showcase models (products flagged modelOutfit) stand mid-shop with a standee.
  const modelProducts = products.filter((p) => p.modelOutfit)
  modelProducts.slice(0, 3).forEach((p, i) => {
    const n = Math.min(modelProducts.length, 3)
    const x = n === 1 ? 0 : -3.4 + (6.8 / (n - 1)) * i
    const z = kit ? -5.2 : -6.6
    // Plinth
    f.cyl(MAT.brass, x, 0, z, 0.63, 0.03)
    f.cyl(MAT.plinth, x, 0.03, z, 0.6, 0.09)
    f.collider(x, z, 1.1, 1.1)
    const w = f.toWorld(x, 0.12, z)
    handles.modelSpots.push({ x: w.x, z: w.z, yaw: shop.yaw, product: p })
    // Standee beside the model, angled to the entrance
    const sx = x + (x <= 0 ? -1.05 : 1.05)
    display.standee(p, sx, z + 0.35, x <= 0 ? 0.35 : -0.35)
  })

  // A sales assistant in every shop (chat with her via E); beside the models where there are some.
  {
    const w = f.toWorld(modelProducts.length ? half - 1.3 : half - 1.6, 0, modelProducts.length ? -2.6 : -4.2)
    handles.staffSpot = { x: w.x, z: w.z, yaw: shop.yaw - 0.9 }
  }

  // 122 Coins rewards counter just inside the entrance (left).
  if (shop.brand) rewardsCounter(ctx, f, interior, shop.brand.id, shop.brand.color)

  return handles
}

// -------------------------------------------------------------------------

/**
 * Bounding box of the non-transparent pixels of a cutout, in `w`×`h` image pixels.
 * Measured on the small CPU thumbnail (reading the GPU-backed full-size canvas back
 * stalled frames), then padded by one sample so the crop never cuts the figure.
 */
function alphaBounds(thumb: HTMLCanvasElement, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const sw = thumb.width
  const sh = thumb.height
  const d = thumb.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, sw, sh).data
  let x0 = sw
  let y0 = sh
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++)
      if (d[(y * sw + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return { x: 0, y: 0, w, h }
  const kx = w / sw
  const ky = h / sh
  const X0 = Math.max(0, Math.floor((x0 - 1) * kx))
  const Y0 = Math.max(0, Math.floor((y0 - 1) * ky))
  const X1 = Math.min(w, Math.ceil((x1 + 2) * kx))
  const Y1 = Math.min(h, Math.ceil((y1 + 2) * ky))
  return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 }
}

/** Display-window geometry (shop-local, mirrored on both sides of the opening). */
const WIN = {
  x0: 3.2, // inner edge (clear of the opening's bronze frame)
  x1: 5.5, // outer edge (clear of the row pilaster at 5.6)
  z: 0.6, // glass line, in front of the wall face
  y0: 0.3, // glass from the stone base…
  y1: 3.6, // …to the lit header
  poster: 4.68, // backdrop poster centre (outer half)
  plinth: 3.68, // product plinth centre (inner half, by the door)
}
const FASCIA_Y = 4.97
const FIG_W = 0.9
const FIG_H = 1.8
const PLINTH_TOP = 0.74
const _white = new Color('#ffffff')

/**
 * Lightbox fascia, lightbox blade sign on a bronze bracket, and two display
 * windows (stone base, glass, lit header, plinth with a product) beside the
 * opening. Static parts are batched; the textured faces are one mesh each
 * (the two blade faces and the two window products share a mesh).
 */
function storefront(f: BatchFrame, group: Group, shop: ShopLayout, section: Section, mono: Monogram, products: Product[], loaders: (() => Promise<unknown>)[], tm: number): void {
  const half = MALL.shopLen / 2
  const cream = tintMat('#f3ece4', 1, 0.8)

  // Fascia: bronze box (1 cm into the wall, front at z 0.15), lit face 5 mm proud, halo on the wall.
  f.box(MAT.brass, 0, FASCIA_Y, 0.07, 6.0, 1.5, 0.16)
  const faceMat = imageMat(lightboxFascia(section, mono))
  registerBloom(faceMat, BLOOM_WEIGHT.lightbox)
  const face = new Mesh(new PlaneGeometry(5.84, 1.36), faceMat)
  face.position.set(0, FASCIA_Y, 0.155)
  face.layers.enable(MIRROR_LAYER)
  group.add(face)
  const hw = f.toWorld(0, FASCIA_Y, 0.012)
  addRectHalo(hw.x, hw.y, hw.z, 6.0 / 0.8, 1.5 / 0.62, shop.yaw, `#${new Color(mono.color).lerp(_white, 0.5).getHexString()}`)

  // Blade: 0.14 m bronze lightbox with a lit face each side (one mesh), hung from a wall bracket.
  // It hangs over the outer display window: z 0.7–1.9 keeps it clear of the window header
  // (z ≤ 0.64), whose underside is at the blade's bottom height.
  const bx = -half + 0.9
  const bz = 1.3
  f.box(MAT.brass, bx, 4.2, bz, 0.14, 1.2, 1.2)
  const faces = mergeGeometries([
    new PlaneGeometry(1.08, 1.08).rotateY(Math.PI / 2).translate(0.075, 0, 0),
    new PlaneGeometry(1.08, 1.08).rotateY(-Math.PI / 2).translate(-0.075, 0, 0),
  ])
  const bladeMat = imageMat(lightboxBlade(section, mono))
  bladeMat.side = FrontSide
  registerBloom(bladeMat, BLOOM_WEIGHT.lightbox)
  const blade = new Mesh(faces, bladeMat)
  blade.position.set(bx, 4.2, bz)
  blade.layers.enable(MIRROR_LAYER)
  group.add(blade)
  f.box(MAT.brass, bx, 4.95, 0.01, 0.12, 0.34, 0.04) // wall plate
  f.bar(MAT.brass, v3(bx, 4.95, 0.02), v3(bx, 4.95, 1.98), 0.02) // arm
  f.bar(MAT.brass, v3(bx, 4.66, 0.02), v3(bx, 4.95, 0.46), 0.011) // brace
  for (const hz of [0.82, 1.78]) f.bar(MAT.brass, v3(bx, 4.79, hz), v3(bx, 4.95, hz), 0.008) // hangers

  // Display windows.
  const cx = (WIN.x0 + WIN.x1) / 2
  const vw = WIN.x1 - WIN.x0
  const gh = WIN.y1 - WIN.y0
  // Glass stops 5 mm under the header and its side returns start 1 cm off the wall:
  // no glass face is coplanar with the wall or the header.
  const gg = gh - 0.005
  const rz0 = 0.01
  const glass = windowGlass()
  for (const sx of [-1, 1]) {
    const x = sx * cx
    // Stone base (1 cm into the wall and below the floor), collider.
    f.box(cream, x, 0.145, WIN.z / 2 - 0.005, vw, 0.31, WIN.z + 0.01, { collide: true })
    // Glass: front pane + two side returns; bronze rails and corner posts.
    f.box(glass, x, WIN.y0 + gg / 2, WIN.z, vw, gg, 0.012)
    for (const ex of [WIN.x0, WIN.x1]) {
      f.box(glass, sx * ex, WIN.y0 + gg / 2, (rz0 + WIN.z) / 2, 0.012, gg, WIN.z - rz0)
      f.box(MAT.brass, sx * ex, WIN.y0 + gh / 2, WIN.z, 0.04, gh, 0.04)
      f.box(MAT.brass, sx * ex, WIN.y0 + 0.004, WIN.z / 2, 0.04, 0.048, WIN.z)
    }
    f.box(MAT.brass, x, WIN.y0 + 0.005, WIN.z, vw + 0.04, 0.05, 0.04)
    f.box(MAT.brass, x, WIN.y1 - 0.015, WIN.z, vw + 0.04, 0.05, 0.04)
    // Header (cream, the bronze top rail runs into it) with a light line along its underside.
    f.box(cream, x, WIN.y1 + 0.12, WIN.z / 2 + 0.015, vw + 0.06, 0.24, WIN.z + 0.05)
    f.box(MAT.lightWarm, x, WIN.y1 - 0.005, WIN.z * 0.45, vw - 0.3, 0.02, 0.04)
    // Lit plinth: cream block, bronze cap, glowing band; a soft spot cone from the header.
    const px = sx * WIN.plinth
    f.box(cream, px, (WIN.y0 + PLINTH_TOP - 0.02) / 2, 0.3, 0.72, PLINTH_TOP - 0.02 - WIN.y0 + 0.01, 0.4)
    f.box(MAT.brass, px, PLINTH_TOP - 0.01, 0.3, 0.74, 0.02, 0.42)
    f.box(MAT.lightWarm, px, PLINTH_TOP - 0.065, 0.502, 0.66, 0.025, 0.01)
    const cw = f.toWorld(px, WIN.y1 - 0.02, 0.3)
    addCone(cw.x, cw.y, cw.z, WIN.y1 - PLINTH_TOP - 0.05, 0.26, 0, 0)
    // Contact shading where the base meets the floor.
    aoFloorJunction(sx * WIN.x0, WIN.z + 0.005, sx * WIN.x1, WIN.z + 0.005, 0, 1, f.base, 0.25, 0.4)
  }

  // The two window products share one tm² canvas (left half / right half; tm = the tier's
  // texture size, 512 on Low) and one mesh.
  // Prefer products with a clean cutout (they stand on the plinth like a mannequin).
  const rank = (p: Product) => (hasCutout(p) ? (p.modelOutfit ? 0 : 1) : 2)
  const picks = [...products].sort((a, b) => rank(a) - rank(b)).slice(0, 2)
  if (!picks.length || typeof document === 'undefined') return
  const quads = picks.map((_, i) => {
    const q = new PlaneGeometry(FIG_W, FIG_H).translate((i === 0 ? -1 : 1) * WIN.plinth, PLINTH_TOP + FIG_H / 2, 0.3)
    const uv = q.getAttribute('uv')
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * 0.5 + i * 0.5)
    return q
  })
  const [c, g] = makeCanvas(tm, tm)
  const k = tm / 1024 // drawing constants below are for a 1024 canvas
  const tex = canvasTexture(c)
  const mat = imageMat(tex)
  mat.side = FrontSide
  mat.alphaTest = 0.5
  const figs = new Mesh(mergeGeometries(quads), mat)
  figs.visible = false
  group.add(figs)
  loaders.push(() =>
    Promise.allSettled(
      picks.map((p, i) =>
        loadProductTexture(displayImage(p), tm).then(({ image, thumb }) => {
          const im = image as HTMLCanvasElement
          const hw = tm / 2
          const x0 = i * hw
          // A full-length cutout (tall once trimmed) stands on the plinth like a mannequin.
          const b = hasCutout(p) ? alphaBounds(thumb, im.width, im.height) : null
          if (b && b.h / b.w > 1.45) {
            const sc = Math.min((480 * k) / b.w, (1000 * k) / b.h)
            g.drawImage(im, b.x, b.y, b.w, b.h, x0 + (hw - b.w * sc) / 2, tm - b.h * sc, b.w * sc, b.h * sc)
          } else {
            // Otherwise a mounted print standing on the plinth; a tall image is narrowed, not squashed.
            const maxW = 440 * k
            const maxH = 620 * k
            const ar = im.height / im.width
            const w = maxW * ar > maxH ? maxH / ar : maxW
            const h = w * ar
            const y = tm - h - 24 * k
            const mx = x0 + 36 * k + (maxW - w) / 2
            g.fillStyle = '#fbf8f4'
            g.fillRect(mx - 20 * k, y - 24 * k, w + 40 * k, h + 48 * k)
            if (b) {
              const sc = Math.min(w / b.w, h / b.h)
              g.drawImage(im, b.x, b.y, b.w, b.h, mx + (w - b.w * sc) / 2, y + (h - b.h * sc) / 2, b.w * sc, b.h * sc)
            } else g.drawImage(im, mx, y, w, h)
          }
        }),
      ),
    ).then(() => {
      tex.needsUpdate = true
      figs.visible = true
    }),
  )
}

/** Shared helpers to place interactive product visuals inside a shop frame. */
class ProductDisplay {
  readonly ctx: ShopContext
  readonly f: BatchFrame
  readonly group: Group
  readonly loaders: (() => Promise<unknown>)[]

  constructor(ctx: ShopContext, f: BatchFrame, group: Group, loaders: (() => Promise<unknown>)[]) {
    this.ctx = ctx
    this.f = f
    this.group = group
    this.loaders = loaders
  }

  private register(p: Product, object: Mesh, highlight: Object3D | null, maxDist = 3.4): void {
    if (highlight) highlight.visible = false
    this.ctx.interaction.add({
      object,
      kind: 'product',
      label: () => openProductLabel(p),
      onInteract: () => store.getState().openProduct(p.id),
      highlight: (on) => {
        if (highlight) highlight.visible = on
      },
      maxDist,
    })
  }

  /** Photo panel (images[0]) with a magenta hover outline and an optional price tag. */
  panel(p: Product, x: number, y: number, z: number, w = PANEL_W, rotY = 0, tag = true): Mesh {
    const h = w * (1306 / 1080)
    const m = new Mesh(new PlaneGeometry(w, h), PLACEHOLDER)
    m.position.set(x, y, z)
    m.rotation.y = rotY
    const hl = new Mesh(new PlaneGeometry(w + 0.08, h + 0.08), HL_MAT)
    hl.position.z = -0.006
    m.add(hl)
    this.group.add(m)
    this.loaders.push(() =>
      loadProductTexture(p.images[0], this.ctx.textureMax()).then(({ texture }) => {
        m.material = imageMat(texture)
      }),
    )
    this.register(p, m, hl)
    if (tag) {
      const pt = priceTag(p)
      pt.position.set(0, -h / 2 - 0.2, 0.01)
      m.add(pt)
    }
    return m
  }

  /** Free-standing standee with the cutout (or photo) and a price tag. */
  standee(p: Product, x: number, z: number, rotY: number): void {
    const g = new Group()
    g.position.set(x, 0, z)
    g.rotation.y = rotY
    this.group.add(g)
    const h = 1.7
    const w = h * (1080 / 1306)
    const img = new Mesh(new PlaneGeometry(w, h), PLACEHOLDER)
    img.position.y = 0.16 + h / 2
    g.add(img)
    const hl = new Mesh(new PlaneGeometry(w + 0.1, h + 0.1), HL_MAT)
    hl.position.z = -0.01
    img.add(hl)
    const baseMat = MAT.plinth
    const baseMesh = new Mesh(new BoxGeometry(w + 0.1, 0.16, 0.36), baseMat)
    baseMesh.position.y = 0.08
    g.add(baseMesh)
    const tag = priceTag(p)
    tag.position.set(0, 0.42, 0.2)
    tag.rotation.x = -0.35
    tag.scale.setScalar(0.9)
    g.add(tag)
    g.add(blobShadow(w + 0.4, 0.8, 0.6))
    const wpos = this.f.toWorld(x, 0, z)
    this.f.colliders?.circles.push({ x: wpos.x, z: wpos.z, r: 0.35 })
    const src = displayImage(p)
    const transparent = !!p.cutout
    this.loaders.push(() =>
      loadProductTexture(src, this.ctx.textureMax()).then(({ texture, aspect }) => {
        img.material = imageMat(texture, { transparent })
        // Cutouts are trimmed to the subject: keep their real proportions.
        const nh = h
        const nw = nh * aspect
        img.scale.set(nw / w, 1, 1)
        hl.visible = false
        if (transparent) {
          // A soft backing card so the cutout reads as a printed standee.
          const card = new Mesh(new PlaneGeometry(nw + 0.12, nh + 0.12), tintMat('#ffffff', 1, 0.6))
          card.position.set(0, img.position.y, -0.015)
          card.scale.x = 1
          g.add(card)
        }
      }),
    )
    this.register(p, img, hl, 3.6)
  }

  /** Product box on a plinth under a glass vitrine (accessories). */
  box(p: Product, x: number, z: number, tint: string): void {
    const f = this.f
    f.block(MAT.plinth, x, 0, z, 0.8, 0.95, 0.8, { collide: true })
    f.block(MAT.brass, x, 0.95, z, 0.82, 0.03, 0.82)
    const side = tintMat(tint, 0.95, 0.7)
    const faceMat: Material = PLACEHOLDER
    const mats: Material[] = [side, side, side, side, faceMat, side]
    const size = 0.5
    const m = new Mesh(new BoxGeometry(size, size * 1.2, size), mats)
    m.position.set(x, 0.98 + (size * 1.2) / 2, z)
    this.group.add(m)
    const hl = new Mesh(new PlaneGeometry(size + 0.08, size * 1.2 + 0.08), HL_MAT)
    hl.position.set(x, m.position.y, z + size / 2 + 0.004)
    hl.renderOrder = -1
    this.group.add(hl)
    hl.position.z -= 0.008
    // Glass vitrine
    const glass = new Mesh(new BoxGeometry(0.74, 0.8, 0.74), MAT.glass)
    glass.position.set(x, 0.98 + 0.4, z)
    this.group.add(glass)
    this.loaders.push(() =>
      loadProductTexture(p.images[0], this.ctx.textureMax()).then(({ texture }) => {
        mats[4] = imageMat(texture)
        m.material = [...mats]
      }),
    )
    this.register(p, m, hl)
    const tag = priceTag(p)
    tag.position.set(x, 0.62, z + 0.41)
    tag.scale.setScalar(0.85)
    this.group.add(tag)
  }
}

function rackDisplay(d: ProductDisplay, products: Product[], tint: string): void {
  const f = d.f
  const depth = MALL.shopDepth
  const z = -depth + 0.65
  const n = products.length
  const span = Math.min(10, n * 2)
  // Wall rail with brackets
  f.bar(MAT.brass, v3(-span / 2 - 0.3, 2.3, z), v3(span / 2 + 0.3, 2.3, z), 0.025)
  for (const x of [-span / 2 - 0.3, span / 2 + 0.3]) f.bar(MAT.brass, v3(x, 2.3, z), v3(x, 2.3, -depth), 0.02)
  f.collider(0, -depth + 0.6, span + 0.6, 1.0)
  products.forEach((p, i) => {
    const x = -span / 2 + (span / n) * (i + 0.5)
    // Hanger
    f.bar(MAT.chrome, v3(x, 2.3, z), v3(x, 2.16, z), 0.012)
    f.bar(MAT.chrome, v3(x - 0.3, 2.05, z), v3(x, 2.16, z), 0.01)
    f.bar(MAT.chrome, v3(x + 0.3, 2.05, z), v3(x, 2.16, z), 0.01)
    d.panel(p, x, 2.05 - PANEL_H / 2, z + 0.02)
  })
  // Centre table with folded stacks
  centreTable(f, tint)
}

function shelfDisplay(d: ProductDisplay, products: Product[], tint: string): void {
  const f = d.f
  const depth = MALL.shopDepth
  const zWall = -depth + 0.25
  for (const y of [0.95, 1.95]) {
    f.box(MAT.wood, 0, y, zWall, 10.6, 0.05, 0.5)
    f.box(MAT.brass, 0, y - 0.03, zWall + 0.25, 10.6, 0.015, 0.015)
  }
  f.collider(0, zWall, 10.8, 0.6)
  const n = products.length
  const w = 0.78
  const h = w * (1306 / 1080)
  products.forEach((p, i) => {
    const x = -5 + (10 / n) * (i + 0.5)
    const y = (i % 2 === 0 ? 1.95 : 0.95) + h / 2 + 0.03
    d.panel(p, x, y, zWall + 0.05, w, 0, false)
    framedPlane(f, x, y, zWall + 0.035, w, h, MAT.brass, 0.03)
    const tag = priceTag(p)
    tag.scale.setScalar(0.62)
    tag.position.set(x + (i % 2 === 0 ? 0 : 0), (i % 2 === 0 ? 1.95 : 0.95) - 0.12, zWall + 0.27)
    d.group.add(tag)
    // Rolled fabric decor next to each card
    f.cyl(tintMat(tint, 0.85), x + 0.62, i % 2 === 0 ? 0.97 : 1.97, zWall + 0.05, 0.07, 0.25)
  })
  centreTable(f, tint)
}

function galleryDisplay(d: ProductDisplay, products: Product[]): void {
  const f = d.f
  const depth = MALL.shopDepth
  const n = products.length
  const zWall = -depth + 0.1
  const w = 1.15
  const h = w * (1306 / 1080)
  products.forEach((p, i) => {
    const x = -4.6 + (9.2 / Math.max(1, n - 1)) * i
    const y = 1.7
    d.panel(p, x, y, zWall + 0.04, w, 0, false)
    framedPlane(f, x, y, zWall + 0.03, w, h, MAT.brass, 0.04)
    // Picture light
    f.box(MAT.brass, x, y + h / 2 + 0.22, zWall + 0.12, 0.5, 0.05, 0.12)
    f.box(MAT.lightWarm, x, y + h / 2 + 0.195, zWall + 0.14, 0.44, 0.012, 0.06)
    const tag = priceTag(p)
    tag.scale.setScalar(0.7)
    tag.position.set(x, y - h / 2 - 0.25, zWall + 0.04)
    d.group.add(tag)
  })
  // Round plinth with a sculptural vase in the middle
  f.cyl(MAT.plinth, 0, 0, -6.5, 0.9, 0.8, { collide: true })
  f.cyl(MAT.brass, 0, 0.8, -6.5, 0.92, 0.03)
  f.sphere(MAT.magenta, 0, 1.15, -6.5, 0.3, 1.25)
  f.cyl(MAT.magenta, 0, 1.4, -6.5, 0.09, 0.35)
}

function boxesDisplay(d: ProductDisplay, products: Product[], tint: string): void {
  const n = products.length
  products.forEach((p, i) => {
    // Gentle arc facing the entrance
    const a = (i / Math.max(1, n - 1) - 0.5) * 2.2
    const x = Math.sin(a) * 4.6
    const z = -8.5 + (1 - Math.cos(a)) * 3.2
    d.box(p, x, z, tint)
  })
}

function centreTable(f: BatchFrame, tint: string): void {
  const z = -9.6
  f.block(MAT.woodDark, 0, 0, z, 2.6, 0.72, 1.1, { collide: true })
  f.block(MAT.marbleTop, 0, 0.72, z, 2.7, 0.05, 1.2)
  const cols = [tintMat(tint, 0.85), tintMat(tint, 0.7), MAT.blush, tintMat(tint, 0.95)]
  for (let i = 0; i < 4; i++) {
    const x = -0.95 + i * 0.63
    for (let k = 0; k < 3; k++) f.block(cols[(i + k) % 4], x, 0.77 + k * 0.07, z + (i % 2 ? 0.15 : -0.15), 0.46, 0.065, 0.36)
  }
}

function buildLounge(f: BatchFrame, group: Group, loaders: (() => Promise<unknown>)[], kit: Kit | null = null, colliders?: CollisionWorld): void {
  const depth = MALL.shopDepth
  // Sofas around a coffee table
  f.block(MAT.sofa, 0, 0, -depth + 1.0, 5, 0.45, 0.9, { collide: true })
  f.block(MAT.sofa, 0, 0.45, -depth + 0.62, 5, 0.5, 0.2)
  f.block(MAT.sofa, -3.2, 0, -8, 0.9, 0.45, 3.2, { collide: true })
  f.block(MAT.sofa, 3.2, 0, -8, 0.9, 0.45, 3.2, { collide: true })
  f.cyl(MAT.marbleTop, 0, 0, -8.5, 0.8, 0.42, { collide: true })
  f.cyl(MAT.brass, 0, 0.42, -8.5, 0.82, 0.02)
  ;([[-5, -depth + 1.2], [5, -depth + 1.2], [-5, -2], [5, -2]] as const).forEach(([x, z], i) => {
    if (!kit?.place('plant', group, x, z, i, colliders)) plant(f, x, z, 1.2, 31 + i)
  })
  const poster = new Mesh(new PlaneGeometry(6, 1.5), PLACEHOLDER)
  poster.position.set(0, 2.8, -depth + 0.06)
  group.add(poster)
  loaders.push(() =>
    logoTexture('#fdf7fa', 1024, 256).then((tex) => {
      poster.material = imageMat(tex)
    }),
  )
}

// ---------------------------------------------------------------------------
// Baked décor kit furnishing (pieces cut from the Le Voile boutique scene).

const WALL_X = MALL.shopLen / 2 - 0.15
const BACK_Z = -MALL.shopDepth + 0.15
const FACE_IN = 0 // front faces the entrance (+z local)
const FACE_PX = Math.PI / 2
const FACE_NX = -Math.PI / 2

/** Hanging rails of each free-standing rack piece (piece-local x, z centre; length along z). */
const RACK_RAILS: Record<string, [number, number, number][]> = {
  rack_1: [[-0.64, 0, 2.65], [0.64, 0, 2.65]],
  rack_2: [[-0.64, -0.03, 2.05], [0.64, 0.03, 2.05]],
  rack_3: [[-0.63, -0.1, 2.13], [0.63, 0.1, 2.13]],
  rack_4: [[-0.63, -0.08, 2.11], [0.64, 0.08, 2.11]],
  rack_5: [[-0.64, -0.04, 2.08], [0.64, 0.05, 2.08]],
}
/** Easel tops (piece-local): board rect centre/size and height, easel row start, count, spacing. */
const EASEL_TOPS: Record<string, { board: [number, number, number, number, number]; row: [number, number]; surface: number; max: number; spacing: number }> = {
  table: { board: [0, 0, 2.56, 1.66, 1.003], row: [-0.9, 0], surface: 1.006, max: 4, spacing: 0.6 },
  gondola: { board: [0, 0, 1.61, 1.13, 0.883], row: [-0.5, 0.15], surface: 0.886, max: 3, spacing: 0.5 },
}
const BOARD = new MeshBasicMaterial({ color: '#efe6da' })

function furnishWithKit(
  kit: Kit,
  ctx: ShopContext,
  f: BatchFrame,
  interior: Group,
  kind: DisplayKind,
  section: Section,
  products: Product[],
  loaders: (() => Promise<unknown>)[],
  mono?: Monogram,
): void {
  // No fake goods: fixtures drop the baked Le Voile garments/scarves (plants keep their foliage).
  // Products live on the fixtures: fixture k shows products from (3k) mod n, so
  // every product appears several times (like stock on several rails).
  let k = 0
  const take = (cap: number): Product[] => {
    const n = products.length
    if (!n) return []
    const start = (3 * k++) % n
    return Array.from({ length: Math.min(cap, n) }, (_, i) => products[(start + i) % n])
  }
  const pctx = { interaction: ctx.interaction, loaders }
  const cards: Card[] = []
  const stock = (o: Object3D, name: string) => {
    const info = kit.info[name]
    const fx = info.front[0]
    const fz = info.front[2]
    const yaw = Math.atan2(fx, fz)
    const added: Object3D[] = []
    const bay = name.startsWith('hangbay') ? 0.26 : name.startsWith('scarfbay') ? 0.31 : null
    if (bay !== null) {
      // 3 cards on the bay front, in front of its shelf boards.
      added.push(cardPanel(pctx, o, take(3), 3, 1, fx * bay, 1.55, fz * bay, yaw, 0.7)!)
    } else if (name === 'reardisplay') {
      // 3 × 2 grid in front of its hanging rail (the rail would cut across the top row).
      added.push(cardPanel(pctx, o, take(6), 3, 2, 0.04, 1.6, 0.36, yaw, 0.78)!)
    } else if (RACK_RAILS[name]) {
      // Cards hanging under each rail, readable from both sides.
      for (const [rx, rz, span] of RACK_RAILS[name]) {
        const cw = (span - 0.3) / 3
        added.push(cardPanel(pctx, o, take(3), 3, 1, rx, 1.8 - (cw * 1.5) / 2, rz, Math.PI / 2, cw, { doubleSided: true })!)
      }
    } else if (EASEL_TOPS[name]) {
      const e = EASEL_TOPS[name]
      const fr = f.batcher.frame(f.base.clone().multiply(o.matrix), ctx.colliders)
      // A board over the top (the baked top still shows where the folded goods sat).
      const [bx, bz, bw, bd, by] = e.board
      fr.box(BOARD, bx, by, bz, bw, 0.006, bd)
      const row = new Group()
      row.position.set(e.row[0], 0, e.row[1])
      o.add(row)
      row.updateMatrix()
      const rf = f.batcher.frame(f.base.clone().multiply(o.matrix).multiply(row.matrix), ctx.colliders)
      cards.push(...easelRow(rf, row, take(e.max), e.surface, e.spacing))
      added.push(row)
    }
    for (const a of added) {
      if (!a) continue
      a.traverse((c) => {
        c.updateMatrix()
        c.matrixAutoUpdate = false
      })
    }
  }
  // No fake goods: fixtures drop the baked Le Voile garments/scarves (plants keep their foliage).
  const put = (name: string, x: number, z: number, face: number, collide = true) => {
    const soft = name === 'plant' || name === 'pendant'
    const o = kit.place(name, interior, x, z, face, collide ? ctx.colliders : undefined, { hideSoft: !soft })
    if (o && !soft) stock(o, name)
    return o
  }
  const depthOf = (name: string) => kit.info[name]?.size[0] ?? 0.75
  const backRow = (names: string[]) =>
    names.forEach((n, i) => put(n, -3.95 + i * 2.62, BACK_Z + depthOf(n) / 2, FACE_IN))
  const sideWall = (side: 1 | -1, names: string[], zs: number[]) =>
    names.forEach((n, i) => put(n, side * (WALL_X - depthOf(n) / 2), zs[i], side < 0 ? FACE_PX : FACE_NX))

  // Lookbook stand with all of the section's products, just inside the entrance.
  const stand = new Group()
  stand.position.set(0, 0, -2.4)
  interior.add(stand)
  stand.updateMatrix()
  const standFrame = f.batcher.frame(f.base.clone().multiply(stand.matrix), ctx.colliders)
  cards.push(...lookbookStand(standFrame, stand, section, products))

  switch (kind) {
    case 'rack':
      backRow(['hangbay_1', 'hangbay_2', 'hangbay_3', 'hangbay_4'])
      sideWall(-1, ['hangbay_2', 'hangbay_3'], [-9.0, -11.65])
      sideWall(1, ['hangbay_4', 'hangbay_1'], [-9.0, -11.65])
      put('rack_1', -2.45, -8.7, FACE_PX)
      put('rack_4', 2.45, -8.7, FACE_PX)
      break
    case 'shelf':
      sideWall(-1, ['scarfbay_1', 'scarfbay_2', 'scarfbay_3', 'scarfbay_4'], [-4.6, -7.15, -9.7, -12.25])
      sideWall(1, ['scarfbay_5', 'scarfbay_3', 'scarfbay_2', 'scarfbay_1'], [-4.6, -7.15, -9.7, -12.25])
      put('reardisplay', 0, BACK_Z + 0.55, FACE_IN)
      put('plant', -2.6, BACK_Z + 0.5, FACE_IN)
      put('plant', 2.6, BACK_Z + 0.5, FACE_IN)
      put('table', 0, -8.4, FACE_IN)
      break
    case 'gallery':
      backRow(['hangbay_3', 'hangbay_1', 'hangbay_4', 'hangbay_2'])
      put('table', 0, -6.6, FACE_IN)
      put('gondola', 0, -10.0, FACE_IN)
      put('rack_2', -4.15, -9.3, FACE_PX)
      put('rack_5', 4.15, -9.3, FACE_PX)
      break
    case 'boxes': {
      sideWall(-1, ['scarfbay_2', 'scarfbay_4', 'scarfbay_1'], [-6.0, -8.55, -11.1])
      sideWall(1, ['scarfbay_3', 'scarfbay_5', 'scarfbay_2'], [-6.0, -8.55, -11.1])
      // The shop's own sign on the back wall (the kit's baked panel carries another brand).
      {
        const panel = new Mesh(new PlaneGeometry(3.4, 0.85), imageMat(shopFascia(section, '', mono)))
        panel.position.set(0, 2.4, BACK_Z + 0.02)
        interior.add(panel)
      }
      put('plant', -2.4, BACK_Z + 0.5, FACE_IN)
      put('plant', 2.4, BACK_Z + 0.5, FACE_IN)
      put('table', 0, -10.4, FACE_IN)
      // Two gondolas with product easels.
      put('gondola', -2.0, -6.6, FACE_IN)
      put('gondola', 2.0, -6.6, FACE_IN)
      break
    }
  }
  registerCards(ctx.interaction, cards)
  loaders.push(async () => loadCards(cards))
}

/** Small counter where 122 Coins are swapped for this brand's discount (shop-local position). */
export function rewardsCounter(ctx: ShopContext, f: BatchFrame, interior: Group, brandId: string, color: string, x = -MALL.shopLen / 2 + 1.6, z = -2.0): void {
  f.block(MAT.brass, x, 0, z, 1.1, 0.06, 0.55, { collide: true })
  f.block(tintMat(color, 1, 0.5), x, 0.06, z, 1.0, 0.98, 0.5)
  f.block(MAT.marbleTop, x, 1.04, z, 1.14, 0.05, 0.6)
  f.cyl(MAT.brass, x, 1.09, z, 0.16, 0.05)
  f.sphere(MAT.brass, x, 1.24, z, 0.11, 0.35)
  const sign = new Mesh(new PlaneGeometry(1.0, 0.25), imageMat(labelSign('122 Coins · Rewards', 'عداد المكافآت', { bg: color, fg: '#ffffff', w: 1024, h: 256 })))
  sign.position.set(x, 0.55, z + 0.26)
  interior.add(sign)
  const hit = new Mesh(new PlaneGeometry(1.1, 1.3), new MeshBasicMaterial({ visible: false }))
  hit.position.set(x, 0.75, z + 0.3)
  interior.add(hit)
  ctx.interaction.add({
    object: hit,
    kind: 'rewards',
    label: () => `${t('rewardsPrompt', store.getState().lang)} · ${store.getState().coins} 🪙`,
    onInteract: () => store.getState().set({ overlay: 'rewards', rewardsBrand: brandId }),
    maxDist: 3.2,
  })
}
