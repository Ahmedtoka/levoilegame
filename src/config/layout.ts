// Procedural mall layout. Coordinates are metres, Y up. The entrance doors are
// on z = 0 and the mall extends towards -z:
//
//    z=0   ┌──────── entrance / exit ────────┐
//          │  ATRIUM (logo, skylight, cashier) │
//  z=-22   ├──────┬───────────────┬──────────┤
//          │ shop │   BOULEVARD   │  shop    │   shops alternate L / R
//          │ shop │               │  shop    │   SHOP_LEN metres each along z
//          └──────┴───────────────┴──────────┘
//
// Adding a section to products.json adds a shop here automatically.

import type { Section } from '../data/types'
import { sectionStyle, type SectionStyle } from './sections'

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

export const MALL = {
  halfWidth: 20,
  atriumDepth: 22,
  boulevardHalf: 6,
  shopLen: 12,
  shopDepth: 14,
  doorHalf: 3,
  atriumHeight: 9,
  boulevardHeight: 6,
  shopHeight: 4.4,
  wallT: 0.3,
} as const

export interface ShopLayout {
  kind: 'shop' | 'lounge'
  section: Section | null
  style: SectionStyle | null
  index: number
  side: 'L' | 'R'
  rect: Rect
  /** Centre of the shop's opening on the boulevard. */
  entrance: { x: number; z: number }
  /** Group yaw so that local -Z points into the shop and local +X runs along its front. */
  yaw: number
  center: { x: number; z: number }
  /** Where teleport puts you (defaults to just inside the entrance). */
  arrival?: Pose
}

export interface Pose {
  x: number
  z: number
  yaw: number
}

export interface MallLayout {
  /** 'mall' = procedural mall; 'boutique' = baked store model. */
  kind: 'mall' | 'boutique'
  bounds: Rect
  /** Entrance hall (zone "atrium"). */
  atrium: Rect
  boulevard: Rect
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

export function buildLayout(sections: Section[]): MallLayout {
  const { halfWidth: W, atriumDepth: A, boulevardHalf: B, shopLen: L } = MALL
  const perSide = Math.ceil(sections.length / 2)
  const zEnd = -A - perSide * L

  const shops: ShopLayout[] = []
  for (let slot = 0; slot < perSide * 2; slot++) {
    const side = slot % 2 === 0 ? 'L' : 'R'
    const row = Math.floor(slot / 2)
    const z1 = -A - row * L
    const z0 = z1 - L
    const rect: Rect = side === 'L' ? { x0: -W, z0, x1: -B, z1 } : { x0: B, z0, x1: W, z1 }
    const section = sections[slot] ?? null
    const ex = side === 'L' ? -B : B
    shops.push({
      kind: section ? 'shop' : 'lounge',
      section,
      style: section ? sectionStyle(section.id, slot) : null,
      index: slot,
      side,
      rect,
      entrance: { x: ex, z: (z0 + z1) / 2 },
      yaw: side === 'L' ? Math.PI / 2 : -Math.PI / 2,
      center: { x: (rect.x0 + rect.x1) / 2, z: (z0 + z1) / 2 },
    })
  }

  return {
    kind: 'mall',
    bounds: { x0: -W, z0: zEnd, x1: W, z1: 0 },
    atrium: { x0: -W, z0: -A, x1: W, z1: 0 },
    boulevard: { x0: -B, z0: zEnd, x1: B, z1: -A },
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
  const inward = s.side === 'L' ? -1 : 1
  return { x: s.entrance.x + inward * 0.3, z: s.entrance.z, yaw: s.yaw }
}
