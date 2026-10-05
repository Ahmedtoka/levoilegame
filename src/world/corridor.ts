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
import { addHalo, addPool } from './glow'
import { addAOStrip, aoCeilJunction, aoFloorJunction } from './aoStrips'
import { GYPSUM, marbleCladMat, oakVeneerMat, uvBox } from './finish'
import { BRAND } from '../config/brand'
import { canvasTexture, loadImage, loadProductTexture, makeCanvas } from '../engine/textures'
import { catalog } from '../state/store'
import { doormatTexture, starInlayTexture, wayfindingTexture, wingDirectoryTexture } from './signage'
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

/** A world point's z in the wing's local frame (distance along the corridor, negative away from the plaza). */
function toLocalZ(wing: Wing, p: { x: number; z: number }): number {
  const dx = p.x - wing.origin.x
  const dz = p.z - wing.origin.z
  return dx * Math.sin(wing.yaw) + dz * Math.cos(wing.yaw)
}

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
      if (!ctx.kit?.placeBatched('plant', wf, 0, z + dz, 0, ctx.colliders)) {
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
      wf.cyl(MAT.brass, x, 4.3, z, 0.022, BH - 4.3)
      wf.sphere(MAT.lightWarm, x, 4.3, z, 0.18)
      const p = w(x, z)
      addHalo(p.x, 4.3, p.z, 0.42)
      addPool(p.x, p.z, 2.8, 2.8)
    }

  // ------------------------------------------------------- ceiling tray
  // Gypsum soffit bands along both walls, 0.22 m below the ceiling, leave a recessed
  // central tray. Each band runs 2 cm into the wall and starts inside the portal beam
  // (whose underside is 2 cm lower), so none of its faces is coplanar with another.
  const SW = 1.5
  const sb = BH - 0.22
  const zs0 = -0.2
  const zs1 = -len - 0.02
  for (const s of [-1, 1]) {
    wf.box(GYPSUM, s * (B - SW / 2 + 0.01), (sb + BH + 0.05) / 2, (zs0 + zs1) / 2, SW + 0.02, BH + 0.05 - sb, zs0 - zs1)
    // Linear slot light set into the soffit underside along the tray edge (1.5 cm proud).
    wf.box(MAT.lightWarm, s * (B - SW + 0.1), sb - 0.005, (zs0 + zs1 + 0.01) / 2, 0.05, 0.02, zs0 - zs1 - 0.01)
    // Round spot cans every 3 m: bronze trim ring with a shallow lit lens dome below it
    // (the lens reuses the pendant globes' instanced sphere: no extra draw call).
    for (let z = -1.5; z > -len + 0.5; z -= 3) {
      wf.cyl(MAT.brass, s * (B - 0.75), sb - 0.025, z, 0.1, 0.07)
      wf.sphere(MAT.lightWarm, s * (B - 0.75), sb - 0.005, z, 0.068, 0.35)
    }
    // Wall/soffit junction shading on the soffit underside.
    aoCeilJunction(s * B, -0.3, s * B, -len, -s, 0, sb, wf.base, 0, 0.45)
  }

  // ------------------------------------------- wainscot, pilasters, wall AO
  // Oak-veneer wainscot (1.1 m) with a bronze cap rail on the solid wall either side
  // of each shop opening; pieces stop 2 cm short of the row boundary (inside the
  // pilaster) and 4 cm into the opening's bronze frame.
  const WH = 1.1
  const wLen = 2.94
  const wGeo = uvBox(0.03, WH, wLen, 1)
  const oak = oakVeneerMat()
  shops.forEach((s, k) => {
    const side = k % 2 === 0 ? -1 : 1
    const z1 = -Math.floor(k / 2) * L
    const z0 = z1 - L
    const zc = (z0 + z1) / 2
    const wx = side * B
    if (s.kind === 'shop') {
      for (const pz of [zc + 3.04 + wLen / 2, zc - 3.04 - wLen / 2]) {
        wf.custom(wGeo, oak, side * (B - 0.005), WH / 2, pz)
        wf.box(MAT.brass, side * (B - 0.011), WH + 0.01, pz, 0.042, 0.04, wLen + 0.02)
        // AO in front of the wainscot face (2 cm off the wall). Its 0.9 m wall band also
        // takes over the old separate wall-shade quads (one draw call fewer).
        aoFloorJunction(wx, pz - wLen / 2, wx, pz + wLen / 2, -side, 0, wf.base, 0.9, 0.5, 0.032)
      }
    } else if (s.kind === 'soon') aoFloorJunction(wx, z0, wx, z1, -side, 0, wf.base)
  })
  aoFloorJunction(-B, -len, B, -len, 0, 1, wf.base)

  // Marble-clad pilasters at every row boundary, both sides (0.8 m wide, 8 cm proud of the wall, 1 cm into it).
  const PD = 0.08
  const PH = BH - 0.15 // top inside the soffit
  const pGeo = uvBox(PD + 0.01, PH, 0.8, 1.6)
  const clad = marbleCladMat()
  for (let r = 1; r < rows; r++)
    for (const side of [-1, 1]) {
      const z = -r * L
      wf.custom(pGeo, clad, side * (B - PD / 2 + 0.005), PH / 2 - 0.01, z)
      wf.box(MAT.brass, side * (B - 0.045), 0.055, z, 0.11, 0.13, 0.84)
      const fx = side * (B - PD - 0.012)
      addAOStrip([fx, 0, z - 0.4], [fx, 0, z + 0.4], [0, 1, 0], 0.5, wf.base)
    }

  // ------------------------------------------------------- column screens
  // Mounted on the pilasters at each row boundary, both sides; the bezel stands
  // proud of the pilaster face (8 cm) so the screen is in front and clickable.
  const brandIds = shops.filter((s) => s.kind === 'shop' && s.brand).map((s) => s.brand!.id)
  const feed = new ScreenFeed({ kinds: ['flash', 'brand'], brandIds, portrait: true })
  for (let r = 1; r < rows; r++)
    for (const side of [-1, 1]) {
      const z = -r * L
      wf.box(MAT.brass, side * (B - 0.095), 1.9, z, 0.04, 1.36, 0.78)
      wf.box(MAT.black, side * (B - 0.115), 1.9, z, 0.04, 1.31, 0.74)
      const m = screenMesh(feed, 0.7, 1.25)
      m.position.set(side * (B - 0.145), 1.9, z)
      m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
      group.add(m)
      feed.addScreen(m)
      registerScreen(ctx.interaction, m.children[0], feed, ctx.actions)
    }

  // ---------------------------------------------------- storefront finishing
  for (const s of shops) {
    if (s.kind !== 'shop') continue
    const sf = ctx.batcher.frame(new Matrix4().makeRotationY(s.yaw).setPosition(s.entrance.x, 0, s.entrance.z), ctx.colliders)
    // Bronze portal: slim jambs on plinth blocks, a deeper lintel, and a light line above it
    // (the display windows beside the opening light their own posters).
    for (const x of [-3.04, 3.04]) {
      sf.box(MAT.brass, x, 1.95, 0.03, 0.12, 3.92, 0.08)
      sf.box(MAT.brass, x, 0.11, 0.045, 0.18, 0.23, 0.11)
    }
    sf.box(MAT.brass, 0, 3.93, 0.035, 6.26, 0.14, 0.09)
    sf.box(MAT.lightWarm, 0, 4.11, 0.05, 5.6, 0.05, 0.03)
    if (s.brand) {
      const mat = new Mesh(new PlaneGeometry(2.4, 1.2), imageMat(doormatTexture({ initials: s.brand.initials, color: s.brand.color, logo: s.brand.logo })))
      const p = toWorld(s.entrance, s.yaw, 0, 0.75)
      // Flat on the floor (X -90deg), then turned with the shop (Y first in YXZ order).
      mat.rotation.set(-Math.PI / 2, s.yaw, 0, 'YXZ')
      mat.position.set(p.x, 0.006, p.z)
      ctx.root.add(mat)
    }
  }

  // ------------------------------------------------------------ wing portal
  for (const s of [-1, 1]) wf.box(MAT.brass, s * (B - 0.12), BH / 2, -0.15, 0.24, BH, 0.3, { collide: true })
  wf.box(MAT.brass, 0, BH - 0.12, -0.15, 2 * B, 0.24, 0.3)

  // ------------------------------------------------------ directory board
  const rowsData = shops.map((s) => ({
    name: s.kind === 'lounge' ? (s.amenity === 'studio' ? 'Styling Studio' : '122 Lounge') : (s.brand?.name ?? ''),
    nameAr: s.kind === 'lounge' ? (s.amenity === 'studio' ? 'ستوديو الستايلينج' : 'استراحة ١٢٢') : (s.brand?.nameAr ?? ''),
    color: s.kind === 'shop' ? (s.brand?.color ?? '#ddd') : '#d8cbb8',
  }))
  const dirTex = wingDirectoryTexture(wing.def.nameEn, wing.def.nameAr, rowsData)
  wf.block(MAT.brass, -4.6, 0, -1.5, 1.32, 0.08, 0.3, { collide: true })
  wf.box(cream, -4.6, 1.3, -1.5, 1.3, 2.36, 0.12, { collide: true })
  for (const face of [0, Math.PI]) {
    const board = new Mesh(new PlaneGeometry(1.2, 2.2), imageMat(dirTex))
    board.position.set(-4.6, 1.3, -1.5 + (face ? -0.065 : 0.065))
    board.rotation.y = face
    group.add(board)
  }

  // ----------------------------------------------------------- wayfinding
  const half = -len / 2
  const ahead = shops.filter((s) => s.center && toLocalZ(wing, s.center) < half).map((s) => s.brand?.name ?? (s.amenity === 'studio' ? 'Studio' : s.amenity === 'lounge' ? 'Lounge' : '')).filter(Boolean)
  const behind = shops.filter((s) => s.center && toLocalZ(wing, s.center) >= half).map((s) => s.brand?.name ?? '').filter(Boolean)
  for (const x of [-1.4, 1.4]) wf.cyl(MAT.brass, x, 4.95, half, 0.015, BH - 4.95)
  wf.box(MAT.brass, 0, 4.6, half, 3.36, 0.86, 0.06)
  const toEnd = new Mesh(new PlaneGeometry(3.2, 0.8), imageMat(wayfindingTexture('Ahead', 'قدامك', ahead)))
  toEnd.position.set(0, 4.6, half + 0.035)
  group.add(toEnd)
  const toPlaza = new Mesh(new PlaneGeometry(3.2, 0.8), imageMat(wayfindingTexture('To the Plaza', 'للبلازا', ['Plaza', ...behind.reverse()])))
  toPlaza.position.set(0, 4.6, half - 0.035)
  toPlaza.rotation.y = Math.PI
  group.add(toPlaza)

  // --------------------------------------------------------------- end wall
  const endZ = -len + 0.16
  wf.box(MAT.brass, 0, 2.6, endZ - 0.04, 10.2, 4.2, 0.06)
  const [ec, eg] = makeCanvas(2048, 820)
  eg.fillStyle = '#f4ede3'
  eg.fillRect(0, 0, 2048, 820)
  const endTex = canvasTexture(ec)
  const endWall = new Mesh(new PlaneGeometry(10, 4), imageMat(endTex))
  endWall.position.set(0, 2.6, endZ)
  group.add(endWall)
  const tiles = shops.filter((s) => s.kind === 'shop' && s.section).slice(0, 6)
  const tileW = 2048 / Math.max(1, tiles.length)
  const drawTile = (s: (typeof tiles)[number], i: number) => {
    const p = catalog().byId.get(s.section!.productIds[0])
    if (!p) return Promise.resolve()
    return loadProductTexture(p.images[0], 512).then(({ image }) => {
      const im = image as HTMLCanvasElement
      const sc = Math.max(tileW / im.width, 820 / im.height)
      eg.save()
      eg.beginPath()
      eg.rect(i * tileW + 6, 6, tileW - 12, 808)
      eg.clip()
      eg.drawImage(im, i * tileW + (tileW - im.width * sc) / 2, (820 - im.height * sc) / 2, im.width * sc, im.height * sc)
      eg.restore()
    })
  }
  void Promise.allSettled(tiles.map(drawTile))
    .then(() => loadImage(BRAND.logo))
    .then((logo) => {
      eg.fillStyle = 'rgba(251,248,244,0.92)'
      eg.fillRect(724, 300, 600, 220)
      const s = Math.min(540 / logo.width, 180 / logo.height)
      eg.drawImage(logo, 1024 - (logo.width * s) / 2, 410 - (logo.height * s) / 2, logo.width * s, logo.height * s)
    })
    .catch(() => {})
    .then(() => {
      endTex.needsUpdate = true
    })
  for (const x of [-4.6, 4.6])
    if (!ctx.kit?.placeBatched('plant', wf, x, -len + 1.0, 0, ctx.colliders)) plant(wf, x, -len + 1.0, 1.2, 140 + Math.round(x))

  return { feeds: [feed] }
}
