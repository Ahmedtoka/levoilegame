// The mall shell: floors, walls, ceilings, skylight, entrance doors and atrium decor.

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
import { MALL, type MallLayout, type Rect } from '../config/layout'
import type { Batcher, BatchFrame } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import type { QualitySettings } from '../engine/quality'
import { gradientTexture, marbleTexture, woodTexture } from '../engine/textures'
import { BRAND } from '../config/brand'
import { glowMat, imageMat, MAT, tintMat } from './materials'
import { bench, column, plant } from './props'
import { directoryTexture, labelSign, logoTexture } from './signage'

export interface ShellHandles {
  doors: SlidingDoors
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
): Promise<ShellHandles> {
  const f = batcher.frame(new Matrix4(), colliders)
  const { halfWidth: W, atriumDepth: A, boulevardHalf: B, atriumHeight: AH, boulevardHeight: BH, shopHeight: SH } = MALL
  const zEnd = layout.bounds.z0
  const root = new Group()
  root.name = 'shell'
  scene.add(root)

  // ---------------------------------------------------------------- floors
  const marble = marbleTexture([1, 1])
  const atriumFloorMat = new MeshStandardMaterial({
    map: repeatTex(marble, (2 * W) / 4, A / 4),
    roughness: 0.18,
    metalness: 0.05,
    transparent: false,
    opacity: 0.8,
  })
  root.add(floorPlane(layout.atrium, atriumFloorMat))
  const blvdFloor = new MeshStandardMaterial({ map: repeatTex(marble, (2 * B) / 4, -zEnd / 4), roughness: 0.22 })
  root.add(floorPlane(layout.boulevard, blvdFloor))

  // Reflection under the atrium floor (High quality only).
  let reflector: Reflector | null = null
  const makeReflector = () => {
    if (reflector) return reflector
    const geo = new PlaneGeometry(2 * W, A)
    reflector = new Reflector(geo, {
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

  // Runner down the boulevard and a medallion in the atrium.
  const runner = new Mesh(new PlaneGeometry(2.6, -zEnd - A - 1), tintMat('#efd7e3', 1, 0.95))
  runner.rotation.x = -Math.PI / 2
  runner.position.set(0, 0.004, (zEnd + -A) / 2)
  root.add(runner)
  const ring = new Mesh(new RingGeometry(2.3, 2.6, 64), MAT.magenta)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(0, 0.005, -12)
  root.add(ring)
  const disc = new Mesh(new CircleGeometry(2.3, 64), tintMat('#f8eef3', 1, 0.4))
  disc.rotation.x = -Math.PI / 2
  disc.position.set(0, 0.004, -12)
  root.add(disc)
  logoTexture(null, 1024, 300).then((tex) => {
    const logo = new Mesh(new PlaneGeometry(3.6, 1.05), imageMat(tex, { transparent: true }))
    logo.rotation.x = -Math.PI / 2
    logo.position.set(0, 0.006, -12)
    root.add(logo)
  })

  // ----------------------------------------------------------------- walls
  const wall = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat = MAT.wall) =>
    f.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, T), y1 - y0, Math.max(z1 - z0, T), {
      collide: y0 < 1.9,
      occlude: true,
    })

  // Entrance wall (z = 0) with the door opening.
  const D = MALL.doorHalf
  wall(-W - T, 0, -D, T, 0, AH)
  wall(D, 0, W + T, T, 0, AH)
  wall(-D, 0, D, T, 3.3, AH)
  // Atrium side walls
  wall(-W - T, -A, -W, 0, 0, AH)
  wall(W, -A, W + T, 0, 0, AH)
  // Header over the boulevard mouth (carries the big logo).
  wall(-B, -A - T, B, -A, BH, AH)
  // Outer walls along the shops and the boulevard end.
  wall(-W - T, zEnd, -W, -A, 0, SH)
  wall(W, zEnd, W + T, -A, 0, SH)
  wall(-B, zEnd - T, B, zEnd, 0, BH)

  const doneSide = new Set<string>()
  for (const s of layout.shops) {
    const { x0, x1, z0, z1 } = s.rect
    for (const z of [z0, z1]) {
      const key = `${s.side}${z}`
      if (doneSide.has(key)) continue
      doneSide.add(key)
      const h = z === -A ? AH : SH
      wall(x0, z - T / 2, x1, z + T / 2, 0, h)
    }
    // Front wall towards the boulevard with an opening (lounges are open).
    const fx0 = s.side === 'L' ? -B - T : B
    const fx1 = s.side === 'L' ? -B : B + T
    const zc = s.entrance.z
    const open = s.kind === 'lounge' ? MALL.shopLen / 2 - 0.4 : 3
    if (s.kind === 'shop') {
      wall(fx0, z0, fx1, zc - open, 0, BH)
      wall(fx0, zc + open, fx1, z1, 0, BH)
    } else {
      column(f, s.side === 'L' ? -B - 0.3 : B + 0.3, z0 + 0.3, BH)
      column(f, s.side === 'L' ? -B - 0.3 : B + 0.3, z1 - 0.3, BH)
    }
    wall(fx0, zc - open, fx1, zc + open, 3.9, BH)
  }

  // -------------------------------------------------------------- ceilings
  const slab = (x0: number, z0: number, x1: number, z1: number, y: number) =>
    f.box(MAT.ceiling, (x0 + x1) / 2, y + 0.1, (z0 + z1) / 2, x1 - x0, 0.2, z1 - z0)
  // Atrium with a skylight opening.
  const sky = { x0: -9, z0: -17, x1: 9, z1: -5 }
  slab(-W, -A, W, sky.z0, AH)
  slab(-W, sky.z1, W, 0, AH)
  slab(-W, sky.z0, sky.x0, sky.z1, AH)
  slab(sky.x1, sky.z0, W, sky.z1, AH)
  // Light well and mullions
  const wellH = 0.8
  f.box(MAT.wall, 0, AH + wellH / 2, sky.z0, sky.x1 - sky.x0, wellH, 0.1)
  f.box(MAT.wall, 0, AH + wellH / 2, sky.z1, sky.x1 - sky.x0, wellH, 0.1)
  f.box(MAT.wall, sky.x0, AH + wellH / 2, (sky.z0 + sky.z1) / 2, 0.1, wellH, sky.z1 - sky.z0)
  f.box(MAT.wall, sky.x1, AH + wellH / 2, (sky.z0 + sky.z1) / 2, 0.1, wellH, sky.z1 - sky.z0)
  for (let x = sky.x0 + 3; x < sky.x1; x += 3) f.box(MAT.brass, x, AH + 0.3, (sky.z0 + sky.z1) / 2, 0.08, 0.12, sky.z1 - sky.z0)
  for (let z = sky.z0 + 3; z < sky.z1; z += 3) f.box(MAT.brass, 0, AH + 0.3, z, sky.x1 - sky.x0, 0.12, 0.08)
  const skyMat = imageMat(gradientTexture([[0, '#cfe6f7'], [1, '#ffffff']]))
  const skyPlane = new Mesh(new PlaneGeometry(sky.x1 - sky.x0, sky.z1 - sky.z0), skyMat)
  skyPlane.rotation.x = Math.PI / 2
  skyPlane.position.set(0, AH + wellH, (sky.z0 + sky.z1) / 2)
  root.add(skyPlane)

  // Soft light shafts from the skylight (additive, Medium/High).
  const shafts = new Group()
  const shaftTex = gradientTexture([[0, 'rgba(255,255,255,0.0)'], [0.15, 'rgba(255,250,240,0.55)'], [1, 'rgba(255,250,240,0)']])
  for (let i = 0; i < 4; i++) {
    const m = new Mesh(new PlaneGeometry(3.4, AH + 1), glowMat(shaftTex, '#fff6ea', 0.16))
    m.position.set(-5 + i * 3.6, AH / 2, -11 + (i % 2) * 1.5)
    m.rotation.set(0, i * 0.6, 0.18)
    shafts.add(m)
  }
  root.add(shafts)

  // Cove light strips around the atrium top.
  f.box(MAT.lightWarm, -W + 0.05, AH - 0.4, -A / 2, 0.06, 0.08, A)
  f.box(MAT.lightWarm, W - 0.05, AH - 0.4, -A / 2, 0.06, 0.08, A)

  // Boulevard ceiling + light strips
  slab(-B, zEnd, B, -A, BH)
  for (let z = -A - 2; z > zEnd + 1; z -= 4) {
    f.box(MAT.lightPanel, -3, BH - 0.02, z - 1.5, 0.18, 0.04, 3)
    f.box(MAT.lightPanel, 3, BH - 0.02, z - 1.5, 0.18, 0.04, 3)
  }
  // Shop ceilings with square light panels
  for (const s of layout.shops) {
    const { x0, x1, z0, z1 } = s.rect
    slab(x0, z0, x1, z1, SH)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const x = x0 + ((x1 - x0) * (i + 0.5)) / 3
        const z = z0 + ((z1 - z0) * (j + 0.5)) / 2
        f.box(MAT.lightPanel, x, SH - 0.02, z, 1.3, 0.04, 1.3)
      }
    // Shop floor (wood tinted to the section colour)
    const tint = s.style?.tint ?? '#efd7e3'
    const wood = woodTexture(tint, [(x1 - x0) / 3, (z1 - z0) / 3], s.index + 3)
    root.add(floorPlane(s.rect, new MeshStandardMaterial({ map: wood, roughness: 0.55 }), 0.002))
  }

  // ------------------------------------------------------- atrium features
  for (const [x, z] of [[-6.5, -7], [6.5, -7], [-6.5, -16.5], [6.5, -16.5]] as const) column(f, x, z, AH)
  plant(f, -12, -15, 1.6, 11)
  plant(f, -15.5, -19.5, 1.2, 12)
  plant(f, 15.5, -19.5, 1.2, 13)
  plant(f, -18.5, -2, 1.3, 14)
  plant(f, 18.5, -2, 1.3, 15)
  plant(f, 9.4, -19, 1.1, 16)
  bench(f, -12, -11.5, 2.4)
  bench(f, -12, -18.5, 2.4)

  // Big logo above the boulevard mouth.
  f.box(MAT.brass, 0, 7.5, -A + 0.06, 9.4, 2.5, 0.06)
  f.box(MAT.wall, 0, 7.5, -A + 0.1, 9.2, 2.3, 0.06)
  logoTexture('#fdf7fa', 1024, 256).then((tex) => {
    const m = new Mesh(new PlaneGeometry(9.2, 2.3), imageMat(tex))
    m.position.set(0, 7.5, -A + 0.14)
    root.add(m)
  })
  // Welcome sign on the inner face of the entrance (seen when leaving).
  const exitSign = new Mesh(new PlaneGeometry(2.4, 0.6), imageMat(labelSign('Exit', 'خروج', { bg: BRAND.magenta, fg: '#ffffff' })))
  exitSign.position.set(0, 3.9, -0.08)
  exitSign.rotation.y = Math.PI
  root.add(exitSign)
  const thanks = new Mesh(new PlaneGeometry(8, 1.6), imageMat(labelSign('Thank you for visiting', 'شكراً لزيارتك', { bg: '#fdf7fa', h: 256 })))
  thanks.position.set(0, 6.5, -0.08)
  thanks.rotation.y = Math.PI
  root.add(thanks)

  // Directory totem near the spawn point.
  const entries = layout.shops
    .filter((s) => s.section)
    .map((s) => ({
      title: s.section!.title,
      titleAr: s.section!.titleAr,
      arrow: s.side === 'L' ? '←' : '→',
      color: s.style!.tint,
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
    update: (_px, pz) => {
      // Only pay for the mirror pass when the atrium can be seen.
      if (reflector) reflector.visible = reflectionsOn && pz > -A - 26
    },
  }
}
