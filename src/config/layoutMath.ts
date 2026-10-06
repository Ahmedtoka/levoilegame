// Pure layout maths for District 122's shop tiers (no three.js, unit-tested):
// packing units along each side of a wing, shopfront openings and the solid
// wall spans between them, and splitting display slots between sections.
//
// Wing-local frame: z = 0 at the mouth on the plaza, −z away from it.
// Unit-local x (shopfront): −front/2 … +front/2, as seen from the corridor.

export type Tier = 'flagship' | 'standard' | 'compact'
export type Side = 'L' | 'R'

export const TIERS: Record<Tier, { front: number; depth: number }> = {
  flagship: { front: 24, depth: 16 },
  standard: { front: 12, depth: 16 },
  compact: { front: 6, depth: 10 },
}

/** Depth of the open seating bay that pads the shorter side of a wing. */
export const NOOK_DEPTH = 4

export interface UnitSpec {
  id: string
  tier: Tier
}

export interface PackedUnit extends UnitSpec {
  side: Side
  /** Wing-local span along the corridor: z1 is the end nearer the plaza. */
  z0: number
  z1: number
  front: number
  depth: number
}

export interface Nook {
  side: Side
  z0: number
  z1: number
}

export interface PackedWing {
  len: number
  units: PackedUnit[]
  nooks: Nook[]
}

/** Lays units end to end from the mouth on each side; the shorter side ends in a nook. */
export function packWing(left: UnitSpec[], right: UnitSpec[]): PackedWing {
  const units: PackedUnit[] = []
  const lay = (list: UnitSpec[], side: Side): number => {
    let at = 0
    for (const s of list) {
      const t = TIERS[s.tier]
      units.push({ ...s, side, z1: -at + 0, z0: -(at + t.front), front: t.front, depth: t.depth })
      at += t.front
    }
    return at
  }
  const l = lay(left, 'L')
  const r = lay(right, 'R')
  const len = Math.max(l, r)
  const nooks: Nook[] = []
  if (l < len) nooks.push({ side: 'L', z0: -len, z1: -l + 0 })
  if (r < len) nooks.push({ side: 'R', z0: -len, z1: -r + 0 })
  return { len, units, nooks }
}

/** Inner boundaries between neighbouring units / nooks on one side (descending, without the mouth and the end). */
export function sideBoundaries(w: PackedWing, side: Side): number[] {
  const zs = [...w.units.filter((u) => u.side === side).map((u) => u.z0), ...w.nooks.filter((n) => n.side === side).map((n) => n.z0)]
  return [...new Set(zs)].filter((z) => z < -0.01 && z > -w.len + 0.01).sort((a, b) => b - a)
}

/** Depth of the unit or nook covering wing-local z on `side` (0 outside the wing). */
export function depthAt(w: PackedWing, side: Side, z: number): number {
  const u = w.units.find((x) => x.side === side && z < x.z1 && z > x.z0)
  if (u) return u.depth
  return w.nooks.some((n) => n.side === side && z < n.z1 && z > n.z0) ? NOOK_DEPTH : 0
}

/** Display window either side of an opening, mirrored (offsets from the opening centre). */
export interface WindowSpec {
  x0: number
  x1: number
  /** Product plinth centres (one standee figure each). */
  plinths: number[]
  /** Backdrop poster centres. */
  posters: number[]
}

export interface Opening {
  /** Centre along the unit front. */
  cx: number
  /** Half width of the walk-through opening. */
  half: number
  window: WindowSpec | null
  /** Glass sidelights flush with the wall, mirrored (compact units). */
  sidelight: { x0: number; x1: number } | null
}

const STD_WINDOW: WindowSpec = { x0: 3.2, x1: 5.5, plinths: [3.68], posters: [4.68] }
const FLAG_WINDOW: WindowSpec = { x0: 3.2, x1: 11.3, plinths: [4.0, 7.9], posters: [5.6, 9.6] }

/** Shopfront openings per tier. A split flagship (Le Voile) is two standard fronts side by side. */
export function openingsFor(tier: Tier, split = false): Opening[] {
  if (tier === 'compact') return [{ cx: 0, half: 1.6, window: null, sidelight: { x0: 1.75, x1: 2.85 } }]
  if (tier === 'flagship' && split) return [-6, 6].map((cx) => ({ cx, half: 3, window: STD_WINDOW, sidelight: null }))
  return [{ cx: 0, half: 3, window: tier === 'flagship' ? FLAG_WINDOW : STD_WINDOW, sidelight: null }]
}

type Span = [number, number]

function subtract(from: Span, holes: Span[]): Span[] {
  let out: Span[] = [from]
  for (const [h0, h1] of holes) {
    const next: Span[] = []
    for (const [a, b] of out) {
      if (h1 <= a || h0 >= b) next.push([a, b])
      else {
        if (h0 > a) next.push([a, h0])
        if (h1 < b) next.push([h1, b])
      }
    }
    out = next
  }
  return out.filter(([a, b]) => b - a > 0.05).sort((p, q) => p[0] - q[0])
}

/** Front wall pieces (full height) left after cutting the openings. */
export function frontSolidSpans(front: number, openings: Opening[]): Span[] {
  return subtract([-front / 2, front / 2], openings.map((o) => [o.cx - o.half, o.cx + o.half]))
}

/**
 * Visible solid wall in front of which wainscot runs: the front minus the openings
 * (with their 4 cm bronze jambs), windows and sidelights, 2 cm short of the unit ends.
 */
export function frontWallSpans(front: number, openings: Opening[]): Span[] {
  const holes: Span[] = []
  for (const o of openings) {
    holes.push([o.cx - o.half - 0.04, o.cx + o.half + 0.04])
    for (const g of [o.window, o.sidelight]) {
      if (!g) continue
      holes.push([o.cx + g.x0 - 0.01, o.cx + g.x1 + 0.01], [o.cx - g.x1 - 0.01, o.cx - g.x0 + 0.01])
    }
  }
  return subtract([-front / 2 + 0.02, front / 2 - 0.02], holes)
}

/**
 * Splits `slots` display positions between sections of `sizes` products: in
 * proportion to size, at least min(size, 2) each when there's room, never more
 * than a section has. Sums to min(slots, total).
 */
export function allocate(sizes: number[], slots: number): number[] {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const n = Math.min(slots, sum(sizes))
  const out = sizes.map(() => 0)
  const base = sizes.map((s) => Math.min(s, 2))
  if (sum(base) >= n) {
    // Not enough for two each: one at a time, in section order.
    let left = n
    for (let round = 0; left > 0; round++)
      for (let i = 0; i < sizes.length && left > 0; i++)
        if (out[i] === round && out[i] < base[i]) {
          out[i]++
          left--
        }
    return out
  }
  base.forEach((b, i) => (out[i] = b))
  let left = n - sum(base)
  const cap = sizes.map((s, i) => s - out[i])
  const capSum = sum(cap)
  const quota = cap.map((c) => (c * left) / capSum)
  quota.forEach((q, i) => {
    const k = Math.min(cap[i], Math.floor(q))
    out[i] += k
    left -= k
  })
  const order = quota
    .map((q, i) => [q - Math.floor(q), i] as const)
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i)
  while (left > 0)
    for (const i of order)
      if (left > 0 && out[i] < sizes[i]) {
        out[i]++
        left--
      }
  return out
}
