// 122 Mall layout. Coordinates are metres, Y up. The entrance doors are on
// z = 0 and the mall extends towards -z:
//
//                       ┌──── NORTH WING ────┐
//                       │ shop │      │ shop │
//                       │ shop │      │ shop │
//   ┌── WEST WING ──────┴──────┴──────┴──────┴────── EAST WING ──┐
//   │ shop shop shop    │       PLAZA        │    shop shop shop  │
//   │ ══ corridor ══    │ (wheel · cashier)  │    ══ corridor ══  │
//   │ shop shop shop    │                    │    shop shop shop  │
//   └───────────────────┴──── entrance ──────┴────────────────────┘
//
// Each wing is built in its own local frame: origin = where it meets the
// plaza, local −Z runs away from the plaza, shops alternate left / right
// (local −X / +X). Shop interiors keep their own local frame on top of that
// (origin = centre of the opening, −Z into the shop).

import type { Section } from '../data/types'
import { sectionStyle, type SectionStyle } from './sections'
import { brandById, WINGS, type BrandDef, type WingDef, type WingId } from './mall'

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

export const MALL = {
  /** Plaza half width (x) and depth (z). */
  plazaHalf: 22,
  plazaDepth: 34,
  /** Wing corridor half width. */
  corridorHalf: 6,
  shopLen: 12,
  shopDepth: 14,
  doorHalf: 3,
  atriumHeight: 9,
  boulevardHeight: 6,
  shopHeight: 4.4,
  wallT: 0.3,
  /** z of the west / east wing centre line. */
  sideWingZ: -20,
} as const

export interface Pose {
  x: number
  z: number
  yaw: number
}

export interface Wing {
  id: WingId
  def: WingDef
  /** Where the corridor meets the plaza. */
  origin: { x: number; z: number }
  /** Rotation of the wing frame (local −Z = away from the plaza). */
  yaw: number
  /** Corridor length. */
  len: number
  /** Corridor footprint (world). */
  rect: Rect
}

export interface ShopLayout {
  /** shop = brand tenant, soon = Coming Soon unit, lounge = mall amenity (studio / rest area). */
  kind: 'shop' | 'lounge' | 'soon'
  /** Slot id: brand id, 'studio' or 'lounge'. */
  id: string
  section: Section | null
  brand: BrandDef | null
  style: SectionStyle | null
  amenity?: 'studio' | 'lounge'
  index: number
  wing: WingId | null
  side: 'L' | 'R'
  rect: Rect
  /** Centre of the shop's opening on the corridor. */
  entrance: { x: number; z: number }
  /** Group yaw so that local −Z points into the shop and local +X runs along its front. */
  yaw: number
  center: { x: number; z: number }
  /** Where teleport puts you (defaults to the threshold). */
  arrival?: Pose
}

export interface MallLayout {
  /** 'mall' = procedural mall; 'boutique' = baked store model. */
  kind: 'mall' | 'boutique'
  bounds: Rect
  /** Entrance plaza (zone "atrium"). */
  atrium: Rect
  wings: Wing[]
  shops: ShopLayout[]
  /** Extra named areas (e.g. fitting rooms) checked after shops. */
  zones?: { id: string; rect: Rect }[]
  spawn: Pose
  /** zone: shown on the minimap; approach: customer side that opens checkout; arrival: teleport pose. */
  cashier: { x: number; z: number; zone: Rect; approach: Rect; arrival: Pose }
  /** zone: stepping in leaves the store; doors: area where the doors slide open; arrival: teleport pose. */
  exit: { x: number; z: number; zone: Rect; doors: Rect; arrival: Pose }
}

export function rectContains(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
}

/** Local (wing or shop frame) → world. */
export function toWorld(origin: { x: number; z: number }, yaw: number, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return { x: origin.x + x * c + z * s, z: origin.z - x * s + z * c }
}

function rectOf(origin: { x: number; z: number }, yaw: number, x0: number, z0: number, x1: number, z1: number): Rect {
  const pts = [toWorld(origin, yaw, x0, z0), toWorld(origin, yaw, x1, z1)]
  const r = (n: number) => Math.round(n * 1000) / 1000
  return {
    x0: r(Math.min(pts[0].x, pts[1].x)),
    z0: r(Math.min(pts[0].z, pts[1].z)),
    x1: r(Math.max(pts[0].x, pts[1].x)),
    z1: r(Math.max(pts[0].z, pts[1].z)),
  }
}

const WING_FRAME: Record<WingId, { origin: { x: number; z: number }; yaw: number }> = {
  north: { origin: { x: 0, z: -MALL.plazaDepth }, yaw: 0 },
  west: { origin: { x: -MALL.plazaHalf, z: MALL.sideWingZ }, yaw: Math.PI / 2 },
  east: { origin: { x: MALL.plazaHalf, z: MALL.sideWingZ }, yaw: -Math.PI / 2 },
}

export function buildLayout(sections: Section[]): MallLayout {
  const { plazaHalf: W, plazaDepth: A, corridorHalf: B, shopLen: L, shopDepth: D } = MALL
  const wings: Wing[] = []
  const shops: ShopLayout[] = []
  let index = 0

  for (const def of WINGS) {
    const { origin, yaw } = WING_FRAME[def.id]
    const rows = Math.ceil(def.slots.length / 2)
    const len = rows * L
    wings.push({ id: def.id, def, origin, yaw, len, rect: rectOf(origin, yaw, -B, -len, B, 0) })

    def.slots.forEach((slot, k) => {
      const side = k % 2 === 0 ? 'L' : 'R'
      const row = Math.floor(k / 2)
      const z1 = -row * L
      const z0 = z1 - L
      const brand = brandById.get(slot) ?? null
      const depth = brand?.depth ?? D
      const lx0 = side === 'L' ? -B - depth : B
      const lx1 = side === 'L' ? -B : B + depth
      const ex = side === 'L' ? -B : B
      const section = sections.find((s) => s.id === slot) ?? null
      const amenity = slot === 'studio' || slot === 'lounge' ? slot : undefined
      const kind: ShopLayout['kind'] = amenity ? 'lounge' : brand?.status === 'soon' || !section ? 'soon' : 'shop'
      const entrance = toWorld(origin, yaw, ex, (z0 + z1) / 2)
      const rect = rectOf(origin, yaw, lx0, z0, lx1, z1)
      shops.push({
        kind,
        id: slot,
        section: kind === 'shop' ? section : null,
        brand,
        style: kind === 'shop' && section ? sectionStyle(section.id, index) : null,
        amenity,
        index: index++,
        wing: def.id,
        side,
        rect,
        entrance,
        yaw: yaw + (side === 'L' ? Math.PI / 2 : -Math.PI / 2),
        center: { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 },
      })
    })
  }

  const all = [{ x0: -W, z0: -A, x1: W, z1: 0 }, ...wings.map((w) => w.rect), ...shops.map((s) => s.rect)]
  const bounds: Rect = {
    x0: Math.min(...all.map((r) => r.x0)),
    z0: Math.min(...all.map((r) => r.z0)),
    x1: Math.max(...all.map((r) => r.x1)),
    z1: Math.max(...all.map((r) => r.z1)),
  }

  return {
    kind: 'mall',
    bounds,
    atrium: { x0: -W, z0: -A, x1: W, z1: 0 },
    wings,
    shops,
    spawn: { x: 0, z: -3.2, yaw: 0 },
    cashier: {
      x: 13,
      z: -9,
      zone: { x0: 9.5, z0: -11.5, x1: 16.5, z1: -5.4 },
      approach: { x0: 9.8, z0: -11.3, x1: 12.6, z1: -6.7 },
      arrival: { x: 10.6, z: -9, yaw: -Math.PI / 2 },
    },
    exit: {
      x: 0,
      z: 0,
      zone: { x0: -2.8, z0: -1.0, x1: 2.8, z1: 0.5 },
      doors: { x0: -3.2, z0: -3.2, x1: 3.2, z1: 0.5 },
      arrival: { x: 0, z: -4.5, yaw: Math.PI },
    },
  }
}

/**
 * Where to stand when teleporting to a shop: on the threshold, facing in. Not
 * deeper: the lookbook stand sits 2.4 m inside, and arriving right in front of
 * it puts its header behind the HUD zone banner (reads as doubled text).
 */
export function shopArrival(s: ShopLayout): Pose {
  if (s.arrival) return s.arrival
  const p = toWorld(s.entrance, s.yaw, 0, -0.3)
  return { x: p.x, z: p.z, yaw: s.yaw }
}

/** Zone id of a slot: brand/section id, 'studio', 'lounge' or the Coming Soon id. */
export function shopZone(s: ShopLayout): string {
  return s.section?.id ?? s.id
}
