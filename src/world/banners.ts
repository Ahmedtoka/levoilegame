// Hanging fabric banners (1.2 × 3.2 m, double-sided) in the plaza and the
// wings. Each banner is ONE mesh: two back-to-back planes sharing one canvas
// texture. Content cycles brand ads and 122 Coins / wheel offers on a slow
// timer, and the banner sways gently; both only while it is in view.

import { Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, Vector3, type Camera, type CanvasTexture, type Object3D } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BRAND } from '../config/brand'
import { brandById, WINGS } from '../config/mall'
import type { BatchFrame } from '../engine/batcher'
import { canvasTexture, loadImage, loadProductTexture, makeCanvas } from '../engine/textures'
import { catalog } from '../state/store'
import { MAT } from './materials'
import { v3 } from './props'

const BANNER_W = 1.2
const BANNER_H = 3.2
const CW = 384
const CH = 1024
const INTERVAL = 16

type Slide = { kind: 'brand'; brandId: string } | { kind: 'coins' } | { kind: 'wheel' }

interface Banner {
  pivot: Group
  canvas: HTMLCanvasElement
  tex: CanvasTexture
  slides: Slide[]
  index: number
  timer: number
  phase: number
  dirty: boolean
}

const banners: Banner[] = []
const images = new Map<string, HTMLImageElement | HTMLCanvasElement | null>()
let geo: PlaneGeometry | null = null
let time = 0
const _pv = new Matrix4()
const _fr = new Frustum()
const _s = new Sphere()
const _v = new Vector3()

function bannerGeometry(): PlaneGeometry {
  if (geo) return geo
  // Pivot at the top edge; front face +Z, back face −Z (not mirrored), 6 mm apart.
  const front = new PlaneGeometry(BANNER_W, BANNER_H).translate(0, -BANNER_H / 2, 0.003)
  const back = new PlaneGeometry(BANNER_W, BANNER_H).rotateY(Math.PI).translate(0, -BANNER_H / 2, -0.003)
  geo = mergeGeometries([front, back]) as PlaneGeometry
  return geo
}

/** Slides for a set of brands: two brand ads, then an offer, alternating coins / wheel. */
export function bannerSlides(brandIds: string[]): Slide[] {
  const out: Slide[] = []
  brandIds.forEach((id, i) => {
    out.push({ kind: 'brand', brandId: id })
    if (i % 2 === 1) out.push({ kind: (i >> 1) % 2 ? 'wheel' : 'coins' })
  })
  if (!out.some((s) => s.kind !== 'brand')) out.push({ kind: 'coins' })
  return out
}

/**
 * Hangs a banner from a bronze rod at (x, yTop, z) in the frame `f` (whose
 * world transform must equal `parent`'s), face normal turned by `rotY`, with
 * two cables up to `ceilY`.
 */
export function addBanner(parent: Object3D, f: BatchFrame, x: number, yTop: number, z: number, rotY: number, ceilY: number, slides: Slide[], start: number): void {
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  const hw = BANNER_W / 2 + 0.09
  const a = v3(x - c * hw, yTop + 0.03, z + s * hw)
  const b = v3(x + c * hw, yTop + 0.03, z - s * hw)
  f.bar(MAT.brass, a, b, 0.018)
  for (const e of [a, b]) {
    const k = e.clone()
    k.x += (x - e.x) * 0.12
    k.z += (z - e.z) * 0.12
    f.bar(MAT.brass, v3(k.x, yTop + 0.03, k.z), v3(k.x, ceilY + 0.02, k.z), 0.004)
  }
  if (typeof document === 'undefined') return
  const [canvas] = makeCanvas(CW, CH)
  const tex = canvasTexture(canvas)
  const pivot = new Group()
  pivot.position.set(x, yTop, z)
  pivot.rotation.y = rotY
  const mesh = new Mesh(bannerGeometry(), new MeshBasicMaterial({ map: tex, color: '#f1eeea', toneMapped: false }))
  pivot.add(mesh)
  parent.add(pivot)
  const banner: Banner = { pivot, canvas, tex, slides, index: start % Math.max(1, slides.length), timer: (start * 2.7) % INTERVAL, phase: start * 1.9, dirty: true }
  banners.push(banner)
  // Draw the first slide as soon as the fonts are in, not on first view: until then the
  // canvas is black, and a banner can be seen (or reflected) before it is ever "in view".
  void document.fonts.ready.then(() => {
    if (!banner.dirty) return
    banner.dirty = false
    drawSlide(banner, banner.slides[banner.index])
    banner.tex.needsUpdate = true
  })
}

function visible(b: Banner, camera: Camera): boolean {
  b.pivot.getWorldPosition(_v)
  _v.y -= BANNER_H / 2
  return _v.distanceTo(camera.position) < 55 && _fr.intersectsSphere(_s.set(_v, BANNER_H * 0.6))
}

export function updateBanners(dt: number, camera: Camera): void {
  if (!banners.length) return
  time += dt
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  _fr.setFromProjectionMatrix(_pv)
  for (const b of banners) {
    if (!visible(b, camera)) continue
    b.pivot.rotation.x = 0.028 * Math.sin(time * 0.7 + b.phase)
    b.pivot.rotation.z = 0.012 * Math.sin(time * 0.43 + b.phase * 1.7)
    b.timer += dt
    if (b.timer >= INTERVAL) {
      b.timer = 0
      b.index = (b.index + 1) % b.slides.length
      b.dirty = true
    }
    if (b.dirty) {
      b.dirty = false
      drawSlide(b, b.slides[b.index])
      b.tex.needsUpdate = true
    }
  }
}

/** Image by URL, null until loaded; asks every banner showing it to redraw on load. */
function image(url: string, product: boolean): HTMLImageElement | HTMLCanvasElement | null {
  if (images.has(url)) return images.get(url) ?? null
  images.set(url, null)
  const p = product ? loadProductTexture(url, 512).then((r) => r.image as HTMLCanvasElement) : loadImage(url)
  p.then((im) => {
    images.set(url, im)
    for (const b of banners) b.dirty = true
  }).catch(() => {})
  return null
}

// ------------------------------------------------------------------ drawing

function spaced(t: string): string {
  return t.split('').join(' ')
}

function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, weight: number, font: string, rtl = false, maxW = CW - 56): void {
  g.font = `${weight} ${px}px ${font}`
  while (g.measureText(s).width > maxW && px > 10) {
    px -= 2
    g.font = `${weight} ${px}px ${font}`
  }
  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.direction = rtl ? 'rtl' : 'ltr'
  g.fillText(s, x, y)
  g.direction = 'ltr'
}

/** Fabric: base colour, soft vertical folds, a faint weave, rod sleeve and hem. */
function fabric(g: CanvasRenderingContext2D, top: string, bottom: string): void {
  const v = g.createLinearGradient(0, 0, 0, CH)
  v.addColorStop(0, top)
  v.addColorStop(1, bottom)
  g.fillStyle = v
  g.fillRect(0, 0, CW, CH)
  const h = g.createLinearGradient(0, 0, CW, 0)
  for (let i = 0; i <= 6; i++) {
    const k = i / 6
    h.addColorStop(k, i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)')
  }
  g.fillStyle = h
  g.fillRect(0, 0, CW, CH)
  g.fillStyle = 'rgba(0,0,0,0.035)'
  for (let y = 0; y < CH; y += 3) g.fillRect(0, y, CW, 1)
  // Rod sleeve with a stitch line, and a weighted hem.
  g.fillStyle = 'rgba(0,0,0,0.18)'
  g.fillRect(0, 0, CW, 34)
  g.fillRect(0, CH - 22, CW, 22)
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 1.5
  g.setLineDash([6, 5])
  for (const y of [40, CH - 28]) {
    g.beginPath()
    g.moveTo(10, y)
    g.lineTo(CW - 10, y)
    g.stroke()
  }
  g.setLineDash([])
}

function rule(g: CanvasRenderingContext2D, y: number, color: string, w = 64): void {
  g.fillStyle = color
  g.fillRect(CW / 2 - w / 2, y, w, 2)
}

function archPhoto(g: CanvasRenderingContext2D, im: HTMLImageElement | HTMLCanvasElement | null, x: number, y: number, w: number, h: number, border: string): void {
  const r = w / 2
  const path = () => {
    g.beginPath()
    g.moveTo(x, y + h)
    g.lineTo(x, y + r)
    g.arc(x + r, y + r, r, Math.PI, 0)
    g.lineTo(x + w, y + h)
    g.closePath()
  }
  g.save()
  path()
  g.fillStyle = 'rgba(255,255,255,0.14)'
  g.fill()
  if (im) {
    g.clip()
    const s = Math.max(w / im.width, h / im.height)
    g.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s)
  }
  g.restore()
  path()
  g.strokeStyle = border
  g.lineWidth = 4
  g.stroke()
}

function creamRing(g: CanvasRenderingContext2D, initials: string, color: string, y: number, r: number): void {
  g.fillStyle = '#fbf3e6'
  g.beginPath()
  g.arc(CW / 2, y, r, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = color
  g.lineWidth = 3
  g.beginPath()
  g.arc(CW / 2, y, r * 0.86, 0, Math.PI * 2)
  g.stroke()
  txt(g, initials, CW / 2, y + r * 0.04, r * (initials.length > 2 ? 0.58 : 0.74), color, 800, BRAND.fontUi)
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)))
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`
}

function drawSlide(b: Banner, s: Slide | undefined): void {
  const g = b.canvas.getContext('2d')!
  g.clearRect(0, 0, CW, CH)
  const cx = CW / 2
  const cream = '#fbf3e6'
  if (s?.kind === 'brand') {
    const br = brandById.get(s.brandId)
    const sec = catalog().sections.find((x) => x.id === s.brandId)
    if (br && sec) {
      fabric(g, shade(br.color, 0.08), shade(br.color, -0.28))
      txt(g, spaced('DISTRICT 122'), cx, 84, 20, 'rgba(251,243,230,0.85)', 600, BRAND.fontLatin)
      const logo = br.logo ? image(br.logo, false) : null
      if (logo) {
        const [t, tg] = makeCanvas(logo.width, logo.height)
        tg.drawImage(logo, 0, 0)
        tg.globalCompositeOperation = 'source-in'
        tg.fillStyle = cream
        tg.fillRect(0, 0, t.width, t.height)
        const sc = Math.min(300 / t.width, 110 / t.height)
        g.drawImage(t, cx - (t.width * sc) / 2, 180 - (t.height * sc) / 2, t.width * sc, t.height * sc)
      } else {
        creamRing(g, br.initials, br.color, 176, 60)
        txt(g, br.name, cx, 286, 44, cream, 700, BRAND.fontLatin)
      }
      txt(g, br.nameAr, cx, logo ? 270 : 336, 34, cream, 700, BRAND.fontUi, true)
      const p = catalog().byId.get(sec.productIds[0])
      archPhoto(g, p ? image(p.images[0], true) : null, 52, 384, CW - 104, 420, 'rgba(251,243,230,0.9)')
      txt(g, spaced('NEW SEASON'), cx, 856, 24, cream, 600, BRAND.fontLatin)
      txt(g, 'كوليكشن جديد', cx, 900, 32, cream, 700, BRAND.fontUi, true)
      const wing = WINGS.find((w) => w.slots.includes(br.id))
      if (wing) {
        rule(g, 936, 'rgba(251,243,230,0.5)', 48)
        txt(g, `${wing.nameEn} · ${wing.nameAr}`, cx, 966, 20, 'rgba(251,243,230,0.8)', 600, BRAND.fontUi)
      }
      return
    }
  }
  if (s?.kind === 'wheel') {
    fabric(g, '#fbf6ef', '#eadfce')
    txt(g, spaced('DISTRICT 122'), cx, 84, 20, '#8a6a46', 600, BRAND.fontLatin)
    // A prize wheel: alternating plum / gold / cream segments with a bronze rim.
    const wy = 290
    const r = 128
    const cols = ['#5b2b82', '#c8a46e', '#9e197e', '#fbf3e6', '#3e1c5c', '#e0c48f']
    for (let i = 0; i < 12; i++) {
      g.fillStyle = cols[i % cols.length]
      g.beginPath()
      g.moveTo(cx, wy)
      g.arc(cx, wy, r, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2)
      g.closePath()
      g.fill()
    }
    g.strokeStyle = '#8a6a46'
    g.lineWidth = 10
    g.beginPath()
    g.arc(cx, wy, r, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#8a6a46'
    g.beginPath()
    g.arc(cx, wy, 20, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.moveTo(cx - 16, wy - r - 22)
    g.lineTo(cx + 16, wy - r - 22)
    g.lineTo(cx, wy - r + 10)
    g.fill()
    txt(g, 'Spin the', cx, 492, 40, '#3e1c5c', 600, BRAND.fontLatin)
    txt(g, 'Wheel', cx, 548, 64, '#3e1c5c', 700, BRAND.fontLatin)
    txt(g, 'لفّي العجلة', cx, 616, 44, '#9e197e', 700, BRAND.fontUi, true)
    rule(g, 664, '#c8a46e')
    txt(g, 'Win coins & free shipping', cx, 712, 24, '#5a4a3c', 600, BRAND.fontLatin)
    txt(g, 'اكسبي كوينز وشحن مجاني', cx, 752, 28, '#5a4a3c', 700, BRAND.fontUi, true)
    txt(g, spaced('ONE SPIN A DAY'), cx, 880, 20, '#8a6a46', 600, BRAND.fontLatin)
    txt(g, 'لفّة كل يوم', cx, 916, 26, '#8a6a46', 700, BRAND.fontUi, true)
    return
  }
  // 122 Coins offer (also the fallback).
  fabric(g, '#5b2b82', '#2e1446')
  txt(g, spaced('DISTRICT 122'), cx, 84, 20, 'rgba(241,230,255,0.85)', 600, BRAND.fontLatin)
  const cy = 250
  const coin = g.createRadialGradient(cx - 30, cy - 34, 10, cx, cy, 104)
  coin.addColorStop(0, '#fff1c9')
  coin.addColorStop(0.55, '#e3bf78')
  coin.addColorStop(1, '#a8803f')
  g.fillStyle = coin
  g.beginPath()
  g.arc(cx, cy, 100, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = 'rgba(120,84,32,0.6)'
  g.lineWidth = 4
  g.beginPath()
  g.arc(cx, cy, 82, 0, Math.PI * 2)
  g.stroke()
  txt(g, '122', cx, cy + 4, 64, '#6b4a1c', 800, BRAND.fontLatin)
  txt(g, spaced('122 COINS'), cx, 398, 30, BRAND.gold, 700, BRAND.fontLatin)
  txt(g, 'Play · Earn · Save', cx, 446, 28, '#f1e6ff', 600, BRAND.fontLatin)
  txt(g, 'العبي · اكسبي · وفّري', cx, 490, 30, '#f1e6ff', 700, BRAND.fontUi, true)
  rule(g, 532, 'rgba(200,164,110,0.7)')
  txt(g, 'up to', cx, 584, 28, '#f1e6ff', 500, BRAND.fontLatin)
  txt(g, '30%', cx, 664, 112, '#ffffff', 700, BRAND.fontLatin)
  txt(g, 'OFF · خصم', cx, 746, 34, BRAND.gold, 700, BRAND.fontUi)
  txt(g, 'Swap coins at any shop', cx, 862, 22, 'rgba(241,230,255,0.85)', 600, BRAND.fontLatin)
  txt(g, 'بدّلي الكوينز في أي محل', cx, 900, 26, 'rgba(241,230,255,0.85)', 700, BRAND.fontUi, true)
}
