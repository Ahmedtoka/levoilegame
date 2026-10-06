// The mall shell: plaza (entrance, skylight, decor) and the three wings
// (corridor, shop boxes, ceilings). Wings are built in their own local frame.

import {
  Box3,
  BoxGeometry,
  CircleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Vector3,
  type Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { MALL, rectContains, type MallLayout, type Rect, type Wing } from '../config/layout'
import { depthAt, frontSolidSpans, NOOK_DEPTH, sideBoundaries } from '../config/layoutMath'
import type { Batcher, BatchFrame } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import type { QualitySettings } from '../engine/quality'
import { gradientTexture, storeTexture } from '../engine/textures'
import { BRAND } from '../config/brand'
import { glowMat, imageMat, MAT, tintMat } from './materials'
import { bench, column, premiumPlanter } from './props'
import type { Kit } from './kit'
import { directoryTexture, labelSign, logoTexture, type DirectoryEntry } from './signage'
import { addPool, setGlowsVisible } from './glow'
import { aoCeilJunction, aoFloorJunction } from './aoStrips'
import { addContactShadow } from './decals'
import { FloorMirror, setFloorSeeThrough } from './floorMirror'
import { atlasPeriod, floorAtlas, corridorFloorMat, GYPSUM, marbleCladMat, oakVeneerMat, tintedPlane, tiledPlane } from './finish'
import { setPbrQuality } from '../engine/pbr'
import { markMirrored } from '../engine/layers'

export interface ShellHandles {
  doors: { target: number; update(dt: number): void }
  setQuality(q: QualitySettings): void
  /** Called each frame with the player position for LOD toggles. */
  update(px: number, pz: number): void
}

const T = MALL.wallT

/** Corridor floor reflection (High): fainter than the plaza's (opacity 0.8, tint #b8b0b4). */
const CORRIDOR_MIRROR = { floorOpacity: 0.9, color: 0xa8a2a4, fadeIn: 0.45 }

function floorPlane(r: Rect, mat: MeshStandardMaterial, y = 0): Mesh {
  const m = new Mesh(new PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2)
  m.matrixAutoUpdate = false
  m.updateMatrix()
  return m
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
  _kit: Kit | null = null, // kept for callers; the mall shell no longer places kit pieces
): Promise<ShellHandles> {
  // The CC0 texture library picks its 512 set on Low; every material below goes through it.
  setPbrQuality(quality)
  const f = batcher.frame(new Matrix4(), colliders)
  const { plazaHalf: W, plazaDepth: A, corridorHalf: B, atriumHeight: AH, boulevardHeight: BH, shopHeight: SH } = MALL
  const root = new Group()
  root.name = 'shell'
  scene.add(root)

  // ------------------------------------------------------------ plaza floor
  // Large-format marble tiles (shared atlas); grout lines on the plaza axis and the entrance line.
  const atriumFloorMat = new MeshStandardMaterial({
    // Low (textureMax 512) gets a 1024 atlas instead of 2048.
    map: floorAtlas(quality.textureMax <= 512 ? 1024 : 2048),
    roughness: 0.18,
    metalness: 0.05,
    transparent: false,
    opacity: 0.8,
  })
  const plazaFloor = new Mesh(tiledPlane(2 * W, A, atlasPeriod(), 0, A / 2), atriumFloorMat)
  plazaFloor.position.set(0, 0, -A / 2)
  // See-through over its mirror (High), the floor is in the transparent queue: draw it first
  // there, so the decals on it (inlays, logo) never sort behind it.
  plazaFloor.renderOrder = -1
  plazaFloor.matrixAutoUpdate = false
  plazaFloor.updateMatrix()
  root.add(plazaFloor)

  // Reflection under the plaza floor (High quality only).
  const plazaMirror = new FloorMirror({
    parent: root,
    width: 2 * W,
    depth: A,
    x: 0,
    z: -A / 2,
    worldBox: new Box3(new Vector3(-W, -0.01, -A), new Vector3(W, 0.01, 0)),
    color: 0xb8b0b4,
    scale: 0.5,
  })
  // One mirror per corridor, created on first entry and only rendered while you are in that wing.
  // Every mirror (plaza too) shows the architecture and lights only (MIRROR_LAYER).
  markMirrored(MAT.wall, MAT.wallWarm, MAT.trim, MAT.brass, MAT.ceiling, MAT.lightWarm, MAT.lightPanel, GYPSUM, oakVeneerMat(), marbleCladMat())
  const wingMirrors: { rect: Rect; mirror: FloorMirror; mat: MeshStandardMaterial; fade: number }[] = []

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
  /** How far a wing's first units reach out from its centre line (corridor half + deeper first unit). */
  const reachOf = (wing: Wing | undefined) => {
    if (!wing) return 0
    const first = (side: 'L' | 'R') => wing.packed.units.find((u) => u.side === side && u.z1 === 0)?.depth ?? 0
    return B + Math.max(first('L'), first('R'))
  }
  // Entrance façade (z = 0) with the door opening.
  wall(f, -W - T, 0, -D, T, 0, AH)
  wall(f, D, 0, W + T, T, 0, AH)
  wall(f, -D, 0, D, T, 3.3, AH)
  // Plaza back wall beside the north wing mouth, and the corners the wings don't cover.
  const north = layout.wings.find((w) => w.id === 'north')
  const northOuter = reachOf(north)
  if (north) {
    wall(f, -W - T, -A - T, -northOuter, -A, 0, AH)
    wall(f, northOuter, -A - T, W + T, -A, 0, AH)
  } else wall(f, -W - T, -A - T, W + T, -A, 0, AH)
  for (const side of [-1, 1]) {
    const wing = layout.wings.find((w) => w.id === (side < 0 ? 'west' : 'east'))
    if (wing) {
      // The wing's shops cover the plaza side wall; close what's left above them.
      const zc = wing.origin.z
      const reach = reachOf(wing)
      if (zc + reach < 0) wall(f, side < 0 ? -W - T : W, zc + reach, side < 0 ? -W : W + T, 0, 0, AH)
      if (zc - reach > -A) wall(f, side < 0 ? -W - T : W, -A, side < 0 ? -W : W + T, zc - reach, 0, AH)
    } else wall(f, side < 0 ? -W - T : W, -A, side < 0 ? -W : W + T, 0, 0, AH)
  }

  // ----------------------------------------------------------------- wings
  for (const wing of layout.wings) buildWing(wing)

  function buildWing(wing: Wing): void {
    const base = new Matrix4().makeRotationY(wing.yaw).setPosition(wing.origin.x, 0, wing.origin.z)
    const wf = batcher.frame(base, colliders)
    const toWorldXZ = (x: number, z: number) => {
      const v = wf.toWorld(x, 0, z)
      return { x: v.x, z: v.z }
    }
    const len = wing.len
    const group = new Group()
    group.position.set(wing.origin.x, 0, wing.origin.z)
    group.rotation.y = wing.yaw
    root.add(group)

    // Corridor floor: a large-format marble field (joints aligned to the border and the mouth)
    // with a darker 0.6 m band along both walls, split by a fine brass strip. Field and band
    // meet edge to edge (no overlapping coplanar faces).
    const band = 0.6
    // Each wing gets its own instance of the floor material (same program and atlas), so its
    // see-through state follows only its own mirror.
    const floorMat = corridorFloorMat()
    const floor = new Mesh(
      mergeGeometries([
        tintedPlane(tiledPlane(2 * (B - band), len, atlasPeriod(), B - band, len / 2), '#ffffff'),
        ...[-1, 1].map((sd) => tintedPlane(tiledPlane(band, len, atlasPeriod(band), 0, len / 2).translate(sd * (B - band / 2), 0, 0), '#a89c90')),
      ]),
      floorMat,
    )
    floor.position.set(0, 0, -len / 2)
    floor.renderOrder = -1 // transparent over the mirror: before the star inlays (see plazaFloor)
    group.add(floor)
    const r = wing.rect
    wingMirrors.push({
      rect: r,
      mat: floorMat,
      fade: 0,
      mirror: new FloorMirror({
        parent: group,
        width: 2 * B,
        depth: len,
        x: 0,
        z: -len / 2,
        worldBox: new Box3(new Vector3(r.x0, -0.01, r.z0), new Vector3(r.x1, 0.01, r.z1)),
        color: CORRIDOR_MIRROR.color,
        scale: 0.5,
      }),
    })
    for (const sd of [-1, 1]) wf.box(MAT.brass, sd * (B - band), 0.002, -len / 2, 0.03, 0.004, len - 0.02)

    // Corridor end and the header over the mouth.
    wall(wf, -B, -len - T, B, -len, 0, BH)
    // Header over the mouth starts at the top of the corridor ceiling (no coplanar overlap → no flicker).
    wall(wf, -B, -T, B, 0, BH + 0.2, AH)

    // Back wall of each unit / nook, and the separators between neighbours, as long as
    // the deeper neighbour (the one at the mouth is plaza height).
    const units = layout.shops.filter((x) => x.wing === wing.id)
    const back = (side: 'L' | 'R', z0: number, z1: number, d: number) =>
      side === 'L' ? wall(wf, -B - d - T, z0, -B - d, z1, 0, SH) : wall(wf, B + d, z0, B + d + T, z1, 0, SH)
    for (const u of units) back(u.side, u.z0, u.z1, u.depth)
    for (const n of wing.nooks) back(n.side, n.z0, n.z1, NOOK_DEPTH)
    for (const side of ['L', 'R'] as const) {
      for (const z of [0, ...sideBoundaries(wing.packed, side), -len]) {
        const d = Math.max(depthAt(wing.packed, side, z + 0.05), depthAt(wing.packed, side, z - 0.05))
        if (!d) continue
        const h = z === 0 ? AH : SH
        if (side === 'L') wall(wf, -B - d, z - T / 2, -B, z + T / 2, 0, h)
        else wall(wf, B, z - T / 2, B + d, z + T / 2, 0, h)
      }
    }

    // Shop fronts: openings for shops, open for lounges and nooks, closed hoarding for Coming Soon.
    // Unit-local x on the front maps to wing z: left units run away from the plaza (+x -> -z).
    const front = (side: 'L' | 'R', zc: number, a: number, b: number, y0: number, y1: number, mat = MAT.wall) => {
      const [z0, z1] = side === 'L' ? [zc - b, zc - a] : [zc + a, zc + b]
      wall(wf, side === 'L' ? -B - T : B, z0, side === 'L' ? -B : B + T, z1, y0, y1, mat)
    }
    const openFront = (side: 'L' | 'R', z0: number, z1: number) => {
      const sd = side === 'L' ? -1 : 1
      for (const cz of [z0 + 0.3, z1 - 0.3]) {
        column(wf, sd * (B + 0.3), cz, BH)
        const c = toWorldXZ(sd * (B + 0.3), cz)
        addContactShadow(c.x, c.z, 1.6, 1.6)
      }
      wall(wf, side === 'L' ? -B - T : B, z0 + 0.4, side === 'L' ? -B : B + T, z1 - 0.4, 3.9, BH)
    }
    for (const s of units) {
      const zc = (s.z0 + s.z1) / 2
      if (s.kind === 'shop') {
        for (const [a, b] of frontSolidSpans(s.front, s.openings)) front(s.side, zc, a, b, 0, BH)
        for (const o of s.openings) front(s.side, zc, o.cx - o.half, o.cx + o.half, 3.9, BH)
      } else if (s.kind === 'soon') front(s.side, zc, -s.front / 2, s.front / 2, 0, BH, MAT.wallWarm)
      else openFront(s.side, s.z0, s.z1)
    }
    for (const n of wing.nooks) {
      openFront(n.side, n.z0, n.z1)
      // A bench along the back and a planter at each end.
      const sd = n.side === 'L' ? -1 : 1
      const bx = sd * (B + NOOK_DEPTH - 0.55)
      const zc = (n.z0 + n.z1) / 2
      bench(wf, bx, zc, Math.min(4.8, n.z1 - n.z0 - 3.2), Math.PI / 2)
      for (const pz of [n.z1 - 1.1, n.z0 + 1.1]) premiumPlanter(wf, sd * (B + NOOK_DEPTH - 0.9), pz, 70 + Math.round(-pz), 1.05)
    }

    // Corridor ceiling: warm gypsum (the tray soffits, slot lights and cans come from corridor.ts).
    wf.box(GYPSUM, 0, BH + 0.1, -len / 2, 2 * B, 0.2, len)

    // Wing name over the mouth (faces the plaza, local +Z).
    const sign = new Mesh(new PlaneGeometry(5, 1.25), imageMat(labelSign(wing.def.nameEn, wing.def.nameAr, { bg: '#f4ede3', fg: '#6b4f35', h: 256 })))
    sign.position.set(0, 6.75, 0.08)
    group.add(sign)
    wf.box(MAT.brass, 0, 6.75, 0.04, 5.2, 1.4, 0.04)
  }

  // -------------------------------------------------------------- ceilings
  const slab = (x0: number, z0: number, x1: number, z1: number, y: number, mat = MAT.ceiling) =>
    f.box(mat, (x0 + x1) / 2, y + 0.1, (z0 + z1) / 2, x1 - x0, 0.2, z1 - z0)
  // Plaza: warm gypsum with a skylight opening.
  const sky = { x0: -10, z0: -25, x1: 10, z1: -9 }
  slab(-W, -A, W, sky.z0, AH, GYPSUM)
  slab(-W, sky.z1, W, 0, AH, GYPSUM)
  slab(-W, sky.z0, sky.x0, sky.z1, AH, GYPSUM)
  slab(sky.x1, sky.z0, W, sky.z1, AH, GYPSUM)
  buildPlazaCeiling()
  const wellH = 0.8
  f.box(MAT.wall, 0, AH + wellH / 2, sky.z0, sky.x1 - sky.x0, wellH, 0.1)
  f.box(MAT.wall, 0, AH + wellH / 2, sky.z1, sky.x1 - sky.x0, wellH, 0.1)
  f.box(MAT.wall, sky.x0, AH + wellH / 2, (sky.z0 + sky.z1) / 2, 0.1, wellH, sky.z1 - sky.z0)
  f.box(MAT.wall, sky.x1, AH + wellH / 2, (sky.z0 + sky.z1) / 2, 0.1, wellH, sky.z1 - sky.z0)
  for (let x = sky.x0 + 3; x < sky.x1; x += 3) f.box(MAT.brass, x, AH + 0.3, (sky.z0 + sky.z1) / 2, 0.08, 0.12, sky.z1 - sky.z0)
  for (let z = sky.z0 + 3; z < sky.z1; z += 3) f.box(MAT.brass, 0, AH + 0.3, z, sky.x1 - sky.x0, 0.12, 0.08)
  const skyPlane = new Mesh(new PlaneGeometry(sky.x1 - sky.x0, sky.z1 - sky.z0), imageMat(gradientTexture([[0, '#5d7392'], [1, '#8da2bd']])))
  skyPlane.rotation.x = Math.PI / 2
  skyPlane.position.set(0, AH + wellH, (sky.z0 + sky.z1) / 2)
  root.add(skyPlane)

  /**
   * Coffer grid of 0.3 m gypsum downstands around the skylight, a bronze frame
   * on the skylight well and a ring of spot cans in the coffers next to it.
   * Beam tops sit 5 cm inside the slab and their ends 2 cm inside the walls or
   * the frame, so no face is coplanar with another surface.
   */
  function buildPlazaCeiling(): void {
    const bw = 0.36
    const yb = AH - 0.3
    const beamX = (x: number, z0: number, z1: number) => f.box(GYPSUM, x, (yb + AH + 0.05) / 2, (z0 + z1) / 2, bw, AH + 0.05 - yb, Math.abs(z1 - z0))
    const beamZ = (z: number, x0: number, x1: number) => f.box(GYPSUM, (x0 + x1) / 2, (yb + AH + 0.05) / 2, z, Math.abs(x1 - x0), AH + 0.05 - yb, bw)
    const out = 0.02
    const fr = 0.2 // how far a beam runs into the skylight frame
    // Side bays (|x| > 10): lines every 4 m across the full depth, cross lines on the skylight grid.
    for (const sd of [-1, 1]) {
      for (const x of [14, 18]) beamX(sd * x, out, -A - out)
      for (const z of [sky.z1, -13, -17, -21, sky.z0]) beamZ(z, sd * (sky.x1 + fr), sd * (W + out))
    }
    // Front and back bays: cross lines at -4.5 / -29.5, short lines up to the frame.
    beamZ(-4.5, -W - out, W + out)
    beamZ(-29.5, -W - out, W + out)
    for (const x of [-10, -6.67, -3.33, 3.33, 6.67, 10]) {
      beamX(x, out, sky.z1 + fr)
      beamX(x, sky.z0 - fr, -A - out)
    }

    // Bronze frame around the skylight well: 0.4 m deep (below the beams), its inner
    // face 1 cm proud of the well walls.
    const fy = AH - 0.15
    const fh = 0.5
    const fw = 0.41
    f.box(MAT.brass, 0, fy, sky.z0 - fw / 2 + 0.06, sky.x1 - sky.x0 + 0.7, fh, fw)
    f.box(MAT.brass, 0, fy, sky.z1 + fw / 2 - 0.06, sky.x1 - sky.x0 + 0.7, fh, fw)
    for (const sd of [-1, 1]) f.box(MAT.brass, sd * (sky.x1 + fw / 2 - 0.06), fy, (sky.z0 + sky.z1) / 2, fw, fh, sky.z1 - sky.z0 - 0.12)
    // Warm light line tucked under the inner lip of the frame.
    f.box(MAT.lightWarm, 0, AH - 0.405, sky.z0 + 0.04, sky.x1 - sky.x0 - 0.1, 0.02, 0.03)
    f.box(MAT.lightWarm, 0, AH - 0.405, sky.z1 - 0.04, sky.x1 - sky.x0 - 0.1, 0.02, 0.03)
    for (const sd of [-1, 1]) f.box(MAT.lightWarm, sd * (sky.x1 - 0.04), AH - 0.405, (sky.z0 + sky.z1) / 2, 0.03, 0.02, sky.z1 - sky.z0 - 0.1)

    // Spot cans: one per coffer in the ring around the skylight.
    const can = (x: number, z: number) => {
      f.cyl(MAT.brass, x, AH - 0.03, z, 0.17, 0.08)
      f.sphere(MAT.lightWarm, x, AH - 0.01, z, 0.115, 0.35)
    }
    for (const sd of [-1, 1]) {
      for (const z of [-6.75, -11, -15, -19, -23, -27.25]) can(sd * 12, z)
    }
    for (const x of [-8.33, -5, 0, 5, 8.33]) {
      can(x, -6.75)
      can(x, -27.25)
    }
  }

  /** Fake AO along the plaza perimeter (wall/floor and wall/ceiling). */
  function plazaAO(): void {
    const sep = T / 2 // the wing mouths' separator walls stand 15 cm proud of the plaza line
    const nOut = reachOf(layout.wings.find((w) => w.id === 'north'))
    // Entrance façade (inner face z = 0), door opening left clear on the floor.
    aoFloorJunction(-W, 0, -D, 0, 0, -1)
    aoFloorJunction(D, 0, W, 0, 0, -1)
    aoCeilJunction(-W, 0, W, 0, 0, -1, AH, undefined, 0.6)
    // Back wall: plaza wall at the corners, the north wing's shop sides in between, the mouth header.
    for (const sd of [-1, 1]) {
      const [a, b] = sd < 0 ? [-W, -nOut] : [nOut, W]
      aoFloorJunction(a, -A, b, -A, 0, 1)
      aoCeilJunction(a, -A, b, -A, 0, 1, AH, undefined, 0.6)
      const [c, d] = sd < 0 ? [-nOut, -B] : [B, nOut]
      aoFloorJunction(c, -A + sep, d, -A + sep, 0, 1)
      aoCeilJunction(c, -A + sep, d, -A + sep, 0, 1, AH, undefined, 0.6)
    }
    aoCeilJunction(-B, -A, B, -A, 0, 1, AH, undefined, 0.6)
    // Sides: the west / east wings' shop sides, with the mouth header over the corridor.
    for (const sd of [-1, 1]) {
      const wing = layout.wings.find((w) => w.id === (sd < 0 ? 'west' : 'east'))
      const x = sd * W
      const n = -sd
      if (!wing) {
        aoFloorJunction(x, 0, x, -A, n, 0)
        aoCeilJunction(x, 0, x, -A, n, 0, AH, undefined, 0.6)
        continue
      }
      const zc = wing.origin.z
      const xs = x + n * sep
      for (const [z0, z1] of [[0, zc + B], [zc - B, -A]] as const) {
        aoFloorJunction(xs, z0, xs, z1, n, 0)
        aoCeilJunction(xs, z0, xs, z1, n, 0, AH, undefined, 0.6)
      }
      aoCeilJunction(x, zc + B, x, zc - B, n, 0, AH, undefined, 0.6)
    }
  }

  // Soft light shafts from the skylight (additive, Medium/High).
  const shafts = new Group()
  const shaftTex = gradientTexture([[0, 'rgba(255,255,255,0.0)'], [0.15, 'rgba(255,250,240,0.55)'], [1, 'rgba(255,250,240,0)']])
  for (let i = 0; i < 5; i++) {
    const m = new Mesh(new PlaneGeometry(3.4, AH + 1), glowMat(shaftTex, '#fff6ea', 0.05))
    m.position.set(-7 + i * 3.6, AH / 2, mid + 2 - (i % 2) * 2.5)
    m.rotation.set(0, i * 0.6, 0.18)
    shafts.add(m)
  }
  root.add(shafts)
  f.box(MAT.lightWarm, 0, AH - 0.4, -0.2, 2 * W, 0.08, 0.06)

  // Shop ceilings with square light panels, and their floors.
  for (const s of layout.shops) {
    const { x0, x1, z0, z1 } = s.rect
    // The slab's edges must never be coplanar with a wall face (that z-fights as a flickering dark
    // band along the corridor). Push every edge 2 cm into the surrounding walls; the corridor-side
    // edge goes 2 cm *inward*, i.e. inside the shopfront wall (which occupies the first 0.3 m).
    const e = 0.02
    const ex = s.entrance
    slab(
      Math.abs(ex.x - x0) < 0.01 ? x0 + e : x0 - e,
      Math.abs(ex.z - z0) < 0.01 ? z0 + e : z0 - e,
      Math.abs(ex.x - x1) < 0.01 ? x1 - e : x1 + e,
      Math.abs(ex.z - z1) < 0.01 ? z1 - e : z1 + e,
      SH,
    )
    const along = x1 - x0 > z1 - z0
    if (s.kind !== 'shop')
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

  for (const w of layout.wings)
    for (const n of w.nooks) {
      const { x0, x1, z0, z1 } = n.rect
      slab(x0 - 0.02, z0 - 0.02, x1 + 0.02, z1 + 0.02, SH)
      const stone = storeTexture('/textures/marble.jpg', [(x1 - x0) / 4, (z1 - z0) / 4])
      root.add(floorPlane(n.rect, new MeshStandardMaterial({ map: stone, color: '#f6efe4', roughness: 0.35 }), 0.002))
    }

  // ------------------------------------------------------- plaza features
  for (const [x, z] of [[-8, -6], [8, -6], [-8, -28], [8, -28]] as const) {
    column(f, x, z, AH)
    addContactShadow(x, z, 1.8, 1.8)
  }
  plazaAO()
  // Daylight pool under the skylight (Medium/High, with the other glows).
  addPool(0, (sky.z0 + sky.z1) / 2, (sky.x1 - sky.x0) * 1.1, (sky.z1 - sky.z0) * 1.1)
  const plants: [number, number, number][] = [[-14, -30, 1.4], [14, -30, 1.4], [-19.5, -2, 1.3], [19.5, -2, 1.3], [-19.5, -31.5, 1.2], [19.5, -31.5, 1.2], [9.4, -19, 1.1]]
  plants.forEach(([x, z, sc], i) => {
    premiumPlanter(f, x, z, 11 + i, sc)
    addContactShadow(x, z, 1.3 * sc, 1.3 * sc)
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
  const thanks = new Mesh(new PlaneGeometry(8, 1.6), imageMat(labelSign('Thank you for visiting District 122', 'شكراً لزيارتك ديستريكت ١٢٢', { bg: '#f4ede3', fg: '#6b4f35', h: 256 })))
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
    // Off: mirrors are disposed (render targets released), not just hidden.
    plazaMirror.setEnabled(q.reflections)
    atriumFloorMat.transparent = q.reflections
    atriumFloorMat.needsUpdate = true
    for (const w of wingMirrors) {
      if (q.reflections) continue
      w.mirror.setEnabled(false)
      w.fade = 0
      setFloorSeeThrough(w.mat, 1)
    }
  }
  setQuality(quality)
  let reflectionsOn = quality.reflections
  let lastT = performance.now()

  return {
    doors,
    setQuality: (q) => {
      reflectionsOn = q.reflections
      setQuality(q)
    },
    update: (px, pz) => {
      const now = performance.now()
      const dt = Math.min(0.1, (now - lastT) / 1000)
      lastT = now
      // Only pay for the mirror pass while the plaza can be seen.
      plazaMirror.setVisible(reflectionsOn && Math.abs(px) < W + 26 && pz > -A - 26)
      // Corridor mirrors: only the wing you are in; the reflection fades in as you enter.
      for (const w of wingMirrors) {
        const inside = reflectionsOn && rectContains(w.rect, px, pz)
        if (inside && !w.mirror.enabled) w.mirror.setEnabled(true)
        w.fade = inside ? Math.min(1, w.fade + dt / CORRIDOR_MIRROR.fadeIn) : 0
        w.mirror.setVisible(inside)
        setFloorSeeThrough(w.mat, 1 - (1 - CORRIDOR_MIRROR.floorOpacity) * w.fade)
      }
    },
  }
}
