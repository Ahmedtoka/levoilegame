// Lightbox walls for the style-B boutiques. Every lightbox of a shop (campaign
// photo with a lit margin + a cream price plaque under it) is drawn into an
// atlas canvas (≤ 28 per atlas) and shown as ONE merged mesh per atlas, so a
// shop's draw calls don't grow with its products. Bronze housings are batched;
// an invisible hit plane per product keeps it clickable with a hover outline.

import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { atlasGrid, LIGHTBOX } from '../config/boutiquePlan'
import { BRAND } from '../config/brand'
import type { BatchFrame } from '../engine/batcher'
import { BLOOM_WEIGHT, registerBloom } from '../engine/bloom'
import { imagePacer } from '../engine/pace'
import { canvasTexture, loadProductTexture, makeCanvas } from '../engine/textures'
import { discountPercent, type Product, type Section } from '../data/types'
import { formatPrice } from '../i18n/i18n'
import { store } from '../state/store'
import type { Interaction } from '../interact/interaction'
import { BRONZE, CREAM, frameGeometry, HOVER_MAT } from './displays'
import { imageMat } from './materials'
import { BOUTIQUE_INK, boutiqueHeader } from './signage'
import { openProductLabel } from './shop'

export interface PlacedProduct {
  product: Product
  x: number
  z: number
  yaw: number
}

export interface SectionPlaque {
  section: Section
  x: number
  z: number
  yaw: number
  w: number
}

export interface LightboxCtx {
  interaction: Interaction
  loaders: (() => Promise<unknown>)[]
  /** Atlas side in px (atlasSize(bakedTextureMax)). */
  atlas: number
}

const HIDDEN = new MeshBasicMaterial({ visible: false })
const PENDING = new MeshBasicMaterial({ color: '#f3ead9' })
const HOUSING = new MeshBasicMaterial({ color: '#4a3a2c' })

/** Offset (dx along the face, dz out of it) from a placed item, in shop-local x/z. */
function at(it: { x: number; z: number; yaw: number }, dx: number, dz: number): [number, number] {
  const c = Math.cos(it.yaw)
  const s = Math.sin(it.yaw)
  return [it.x + dx * c + dz * s, it.z - dx * s + dz * c]
}

function fit(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number): void {
  g.font = font(px)
  while (px > 8 && g.measureText(text).width > maxW) g.font = font(--px)
}

function drawCell(g: CanvasRenderingContext2D, im: HTMLCanvasElement | null, p: Product, x: number, y: number, cw: number, ch: number, ph: number): void {
  const m = Math.round((cw * LIGHTBOX.margin) / (LIGHTBOX.w + 2 * LIGHTBOX.margin))
  // Lit margin, then the photo cover-cropped into the window.
  g.fillStyle = '#fff6e6'
  g.fillRect(x, y, cw, ph)
  if (im) {
    const w = cw - 2 * m
    const h = ph - 2 * m
    const s = Math.max(w / im.width, h / im.height)
    g.save()
    g.beginPath()
    g.rect(x + m, y + m, w, h)
    g.clip()
    g.drawImage(im, x + m + (w - im.width * s) / 2, y + m + (h - im.height * s) / 2, im.width * s, im.height * s)
    g.restore()
  }
  // Plaque: title, then price (sale: old price struck through + badge).
  const py = y + ph
  const pw = cw - 2 * m
  const pH = ch - ph
  g.fillStyle = '#f4ede3'
  g.fillRect(x + m, py, pw, pH)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = BOUTIQUE_INK
  fit(g, p.title, (px) => `500 ${px}px ${BRAND.fontLatin}`, Math.round(cw * 0.085), pw * 0.92)
  g.fillText(p.title, x + cw / 2, py + pH * 0.32)
  const off = discountPercent(p)
  const price = formatPrice(p.price, 'en')
  g.fillStyle = BRAND.magenta
  g.font = `700 ${Math.round(cw * 0.095)}px ${BRAND.fontUi}`
  if (p.compareAtPrice && off) {
    const old = formatPrice(p.compareAtPrice, 'en')
    g.textAlign = 'right'
    g.fillText(price, x + cw / 2 - cw * 0.02, py + pH * 0.72)
    g.textAlign = 'left'
    g.fillStyle = '#9a8f96'
    g.font = `400 ${Math.round(cw * 0.07)}px ${BRAND.fontUi}`
    const ox = x + cw / 2 + cw * 0.03
    g.fillText(old, ox, py + pH * 0.73)
    g.fillRect(ox, py + pH * 0.73, g.measureText(old).width, Math.max(1, cw * 0.006))
    // Badge on the photo's top corner.
    g.fillStyle = BRAND.magenta
    g.fillRect(x + m + cw * 0.04, y + m + cw * 0.04, cw * 0.24, cw * 0.1)
    g.fillStyle = '#fff'
    g.textAlign = 'center'
    g.font = `700 ${Math.round(cw * 0.06)}px ${BRAND.fontUi}`
    g.fillText(`-${off}%`, x + m + cw * 0.16, y + m + cw * 0.09)
  } else g.fillText(price, x + cw / 2, py + pH * 0.72)
}

/** Lightboxes for `items` (positions from placeOnRuns): housings batched, faces in atlases. */
export function buildLightboxes(ctx: LightboxCtx, f: BatchFrame, parent: Group, items: PlacedProduct[]): void {
  const L = LIGHTBOX
  const boxW = L.w + 2 * L.margin
  const boxH = L.h + 2 * L.margin
  // Housings: deep bronze-dark box behind each face, bronze frame bars, cream plaque backing.
  for (const it of items) {
    const [hx, hz] = at(it, 0, -0.045)
    f.box(HOUSING, hx, L.y, hz, boxW + 2 * L.frame, boxH + 2 * L.frame, 0.08, { rotY: it.yaw })
    for (const sy of [-1, 1]) {
      const [x, z] = at(it, 0, 0.01)
      f.box(BRONZE, x, L.y + sy * (boxH / 2 + L.frame / 2), z, boxW + 2 * L.frame, L.frame, 0.03, { rotY: it.yaw })
    }
    for (const sx of [-1, 1]) {
      const [x, z] = at(it, sx * (boxW / 2 + L.frame / 2), 0.01)
      f.box(BRONZE, x, L.y, z, L.frame, boxH, 0.03, { rotY: it.yaw })
    }
    const [px, pz] = at(it, 0, -0.012)
    f.box(CREAM, px, L.plaqueY, pz, L.plaqueW + 0.04, L.plaqueH + 0.04, 0.02, { rotY: it.yaw })
  }

  // Hit planes and hover outlines.
  for (const it of items) {
    const top = L.y + boxH / 2
    const bottom = L.plaqueY - L.plaqueH / 2
    const hit = new Mesh(new PlaneGeometry(boxW, top - bottom), HIDDEN)
    const [x, z] = at(it, 0, 0.012)
    hit.position.set(x, (top + bottom) / 2, z)
    hit.rotation.y = it.yaw
    parent.add(hit)
    const hl = new Mesh(frameGeometry(boxW + 0.1, top - bottom + 0.1), HOVER_MAT)
    hl.position.z = -0.004
    hl.visible = false
    hit.add(hl)
    ctx.interaction.add({
      object: hit,
      kind: 'product',
      label: () => openProductLabel(it.product),
      onInteract: () => store.getState().openProduct(it.product.id),
      highlight: (on) => (hl.visible = on),
      maxDist: 4,
    })
  }

  // Faces: one atlas (and one mesh) per grid's worth of items.
  const grid = atlasGrid(ctx.atlas)
  const per = grid.cols * grid.rows
  for (let a = 0; a * per < items.length; a++) {
    const batch = items.slice(a * per, (a + 1) * per)
    const S = ctx.atlas
    const quads = batch.flatMap((it, i) => {
      const c = i % grid.cols
      const r = Math.floor(i / grid.cols)
      const u0 = (c * grid.cw) / S
      const u1 = ((c + 1) * grid.cw) / S
      const vTop = 1 - (r * grid.ch) / S
      const vPhoto = 1 - (r * grid.ch + grid.ph) / S
      const vBottom = 1 - ((r + 1) * grid.ch) / S
      const inset = ((L.margin / boxW) * grid.cw) / S
      const face = (w: number, h: number, y: number, dz: number, uu0: number, uu1: number, v0: number, v1: number) => {
        const q = new PlaneGeometry(w, h)
        const uv = q.getAttribute('uv')
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uu0 + uv.getX(k) * (uu1 - uu0), v0 + uv.getY(k) * (v1 - v0))
        const [x, z] = at(it, 0, dz)
        return q.rotateY(it.yaw).translate(x, y, z)
      }
      return [
        face(boxW, boxH, L.y, 0, u0, u1, vPhoto, vTop),
        face(L.plaqueW, L.plaqueH, L.plaqueY, 0, u0 + inset, u1 - inset, vBottom, vPhoto),
      ]
    })
    const mesh = new Mesh(mergeGeometries(quads), PENDING)
    parent.add(mesh)
    ctx.loaders.push(async () => {
      const [c, g] = makeCanvas(S, S)
      g.fillStyle = '#f3ead9'
      g.fillRect(0, 0, S, S)
      const imgs = await Promise.all(
        batch.map((it) =>
          loadProductTexture(it.product.images[1] ?? it.product.images[0], 512)
            .then((r) => r.image as HTMLCanvasElement)
            .catch(() => null),
        ),
      )
      for (let i = 0; i < batch.length; i++) {
        if (i % 4 === 0) await imagePacer.slot()
        drawCell(g, imgs[i], batch[i].product, (i % grid.cols) * grid.cw, Math.floor(i / grid.cols) * grid.ch, grid.cw, grid.ch, grid.ph)
      }
      const mat = imageMat(canvasTexture(c))
      registerBloom(mat, BLOOM_WEIGHT.lightbox)
      mesh.material = mat
    })
  }
}

/** Section plaques above lightbox groups: one atlas, one mesh. */
export function buildSectionPlaques(ctx: LightboxCtx, parent: Group, plaques: SectionPlaque[]): void {
  void ctx
  if (!plaques.length || typeof document === 'undefined') return
  const RH = 192
  const H = Math.min(4096, plaques.length * RH)
  const [c, g] = makeCanvas(1024, H)
  plaques.forEach((pl, i) => {
    const t = boutiqueHeader(pl.section)
    g.drawImage(t.image as HTMLCanvasElement, 0, i * RH)
    t.dispose()
  })
  const tex = canvasTexture(c)
  const quads = plaques.map((pl, i) => {
    const h = 0.3
    const q = new PlaneGeometry(pl.w, h)
    const uv = q.getAttribute('uv')
    const v1 = 1 - (i * RH) / H
    const v0 = 1 - ((i + 1) * RH) / H
    for (let k = 0; k < uv.count; k++) uv.setY(k, v0 + uv.getY(k) * (v1 - v0))
    const [x, z] = at(pl, 0, 0.004)
    return q.rotateY(pl.yaw).translate(x, LIGHTBOX.sectionY, z)
  })
  parent.add(new Mesh(mergeGeometries(quads), imageMat(tex)))
}
