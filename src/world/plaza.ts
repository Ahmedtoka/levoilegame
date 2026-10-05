// The plaza's events stage: oak + bronze stage with steps, a two-faced LED
// screen (front: live carousel; back: brand reel), a lighting truss with
// cones, three curved rows of seating, planters and portrait screens on the
// plaza columns. Static parts are batched; screens share feeds.

import { Matrix4, type Object3D } from 'three'
import type { Batcher } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import type { Interaction } from '../interact/interaction'
import type { Kit } from './kit'
import { MAT, tintMat } from './materials'
import { premiumPlanter } from './props'
import { arcSeats, stageWatchSpots, type SeatPose } from './plazaMath'
import { addContactShadow } from './decals'
import { addCone } from './glow'
import { ScreenFeed, registerScreen, screenMesh, type ScreenActions } from './screens'
import { addBanner, bannerSlides } from './banners'
import { BRANDS } from '../config/mall'
import { catalog } from '../state/store'

export const STAGE = { x: 0, z: -21.5, screenZ: -22.9 } as const

export interface PlazaCtx {
  root: Object3D
  batcher: Batcher
  colliders: CollisionWorld
  interaction: Interaction
  kit: Kit | null
  actions: ScreenActions
}

export function stageSpots(): SeatPose[] {
  return stageWatchSpots(STAGE.x, STAGE.z, 11, 6, 0.5)
}

const openBrandIds = (): string[] => {
  const have = new Set(catalog().sections.map((x) => x.id))
  return BRANDS.filter((b) => b.status === 'open' && have.has(b.id)).map((b) => b.id)
}

export function buildPlaza(ctx: PlazaCtx): { feeds: ScreenFeed[] } {
  const f = ctx.batcher.frame(new Matrix4(), ctx.colliders)
  const oak = tintMat('#b98a5c', 1, 0.55)
  const cream = tintMat('#f3ece4', 1, 0.8)
  const plum = tintMat('#6d3d8f', 1, 0.9)
  const { x: sx, z: sz } = STAGE

  // ------------------------------------------------------------ the stage
  f.block(cream, sx, 0, sz, 9, 0.4, 4.5, { collide: true })
  f.block(oak, sx, 0.4, sz, 9.04, 0.05, 4.54)
  f.box(MAT.brass, sx, 0.425, sz + 2.27, 9.06, 0.06, 0.04)
  f.box(MAT.lightWarm, sx, 0.33, sz + 2.26, 8.6, 0.05, 0.02)
  f.block(cream, sx, 0, sz + 2.45, 7, 0.3, 0.4, { collide: true })
  f.block(cream, sx, 0, sz + 2.8, 7, 0.16, 0.3, { collide: true })
  addContactShadow(sx, sz, 10.5, 6.5)

  // ------------------------------------------------------- LED screen
  const sz2 = STAGE.screenZ
  // Slim bronze bezel (6 cm) around a black surround; the screen sits 1 cm proud of it.
  for (const px of [-3.68, 3.68]) f.block(MAT.brass, px, 0.45, sz2, 0.2, 6.2, 0.2)
  f.box(MAT.brass, sx, 4.47, sz2, 7.2, 4.14, 0.12)
  f.box(MAT.black, sx, 4.47, sz2, 7.08, 4.02, 0.18)
  const front = new ScreenFeed({ kinds: ['flash', 'deal', 'brand', 'games', 'welcome'], brandIds: openBrandIds(), portrait: false })
  const back = new ScreenFeed({ kinds: ['brand'], brandIds: openBrandIds(), portrait: false, interval: 4 })
  const fm = screenMesh(front, 7, 3.94)
  fm.position.set(sx, 4.47, sz2 + 0.1)
  ctx.root.add(fm)
  front.addScreen(fm)
  registerScreen(ctx.interaction, fm.children[0], front, ctx.actions)
  const bm = screenMesh(back, 7, 3.94)
  bm.position.set(sx, 4.47, sz2 - 0.1)
  bm.rotation.y = Math.PI
  ctx.root.add(bm)
  back.addScreen(bm)
  registerScreen(ctx.interaction, bm.children[0], back, ctx.actions)

  // ------------------------------------------------------- lighting truss
  const tz0 = sz - 1.8
  const tz1 = sz + 1.7
  for (const px of [-5, 5]) {
    f.block(MAT.brass, px, 0, tz0, 0.3, 7.35, 0.3, { collide: true })
    f.box(MAT.brass, px, 7.2, (tz0 + tz1) / 2, 0.3, 0.3, tz1 - tz0)
  }
  f.box(MAT.brass, sx, 7.2, tz0, 10.3, 0.3, 0.3)
  f.box(MAT.brass, sx, 7.2, tz1, 10.3, 0.3, 0.3)
  for (const cx of [-3.75, -2.25, -0.75, 0.75, 2.25, 3.75]) {
    f.cyl(MAT.black, cx, 6.6, tz1, 0.13, 0.45)
    // Cone from the can down to the stage top, tilted back towards the stage.
    addCone(cx, 6.6, tz1, 6.2, 1.1, Math.atan2(1.2, 6.2), 0)
  }

  // ------------------------------------------------------- seating
  for (const s of arcSeats(sx, sz, [6.2, 7.6, 9], (48 * Math.PI) / 180, 2, 0.9)) {
    f.block(cream, s.x, 0, s.z, 0.86, 0.28, 0.55, { rotY: s.yaw, collide: true })
    f.block(plum, s.x, 0.28, s.z, 0.84, 0.13, 0.5, { rotY: s.yaw })
    f.block(MAT.brass, s.x, 0.0, s.z, 0.88, 0.04, 0.57, { rotY: s.yaw })
    addContactShadow(s.x, s.z, 1.15, 0.85, s.yaw)
  }

  // ------------------------------------------------------- planters
  for (const [px, pz] of [[-6.4, sz - 1.7], [6.4, sz - 1.7], [-6.4, sz + 2.3], [6.4, sz + 2.3]] as const) {
    premiumPlanter(f, px, pz, 70 + Math.round(px + pz), 1.1)
    addContactShadow(px, pz, 1.4, 1.4)
  }

  // ------------------------------------------------ plaza column screens
  // Columns at (±8, −6) and (±8, −28); the screen faces the plaza centre.
  const colFeed = new ScreenFeed({ kinds: ['flash', 'deal', 'brand', 'games'], brandIds: openBrandIds(), portrait: true })
  for (const [cx, cz] of [[-8, -6], [8, -6], [-8, -28], [8, -28]] as const) {
    const yaw = Math.atan2(sx - cx, sz - cz)
    // Thin bronze bezel plate behind the screen, sunk into the column.
    f.box(MAT.brass, cx + Math.sin(yaw) * 0.43, 2.1, cz + Math.cos(yaw) * 0.43, 1.07, 1.85, 0.06, { rotY: yaw })
    f.box(MAT.black, cx + Math.sin(yaw) * 0.445, 2.1, cz + Math.cos(yaw) * 0.445, 1.03, 1.81, 0.04, { rotY: yaw })
    const m = screenMesh(colFeed, 1.0, 1.78)
    m.position.set(cx + Math.sin(yaw) * 0.47, 2.1, cz + Math.cos(yaw) * 0.47)
    m.rotation.y = yaw
    ctx.root.add(m)
    colFeed.addScreen(m)
    registerScreen(ctx.interaction, m.children[0], colFeed, ctx.actions)
  }

  // ------------------------------------------------------ fabric banners
  // Four banners hang from the side coffer beams (bottom at 8.7 m), framing the stage.
  const ids = openBrandIds()
  ;[[-12, -13], [12, -13], [-12, -21], [12, -21]].forEach(([bx, bz], i) => {
    const order = ids.slice(i * 2).concat(ids.slice(0, i * 2))
    addBanner(ctx.root, f, bx, 8.3, bz, 0, 8.7, bannerSlides(order), i)
  })

  return { feeds: [front, back, colFeed] }
}
