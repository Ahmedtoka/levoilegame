// Live screens (stage LED, plaza columns, corridor columns). A ScreenFeed owns
// two canvas textures: A shows the current slide, B fades in the next one,
// then A is redrawn and B hidden. All screens of a feed share the two
// materials, so a feed costs two textures however many screens show it.
// Redraws happen only on slide changes / countdown ticks, and only while one
// of the feed's screens is within 45 m and inside the camera frustum.

import { Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, Vector3, type Camera, type CanvasTexture, type Object3D } from 'three'
import { BRAND } from '../config/brand'
import { brandById } from '../config/mall'
import { canvasTexture, loadImage, loadProductTexture, makeCanvas } from '../engine/textures'
import { t } from '../i18n/i18n'
import type { Interaction } from '../interact/interaction'
import { catalog, store } from '../state/store'
import { demoEnabled } from '../social'
import { buildSlides, type SlideKind, type SlideSpec } from './screenSlides'
import { shopFascia } from './signage'

export interface ScreenActions {
  teleport(id: string): void
  openProduct(id: string): void
  openWheel(): void
}

const FADE = 0.5
const _pv = new Matrix4()
const _fr = new Frustum()
const _s = new Sphere()
const _v = new Vector3()
const fasciaCache = new Map<string, CanvasTexture>()
const imgCache = new Map<string, HTMLImageElement | HTMLCanvasElement | null>()
const imgPending = new Map<string, Set<() => void>>()

/** Image by URL (product photo / logo), null until loaded; `onLoad` asks for a redraw. */
function img(url: string, onLoad: () => void, product = true): HTMLImageElement | HTMLCanvasElement | null {
  const pending = imgPending.get(url)
  if (pending) {
    pending.add(onLoad)
    return null
  }
  if (imgCache.has(url)) return imgCache.get(url) ?? null
  imgCache.set(url, null)
  const cbs = new Set<() => void>([onLoad])
  imgPending.set(url, cbs)
  const p = product ? loadProductTexture(url, 512).then((r) => r.image as HTMLCanvasElement) : loadImage(url)
  p.then((i) => {
    imgCache.set(url, i)
    imgPending.delete(url)
    for (const cb of cbs) cb()
  }).catch(() => {
    imgPending.delete(url)
  })
  return null
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function cover(g: CanvasRenderingContext2D, im: HTMLImageElement | HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / im.width, h / im.height)
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  g.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s)
  g.restore()
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, weight = 700, font: string = BRAND.fontUi, rtl = false): void {
  g.fillStyle = color
  g.font = `${weight} ${px}px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.direction = rtl ? 'rtl' : 'ltr'
  g.fillText(s, x, y)
  g.direction = 'ltr'
}

export class ScreenFeed {
  readonly matA: MeshBasicMaterial
  readonly matB: MeshBasicMaterial
  private readonly canA: HTMLCanvasElement
  private readonly canB: HTMLCanvasElement
  private readonly texA: CanvasTexture
  private readonly texB: CanvasTexture
  private readonly kinds: SlideKind[]
  private readonly brandIds: string[]
  private readonly portrait: boolean
  private readonly interval: number
  private readonly screens: Object3D[] = []
  private slides: SlideSpec[] = []
  private index = 0
  private brandIndex = 0
  private timer = 0
  private fade = -1
  private tick = 0
  private dirty = true

  constructor(opts: { kinds: SlideKind[]; brandIds: string[]; portrait: boolean; interval?: number }) {
    this.kinds = opts.kinds
    this.brandIds = opts.brandIds
    this.portrait = opts.portrait
    this.interval = opts.interval ?? 6
    const [w, h] = this.portrait ? [576, 1024] : [1024, 576]
    ;[this.canA] = makeCanvas(w, h)
    ;[this.canB] = makeCanvas(w, h)
    this.texA = canvasTexture(this.canA)
    this.texB = canvasTexture(this.canB)
    this.matA = new MeshBasicMaterial({ map: this.texA, toneMapped: false })
    this.matB = new MeshBasicMaterial({ map: this.texB, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, visible: false })
    this.rebuild()
  }

  addScreen(o: Object3D): void {
    this.screens.push(o)
  }

  current(): SlideSpec | null {
    return this.slides[this.index % Math.max(1, this.slides.length)] ?? null
  }

  private rebuild(): void {
    const s = store.getState()
    this.slides = buildSlides({ kinds: this.kinds, flash: s.flash, groupDeal: s.groupDeal, brandIds: this.brandIds, brandIndex: this.brandIndex, demo: demoEnabled, now: Date.now() })
  }

  private visible(camera: Camera): boolean {
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _fr.setFromProjectionMatrix(_pv)
    for (const o of this.screens) {
      o.getWorldPosition(_v)
      if (_v.distanceTo(camera.position) < 45 && _fr.intersectsSphere(_s.set(_v, 3))) return true
    }
    return false
  }

  update(dt: number, camera: Camera): void {
    if (!this.visible(camera)) return
    if (this.fade >= 0) {
      this.fade += dt / FADE
      this.matB.opacity = Math.min(1, this.fade)
      if (this.fade >= 1) {
        this.draw(this.canA, this.current())
        this.texA.needsUpdate = true
        this.matB.opacity = 0
        this.matB.visible = false
        this.fade = -1
      }
      return
    }
    this.timer += dt
    this.tick += dt
    if (this.timer >= this.interval) {
      this.timer = 0
      this.index++
      if (this.index >= this.slides.length) {
        this.index = 0
        this.brandIndex++
      }
      this.rebuild()
      this.draw(this.canB, this.current())
      this.texB.needsUpdate = true
      this.fade = 0
      this.matB.visible = true
      return
    }
    // Countdowns tick once a second; first paint / image loads set `dirty`.
    const cur = this.current()
    if (this.dirty || (this.tick >= 1 && (cur?.kind === 'flash' || cur?.kind === 'deal'))) {
      this.tick = 0
      this.dirty = false
      this.rebuild()
      this.draw(this.canA, this.current())
      this.texA.needsUpdate = true
    }
  }

  private draw(c: HTMLCanvasElement, s: SlideSpec | null): void {
    const g = c.getContext('2d')!
    this.paint(g, c.width, c.height, s)
    gloss(g, c.width, c.height)
  }

  private paint(g: CanvasRenderingContext2D, W: number, H: number, s: SlideSpec | null): void {
    const P = this.portrait
    const redraw = () => (this.dirty = true)
    if (s?.kind === 'brand') {
      const bid = s.brandId
      if (!brandById.get(bid ?? '') || !catalog().sections.some((x) => x.id === bid)) s = null
    }
    const dark = !s || s.kind === 'flash' || s.kind === 'games' || s.kind === 'welcome'
    const grad = g.createLinearGradient(0, 0, W * 0.4, H)
    if (dark) {
      grad.addColorStop(0, '#47215f')
      grad.addColorStop(1, '#25103a')
    } else {
      grad.addColorStop(0, '#fcf8f3')
      grad.addColorStop(1, '#eee4d6')
    }
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    frame(g, W, H, dark ? 'rgba(200,164,110,0.75)' : 'rgba(176,138,92,0.6)')
    const cx = W / 2
    // Type scale: eyebrow (letter-spaced caps), display, title, body.
    const eyebrow = 26
    const ink = '#3a2e26'
    if (!s || s.kind === 'welcome') {
      const logo = img(BRAND.logoWhite, redraw, false)
      if (logo) contain(g, logo, cx, H * (P ? 0.42 : 0.4), P ? 420 : 560, P ? 120 : 160)
      rule(g, cx, H * (P ? 0.55 : 0.6), 72, BRAND.gold)
      text(g, spacedCaps('Shop · Play · Meet'), cx, H * (P ? 0.62 : 0.7), 30, '#f1e6ff', 500, BRAND.fontLatin)
      text(g, 'اتسوقي · العبي · قابلي صحابك', cx, H * (P ? 0.69 : 0.8), 32, BRAND.gold, 700, BRAND.fontUi, true)
      return
    }
    if (s.kind === 'flash') {
      const b = brandById.get(s.brandId ?? '')
      text(g, spacedCaps('Flash sale'), cx, H * (P ? 0.1 : 0.14), eyebrow, BRAND.gold, 600, BRAND.fontLatin)
      text(g, 'فلاش سيل', cx, H * (P ? 0.15 : 0.23), 30, '#f1e6ff', 700, BRAND.fontUi, true)
      text(g, `−${s.percent}%`, cx, H * (P ? 0.34 : 0.45), P ? 180 : 190, '#ffffff', 700, BRAND.fontLatin)
      rule(g, cx, H * (P ? 0.47 : 0.62), 64, BRAND.gold)
      text(g, b?.name ?? '', cx, H * (P ? 0.54 : 0.7), P ? 52 : 56, '#ffffff', 600, BRAND.fontLatin)
      text(g, b?.nameAr ?? '', cx, H * (P ? 0.61 : 0.79), 40, '#f1e6ff', 700, BRAND.fontUi, true)
      pill(g, cx, H * (P ? 0.78 : 0.9), P ? 260 : 220, P ? 84 : 64, 'rgba(200,164,110,0.18)', BRAND.gold)
      text(g, mmss((s.endsAt ?? 0) - Date.now()), cx, H * (P ? 0.78 : 0.9), P ? 56 : 44, BRAND.gold, 700, BRAND.fontLatin)
      return
    }
    if (s.kind === 'games') {
      text(g, spacedCaps('122 Coins'), cx, H * (P ? 0.14 : 0.16), eyebrow, BRAND.gold, 600, BRAND.fontLatin)
      coin(g, cx, H * (P ? 0.32 : 0.36), P ? 96 : 84)
      text(g, 'Play & earn 122 Coins', cx, H * (P ? 0.52 : 0.6), P ? 44 : 54, '#ffffff', 600, BRAND.fontLatin)
      text(g, 'العبي واكسبي 122 Coins', cx, H * (P ? 0.6 : 0.72), P ? 40 : 44, BRAND.gold, 700, BRAND.fontUi, true)
      rule(g, cx, H * (P ? 0.68 : 0.8), 64, 'rgba(200,164,110,0.7)')
      text(g, 'Wheel · Passport · Hidden logos', cx, H * (P ? 0.75 : 0.87), P ? 26 : 28, '#e6d8f2', 500, BRAND.fontLatin)
      return
    }
    if (s.kind === 'deal') {
      const p = catalog().byId.get(s.productId ?? '')
      const ph = p ? img(p.images[0], redraw) : null
      const [px, py, pw, phh] = P ? [56, 56, W - 112, H * 0.46] : [48, 48, W * 0.42, H - 96]
      g.fillStyle = '#e9dfd2'
      g.fillRect(px, py, pw, phh)
      if (ph) cover(g, ph, px, py, pw, phh)
      const tx = P ? cx : W * 0.73
      const ty = P ? H * 0.57 : H * 0.17
      text(g, spacedCaps('Group deal'), tx, ty, eyebrow, '#8a6a46', 600, BRAND.fontLatin)
      text(g, 'صفقة جماعية', tx, ty + 40, 30, '#5b2b82', 700, BRAND.fontUi, true)
      text(g, `${s.joined}/${s.target}`, tx, ty + (P ? 130 : 140), P ? 110 : 116, ink, 700, BRAND.fontLatin)
      const bw = P ? W - 180 : W * 0.4
      const by = ty + (P ? 200 : 214)
      pill(g, tx, by + 8, bw, 16, '#e6d9ee', null)
      const k = Math.min(s.joined ?? 0, s.target ?? 1) / (s.target ?? 1)
      if (k > 0) pill(g, tx - (bw * (1 - k)) / 2, by + 8, Math.max(16, bw * k), 16, '#5b2b82', null)
      text(g, `−${s.percent}% · ${mmss((s.endsAt ?? 0) - Date.now())}`, tx, by + 70, P ? 42 : 44, '#5b2b82', 700, BRAND.fontLatin)
      if (p) text(g, p.title, tx, by + 124, 28, '#6b4f35', 500, BRAND.fontLatin)
      return
    }
    // brand
    const b = brandById.get(s.brandId ?? '')
    const sec = catalog().sections.find((x) => x.id === s.brandId)
    if (!b || !sec) return
    let fascia = fasciaCache.get(b.id)
    if (!fascia) {
      fascia = shopFascia(sec, '', { initials: b.initials, color: b.color, logo: b.logo })
      fasciaCache.set(b.id, fascia)
    }
    // The fascia paints its logo asynchronously; request a redraw once the image has loaded.
    if (b.logo) img(b.logo, redraw, false)
    const fh = P ? 140 : 164
    const fw = P ? W - 96 : W - 360
    g.drawImage(fascia.image as HTMLCanvasElement, (W - fw) / 2, 44, fw, fh)
    const prods = sec.productIds.slice(0, 2).map((id) => catalog().byId.get(id)).filter((p) => !!p)
    const gap = 24
    prods.forEach((p, k) => {
      const ph = img(p!.images[0], redraw)
      const [x, y, w, h] = P
        ? [48 + k * ((W - 96 - gap) / 2 + gap), fh + 76, (W - 96 - gap) / 2, H * 0.5]
        : [72 + k * ((W - 144 - gap) / 2 + gap), fh + 68, (W - 144 - gap) / 2, H - fh - 190]
      g.fillStyle = '#e9dfd2'
      g.fillRect(x, y, w, h)
      if (ph) cover(g, ph, x, y, w, h)
    })
    rule(g, cx, H - (P ? 150 : 100), 56, b.color)
    text(g, `Discover ${b.name}`, cx, H - (P ? 112 : 70), P ? 32 : 32, ink, 600, BRAND.fontLatin)
    text(g, `اكتشفي ${b.nameAr}`, cx, H - (P ? 66 : 36), P ? 32 : 26, b.color, 700, BRAND.fontUi, true)
  }
}

/** Letter-spaced capitals for eyebrow labels. */
function spacedCaps(t: string): string {
  return t.toUpperCase().split('').join(' ')
}

function rule(g: CanvasRenderingContext2D, cx: number, y: number, w: number, color: string): void {
  g.fillStyle = color
  g.fillRect(cx - w / 2, y - 1, w, 2)
}

function pill(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, fill: string, stroke: string | null): void {
  const r = h / 2
  g.beginPath()
  g.moveTo(cx - w / 2 + r, cy - r)
  g.lineTo(cx + w / 2 - r, cy - r)
  g.arc(cx + w / 2 - r, cy, r, -Math.PI / 2, Math.PI / 2)
  g.lineTo(cx - w / 2 + r, cy + r)
  g.arc(cx - w / 2 + r, cy, r, Math.PI / 2, (Math.PI * 3) / 2)
  g.closePath()
  g.fillStyle = fill
  g.fill()
  if (stroke) {
    g.strokeStyle = stroke
    g.lineWidth = 2
    g.stroke()
  }
}

/** Hairline inner frame with small corner brackets. */
function frame(g: CanvasRenderingContext2D, W: number, H: number, color: string): void {
  const m = 22
  const k = 34
  g.strokeStyle = color
  g.lineWidth = 1.5
  g.strokeRect(m, m, W - m * 2, H - m * 2)
  g.lineWidth = 4
  g.beginPath()
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
    g.moveTo(x, y + dy * k)
    g.lineTo(x, y)
    g.lineTo(x + dx * k, y)
  }
  g.stroke()
}

function contain(g: CanvasRenderingContext2D, im: HTMLImageElement | HTMLCanvasElement, cx: number, cy: number, w: number, h: number): void {
  const s = Math.min(w / im.width, h / im.height)
  g.drawImage(im, cx - (im.width * s) / 2, cy - (im.height * s) / 2, im.width * s, im.height * s)
}

function coin(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.34, r * 0.1, cx, cy, r)
  grad.addColorStop(0, '#fff1c9')
  grad.addColorStop(0.55, '#e3bf78')
  grad.addColorStop(1, '#a8803f')
  g.fillStyle = grad
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = 'rgba(120,84,32,0.6)'
  g.lineWidth = 3
  g.beginPath()
  g.arc(cx, cy, r * 0.82, 0, Math.PI * 2)
  g.stroke()
  text(g, '122', cx, cy + r * 0.04, r * 0.62, '#6b4a1c', 800, BRAND.fontLatin)
}

/** Subtle screen gloss baked over every slide: a soft top sheen and one diagonal streak. */
function gloss(g: CanvasRenderingContext2D, W: number, H: number): void {
  const top = g.createLinearGradient(0, 0, 0, H * 0.45)
  top.addColorStop(0, 'rgba(255,255,255,0.09)')
  top.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = top
  g.fillRect(0, 0, W, H * 0.45)
  g.save()
  g.globalCompositeOperation = 'lighter'
  const d = g.createLinearGradient(W * 0.08, 0, W * 0.5, H)
  d.addColorStop(0, 'rgba(255,255,255,0)')
  d.addColorStop(0.46, 'rgba(255,255,255,0)')
  d.addColorStop(0.5, 'rgba(255,255,255,0.05)')
  d.addColorStop(0.6, 'rgba(255,255,255,0)')
  g.fillStyle = d
  g.fillRect(0, 0, W, H)
  g.restore()
}

export function screenMesh(feed: ScreenFeed, w: number, h: number): Group {
  const g = new Group()
  const geo = new PlaneGeometry(w, h)
  const a = new Mesh(geo, feed.matA)
  const b = new Mesh(geo, feed.matB)
  b.position.z = 0.002
  b.renderOrder = 2
  g.add(a, b)
  return g
}

/** E / tap on a screen performs the current slide's action. */
export function registerScreen(interaction: Interaction, hit: Object3D, feed: ScreenFeed, actions: ScreenActions): void {
  interaction.add({
    object: hit,
    kind: 'deal',
    enabled: () => !!feed.current()?.action,
    label: () => {
      const s = feed.current()
      const L = store.getState().lang
      if (s?.action?.type === 'teleport') {
        const b = brandById.get(s.action.target)
        return `${t('screenGoTo', L)} ${L === 'ar' ? (b?.nameAr ?? '') : (b?.name ?? '')}`
      }
      return t('screenOpen', L)
    },
    onInteract: () => {
      const a = feed.current()?.action
      if (!a) return
      if (a.type === 'teleport') actions.teleport(a.target)
      else if (a.type === 'product') actions.openProduct(a.id)
      else actions.openWheel()
    },
    maxDist: 9,
  })
}
