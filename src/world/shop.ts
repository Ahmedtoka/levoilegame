// One shop per section, built in a local frame:
//   origin = centre of the opening on the boulevard, local -Z goes into the
//   shop (depth 0..14), local X runs along the front (-6..6), +Z faces the
//   boulevard. Products are laid out according to SectionStyle.display.

import {
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
import { MALL, type ShopLayout } from '../config/layout'
import type { Batcher, BatchFrame } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import { loadProductTexture } from '../engine/textures'
import { withinGate } from '../engine/hysteresis'
import { BLOOM_WEIGHT, registerBloom } from '../engine/bloom'
import { MIRROR_LAYER } from '../engine/layers'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { discountPercent, hasCutout, type Catalog, type Product, type Section } from '../data/types'
import { formatPrice, t } from '../i18n/i18n'
import { store } from '../state/store'
import type { Interaction } from '../interact/interaction'
import { imageMat, MAT, tintMat } from './materials'
import { framedPlane, plant, v3 } from './props'
import { bladeSign, comingSoonTexture, popupTexture, labelSign, lightboxBlade, lightboxFascia, logoTexture, priceTagTexture, shopFascia, type Monogram } from './signage'
import { addCone, addRectHalo } from './glow'
import { aoFloorJunction } from './aoStrips'
import { windowGlass } from './finish'
import type { Kit } from './kit'
import { showcaseMesh } from './showcase'
import { buildBoutique } from './boutiqueShop'
import { brandSubsections } from '../data/mallCatalog'

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
  const depth = shop.depth
  const half = shop.front / 2
  const r = shop.rect
  const handles: ShopHandles = {
    layout: shop,
    interior,
    modelSpots: [],
    staffSpot: null,
    interiorVisible: true,
    seenFrom: true,
    update(px, pz, insideShop) {
      // Distance to the nearest point of the unit's frontage (long flagships don't pop).
      const dx = px - shop.entrance.x
      const dz = pz - shop.entrance.z
      const along = Math.max(-half, Math.min(half, dx * Math.cos(shop.yaw) - dz * Math.sin(shop.yaw)))
      const fx = shop.entrance.x + along * Math.cos(shop.yaw)
      const fz = shop.entrance.z - along * Math.sin(shop.yaw)
      if (!loaded && Math.hypot(px - fx, pz - fz) < 34) load()
      // Inside a shop you only see that shop; from the boulevard, shops near you.
      const inside = px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1
      // Hysteresis: shown within 19 m, hidden again only past 22 m (no flicker at the edge).
      const near = withinGate(handles.interiorVisible, Math.hypot(px - fx, pz - fz), 19, 3)
      handles.seenFrom = inside || !insideShop
      const v = inside || (!insideShop && near)
      if (v !== handles.interiorVisible) {
        handles.interiorVisible = v
        interior.visible = v
      }
    },
    load,
  }

  if (shop.kind === 'soon') {
    // Empty unit: hoarding across the closed front, nothing inside.
    const hoarding = new Mesh(new PlaneGeometry(shop.front - 0.6, 3.75), imageMat(shop.popup ? popupTexture() : comingSoonTexture()))
    hoarding.position.set(0, 1.9, 0.03)
    group.add(hoarding)
    f.box(MAT.brass, 0, 3.8, 0.02, shop.front - 0.5, 0.06, 0.04)
    interior.visible = false
    handles.update = () => {}
    handles.interiorVisible = false
    return handles
  }

  if (shop.kind === 'lounge' || !shop.section || !shop.style) {
    buildLounge(f, interior, loaders, ctx.kit ?? null, ctx.colliders, depth)
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
  const products = section.productIds.map((id) => ctx.catalog.byId.get(id)).filter((p): p is Product => !!p)

  // ---------------------------------------------------------- storefront
  if (mono) storefront(ctx, f, group, shop, section, mono, products, loaders, ctx.textureMax())
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
  const posterXs = shop.openings.flatMap((o) => (o.window ? o.window.posters.flatMap((p) => [o.cx - p, o.cx + p]) : []))
  posterXs.forEach((x, i) => {
    const p = products[(i + 1) % Math.max(1, products.length)]
    if (!p) return
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

  if (shop.brand)
    buildBoutique(ctx, f, handles, loaders, {
      tier: shop.tier,
      front: shop.front,
      depth: shop.depth,
      offsetX: 0,
      products,
      sections: brandSubsections(shop.brand.id).length ? brandSubsections(shop.brand.id) : [section],
      brand: shop.brand,
    })
  return handles
}

// -------------------------------------------------------------------------

/** Display-window geometry (shop-local, mirrored on both sides of the opening). */
const WIN = {
  z: 0.6, // glass line, in front of the wall face
  y0: 0.3, // glass from the stone base…
  y1: 3.6, // …to the lit header
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
function storefront(ctx: ShopContext, f: BatchFrame, group: Group, shop: ShopLayout, section: Section, mono: Monogram, products: Product[], loaders: (() => Promise<unknown>)[], tm: number): void {
  const half = shop.front / 2
  const cream = tintMat('#f3ece4', 1, 0.8)

  // Fascia: bronze box (1 cm into the wall, front at z 0.15), lit face 5 mm proud, halo on the wall.
  const fw = Math.min(6, shop.front - 1.2)
  const fh = (1.5 * fw) / 6
  f.box(MAT.brass, 0, FASCIA_Y, 0.07, fw, fh, 0.16)
  const faceMat = imageMat(lightboxFascia(section, mono))
  registerBloom(faceMat, BLOOM_WEIGHT.lightbox)
  const face = new Mesh(new PlaneGeometry((5.84 * fw) / 6, (1.36 * fh) / 1.5), faceMat)
  face.position.set(0, FASCIA_Y, 0.155)
  face.layers.enable(MIRROR_LAYER)
  group.add(face)
  const hw = f.toWorld(0, FASCIA_Y, 0.012)
  addRectHalo(hw.x, hw.y, hw.z, fw / 0.8, fh / 0.62, shop.yaw, `#${new Color(mono.color).lerp(_white, 0.5).getHexString()}`)

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

  // Display windows (mirrored either side of each opening) and compact sidelights.
  const glass = windowGlass()
  const plinthXs: number[] = []
  for (const o of shop.openings) {
    if (o.sidelight) {
      for (const sx of [-1, 1]) {
        const a = o.cx + sx * o.sidelight.x0
        const b = o.cx + sx * o.sidelight.x1
        const x = (a + b) / 2
        const w = Math.abs(b - a)
        f.box(glass, x, 0.3 + 3.3 / 2, 0.02, w, 3.3, 0.012)
        f.box(MAT.brass, x, 0.3, 0.03, w + 0.04, 0.05, 0.05)
        f.box(MAT.brass, x, 3.6, 0.03, w + 0.04, 0.05, 0.05)
      }
      continue
    }
    if (!o.window) continue
    const W = o.window
    const vw = W.x1 - W.x0
    const gh = WIN.y1 - WIN.y0
    // Glass stops 5 mm under the header and its side returns start 1 cm off the wall:
    // no glass face is coplanar with the wall or the header.
    const gg = gh - 0.005
    const rz0 = 0.01
    for (const sx of [-1, 1]) {
      const x = o.cx + (sx * (W.x0 + W.x1)) / 2
      // Stone base (1 cm into the wall and below the floor), collider.
      f.box(cream, x, 0.145, WIN.z / 2 - 0.005, vw, 0.31, WIN.z + 0.01, { collide: true })
      // Glass: front pane + two side returns; bronze rails and corner posts.
      f.box(glass, x, WIN.y0 + gg / 2, WIN.z, vw, gg, 0.012)
      for (const ex of [W.x0, W.x1]) {
        const px = o.cx + sx * ex
        f.box(glass, px, WIN.y0 + gg / 2, (rz0 + WIN.z) / 2, 0.012, gg, WIN.z - rz0)
        f.box(MAT.brass, px, WIN.y0 + gh / 2, WIN.z, 0.04, gh, 0.04)
        f.box(MAT.brass, px, WIN.y0 + 0.004, WIN.z / 2, 0.04, 0.048, WIN.z)
      }
      f.box(MAT.brass, x, WIN.y0 + 0.005, WIN.z, vw + 0.04, 0.05, 0.04)
      f.box(MAT.brass, x, WIN.y1 - 0.015, WIN.z, vw + 0.04, 0.05, 0.04)
      // Header (cream, the bronze top rail runs into it) with a light line along its underside.
      f.box(cream, x, WIN.y1 + 0.12, WIN.z / 2 + 0.015, vw + 0.06, 0.24, WIN.z + 0.05)
      f.box(MAT.lightWarm, x, WIN.y1 - 0.005, WIN.z * 0.45, vw - 0.3, 0.02, 0.04)
      // Lit plinths: cream block, bronze cap, glowing band; a soft spot cone from the header.
      for (const pl of W.plinths) {
        const px = o.cx + sx * pl
        f.box(cream, px, (WIN.y0 + PLINTH_TOP - 0.02) / 2, 0.3, 0.72, PLINTH_TOP - 0.02 - WIN.y0 + 0.01, 0.4)
        f.box(MAT.brass, px, PLINTH_TOP - 0.01, 0.3, 0.74, 0.02, 0.42)
        f.box(MAT.lightWarm, px, PLINTH_TOP - 0.065, 0.502, 0.66, 0.025, 0.01)
        const cw = f.toWorld(px, WIN.y1 - 0.02, 0.3)
        addCone(cw.x, cw.y, cw.z, WIN.y1 - PLINTH_TOP - 0.05, 0.26, 0, 0)
        plinthXs.push(px)
      }
      // Contact shading where the base meets the floor.
      const a = o.cx + sx * W.x0
      const b = o.cx + sx * W.x1
      aoFloorJunction(Math.min(a, b), WIN.z + 0.005, Math.max(a, b), WIN.z + 0.005, 0, 1, f.base, 0.25, 0.4)
    }
  }

  // Window figures: prefer clean cut-outs (they stand on the plinth like a mannequin).
  const rank = (p: Product) => (hasCutout(p) ? (p.modelOutfit ? 0 : 1) : 2)
  const ranked = [...products].sort((a, b) => rank(a) - rank(b))
  if (!ranked.length) return
  showcaseMesh(
    { interaction: ctx.interaction, loaders },
    group,
    plinthXs.map((x, i) => ({ product: ranked[i % ranked.length], x, y: PLINTH_TOP + FIG_H / 2, z: 0.3, yaw: 0, w: FIG_W, h: FIG_H })),
    tm / 2,
  )
}

function buildLounge(f: BatchFrame, group: Group, loaders: (() => Promise<unknown>)[], kit: Kit | null = null, colliders?: CollisionWorld, depth = 14): void {
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
