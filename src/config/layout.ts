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
}

export interface MallLayout {
  bounds: Rect
  atrium: Rect
  boulevard: Rect
  shops: ShopLayout[]
  spawn: { x: number; z: number; yaw: number }
  cashier: { x: number; z: number; zone: Rect }
  exit: { x: number; z: number; zone: Rect }
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
    bounds: { x0: -W, z0: zEnd, x1: W, z1: 0 },
    atrium: { x0: -W, z0: -A, x1: W, z1: 0 },
    boulevard: { x0: -B, z0: zEnd, x1: B, z1: -A },
    shops,
    spawn: { x: 0, z: -3.2, yaw: 0 },
    cashier: { x: 13, z: -9, zone: { x0: 9.5, z0: -11.5, x1: 16.5, z1: -5.4 } },
    exit: { x: 0, z: 0, zone: { x0: -MALL.doorHalf, z0: -1.6, x1: MALL.doorHalf, z1: 0 } },
  }
}

/** Where to stand when teleporting to a shop: just inside, facing in. */
export function shopArrival(s: ShopLayout): { x: number; z: number; yaw: number } {
  const inward = s.side === 'L' ? -1 : 1
  return { x: s.entrance.x + inward * 1.5, z: s.entrance.z, yaw: s.yaw }
}
