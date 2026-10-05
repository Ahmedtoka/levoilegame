// Product displays shared by the mall shops and the boutique: oak "lookbook"
// stands (section header + grid of product cards) and small easel cards for
// tables/gondolas. Card = photo + title + price baked into one texture.

import {
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BRAND } from '../config/brand'
import type { BatchFrame } from '../engine/batcher'
import { canvasTexture, loadProductTexture, makeCanvas } from '../engine/textures'
import { imagePacer } from '../engine/pace'
import { discountPercent, type Product, type Section } from '../data/types'
import { formatPrice } from '../i18n/i18n'
import { store } from '../state/store'
import type { Interaction } from '../interact/interaction'
import { imageMat } from './materials'
import { blobShadow } from './props'
import { BOUTIQUE_CREAM, boutiqueHeader, drawProductCard, productCardTexture } from './signage'
import { openProductLabel } from './shop'

export const OAK = new MeshStandardMaterial({ color: '#b98a5c', roughness: 0.55 })
export const OAK_DARK = new MeshStandardMaterial({ color: '#8c6644', roughness: 0.6 })
export const CREAM = new MeshStandardMaterial({ color: BOUTIQUE_CREAM, roughness: 0.8 })
export const BRONZE = new MeshStandardMaterial({ color: '#a8835a', roughness: 0.35, metalness: 0.7 })
const HL = new MeshBasicMaterial({ color: BRAND.magenta, toneMapped: false })
const PLACEHOLDER: Material = new MeshStandardMaterial({ color: '#eee6dd', roughness: 0.9 })
export const CARD_W = 0.42

export interface Card {
  mesh: Mesh
  product: Product
  hl: Object3D
}

function cardMesh(parent: Object3D, p: Product, w = CARD_W): Card {
  const h = w * (768 / 512)
  const mesh = new Mesh(new PlaneGeometry(w, h), PLACEHOLDER)
  const hl = new Mesh(new PlaneGeometry(w + 0.06, h + 0.06), HL)
  hl.position.z = -0.005
  hl.visible = false
  mesh.add(hl)
  parent.add(mesh)
  return { mesh, product: p, hl }
}

/** Oak "lookbook" stand (front faces local +z): header + 3/2 grid of product cards. */
export function lookbookStand(f: BatchFrame, g: Group, section: Section, products: Product[]): Card[] {
  const W = 1.5
  f.block(OAK_DARK, 0, 0, 0, W + 0.1, 0.06, 0.42, { collide: true })
  f.box(OAK, -W / 2, 1.05, 0, 0.05, 2.1, 0.05)
  f.box(OAK, W / 2, 1.05, 0, 0.05, 2.1, 0.05)
  f.box(CREAM, 0, 1.15, -0.03, W, 1.62, 0.02)
  f.box(BRONZE, 0, 2.11, 0, W + 0.06, 0.03, 0.06)
  const header = new Mesh(new PlaneGeometry(W - 0.04, 0.28), imageMat(boutiqueHeader(section)))
  header.position.set(0, 1.94, 0.006)
  g.add(header)
  const cards: Card[] = []
  const rows = [products.slice(0, 3), products.slice(3, 6)]
  rows.forEach((row, r) => {
    const y = r === 0 ? 1.38 : 0.7
    row.forEach((p, i) => {
      const c = cardMesh(g, p)
      c.mesh.position.set((i - (row.length - 1) / 2) * (CARD_W + 0.05), y, 0.004)
      cards.push(c)
    })
  })
  g.add(blobShadow(W + 0.5, 0.9, 0.5))
  return cards
}

/** Row of small easel cards standing on a surface (table / gondola), along local +x. */
export function easelRow(f: BatchFrame, g: Group, products: Product[], surface: number, spacing = 0.33): Card[] {
  const w = 0.28
  const h = w * (768 / 512)
  return products.map((p, i) => {
    const holder = new Group()
    holder.position.set(i * spacing, surface + 0.02 + (h / 2) * Math.cos(0.2), 0)
    holder.rotation.x = -0.2
    g.add(holder)
    f.box(OAK_DARK, i * spacing, surface + 0.01, -0.06, w * 0.6, 0.02, 0.12)
    return cardMesh(holder, p, w)
  })
}

export function registerCards(interaction: Interaction, cards: Card[], maxDist = 3.2): void {
  for (const card of cards) {
    interaction.add({
      object: card.mesh,
      kind: 'product',
      label: () => openProductLabel(card.product),
      onInteract: () => store.getState().openProduct(card.product.id),
      highlight: (on) => (card.hl.visible = on),
      maxDist,
    })
  }
}

/** Loads the card textures (call when the player gets close). */
export function loadCards(cards: Card[]): void {
  for (const { mesh, product } of cards) {
    loadProductTexture(product.images[0], 512)
      .then(({ image }) => {
        const off = discountPercent(product)
        mesh.material = imageMat(
          productCardTexture(
            image as HTMLCanvasElement,
            product.title,
            formatPrice(product.price, 'en'),
            product.compareAtPrice && off ? formatPrice(product.compareAtPrice, 'en') : null,
            off ? `-${off}%` : null,
          ),
        )
      })
      .catch((e) => console.warn(e))
  }
}

// ---------------------------------------------------------------------------
// Composed card panel: a grid of product cards drawn into ONE texture on one
// plane (one draw call per fixture). Invisible per-card hit planes make every
// product clickable; a plum frame per card shows on hover.

const HIDDEN = new MeshBasicMaterial({ visible: false })
const PENDING = new MeshBasicMaterial({ color: '#eee6dd', side: DoubleSide })
const PENDING_FRONT = new MeshBasicMaterial({ color: '#eee6dd' })

export interface CardPanelOpts {
  /** Texture pixels per card (default 192 × 288). */
  cellW?: number
  cellH?: number
  /** A second, non-mirrored face on the back (free-standing rails). */
  doubleSided?: boolean
  maxDist?: number
}

export interface CardPanelCtx {
  interaction: Interaction
  loaders: (() => Promise<unknown>)[]
}

/** Composed panel textures are shared between fixtures showing the same cards. */
const panelTextures = new Map<string, Promise<Texture>>()

function panelTexture(cells: Product[], cols: number, rows: number, W: number, H: number): Promise<Texture> {
  const key = `${cells.map((p) => p.id).join(',')}|${cols}x${rows}|${W}x${H}`
  let t = panelTextures.get(key)
  if (!t) {
    t = (async () => {
      const [c, cg] = makeCanvas(cols * W, rows * H)
      cg.fillStyle = '#f4ede3'
      cg.fillRect(0, 0, c.width, c.height)
      const images = await Promise.all(cells.map((p) => loadProductTexture(p.images[0], H).then((r) => r.image as HTMLCanvasElement)))
      // Spread the drawing over frames so walking in doesn't hitch.
      await imagePacer.slot()
      const m = Math.round((W * 6) / 256)
      cells.forEach((p, i) => {
        const off = discountPercent(p)
        cg.save()
        cg.translate((i % cols) * W + m, Math.floor(i / cols) * H + m)
        cg.scale((W - 2 * m) / 512, (H - 2 * m) / 768)
        drawProductCard(
          cg,
          images[i],
          p.title,
          formatPrice(p.price, 'en'),
          p.compareAtPrice && off ? formatPrice(p.compareAtPrice, 'en') : null,
          off ? `-${off}%` : null,
        )
        cg.restore()
      })
      return canvasTexture(c)
    })()
    panelTextures.set(key, t)
    t.catch(() => panelTextures.delete(key))
  }
  return t
}

const frames = new Map<string, BufferGeometry>()

/** Thin rectangular frame (w × h outside) used as the hover outline. */
function frameGeometry(w: number, h: number): BufferGeometry {
  const key = `${w.toFixed(3)}x${h.toFixed(3)}`
  let g = frames.get(key)
  if (!g) {
    const t = Math.min(w, h) * 0.035
    const s = new Shape().moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2).lineTo(w / 2, h / 2).lineTo(-w / 2, h / 2).closePath()
    const hole = new Shape()
      .moveTo(-w / 2 + t, -h / 2 + t)
      .lineTo(-w / 2 + t, h / 2 - t)
      .lineTo(w / 2 - t, h / 2 - t)
      .lineTo(w / 2 - t, -h / 2 + t)
      .closePath()
    s.holes.push(hole)
    g = new ShapeGeometry(s)
    frames.set(key, g)
  }
  return g
}

/**
 * A cols × rows grid of product cards as one textured plane in `parent`
 * (centre x, y, z; yaw of its front; card width cw, height 1.5 cw). The
 * texture is drawn lazily through `ctx.loaders`. Returns null when `list` is empty.
 */
export function cardPanel(
  ctx: CardPanelCtx,
  parent: Object3D,
  list: Product[],
  cols: number,
  rows: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  cw: number,
  opts: CardPanelOpts = {},
): Mesh | null {
  const ch = cw * 1.5
  const cells = list.slice(0, cols * rows)
  if (!cells.length) return null
  const PW = cols * cw
  const PH = rows * ch
  let geo: BufferGeometry = new PlaneGeometry(PW, PH)
  if (opts.doubleSided) geo = mergeGeometries([geo, new PlaneGeometry(PW, PH).rotateY(Math.PI)], false)
  const panel = new Mesh(geo, opts.doubleSided ? PENDING_FRONT : PENDING)
  panel.position.set(x, y, z)
  panel.rotation.y = yaw
  parent.add(panel)
  const outline = frameGeometry(cw * 0.98, ch * 0.98)
  const faces = opts.doubleSided ? [1, -1] : [1]
  for (const side of faces) {
    cells.forEach((p, i) => {
      // On the back face the columns run the other way (viewer's left is +x there).
      const cx = side * (-(cols - 1) / 2 + (i % cols)) * cw
      const cy = ((rows - 1) / 2 - Math.floor(i / cols)) * ch
      const hit = new Mesh(new PlaneGeometry(cw * 0.96, ch * 0.96), HIDDEN)
      hit.position.set(cx, cy, side * 0.01)
      if (side < 0) hit.rotation.y = Math.PI
      panel.add(hit)
      const hl = new Mesh(outline, HL)
      hl.position.set(cx, cy, side * 0.004)
      if (side < 0) hl.rotation.y = Math.PI
      hl.visible = false
      panel.add(hl)
      ctx.interaction.add({
        object: hit,
        kind: 'product',
        label: () => openProductLabel(p),
        onInteract: () => store.getState().openProduct(p.id),
        highlight: (on) => (hl.visible = on),
        maxDist: opts.maxDist ?? 3.4,
      })
    })
  }
  const W = opts.cellW ?? 192
  const H = opts.cellH ?? 288
  ctx.loaders.push(async () => {
    const tex = await panelTexture(cells, cols, rows, W, H)
    const mat = imageMat(tex)
    if (opts.doubleSided) mat.side = FrontSide
    panel.material = mat
  })
  return panel
}
