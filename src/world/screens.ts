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

/** Image by URL (product photo / logo), null until loaded; `onLoad` asks for a redraw. */
function img(url: string, onLoad: () => void, product = true): HTMLImageElement | HTMLCanvasElement | null {
  if (imgCache.has(url)) return imgCache.get(url) ?? null
  imgCache.set(url, null)
  const p = product ? loadProductTexture(url, 512).then((r) => r.image as HTMLCanvasElement) : loadImage(url)
  p.then((i) => {
    imgCache.set(url, i)
    onLoad()
  }).catch(() => {})
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
    const W = c.width
    const H = c.height
    const P = this.portrait
    const redraw = () => (this.dirty = true)
    const grad = g.createLinearGradient(0, 0, W, H)
    if (!s || s.kind === 'flash' || s.kind === 'games' || s.kind === 'welcome') {
      grad.addColorStop(0, '#3e1c5c')
      grad.addColorStop(1, '#5b2b82')
    } else {
      grad.addColorStop(0, '#fbf6f2')
      grad.addColorStop(1, '#efe6da')
    }
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    g.strokeStyle = BRAND.gold
    g.lineWidth = 6
    g.strokeRect(12, 12, W - 24, H - 24)
    const cx = W / 2
    if (!s || s.kind === 'welcome') {
      const logo = img(BRAND.logoWhite, redraw, false)
      if (logo) cover(g, logo, cx - (P ? 230 : 320), H / 2 - (P ? 130 : 110), P ? 460 : 640, P ? 130 : 180)
      text(g, 'SHOP · PLAY · MEET', cx, H * (P ? 0.66 : 0.78), P ? 34 : 40, '#f1e6ff', 600, BRAND.fontLatin)
      text(g, 'اتسوقي · العبي · قابلي صحابك', cx, H * (P ? 0.74 : 0.88), P ? 34 : 34, BRAND.gold, 700, BRAND.fontUi, true)
      return
    }
    if (s.kind === 'flash') {
      const b = brandById.get(s.brandId ?? '')
      text(g, '⚡ FLASH SALE · فلاش سيل', cx, H * 0.16, P ? 40 : 48, BRAND.gold, 800)
      text(g, `−${s.percent}%`, cx, H * (P ? 0.36 : 0.42), P ? 190 : 210, '#ffffff', 800, BRAND.fontLatin)
      text(g, b?.name ?? '', cx, H * (P ? 0.56 : 0.66), P ? 56 : 64, '#ffffff', 700, BRAND.fontLatin)
      text(g, b?.nameAr ?? '', cx, H * (P ? 0.64 : 0.77), P ? 46 : 48, '#f1e6ff', 700, BRAND.fontUi, true)
      text(g, mmss((s.endsAt ?? 0) - Date.now()), cx, H * (P ? 0.8 : 0.9), P ? 64 : 52, BRAND.gold, 800, BRAND.fontLatin)
      return
    }
    if (s.kind === 'games') {
      text(g, '🎡  🛂  ✨  🪙', cx, H * 0.3, P ? 90 : 110, '#ffffff', 400)
      text(g, 'Play & earn 122 Coins', cx, H * 0.55, P ? 48 : 60, '#ffffff', 700, BRAND.fontLatin)
      text(g, 'العبي واكسبي 122 Coins', cx, H * 0.7, P ? 48 : 56, BRAND.gold, 800, BRAND.fontUi, true)
      text(g, 'Wheel · Passport · Hidden logos', cx, H * 0.84, P ? 30 : 34, '#f1e6ff', 600, BRAND.fontLatin)
      return
    }
    if (s.kind === 'deal') {
      const p = catalog().byId.get(s.productId ?? '')
      const ph = p ? img(p.images[0], redraw) : null
      const [px, py, pw, phh] = P ? [60, 60, W - 120, H * 0.48] : [40, 40, W * 0.42, H - 80]
      if (ph) cover(g, ph, px, py, pw, phh)
      const tx = P ? cx : W * 0.72
      const ty = P ? H * 0.58 : H * 0.18
      text(g, '👥 Group deal · صفقة جماعية', tx, ty, P ? 34 : 38, '#5b2b82', 800)
      text(g, `${s.joined}/${s.target}`, tx, ty + (P ? 110 : 120), P ? 120 : 130, '#2a1f33', 800, BRAND.fontLatin)
      const bw = P ? W - 160 : W * 0.44
      g.fillStyle = '#e6d9ee'
      g.fillRect(tx - bw / 2, ty + (P ? 190 : 210), bw, 22)
      g.fillStyle = '#5b2b82'
      g.fillRect(tx - bw / 2, ty + (P ? 190 : 210), (bw * Math.min(s.joined ?? 0, s.target ?? 1)) / (s.target ?? 1), 22)
      text(g, `−${s.percent}% · ${mmss((s.endsAt ?? 0) - Date.now())}`, tx, ty + (P ? 270 : 290), P ? 46 : 50, '#5b2b82', 800, BRAND.fontLatin)
      if (p) text(g, p.title, tx, ty + (P ? 330 : 350), P ? 30 : 32, '#6b4f35', 600, BRAND.fontLatin)
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
    const fh = P ? 150 : 180
    g.drawImage(fascia.image as HTMLCanvasElement, P ? 30 : 160, 30, P ? W - 60 : W - 320, fh)
    const prods = sec.productIds.slice(0, 2).map((id) => catalog().byId.get(id)).filter((p) => !!p)
    prods.forEach((p, k) => {
      const ph = img(p!.images[0], redraw)
      const [x, y, w, h] = P ? [40 + k * ((W - 100) / 2 + 20), fh + 60, (W - 100) / 2, H * 0.5] : [60 + k * (W / 2 - 40), fh + 50, W / 2 - 100, H - fh - 150]
      if (ph) cover(g, ph, x, y, w, h)
    })
    text(g, `Discover ${b.name} · اكتشفي ${b.nameAr}`, cx, H - (P ? 90 : 50), P ? 34 : 38, b.color, 800)
  }
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
