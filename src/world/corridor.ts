// Warm-luxury finishing for one wing corridor, built in the wing's local frame
// (origin = mouth on the plaza, local −Z away from it, corridor x ±6):
// bronze floor inlays + marble stars, islands (planters + bench), pendant
// lights with halos, ceiling coves. Tasks 8–9 add screens, storefront
// framing, portal, wayfinding and the end wall.

import { Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three'
import { MALL, toWorld, type ShopLayout, type Wing } from '../config/layout'
import type { Batcher } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import type { Interaction } from '../interact/interaction'
import type { Kit } from './kit'
import { imageMat, MAT, tintMat } from './materials'
import { plant } from './props'
import { addContactShadow } from './decals'
import { addHalo } from './glow'
import { doormatTexture, starInlayTexture } from './signage'
import { ScreenFeed, registerScreen, screenMesh, type ScreenActions } from './screens'

export interface CorridorCtx {
  root: Object3D
  batcher: Batcher
  colliders: CollisionWorld
  interaction: Interaction
  kit: Kit | null
  actions: ScreenActions
}

let starGeo: PlaneGeometry | null = null
let starMat: MeshBasicMaterial | null = null

export function buildCorridor(ctx: CorridorCtx, wing: Wing, shops: ShopLayout[]): { feeds: ScreenFeed[] } {
  const B = MALL.corridorHalf
  const BH = MALL.boulevardHeight
  const L = MALL.shopLen
  const len = wing.len
  const rows = Math.ceil(wing.def.slots.length / 2)
  const base = new Matrix4().makeRotationY(wing.yaw).setPosition(wing.origin.x, 0, wing.origin.z)
  const wf = ctx.batcher.frame(base, ctx.colliders)
  const group = new Group()
  group.position.set(wing.origin.x, 0, wing.origin.z)
  group.rotation.y = wing.yaw
  ctx.root.add(group)
  group.updateMatrixWorld(true)
  const w = (x: number, z: number) => toWorld(wing.origin, wing.yaw, x, z)
  const cream = tintMat('#f3ece4', 1, 0.8)
  const plum = tintMat('#6d3d8f', 1, 0.9)

  // ---------------------------------------------------------- floor inlays
  for (const x of [-1.8, 1.8]) wf.box(MAT.brass, x, 0.003, -len / 2, 0.06, 0.004, len - 0.6)
  starGeo ??= new PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2)
  starMat ??= new MeshBasicMaterial({ map: starInlayTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
  for (let r = 0; r < rows; r++) wf.custom(starGeo, starMat, 0, 0.004, -(r + 0.5) * L)

  // ---------------------------------------------------------------- islands
  for (let r = 1; r < rows; r++) {
    const z = -r * L
    wf.block(cream, 0, 0, z, 0.62, 0.3, 2.4, { collide: true })
    wf.block(plum, 0, 0.3, z, 0.58, 0.13, 2.36)
    wf.block(MAT.brass, 0, 0, z, 0.66, 0.04, 2.44)
    for (const dz of [-1.9, 1.9]) {
      if (!ctx.kit?.place('plant', group, 0, z + dz, dz < 0 ? 0 : Math.PI, ctx.colliders)) {
        wf.cyl(MAT.marbleTop, 0, 0, z + dz, 0.55, 0.55, { collide: true })
        plant(wf, 0, z + dz, 1.1, 90 + r * 2 + (dz < 0 ? 0 : 1))
      }
    }
    const c = w(0, z)
    addContactShadow(c.x, c.z, 1.7, 5.8, wing.yaw)
  }

  // ---------------------------------------------------------------- pendants
  for (let z = -3; z > -len + 1; z -= 6)
    for (const x of [-2.6, 2.6]) {
      wf.cyl(MAT.brass, x, 4.3, z, 0.015, BH - 4.3)
      wf.sphere(MAT.lightWarm, x, 4.3, z, 0.18)
      const p = w(x, z)
      addHalo(p.x, 4.3, p.z, 0.42)
    }

  // ---------------------------------------------------------- ceiling coves
  for (const s of [-1, 1]) {
    wf.box(MAT.lightWarm, s * 5.7, BH - 0.05, -len / 2, 0.08, 0.06, len - 0.4)
    wf.box(MAT.brass, s * 5.45, BH - 0.12, -len / 2, 0.05, 0.12, len - 0.4)
  }

  // ------------------------------------------------------- column screens
  // On the solid wall between two storefronts (each row boundary), both sides.
  const brandIds = shops.filter((s) => s.kind === 'shop' && s.brand).map((s) => s.brand!.id)
  const feed = new ScreenFeed({ kinds: ['flash', 'brand'], brandIds, portrait: true })
  for (let r = 1; r < rows; r++)
    for (const side of [-1, 1]) {
      const z = -r * L
      wf.box(MAT.black, side * (B - 0.05), 1.9, z, 0.06, 1.62, 0.92)
      wf.box(MAT.brass, side * (B - 0.04), 1.9, z, 0.04, 1.7, 1.0)
      const m = screenMesh(feed, 0.84, 1.5)
      m.position.set(side * (B - 0.09), 1.9, z)
      m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
      group.add(m)
      feed.addScreen(m)
      registerScreen(ctx.interaction, m.children[0], feed, ctx.actions)
    }

  // ---------------------------------------------------- storefront finishing
  for (const s of shops) {
    if (s.kind !== 'shop') continue
    const sf = ctx.batcher.frame(new Matrix4().makeRotationY(s.yaw).setPosition(s.entrance.x, 0, s.entrance.z), ctx.colliders)
    for (const x of [-3.02, 3.02]) sf.box(MAT.brass, x, 1.95, 0.03, 0.08, 3.9, 0.06)
    sf.box(MAT.brass, 0, 3.93, 0.03, 6.12, 0.08, 0.06)
    sf.box(MAT.lightWarm, 0, 4.14, 0.05, 5.6, 0.07, 0.03)
    for (const x of [-4.55, 4.55]) sf.box(MAT.lightWarm, x, 0.47, 0.07, 1.9, 0.03, 0.04)
    if (s.brand) {
      const mat = new Mesh(new PlaneGeometry(2.4, 1.2), imageMat(doormatTexture({ initials: s.brand.initials, color: s.brand.color, logo: s.brand.logo })))
      const p = toWorld(s.entrance, s.yaw, 0, 0.75)
      // Flat on the floor (X -90deg), then turned with the shop (Y first in YXZ order).
      mat.rotation.set(-Math.PI / 2, s.yaw, 0, 'YXZ')
      mat.position.set(p.x, 0.006, p.z)
      ctx.root.add(mat)
    }
  }

  return { feeds: [feed] }
}
