// The mall shell: plaza (entrance, skylight, decor) and the three wings
// (corridor, shop boxes, ceilings). Wings are built in their own local frame.

import {
  BoxGeometry,
  CircleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  type Object3D,
  type Texture,
} from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { MALL, type MallLayout, type Rect, type Wing } from '../config/layout'
import { brandById } from '../config/mall'
import type { Batcher, BatchFrame } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import type { QualitySettings } from '../engine/quality'
import { gradientTexture, storeTexture } from '../engine/textures'
import { BRAND } from '../config/brand'
import { glowMat, imageMat, MAT, tintMat } from './materials'
import { bench, column, plant } from './props'
import type { Kit } from './kit'
import { directoryTexture, labelSign, logoTexture, type DirectoryEntry } from './signage'
import { setGlowsVisible } from './glow'

export interface ShellHandles {
  doors: { target: number; update(dt: number): void }
  setQuality(q: QualitySettings): void
  /** Called each frame with the player position for LOD toggles. */
  update(px: number, pz: number): void
}

const T = MALL.wallT

function floorPlane(r: Rect, mat: MeshStandardMaterial, y = 0): Mesh {
  const m = new Mesh(new PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2)
  m.matrixAutoUpdate = false
  m.updateMatrix()
  return m
}

function repeatTex(tex: Texture, rx: number, rz: number): Texture {
  const t = tex.clone()
  t.repeat.set(rx, rz)
  t.needsUpdate = true
  return t
}

export class SlidingDoors {
  readonly group = new Group()
  private readonly left: Object3D
  private readonly right: Object3D
  private open = 0
  target = 0

  constructor(f: BatchFrame, x: number, z: number, half: number) {
    const h = 3.2
    const make = (sx: number) => {
      const g = new Group()
      const glass = new Mesh(new PlaneGeometry(half, h), MAT.glass)
      glass.position.y = h / 2
      g.add(glass)
      const frame = new Mesh(new BoxGeometry(0.06, h, 0.06), MAT.brass)
      frame.position.set((sx * half) / 2, h / 2, 0.01)
      g.add(frame)
      g.position.set(x - (sx * half) / 2, 0, z)
      this.group.add(g)
      return g
    }
    this.left = make(1)
    this.right = make(-1)
    // Door frame and a permanent collider (the exit is a trigger, not a walkway).
    f.box(MAT.brass, x, h + 0.06, z, half * 2 + 0.2, 0.12, 0.2)
    f.box(MAT.brass, x - half - 0.05, h / 2, z, 0.1, h, 0.2)
    f.box(MAT.brass, x + half + 0.05, h / 2, z, 0.1, h, 0.2)
    f.collider(x, z - 0.05, half * 2, 0.4, 3)
  }

  update(dt: number): void {
    this.open += (this.target - this.open) * Math.min(1, dt * 4)
    const half = MALL.doorHalf
    this.left.position.x = -half / 2 - this.open * half * 0.95
    this.right.position.x = half / 2 + this.open * half * 0.95
  }
}

export async function buildShell(
  scene: Object3D,
  batcher: Batcher,
  colliders: CollisionWorld,
  layout: MallLayout,
  quality: QualitySettings,
  kit: Kit | null = null,
): Promise<ShellHandles> {
  const f = batcher.frame(new Matrix4(), colliders)
  const { plazaHalf: W, plazaDepth: A, corridorHalf: B, shopDepth: SD, shopLen: SL, atriumHeight: AH, boulevardHeight: BH, shopHeight: SH } = MALL
  const root = new Group()
  root.name = 'shell'
  scene.add(root)
  const marble = storeTexture('/textures/marble.jpg', [1, 1])

  // ------------------------------------------------------------ plaza floor
  const atriumFloorMat = new MeshStandardMaterial({
    map: repeatTex(marble, (2 * W) / 4, A / 4),
    roughness: 0.18,
    metalness: 0.05,
    transparent: false,
    opacity: 0.8,
  })
  root.add(floorPlane(layout.atrium, atriumFloorMat))

  // Reflection under the plaza floor (High quality only).
  let reflector: Reflector | null = null
  const makeReflector = () => {
    if (reflector) return reflector
    reflector = new Reflector(new PlaneGeometry(2 * W, A), {
      textureWidth: Math.round(window.innerWidth * 0.5),
      textureHeight: Math.round(window.innerHeight * 0.5),
      color: 0xb8b0b4,
      clipBias: 0.003,
    })
    reflector.rotation.x = -Math.PI / 2
    reflector.position.set(0, -0.002, -A / 2)
    root.add(reflector)
    return reflector
  }

  // Medallion with the mall logo, between the entrance and the stage seating.
  const mid = -A / 2
  const medZ = -9.5
  const ring = new Mesh(new RingGeometry(3.3, 3.6, 72), MAT.brass)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(0, 0.005, medZ)
  root.add(ring)
  const disc = new Mesh(new CircleGeometry(3.3, 72), tintMat('#efe7dc', 1, 0.4))
  disc.rotation.x = -Math.PI / 2
  disc.position.set(0, 0.004, medZ)
  root.add(disc)
  logoTexture(null, 1024, 300).then((tex) => {
    const logo = new Mesh(new PlaneGeometry(5.2, 1.5), imageMat(tex, { transparent: true }))
    logo.rotation.x = -Math.PI / 2
    logo.position.set(0, 0.006, medZ)
    root.add(logo)
  })

  const wall = (fr: BatchFrame, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat = MAT.wall) =>
    fr.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, T), y1 - y0, Math.max(z1 - z0, T), {
      collide: y0 < 1.9,
      occlude: true,
    })

  // ------------------------------------------------------------ plaza walls
  const D = MALL.doorHalf
  // Entrance façade (z = 0) with the door opening.
  wall(f, -W - T, 0, -D, T, 0, AH)
  wall(f, D, 0, W + T, T, 0, AH)
  wall(f, -D, 0, D, T, 3.3, AH)
  // Plaza back wall beside the north wing mouth, and the corners the wings don't cover.
  const north = layout.wings.find((w) => w.id === 'north')
  const northOuter = north ? B + SD : 0
  if (north) {
    wall(f, -W - T, -A - T, -northOuter, -A, 0, AH)
    wall(f, northOuter, -A - T, W + T, -A, 0, AH)
  } else wall(f, -W - T, -A - T, W + T, -A, 0, AH)
  for (const side of [-1, 1]) {
    const wing = layout.wings.find((w) => w.id === (side < 0 ? 'west' : 'east'))
    if (wing) {
      // The wing's shops cover the plaza side wall; close what's left above them.
      const zc = wing.origin.z
      const reach = B + SD
      if (zc + reach < 0) wall(f, side < 0 ? -W - T : W, zc + reach, side < 0 ? -W : W + T, 0, 0, AH)
      if (zc - reach > -A) wall(f, side < 0 ? -W - T : W, -A, side < 0 ? -W : W + T, zc - reach, 0, AH)
    } else wall(f, side < 0 ? -W - T : W, -A, side < 0 ? -W : W + T, 0, 0, AH)
  }

  // ----------------------------------------------------------------- wings
  for (const wing of layout.wings) buildWing(wing)

  function buildWing(wing: Wing): void {
    const base = new Matrix4().makeRotationY(wing.yaw).setPosition(wing.origin.x, 0, wing.origin.z)
    const wf = batcher.frame(base, colliders)
    const len = wing.len
    const group = new Group()
    group.position.set(wing.origin.x, 0, wing.origin.z)
    group.rotation.y = wing.yaw
    root.add(group)

    // Corridor floor
    const floor = new Mesh(new PlaneGeometry(2 * B, len), new MeshStandardMaterial({ map: repeatTex(marble, (2 * B) / 4, len / 4), roughness: 0.22 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0, -len / 2)
    group.add(floor)

    // Corridor end and the header over the mouth.
    wall(wf, -B, -len - T, B, -len, 0, BH)
    wall(wf, -B, -T, B, 0, BH, AH)

    // Back wall of each unit (units can be deeper, e.g. anchor stores) and the
    // separators between units, as long as the deeper neighbour.
    const depthOf = (k: number) => {
      const slot = wing.def.slots[k]
      return slot ? (brandById.get(slot)?.depth ?? SD) : 0
    }
    const rows = Math.ceil(wing.def.slots.length / 2)
    for (const side of [-1, 1]) {
      const first = side < 0 ? 0 : 1
      for (let r = 0; r < rows; r++) {
        const d = depthOf(first + r * 2)
        if (!d) continue
        const z1 = -r * SL
        if (side < 0) wall(wf, -B - d - T, z1 - SL, -B - d, z1, 0, SH)
        else wall(wf, B + d, z1 - SL, B + d + T, z1, 0, SH)
      }
      for (let r = 0; r <= rows; r++) {
        const d = Math.max(depthOf(first + (r - 1) * 2), depthOf(first + r * 2))
        if (!d) continue
        const z = -r * SL
        // The one at the mouth is plaza height.
        const h = r === 0 ? AH : SH
        if (side < 0) wall(wf, -B - d, z - T / 2, -B, z + T / 2, 0, h)
        else wall(wf, B, z - T / 2, B + d, z + T / 2, 0, h)
      }
    }

    // Shop fronts: an opening for shops, open for lounges, hoarding for Coming Soon.
    const wingShops = layout.shops.filter((x) => x.wing === wing.id)
    wingShops.forEach((s, k) => {
      const side = k % 2 === 0 ? -1 : 1
      const row = Math.floor(k / 2)
      const z1 = -row * SL
      const z0 = z1 - SL
      const zc = (z0 + z1) / 2
      const fx0 = side < 0 ? -B - T : B
      const fx1 = side < 0 ? -B : B + T
      if (s.kind === 'shop') {
        wall(wf, fx0, z0, fx1, zc - 3, 0, BH)
        wall(wf, fx0, zc + 3, fx1, z1, 0, BH)
        wall(wf, fx0, zc - 3, fx1, zc + 3, 3.9, BH)
      } else if (s.kind === 'soon') {
        wall(wf, fx0, z0, fx1, z1, 0, BH, MAT.wallWarm)
      } else {
        column(wf, side * (B + 0.3), z0 + 0.3, BH)
        column(wf, side * (B + 0.3), z1 - 0.3, BH)
        wall(wf, fx0, z0 + 0.4, fx1, z1 - 0.4, 3.9, BH)
      }
    })

    // Corridor ceiling (coves and pendants come from corridor.ts).
    wf.box(MAT.ceiling, 0, BH + 0.1, -len / 2, 2 * B, 0.2, len)

    // Wing name over the mouth (faces the plaza, local +Z).
    const sign = new Mesh(new PlaneGeometry(5, 1.25), imageMat(labelSign(wing.def.nameEn, wing.def.nameAr, { bg: '#f4ede3', fg: '#6b4f35', h: 256 })))
    sign.position.set(0, 6.75, 0.08)
    group.add(sign)
    wf.box(MAT.brass, 0, 6.75, 0.04, 5.2, 1.4, 0.04)
  }

  // -------------------------------------------------------------- ceilings
  const slab = (x0: number, z0: number, x1: number, z1: number, y: number) =>
    f.box(MAT.ceiling, (x0 + x1) / 2, y + 0.1, (z0 + z1) / 2, x1 - x0, 0.2, z1 - z0)
  // Plaza with a skylight opening.
  const sky = { x0: -10, z0: -25, x1: 10, z1: -9 }
  slab(-W, -A, W, sky.z0, AH)
  slab(-W, sky.z1, W, 0, AH)
  slab(-W, sky.z0, sky.x0, sky.z1, AH)
  slab(sky.x1, sky.z0, W, sky.z1, AH)
  const wellH = 0.8
  f.box(MAT.wall, 0, AH + wellH / 2, sky.z0, sky.x1 - sky.x0, wellH, 0.1)
  f.box(MAT.wall, 0, AH + wellH / 2, sky.z1, sky.x1 - sky.x0, wellH, 0.1)
  f.box(MAT.wall, sky.x0, AH + wellH / 2, (sky.z0 + sky.z1) / 2, 0.1, wellH, sky.z1 - sky.z0)
  f.box(MAT.wall, sky.x1, AH + wellH / 2, (sky.z0 + sky.z1) / 2, 0.1, wellH, sky.z1 - sky.z0)
  for (let x = sky.x0 + 3; x < sky.x1; x += 3) f.box(MAT.brass, x, AH + 0.3, (sky.z0 + sky.z1) / 2, 0.08, 0.12, sky.z1 - sky.z0)
  for (let z = sky.z0 + 3; z < sky.z1; z += 3) f.box(MAT.brass, 0, AH + 0.3, z, sky.x1 - sky.x0, 0.12, 0.08)
  const skyPlane = new Mesh(new PlaneGeometry(sky.x1 - sky.x0, sky.z1 - sky.z0), imageMat(gradientTexture([[0, '#cfe6f7'], [1, '#ffffff']])))
  skyPlane.rotation.x = Math.PI / 2
  skyPlane.position.set(0, AH + wellH, (sky.z0 + sky.z1) / 2)
  root.add(skyPlane)

  // Soft light shafts from the skylight (additive, Medium/High).
  const shafts = new Group()
  const shaftTex = gradientTexture([[0, 'rgba(255,255,255,0.0)'], [0.15, 'rgba(255,250,240,0.55)'], [1, 'rgba(255,250,240,0)']])
  for (let i = 0; i < 5; i++) {
    const m = new Mesh(new PlaneGeometry(3.4, AH + 1), glowMat(shaftTex, '#fff6ea', 0.15))
    m.position.set(-7 + i * 3.6, AH / 2, mid + 2 - (i % 2) * 2.5)
    m.rotation.set(0, i * 0.6, 0.18)
    shafts.add(m)
  }
  root.add(shafts)
  f.box(MAT.lightWarm, 0, AH - 0.4, -0.2, 2 * W, 0.08, 0.06)

  // Shop ceilings with square light panels, and their floors.
  for (const s of layout.shops) {
    const { x0, x1, z0, z1 } = s.rect
    slab(x0, z0, x1, z1, SH)
    const along = x1 - x0 > z1 - z0
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const u = (i + 0.5) / 3
        const v = (j + 0.5) / 2
        const x = x0 + (x1 - x0) * (along ? u : v)
        const z = z0 + (z1 - z0) * (along ? v : u)
        f.box(MAT.lightPanel, x, SH - 0.02, z, 1.3, 0.04, 1.3)
      }
    const stone = storeTexture('/textures/marble.jpg', [(x1 - x0) / 4, (z1 - z0) / 4])
    const floorColor = s.kind === 'soon' ? '#e6dccd' : '#f6efe4'
    root.add(floorPlane(s.rect, new MeshStandardMaterial({ map: stone, color: floorColor, roughness: 0.35 }), 0.002))
  }

  // ------------------------------------------------------- plaza features
  for (const [x, z] of [[-8, -6], [8, -6], [-8, -28], [8, -28]] as const) column(f, x, z, AH)
  const plants: [number, number, number][] = [[-14, -30, 1.4], [14, -30, 1.4], [-19.5, -2, 1.3], [19.5, -2, 1.3], [-19.5, -31.5, 1.2], [19.5, -31.5, 1.2], [9.4, -19, 1.1]]
  plants.forEach(([x, z, sc], i) => {
    if (!kit?.placeBatched('plant', f, x, z, i * 1.3, colliders)) plant(f, x, z, sc, 11 + i)
  })
  // Side benches by the entrance.
  bench(f, -12, -4.5, 2.4)
  bench(f, -12, -11.5, 2.4)

  // Mall logo above the north wing mouth (over the wing name).
  f.box(MAT.brass, 0, 8.25, -A + 0.06, 4.6, 1.4, 0.04)
  logoTexture('#fdf7fa', 1024, 288).then((tex) => {
    const m = new Mesh(new PlaneGeometry(4.4, 1.24), imageMat(tex))
    m.position.set(0, 8.25, -A + 0.1)
    root.add(m)
  })

  // Signs on the inner face of the entrance (seen when leaving).
  const exitSign = new Mesh(new PlaneGeometry(2.4, 0.6), imageMat(labelSign('Exit', 'خروج', { bg: '#8a6a46', fg: '#f4ede3' })))
  exitSign.position.set(0, 3.9, -0.08)
  exitSign.rotation.y = Math.PI
  root.add(exitSign)
  const thanks = new Mesh(new PlaneGeometry(8, 1.6), imageMat(labelSign('Thank you for visiting 122 Mall', 'شكراً لزيارتك ١٢٢ مول', { bg: '#f4ede3', fg: '#6b4f35', h: 256 })))
  thanks.position.set(0, 6.5, -0.08)
  thanks.rotation.y = Math.PI
  root.add(thanks)

  // Directory totem near the spawn point: every shop with its wing.
  const arrowOf = { west: '←', north: '↑', east: '→' } as const
  const entries: DirectoryEntry[] = layout.shops
    .filter((s) => s.kind !== 'lounge' || s.amenity === 'studio')
    .map((s) => ({
      title: s.kind === 'lounge' ? 'Styling Studio' : (s.brand?.name ?? s.id),
      titleAr: s.kind === 'lounge' ? 'ستوديو الستايلينج' : (s.brand?.nameAr ?? ''),
      arrow: s.wing ? arrowOf[s.wing] : '↑',
      color: s.kind === 'shop' ? (s.brand?.color ?? '#ddd') : '#d8cbb8',
    }))
  entries.push({ title: 'Cashier', titleAr: 'الكاشير', arrow: '→', color: BRAND.magenta })
  const totem = new Group()
  totem.position.set(-3.4, 0, -7.2)
  totem.rotation.y = 0.35
  const totemFrame = batcher.frame(totem.matrix.clone().compose(totem.position, totem.quaternion, totem.scale), colliders)
  totemFrame.block(MAT.brass, 0, 0, 0, 1.5, 0.12, 0.42, { collide: true })
  totemFrame.block(MAT.wall, 0, 0.12, 0, 1.36, 2.7, 0.3)
  const dir = new Mesh(new PlaneGeometry(1.25, 2.5), imageMat(directoryTexture(entries)))
  dir.position.set(0, 1.47, 0.16)
  totem.add(dir)
  root.add(totem)

  // Entrance doors (the exit trigger).
  const doors = new SlidingDoors(f, 0, 0, D)
  root.add(doors.group)

  const setQuality = (q: QualitySettings) => {
    setGlowsVisible(q.fancyDecor)
    shafts.visible = q.fancyDecor
    if (q.reflections) {
      makeReflector().visible = true
      atriumFloorMat.transparent = true
    } else {
      if (reflector) reflector.visible = false
      atriumFloorMat.transparent = false
    }
    atriumFloorMat.needsUpdate = true
  }
  setQuality(quality)
  let reflectionsOn = quality.reflections

  return {
    doors,
    setQuality: (q) => {
      reflectionsOn = q.reflections
      setQuality(q)
    },
    update: (px, pz) => {
      // Only pay for the mirror pass while the plaza can be seen.
      if (reflector) reflector.visible = reflectionsOn && Math.abs(px) < W + 26 && pz > -A - 26
    },
  }
}
