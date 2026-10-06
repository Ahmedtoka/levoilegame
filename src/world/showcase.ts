// Product figures that stand in the world (window plinths, standees, island
// risers): N products drawn into one canvas and shown as ONE merged mesh of
// alpha-tested quads. A tall cut-out stands like a mannequin; anything else
// is a mounted print. Invisible hit planes keep each one clickable.

import { FrontSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture, loadProductTexture, makeCanvas } from '../engine/textures'
import { displayImage, hasCutout, type Product } from '../data/types'
import { store } from '../state/store'
import type { Interaction } from '../interact/interaction'
import { imageMat } from './materials'
import { frameGeometry, HOVER_MAT } from './displays'
import { openProductLabel } from './shop'

export interface ShowcaseItem {
  product: Product
  /** Centre of the quad (shop-local) and its facing. */
  x: number
  y: number
  z: number
  yaw: number
  w: number
  h: number
}

export interface ShowcaseCtx {
  interaction: Interaction
  loaders: (() => Promise<unknown>)[]
}

const HIDDEN = new MeshBasicMaterial({ visible: false })

/**
 * Bounding box of the non-transparent pixels of a cutout, in `w`×`h` image pixels.
 * Measured on the small CPU thumbnail (reading the GPU-backed full-size canvas back
 * stalled frames), then padded by one sample so the crop never cuts the figure.
 */
export function alphaBounds(thumb: HTMLCanvasElement, w: number, h: number): { x: number; y: number; w: number; h: number } {
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

/** Draws product `p` bottom-aligned into the cell (x, y, cw, ch). */
export function drawShowcase(g: CanvasRenderingContext2D, im: HTMLCanvasElement, thumb: HTMLCanvasElement, p: Product, x: number, y: number, cw: number, ch: number): void {
  const b = hasCutout(p) ? alphaBounds(thumb, im.width, im.height) : null
  if (b && b.h / b.w > 1.45) {
    // A full-length cutout stands like a mannequin.
    const sc = Math.min((cw * 0.94) / b.w, (ch * 0.98) / b.h)
    g.drawImage(im, b.x, b.y, b.w, b.h, x + (cw - b.w * sc) / 2, y + ch - b.h * sc, b.w * sc, b.h * sc)
    return
  }
  if (b) {
    // A product cut-out (bag, shoe, box): as large as fits, standing on the base.
    const sc = Math.min((cw * 0.9) / b.w, (ch * 0.9) / b.h)
    g.drawImage(im, b.x, b.y, b.w, b.h, x + (cw - b.w * sc) / 2, y + ch - b.h * sc, b.w * sc, b.h * sc)
    return
  }
  // Otherwise a mounted print standing on the base; a tall image is narrowed, not squashed.
  const maxW = cw * 0.86
  const maxH = ch * 0.62
  const ar = im.height / im.width
  const w = maxW * ar > maxH ? maxH / ar : maxW
  const h = w * ar
  const pad = cw * 0.04
  const py = y + ch - h - pad * 1.2
  const px = x + (cw - w) / 2
  g.fillStyle = '#fbf8f4'
  g.fillRect(px - pad, py - pad * 1.2, w + 2 * pad, h + 2.4 * pad)
  g.drawImage(im, px, py, w, h)
}

/** All items as one alpha-tested mesh in `parent` (cell = texture px per item, height 2 × width). */
export function showcaseMesh(ctx: ShowcaseCtx, parent: Group, items: ShowcaseItem[], cell: number): Mesh | null {
  if (!items.length || typeof document === 'undefined') return null
  const cols = Math.min(items.length, 8)
  const rows = Math.ceil(items.length / cols)
  const cw = cell
  const ch = cell * 2
  const W = cols * cw
  const H = rows * ch
  const quads = items.map((it, i) => {
    const q = new PlaneGeometry(it.w, it.h)
    const c = i % cols
    const r = Math.floor(i / cols)
    // Each item's cell keeps the item's aspect: the quad samples the bottom-centred w:h part of it.
    const cellAspect = cw / ch
    const itAspect = it.w / it.h
    const uw = itAspect < cellAspect ? (cw * (itAspect / cellAspect)) / W : cw / W
    const vh = itAspect < cellAspect ? ch / H : (ch * (cellAspect / itAspect)) / H
    const u0 = (c * cw) / W + (cw / W - uw) / 2
    const v0 = 1 - ((r + 1) * ch) / H
    const uv = q.getAttribute('uv')
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * uw, v0 + uv.getY(k) * vh)
    q.rotateY(it.yaw).translate(it.x, it.y, it.z)
    return q
  })
  const [canvas, g] = makeCanvas(W, H)
  const tex = canvasTexture(canvas)
  const mat = imageMat(tex)
  mat.side = FrontSide
  mat.alphaTest = 0.5
  const mesh = new Mesh(mergeGeometries(quads), mat)
  mesh.visible = false
  parent.add(mesh)
  // Hit planes + hover outlines.
  items.forEach((it) => {
    const hit = new Mesh(new PlaneGeometry(it.w, it.h), HIDDEN)
    hit.position.set(it.x, it.y, it.z)
    hit.rotation.y = it.yaw
    parent.add(hit)
    const hl = new Mesh(frameGeometry(it.w + 0.06, it.h + 0.06), HOVER_MAT)
    hl.position.set(0, 0, 0.004)
    hl.visible = false
    hit.add(hl)
    ctx.interaction.add({
      object: hit,
      kind: 'product',
      label: () => openProductLabel(it.product),
      onInteract: () => store.getState().openProduct(it.product.id),
      highlight: (on) => (hl.visible = on),
      maxDist: 3.6,
    })
  })
  ctx.loaders.push(() =>
    Promise.allSettled(
      items.map((it, i) =>
        loadProductTexture(displayImage(it.product), ch).then(({ image, thumb }) => {
          // Draw into the bottom-centred w:h part of the cell the quad samples.
          const cellAspect = cw / ch
          const itAspect = it.w / it.h
          const dw = itAspect < cellAspect ? cw * (itAspect / cellAspect) : cw
          const dh = itAspect < cellAspect ? ch : ch * (cellAspect / itAspect)
          const x = (i % cols) * cw + (cw - dw) / 2
          const y = Math.floor(i / cols) * ch + (ch - dh)
          drawShowcase(g, image as HTMLCanvasElement, thumb, it.product, x, y, dw, dh)
        }),
      ),
    ).then(() => {
      tex.needsUpdate = true
      mesh.visible = true
    }),
  )
  return mesh
}
