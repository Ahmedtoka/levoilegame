// Interior plan of a style-B "campaign boutique" per tier (pure, unit-tested).
// Shop-local frame: origin = centre of the unit front, −z into the shop,
// x along the front (−front/2 … front/2). A plane's yaw is its rotation.y
// (0 faces +z, the entrance; +π/2 faces +x; −π/2 faces −x).

import { allocate, type Tier } from './layoutMath'

export const LIGHTBOX = {
  /** Photo area, its lit margin and the bronze frame. */
  w: 0.86,
  h: 1.04,
  margin: 0.03,
  frame: 0.04,
  pitch: 1.1,
  y: 1.62,
  plaqueW: 0.86,
  plaqueH: 0.28,
  plaqueY: 0.86,
  sectionY: 2.55,
  /** Plane offset from the wall face. */
  inset: 0.1,
}

export const HERO: Record<Tier, { w: number; h: number; y: number }> = {
  flagship: { w: 3.2, h: 2.0, y: 2.0 },
  standard: { w: 2.4, h: 1.5, y: 1.9 },
  compact: { w: 1.6, h: 1.0, y: 2.0 },
}

/** A straight line of lightboxes (centre line of their photo planes). */
export interface Run {
  x0: number
  z0: number
  x1: number
  z1: number
  yaw: number
}

export interface Spot {
  x: number
  z: number
  yaw: number
}

export interface BoutiquePlan {
  /** Lightbox runs in display order (sections fill them in this order). */
  runs: Run[]
  /** Free-standing double-sided lightbox walls (structure only; their faces are in `runs`). */
  freeWalls: { x: number; z: number; len: number }[]
  hero: { x: number; y: number; z: number; w: number; h: number }
  standees: Spot[]
  /** Showcase character models (products flagged modelOutfit). */
  models: Spot[]
  islands: { x: number; z: number; w: number; d: number }[]
  screen: Spot
  counter: { x: number; z: number }
  staff: Spot
  fitting: { x0: number; z0: number; x1: number; z1: number } | null
  /** Warm ceiling slot lights (x0, z0 → x1, z1). */
  lights: { x0: number; z0: number; x1: number; z1: number }[]
}

const P2 = Math.PI / 2

export function runCap(r: Run): number {
  const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0)
  return Math.max(0, Math.floor((len - 0.2) / LIGHTBOX.pitch + 1e-9))
}

/** n items over the runs (in proportion to capacity), centred on each run at the lightbox pitch. */
export function placeOnRuns(runs: Run[], n: number): Spot[] {
  const caps = runs.map(runCap)
  const counts = allocate(caps, n)
  const out: Spot[] = []
  runs.forEach((r, i) => {
    const k = counts[i]
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0)
    if (!k || !len) return
    const dx = (r.x1 - r.x0) / len
    const dz = (r.z1 - r.z0) / len
    const cx = (r.x0 + r.x1) / 2
    const cz = (r.z0 + r.z1) / 2
    for (let j = 0; j < k; j++) {
      const o = (j - (k - 1) / 2) * LIGHTBOX.pitch
      out.push({ x: cx + dx * o, z: cz + dz * o, yaw: r.yaw })
    }
  })
  return out
}

/** Lightbox atlas side for the quality tier (from ShopContext.bakedTextureMax). */
export function atlasSize(bakedMax: number): number {
  return bakedMax >= 4096 ? 2048 : bakedMax >= 2048 ? 1536 : 1024
}

/** 7 columns of cells: photo (with lit margin) on top, plaque below. */
export function atlasGrid(size: number): { cols: number; rows: number; cw: number; ch: number; ph: number } {
  const cols = 7
  const cw = Math.floor(size / cols)
  const boxW = LIGHTBOX.w + 2 * LIGHTBOX.margin
  const boxH = LIGHTBOX.h + 2 * LIGHTBOX.margin
  const ph = Math.round((cw * boxH) / boxW)
  const ch = ph + Math.round((cw * (LIGHTBOX.plaqueH + 0.04)) / boxW)
  return { cols, rows: Math.floor(size / ch), cw, ch, ph }
}

export function planBoutique(tier: Tier, front: number, depth: number): BoutiquePlan {
  const h = front / 2
  const WX = h - 0.15 - LIGHTBOX.inset // side wall lightbox planes
  const BZ = -depth + 0.15 + LIGHTBOX.inset // back wall lightbox planes
  const hero = { x: 0, z: -depth + 0.15 + 0.06, ...HERO[tier] }
  const heroClear = hero.w / 2 + 0.8
  const strip = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 })

  if (tier === 'flagship') {
    const free = [-6.5, 6.5].map((x) => ({ x, z: -8, len: 3.6 }))
    const runs: Run[] = [
      { x0: -WX, z0: -2.8, x1: -WX, z1: -(depth - 1.3), yaw: P2 },
      { x0: -(h - 1.3), z0: BZ, x1: -heroClear, z1: BZ, yaw: 0 },
      { x0: heroClear, z0: BZ, x1: 7.2, z1: BZ, yaw: 0 },
      { x0: WX, z0: -11.6, x1: WX, z1: -4.6, yaw: -P2 },
      // Free-standing walls: each has a face towards the side wall and one towards the centre.
      ...free.flatMap((w) => [
        { x0: w.x - 0.07, z0: w.z + w.len / 2, x1: w.x - 0.07, z1: w.z - w.len / 2, yaw: -P2 },
        { x0: w.x + 0.07, z0: w.z - w.len / 2, x1: w.x + 0.07, z1: w.z + w.len / 2, yaw: P2 },
      ]),
    ]
    return {
      runs,
      freeWalls: free,
      hero,
      standees: [
        { x: -2.6, z: -13.4, yaw: 0.25 },
        { x: 2.6, z: -13.4, yaw: -0.25 },
      ],
      models: [
        { x: -1.2, z: -11.8, yaw: 0 },
        { x: 1.2, z: -11.8, yaw: 0 },
      ],
      islands: [
        { x: 0, z: -5.4, w: 2.6, d: 1.2 },
        { x: -3.0, z: -10.0, w: 2.0, d: 1.0 },
        { x: 3.0, z: -10.0, w: 2.0, d: 1.0 },
      ],
      screen: { x: h - 0.15 - 0.06, z: -3.6, yaw: -P2 },
      counter: { x: -h + 1.6, z: -1.8 },
      staff: { x: h - 2.2, z: -2.6, yaw: -0.9 },
      fitting: { x0: 7.5, z0: -depth + 0.15, x1: h - 0.15, z1: -11.9 },
      lights: [strip(-h + 0.5, -2.4, -h + 0.5, -depth + 0.6), strip(h - 0.5, -2.4, h - 0.5, -11.4), strip(-h + 0.6, -depth + 0.5, 7.2, -depth + 0.5)],
    }
  }

  if (tier === 'standard') {
    return {
      runs: [
        { x0: -WX, z0: -2.8, x1: -WX, z1: -(depth - 1.3), yaw: P2 },
        { x0: -(h - 1.2), z0: BZ, x1: -heroClear, z1: BZ, yaw: 0 },
        { x0: heroClear, z0: BZ, x1: h - 1.2, z1: BZ, yaw: 0 },
        { x0: WX, z0: -(depth - 1.3), x1: WX, z1: -4.6, yaw: -P2 },
      ],
      freeWalls: [],
      hero,
      standees: [
        { x: -2.4, z: -13.2, yaw: 0.25 },
        { x: 2.4, z: -13.2, yaw: -0.25 },
      ],
      models: [{ x: 0, z: -11.9, yaw: 0 }],
      islands: [{ x: 0, z: -7.4, w: 2.4, d: 1.1 }],
      screen: { x: h - 0.15 - 0.06, z: -3.6, yaw: -P2 },
      counter: { x: -h + 1.6, z: -1.8 },
      staff: { x: h - 2.0, z: -2.6, yaw: -0.9 },
      fitting: null,
      lights: [strip(-h + 0.5, -2.4, -h + 0.5, -depth + 0.6), strip(h - 0.5, -2.4, h - 0.5, -depth + 0.6)],
    }
  }

  // compact
  return {
    runs: [
      { x0: -WX, z0: -2.2, x1: -WX, z1: -(depth - 1.0), yaw: P2 },
      { x0: WX, z0: -(depth - 1.0), x1: WX, z1: -3.4, yaw: -P2 },
    ],
    freeWalls: [],
    hero,
    standees: [{ x: 2.25, z: -0.95, yaw: -0.2 }],
    models: [],
    islands: [{ x: 0, z: -6.0, w: 1.2, d: 0.8 }],
    screen: { x: h - 0.15 - 0.06, z: -2.4, yaw: -P2 },
    counter: { x: -h + 0.95, z: -1.35 },
    staff: { x: 1.2, z: -4.2, yaw: -0.6 },
    fitting: null,
    lights: [strip(-h + 0.45, -1.8, -h + 0.45, -depth + 0.6), strip(h - 0.45, -1.8, h - 0.45, -depth + 0.6)],
  }
}
