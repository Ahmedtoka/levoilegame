// 3D side of the "live mall" demo: the Styling Studio (in the lounge slot),
// the wheel of fortune, the hidden treasure logos, the group-deal boards and
// the simulated crowd.

import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Box3,
  Vector3,
  type CanvasTexture,
  type Texture,
} from 'three'
import type { Game } from '../game'
import { BRAND } from '../config/brand'
import { canvasTexture, loadImage, makeCanvas } from '../engine/textures'
import { labelSign } from './signage'
import { imageMat } from './materials'
import { createCharacter } from '../actors/character'
import { stylistLook } from '../actors/palette'
import { addGreeter, placeCharacter } from './people'
import type { ShopHandles } from './shop'
import { Crowd, type CrowdPlaces } from './crowd'
import { catalog, store, watch } from '../state/store'
import { t } from '../i18n/i18n'
import { displayImage } from '../data/types'
import { social } from '../social'
import { collectTreasure, TREASURE_COUNT, WHEEL_PRIZES } from '../social/games'

type P3 = [number, number, number]

const STYLISTS = ['Laila', 'Dina', 'Rana']

export interface LiveMall {
  crowd: Crowd | null
}

export function buildLiveMall(game: Game, shops: ShopHandles[], logo: Texture | null): LiveMall {
  const studioPoses = buildStudio(game, shops, logo)
  const wheel = buildWheel(game)
  buildTreasures(game, shops)
  buildDealBoards(game, shops)

  const presence = social().presence
  let crowd: Crowd | null = null
  if (presence) {
    const places: CrowdPlaces = { wheel: wheel.centre, studio: studioPoses }
    crowd = new Crowd(game, shops, presence, places)
    crowd.build()
    crowd.onWheelPlay = () => wheel.spin()
    const c = crowd
    game.updaters.push((dt, time) => c.update(dt, time))
  }
  return { crowd }
}

// ----------------------------------------------------------------- helpers

function toWorld(s: ShopHandles, x: number, z: number): { x: number; z: number } {
  const { yaw, entrance } = s.layout
  return { x: entrance.x + x * Math.cos(yaw) + z * Math.sin(yaw), z: entrance.z - x * Math.sin(yaw) + z * Math.cos(yaw) }
}

function frameGroup(s: ShopHandles): Group {
  const g = new Group()
  g.position.set(s.layout.entrance.x, 0, s.layout.entrance.z)
  g.rotation.y = s.layout.yaw
  return g
}

function collideMesh(game: Game, m: Mesh): void {
  m.updateWorldMatrix(true, false)
  game.colliders.addBox(new Box3().setFromObject(m))
}

const BRASS = new MeshStandardMaterial({ color: '#b08a55', roughness: 0.35, metalness: 0.8 })
const CREAM = new MeshStandardMaterial({ color: '#f3ece4', roughness: 0.8 })

// ------------------------------------------------------------------ studio

/** Mirrors + stylists in the lounge slot. Returns the customer pose at each mirror (world). */
function buildStudio(game: Game, shops: ShopHandles[], logo: Texture | null): CrowdPlaces['studio'] {
  const lounge = shops.find((s) => s.layout.kind === 'lounge')
  if (!lounge) return []
  const g = frameGroup(lounge)
  game.engine.scene.add(g)

  const signMat = imageMat(labelSign('Styling Studio', 'ستوديو الستايلينج', { bg: '#f4ede3', fg: '#6b4f35' }))
  signMat.side = FrontSide
  const sign = new Mesh(new PlaneGeometry(4.2, 1.05), signMat)
  sign.position.set(0, 4.55, 0.06)
  g.add(sign)

  const glass = new MeshStandardMaterial({ color: '#dbe4ec', roughness: 0.12, metalness: 0.35, emissive: '#8a98a6', emissiveIntensity: 0.35 })
  const rug = new MeshStandardMaterial({ color: '#e9d9e2', roughness: 0.95 })
  // [mirror x, z, mirror local yaw, customer x, z, stylist x, z]
  const stations: [number, number, number, number, number, number, number][] = [
    [-5.2, -3.6, Math.PI / 2, -4.3, -3.6, -3.85, -4.65],
    [5.2, -3.6, -Math.PI / 2, 4.3, -3.6, 3.85, -4.65],
    [5.2, -11.0, -Math.PI / 2, 4.3, -11.0, 3.9, -10.0],
  ]
  const poses: CrowdPlaces['studio'] = []
  stations.forEach(([mx, mz, my, cx, cz, sx, sz], i) => {
    const mirror = new Group()
    mirror.position.set(mx, 0, mz)
    mirror.rotation.y = my
    const frame = new Mesh(new BoxGeometry(1.0, 2.1, 0.07), BRASS)
    frame.position.y = 1.15
    const pane = new Mesh(new PlaneGeometry(0.86, 1.95), glass)
    pane.position.set(0, 1.15, 0.04)
    const base = new Mesh(new BoxGeometry(1.1, 0.1, 0.4), BRASS)
    base.position.y = 0.05
    mirror.add(frame, pane, base)
    g.add(mirror)
    const r = new Mesh(new CylinderGeometry(0.9, 0.9, 0.012, 28), rug)
    r.position.set((cx + sx) / 2, 0.006, (cz + sz) / 2)
    g.add(r)
    collideMesh(game, frame)

    const wc = toWorld(lounge, cx, cz)
    poses.push({ ...wc, yaw: lounge.layout.yaw + my + Math.PI })
    const ws = toWorld(lounge, sx, sz)
    const c = createCharacter(stylistLook(500 + i * 13, logo), 500 + i)
    const yawToCustomer = Math.atan2(wc.x - ws.x, wc.z - ws.z)
    placeCharacter(game, c, ws.x, ws.z, yawToCustomer)
    addGreeter(game, c, STYLISTS[i], () => lounge.interiorVisible, { id: `stylist-${i}`, name: STYLISTS[i], role: 'stylist' })
  })
  return poses
}

// ------------------------------------------------------------------- wheel

function wheelTexture(): CanvasTexture {
  const S = 512
  const [c, g] = makeCanvas(S, S)
  const n = WHEEL_PRIZES.length
  for (let i = 0; i < n; i++) {
    g.beginPath()
    g.moveTo(S / 2, S / 2)
    g.arc(S / 2, S / 2, S / 2 - 6, (i / n) * Math.PI * 2 - Math.PI / 2, ((i + 1) / n) * Math.PI * 2 - Math.PI / 2)
    g.fillStyle = WHEEL_PRIZES[i].color
    g.fill()
    g.save()
    g.translate(S / 2, S / 2)
    g.rotate(((i + 0.5) / n) * Math.PI * 2)
    const dark = ['#9e197e', '#6f0f58'].includes(WHEEL_PRIZES[i].color)
    g.fillStyle = dark ? '#fff' : '#5a2a4a'
    g.textAlign = 'center'
    g.font = `700 30px ${BRAND.fontUi}`
    g.fillText(WHEEL_PRIZES[i].title.ar, 0, -S * 0.3)
    g.restore()
  }
  g.lineWidth = 10
  g.strokeStyle = '#b08a55'
  g.beginPath()
  g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#fbf8f6'
  g.beginPath()
  g.arc(S / 2, S / 2, 46, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = BRAND.magenta
  g.font = `600 30px ${BRAND.fontLatin}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('LV', S / 2, S / 2)
  return canvasTexture(c)
}

function buildWheel(game: Game): { centre: { x: number; z: number }; spin: () => void } {
  const x = 6.2
  const z = -3.6
  const g = new Group()
  g.position.set(x, 0, z)
  g.rotation.y = Math.atan2(0 - x, -3.2 - z) // face the entrance walkway
  const post = new Mesh(new CylinderGeometry(0.07, 0.09, 1.6, 12), BRASS)
  post.position.y = 0.8
  const foot = new Mesh(new CylinderGeometry(0.55, 0.6, 0.08, 24), BRASS)
  foot.position.y = 0.04
  const disc = new Mesh(new CircleGeometry(0.85, 48), imageMat(wheelTexture()))
  disc.position.set(0, 1.95, 0.1)
  const rim = new Mesh(new CylinderGeometry(0.9, 0.9, 0.08, 48), BRASS)
  rim.rotation.x = Math.PI / 2
  rim.position.set(0, 1.95, 0.04)
  const pointer = new Mesh(new ConeGeometry(0.09, 0.22, 3), new MeshStandardMaterial({ color: BRAND.magenta, roughness: 0.4 }))
  pointer.position.set(0, 2.88, 0.14)
  pointer.rotation.z = Math.PI
  const sign = new Mesh(new PlaneGeometry(1.8, 0.45), imageMat(labelSign('Wheel of fortune', 'عجلة الحظ', { bg: '#f4ede3', fg: '#6b4f35' })))
  sign.position.set(0, 3.35, 0.05)
  g.add(post, foot, rim, disc, pointer, sign)
  game.engine.scene.add(g)
  game.colliders.circles.push({ x, z, r: 0.6 })
  game.interaction.add({
    object: disc,
    kind: 'wheel',
    label: () => t('spinWheel', store.getState().lang),
    onInteract: () => store.getState().set({ overlay: 'wheel' }),
    maxDist: 3.6,
  })
  let vel = 0
  game.updaters.push((dt) => {
    disc.rotation.z -= (0.15 + vel) * dt
    vel *= Math.pow(0.35, dt)
  })
  return { centre: { x, z }, spin: () => (vel = 6 + Math.random() * 4) }
}

// ---------------------------------------------------------------- treasure

async function treasureTexture(): Promise<CanvasTexture> {
  const S = 256
  const [c, g] = makeCanvas(S, S)
  const grad = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2)
  grad.addColorStop(0, '#c0359e')
  grad.addColorStop(1, '#6f0f58')
  g.fillStyle = grad
  g.beginPath()
  g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = '#e8c98f'
  g.stroke()
  try {
    const img = await loadImage(BRAND.logoWhite)
    const s = Math.min(190 / img.width, 80 / img.height)
    g.drawImage(img, (S - img.width * s) / 2, (S - img.height * s) / 2, img.width * s, img.height * s)
  } catch {
    g.fillStyle = '#fff'
    g.font = `600 64px ${BRAND.fontLatin}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('LV', S / 2, S / 2)
  }
  return canvasTexture(c)
}

function haloTexture(): CanvasTexture {
  const [c, g] = makeCanvas(128, 128)
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,190,240,1)')
  grad.addColorStop(0.4, 'rgba(230,90,190,0.45)')
  grad.addColorStop(1, 'rgba(230,90,190,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return canvasTexture(c)
}

function buildTreasures(game: Game, shops: ShopHandles[]): void {
  const byId = (id: string) => shops.find((s) => s.layout.section?.id === id)
  const lounge = shops.find((s) => s.layout.kind === 'lounge')
  const zEnd = game.layout.bounds.z0
  const spots: { pos: P3; shop?: ShopHandles }[] = [
    { pos: [-3.85, 0.55, -8.15] }, // behind the directory totem
    { pos: [18.7, 0.5, -21.0] }, // far atrium corner, by the plant
    { pos: [-5.4, 2.4, zEnd + 0.6] }, // end of the boulevard, up high
  ]
  const sc = byId('scarves') ?? shops.find((s) => s.layout.section)
  if (sc) {
    const w = toWorld(sc, 5.3, -13.3)
    spots.push({ pos: [w.x, 2.7, w.z], shop: sc })
  }
  if (lounge) {
    const w = toWorld(lounge, -5.5, -13.3)
    spots.push({ pos: [w.x, 1.5, w.z], shop: lounge })
  }
  const geo = new CircleGeometry(0.24, 32)
  const haloMat = new MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending })
  const haloGeo = new PlaneGeometry(1.0, 1.0)
  const mat = new MeshBasicMaterial({ color: '#ffffff', side: 2, toneMapped: false })
  treasureTexture().then((tex) => {
    mat.map = tex
    mat.needsUpdate = true
  })
  spots.slice(0, TREASURE_COUNT).forEach(({ pos, shop }, i) => {
    const g = new Group()
    g.position.set(...pos)
    const coin = new Mesh(geo, mat)
    const halo = new Mesh(haloGeo, haloMat)
    g.add(halo, coin)
    game.engine.scene.add(g)
    game.interaction.add({
      object: coin,
      kind: 'treasure',
      enabled: () => g.visible,
      label: () => t('collectLogo', store.getState().lang),
      onInteract: () => {
        collectTreasure(i)
        g.visible = false
      },
      maxDist: 3.4,
    })
    const cam = game.engine.camera
    game.updaters.push((_dt, time) => {
      if (store.getState().treasures.includes(i)) {
        g.visible = false
        return
      }
      g.visible = !shop || shop.interiorVisible
      if (!g.visible) return
      coin.rotation.y = time * 1.6 + i
      g.position.y = pos[1] + Math.sin(time * 2 + i) * 0.06
      halo.quaternion.copy(cam.quaternion)
      halo.scale.setScalar(1 + Math.sin(time * 3 + i) * 0.12)
    })
  })
}

// -------------------------------------------------------------- deal board

function buildDealBoards(game: Game, shops: ShopHandles[]): void {
  const deals = social().deals
  if (!deals) return
  const W = 640
  const H = 400
  const [c, g] = makeCanvas(W, H)
  const tex = canvasTexture(c)
  let thumb: HTMLImageElement | null = null
  let thumbFor = ''
  let lastKey = ''

  const draw = () => {
    const d = store.getState().groupDeal
    if (!d) return
    const p = catalog().byId.get(d.productId)
    if (!p) return
    if (thumbFor !== p.id) {
      thumbFor = p.id
      loadImage(displayImage(p))
        .then((img) => {
          thumb = img
          lastKey = ''
        })
        .catch(() => {})
    }
    const secs = Math.max(0, Math.floor((d.endsAt - Date.now()) / 1000))
    const left = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    const key = `${d.joined}|${left}|${d.unlocked}|${!!thumb}`
    if (key === lastKey) return
    lastKey = key
    g.fillStyle = '#fbf6f2'
    g.fillRect(0, 0, W, H)
    g.fillStyle = BRAND.magenta
    g.fillRect(0, 0, W, 64)
    g.fillStyle = '#fff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.direction = 'rtl'
    g.font = `700 34px ${BRAND.fontUi}`
    g.fillText('👥 صفقة جماعية · خصم ٢٥٪', W / 2, 33)
    g.direction = 'ltr'
    if (thumb) {
      const s = Math.min(220 / thumb.width, 300 / thumb.height)
      g.drawImage(thumb, 40 + (220 - thumb.width * s) / 2, 80 + (300 - thumb.height * s) / 2, thumb.width * s, thumb.height * s)
    }
    const x = 420
    g.fillStyle = '#2a1f27'
    g.font = `600 26px ${BRAND.fontLatin}`
    g.fillText(p.title.length > 22 ? p.title.slice(0, 21) + '…' : p.title, x, 112)
    g.direction = 'rtl'
    g.font = `800 64px ${BRAND.fontUi}`
    g.fillStyle = BRAND.magenta
    g.fillText(d.unlocked ? 'اكتملت! 🎉' : `${d.joined}/${d.target}`, x, 195)
    g.font = `700 28px ${BRAND.fontUi}`
    g.fillStyle = '#6b4f35'
    g.fillText(d.unlocked ? 'خصم ٢٥٪ اتفتح' : 'انضموا', x, 248)
    // progress bar
    g.direction = 'ltr'
    g.fillStyle = '#eadfe6'
    g.fillRect(x - 150, 278, 300, 18)
    g.fillStyle = BRAND.magenta
    g.fillRect(x - 150, 278, (300 * Math.min(d.joined, d.target)) / d.target, 18)
    g.direction = 'rtl'
    g.font = `700 30px ${BRAND.fontUi}`
    g.fillStyle = '#2a1f27'
    if (!d.unlocked) g.fillText(`فاضل ${left}`, x, 340)
    g.direction = 'ltr'
    tex.needsUpdate = true
  }

  const mat = imageMat(tex)
  const boards: { g: Group; panel: Mesh; shop?: ShopHandles }[] = []
  const makeBoard = (x: number, z: number, yaw: number, shop?: ShopHandles) => {
    const b = new Group()
    b.position.set(x, 0, z)
    b.rotation.y = yaw
    const panel = new Mesh(new PlaneGeometry(1.6, 1.0), mat)
    panel.position.y = 1.55
    const back = new Mesh(new BoxGeometry(1.7, 1.1, 0.05), CREAM)
    back.position.set(0, 1.55, -0.04)
    for (const sx of [-0.7, 0.7]) {
      const leg = new Mesh(new CylinderGeometry(0.025, 0.025, 1.05, 8), BRASS)
      leg.position.set(sx, 0.52, -0.04)
      b.add(leg)
    }
    b.add(back, panel)
    game.engine.scene.add(b)
    game.colliders.circles.push({ x, z, r: 0.5 })
    game.interaction.add({
      object: panel,
      kind: 'deal',
      label: () => `${t('groupDeal', store.getState().lang)} · ${t('view', store.getState().lang)}`,
      onInteract: () => {
        const d = store.getState().groupDeal
        if (d) store.getState().openProduct(d.productId)
      },
      maxDist: 4,
    })
    boards.push({ g: b, panel, shop })
  }

  makeBoard(3.6, -19.6, 0)
  const placeShopBoard = () => {
    const d = store.getState().groupDeal
    const p = d && catalog().byId.get(d.productId)
    const shop = p && shops.find((s) => s.layout.section?.id === p.section)
    if (!shop || boards.length > 1) return
    const w = toWorld(shop, -2.6, 1.4)
    makeBoard(w.x, w.z, shop.layout.yaw)
  }
  watch((s) => s.groupDeal, () => {
    placeShopBoard()
    draw()
  })
  let acc = 0
  const v = new Vector3()
  game.updaters.push((dt) => {
    if ((acc += dt) < 1) return
    acc = 0
    const P = game.player.pos
    if (boards.some((b) => b.g.getWorldPosition(v).distanceTo(P) < 30)) draw()
  })
}
