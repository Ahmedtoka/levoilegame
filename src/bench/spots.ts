// Bench / screenshot spots: fixed poses (world metres, player yaw/pitch) that every décor
// agent measures from, so numbers and screenshots are comparable across branches.
//
// Poses are derived from the layout (`buildLayout`), never typed as literals, so they
// follow the packing when a unit moves. Each spot carries the zone id `Game.zoneAt()`
// must report there (checked by tests/benchSpots.test.ts).
//
// Player conventions (src/player/player.ts): forward = (-sin yaw, 0, -cos yaw); pitch > 0
// looks up; the default pitch is -0.04. `?bench=<spot>` teleports to the spot and sets
// the pitch, then samples (src/bench/run.ts). The script `scripts/bench.mjs` drives it.

import { MALL, buildLayout, shopZone, toWorld, type MallLayout, type ShopLayout } from '../config/layout'
import { BRANDS } from '../config/mall'
import type { Section } from '../data/types'

export interface BenchSpot {
  x: number
  z: number
  yaw: number
  pitch: number
  /** Zone id Game.zoneAt() reports at (x, z). */
  zone: string
}

/** The plaza stage (src/world/plaza.ts STAGE): centre z, 4.5 m deep, steps on the entrance side. */
const STAGE_Z = -21.5
const STAGE_STEP_EDGE_Z = STAGE_Z + 2.95
const DEFAULT_PITCH = -0.04

/** Player yaw whose forward vector is the world direction (dx, dz). */
function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

/** The opening a visitor arriving from the plaza walks through (shopArrival's choice), else the first. */
function plazaOpening(s: ShopLayout): number {
  const o = s.openings.find((x) => Math.sign(x.cx) === s.plazaDir) ?? s.openings[0]
  return o?.cx ?? 0
}

/** The other opening of a split flagship (Le Voile's lightbox hall). */
function otherOpening(s: ShopLayout): number {
  const o = s.openings.find((x) => Math.sign(x.cx) !== s.plazaDir) ?? s.openings[0]
  return o?.cx ?? 0
}

/** `dist` metres out from the shop front (corridor side), looking straight in. */
function storefront(s: ShopLayout, cx: number, dist: number, pitch: number): BenchSpot {
  const p = toWorld(s.entrance, s.yaw, cx, dist)
  return { x: p.x, z: p.z, yaw: s.yaw, pitch, zone: `wing-${s.wing}` }
}

/** `depth` metres inside the shop through the opening at `cx`, looking in. */
function inside(s: ShopLayout, cx: number, depth: number): BenchSpot {
  const p = toWorld(s.entrance, s.yaw, cx, -depth)
  return { x: p.x, z: p.z, yaw: s.yaw, pitch: DEFAULT_PITCH, zone: shopZone(s) }
}

export function benchSpots(layout: MallLayout): Record<string, BenchSpot> {
  const shop = (id: string): ShopLayout => {
    const s = layout.shops.find((x) => x.id === id)
    if (!s) throw new Error(`bench: no unit "${id}" in the layout`)
    return s
  }
  const wing = (id: string) => {
    const w = layout.wings.find((x) => x.id === id)
    if (!w) throw new Error(`bench: no wing "${id}"`)
    return w
  }
  const mouth = (id: string): BenchSpot => {
    const w = wing(id)
    const p = toWorld(w.origin, w.yaw, 0, -1.5)
    return { x: p.x, z: p.z, yaw: w.yaw, pitch: DEFAULT_PITCH, zone: `wing-${id}` }
  }
  const { spawn, cashier } = layout

  const north = wing('north')
  const mid = toWorld(north.origin, north.yaw, 0, -north.len / 2)

  // Seating nook at the end of the west wing's shorter side: stand in the corridor 3.5 m
  // from the nook, looking at it (falls back to the wing end if the packing has none).
  const west = wing('west')
  const nook = west.nooks[0]
  let nookSpot: BenchSpot
  if (nook) {
    const dir = nook.side === 'L' ? -1 : 1
    const lx = dir * (MALL.corridorHalf - 3.5)
    const p = toWorld(west.origin, west.yaw, lx, (nook.z0 + nook.z1) / 2)
    const d = toWorld({ x: 0, z: 0 }, west.yaw, dir, 0)
    nookSpot = { x: p.x, z: p.z, yaw: yawToward(d.x, d.z), pitch: DEFAULT_PITCH, zone: `wing-west` }
  } else {
    const p = toWorld(west.origin, west.yaw, 0, -west.len + 4)
    nookSpot = { x: p.x, z: p.z, yaw: west.yaw, pitch: DEFAULT_PITCH, zone: `wing-west` }
  }

  const pistage = shop('pistage')
  const axis = shop('axis')
  const hashbag = shop('hashbag')
  const levoile = shop('levoile')
  const soon1 = shop('soon-1')
  const popup = layout.shops.find((s) => s.popup) ?? shop('popup')

  return {
    // ------------------------------------------------------------- plaza
    'atrium-entrance': { x: spawn.x, z: spawn.z, yaw: spawn.yaw, pitch: DEFAULT_PITCH, zone: 'atrium' },
    'atrium-up': { x: 0, z: -17, yaw: 0, pitch: 0.6, zone: 'atrium' },
    'atrium-stage': { x: 0, z: STAGE_STEP_EDGE_Z + 3, yaw: 0, pitch: 0.12, zone: 'atrium' },
    'atrium-cashier': { x: cashier.arrival.x, z: cashier.arrival.z, yaw: cashier.arrival.yaw, pitch: DEFAULT_PITCH, zone: 'cashier' },
    // ------------------------------------------------------------- wings
    'wing-west-mouth': mouth('west'),
    'wing-north-mouth': mouth('north'),
    'wing-east-mouth': mouth('east'),
    'wing-north-mid': { x: mid.x, z: mid.z, yaw: north.yaw, pitch: DEFAULT_PITCH, zone: 'wing-north' },
    'wing-west-nook': nookSpot,
    // -------------------------------------------------------- storefronts
    'storefront-pistage': storefront(pistage, plazaOpening(pistage), 4, 0.1),
    'storefront-axis': storefront(axis, plazaOpening(axis), 4, 0.1),
    // ------------------------------------------------------ shop interiors
    'shop-pistage': inside(pistage, plazaOpening(pistage), 3),
    'shop-hashbag': inside(hashbag, plazaOpening(hashbag), 3),
    'shop-axis': inside(axis, plazaOpening(axis), 3),
    'shop-levoile': inside(levoile, plazaOpening(levoile), 3),
    'shop-levoile-hall': inside(levoile, otherOpening(levoile), 3),
    // ------------------------------------------------- closed / pop-up units
    'soon-1': storefront(soon1, 0, 4, 0.1),
    popup: storefront(popup, 0, 4, 0.1),
  }
}

/** One Section per open brand: the shape buildMallCatalog() produces, enough for the layout. */
export function brandSections(): Section[] {
  return BRANDS.filter((b) => b.status === 'open').map((b) => ({ id: b.id, title: b.name, titleAr: b.nameAr, productIds: [] }))
}

/** The spots in world coordinates for the District 122 layout (the mall, not ?boutique). */
export const BENCH_SPOTS: Record<string, BenchSpot> = benchSpots(buildLayout(brandSections()))

export const BENCH_SPOT_IDS: string[] = Object.keys(BENCH_SPOTS)

/** Draw-call budget of a zone (plan: plaza ≤ 220, wing ≤ 300, shop interior ≤ 130). */
export function callBudget(zone: string): number {
  if (zone === 'atrium' || zone === 'cashier') return 220
  if (zone.startsWith('wing-')) return 300
  return 130
}
