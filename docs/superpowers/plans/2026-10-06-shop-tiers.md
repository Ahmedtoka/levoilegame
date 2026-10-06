# Shop Tiers (Flagship / Standard / Compact) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the uniform 12 × 14 m shop slots with three shop tiers and furnish every brand shop as a style-B "campaign boutique":
- Flagship 24 × 16 m, Standard 12 × 16 m, Compact 6 × 10 m;
- lightbox walls, a hero campaign wall, standees, islands and an "All products" screen;
- the per-shop cost doesn't grow with the product count.

**Architecture:**
- Pure maths, unit-tested with vitest and free of three.js, lives in `src/config/layoutMath.ts` (packing units along wing sides, shopfront openings, wall spans, section allocation) and `src/config/boutiquePlan.ts` (interior positions per tier).
- `buildLayout` turns those into `ShopLayout`s. The shell (`mall.ts`) and the corridor finishing (`corridor.ts`) iterate units and openings instead of 12 m rows.
- `src/world/boutiqueShop.ts` furnishes brand shops from the plan.
- All of a shop's lightboxes go into one atlas canvas per ≤ 28 products, built by `src/world/lightbox.ts`.

**Tech Stack:** Vite 8, TypeScript 6, three.js 0.186 (plain), Zustand vanilla, vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-06-shop-tiers-design.md` (read it first; this plan argues from it).

## Global Constraints

- **Tier sizes** (front × depth): flagship 24 × 16, standard 12 × 16, compact 6 × 10. Nook depth 4.
- **Wing map** (left / right from the plaza mouth):
  - west: `levoile, noha-collection, bezravoga, soon-4, popup` / `scarfest, nourhan, rwan-designs` (60 m)
  - north: `pistage, dnd, lounge` / `jeno, fashion-avenue, axis, the-cause-wear` (60 m; the right side gets a 12 m nook)
  - east: `slip-and-go, hashbag, promax, soon-1` / `nanosh, studio, soon-2, soon-3` (48 m)
- **Flagship brands:** levoile (split), scarfest, nourhan, pistage, dnd, jeno, slip-and-go, nanosh.
  - Standard: noha-collection, bezravoga, rwan-designs, fashion-avenue, hashbag, plus the studio and lounge amenities.
  - Compact: axis, the-cause-wear, promax, soon-1..4, popup.
- **Lightbox:** photo 0.86 × 1.04 m, 3 cm lit margin, 4 cm bronze frame, centre y 1.62, pitch 1.10. Plaque centre y 0.86, 0.86 × 0.28. Section plaque y 2.55.
- **Hero size:** flagship 3.2 × 2.0, standard 2.4 × 1.5, compact 1.6 × 1.0.
- **Atlas size:** 2048 on High (bakedTextureMax ≥ 4096), 1536 on Medium (≥ 2048), 1024 on Low. 7 columns.
- **Modesty rule (CLAUDE.md):** unchanged. Character code isn't touched, and models still use `modelSpots`.
- **Strings:** every new UI string goes in `src/i18n/i18n.ts` in both `ar` (natural Egyptian Arabic) and `en`. Brand terms stay in English. Use CSS logical properties.
- **Overlays** render through `paint()` (`src/ui/dom.ts`).
- **3D price text** uses Latin digits (`formatPrice(x, 'en')`).
- **Never block on assets.** Every texture loads lazily through the shop's `loaders` and draws via `imagePacer`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Gates:** run `npm test` and `npx tsc --noEmit` before each commit.

---

### Task 0: Performance baseline

**Files:**
- Create: `docs/superpowers/notes/2026-10-06-shop-tiers-perf.md`

- [ ] **Step 1: Start the dev server** with `preview_start {name: "dev"}` and open `http://localhost:5173/?nodemo&fps`.
- [ ] **Step 2: Measure the baseline.**
  1. Run this in the page via `javascript_tool`:

```js
const g = lv.game; g.enterMall(); await new Promise(r => setTimeout(r, 4000));
const measure = async (target) => { g.teleport(target); await new Promise(r => setTimeout(r, 4000));
  let n = 0; const t0 = performance.now(); await new Promise(res => { const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : res() }; requestAnimationFrame(f) });
  return { target, fps: Math.round(n / 3), calls: lv.engine.renderer.info.render.calls, tris: lv.engine.renderer.info.render.triangles } }
const out = []; for (const t of ['pistage', 'nourhan', 'axis', 'levoile', 'atrium']) out.push(await measure(t)); JSON.stringify(out)
```

  2. Repeat at the mobile preset: `resize_window {preset: "mobile"}`, reload with `?nodemo&fps&quality=low` (if `quality` isn't a URL flag, set `lv.store.getState().set({quality:'low'})`).
  3. Reset with preset `desktop`.
- [ ] **Step 3: Record** both tables in the notes file under "Baseline (before tiers)" and commit:

```bash
git add docs/superpowers/notes/2026-10-06-shop-tiers-perf.md
git commit -m "docs: performance baseline before shop tiers"
```

---

### Task 1: Pure layout maths

**Files:**
- Create: `src/config/layoutMath.ts`
- Test: `tests/layoutMath.test.ts`

**Interfaces:**
- Produces:
  - types: `Tier`, `Side`, `UnitSpec`, `PackedUnit`, `Nook`, `PackedWing`, `WindowSpec`, `Opening`
  - constants: `TIERS`, `NOOK_DEPTH`
  - functions:
    - `packWing(left, right): PackedWing`
    - `sideBoundaries(w, side): number[]`
    - `depthAt(w, side, z): number`
    - `openingsFor(tier, split?): Opening[]`
    - `frontSolidSpans(front, openings): [number, number][]` (wall pieces, openings removed)
    - `frontWallSpans(front, openings): [number, number][]` (visible wainscot pieces: openings, windows and sidelights removed)
    - `allocate(sizes, slots): number[]`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/layoutMath.test.ts
import { describe, expect, it } from 'vitest'
import { allocate, depthAt, frontSolidSpans, frontWallSpans, openingsFor, packWing, sideBoundaries, TIERS } from '../src/config/layoutMath'

const u = (id: string, tier: 'flagship' | 'standard' | 'compact') => ({ id, tier })

describe('packWing', () => {
  it('packs each side from the mouth and pads the shorter side with a nook', () => {
    const w = packWing([u('a', 'flagship'), u('b', 'standard')], [u('c', 'standard')])
    expect(w.len).toBe(36)
    expect(w.units.map((x) => [x.id, x.side, x.z1, x.z0])).toEqual([
      ['a', 'L', 0, -24],
      ['b', 'L', -24, -36],
      ['c', 'R', 0, -12],
    ])
    expect(w.nooks).toEqual([{ side: 'R', z0: -36, z1: -12 }])
    expect(w.units[0].depth).toBe(TIERS.flagship.depth)
  })
  it('lists inner boundaries per side and the depth at a point', () => {
    const w = packWing([u('a', 'flagship'), u('b', 'compact')], [u('c', 'standard')])
    expect(sideBoundaries(w, 'L')).toEqual([-24])
    expect(sideBoundaries(w, 'R')).toEqual([-12])
    expect(depthAt(w, 'L', -5)).toBe(16)
    expect(depthAt(w, 'L', -26)).toBe(10)
    expect(depthAt(w, 'R', -20)).toBe(4) // nook
    expect(depthAt(w, 'L', 1)).toBe(0)
  })
})

describe('openings', () => {
  it('gives each tier one centred opening; a split flagship gets two standard ones', () => {
    expect(openingsFor('standard')).toHaveLength(1)
    expect(openingsFor('compact')[0].half).toBeCloseTo(1.6)
    expect(openingsFor('flagship')[0].window?.plinths).toHaveLength(2)
    expect(openingsFor('flagship', true).map((o) => o.cx)).toEqual([-6, 6])
  })
  it('keeps openings, windows and sidelights inside the unit', () => {
    for (const [tier, split] of [['flagship', false], ['flagship', true], ['standard', false], ['compact', false]] as const) {
      const half = TIERS[tier].front / 2
      for (const o of openingsFor(tier, split)) {
        expect(Math.abs(o.cx) + o.half).toBeLessThanOrEqual(half)
        if (o.window) expect(Math.abs(o.cx) + o.window.x1).toBeLessThanOrEqual(half - 0.3)
        if (o.sidelight) expect(Math.abs(o.cx) + o.sidelight.x1).toBeLessThanOrEqual(half - 0.1)
      }
    }
  })
  it('splits the front wall around the openings', () => {
    expect(frontSolidSpans(12, openingsFor('standard'))).toEqual([[-6, -3], [3, 6]])
    const spans = frontWallSpans(12, openingsFor('standard'))
    // jamb → window post and window post → pilaster on both sides (the 12 m slot of the old code)
    expect(spans.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)])).toEqual([[-5.98, -5.51], [-3.19, -3.04], [3.04, 3.19], [5.51, 5.98]])
  })
})

describe('allocate', () => {
  it('sums to min(slots, total), never exceeds a section, gives two each when possible', () => {
    const out = allocate([30, 5, 1, 12], 20)
    expect(out.reduce((a, b) => a + b, 0)).toBe(20)
    expect(out[2]).toBe(1)
    expect(out.every((n, i) => n <= [30, 5, 1, 12][i])).toBe(true)
    expect(out[1]).toBeGreaterThanOrEqual(2)
    expect(out[0]).toBeGreaterThan(out[3])
  })
  it('handles fewer slots than sections and more slots than products', () => {
    expect(allocate([4, 4, 4], 2)).toEqual([1, 1, 0])
    expect(allocate([3, 2], 40)).toEqual([3, 2])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/layoutMath.test.ts`
Expected: FAIL, "Failed to resolve import ../src/config/layoutMath".

- [ ] **Step 3: Implement `src/config/layoutMath.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/layoutMath.test.ts`
Expected: PASS (all). If the `allocate([4,4,4],2)` case fails, check the round-robin condition `out[i] === round`.

- [ ] **Step 5: Commit**

```bash
git add src/config/layoutMath.ts tests/layoutMath.test.ts
git commit -m "feat(layout): pure maths for shop tiers, wing packing and shopfront openings"
```

---

### Task 2: Boutique interior plan (pure)

**Files:**
- Create: `src/config/boutiquePlan.ts`
- Test: `tests/boutiquePlan.test.ts`

**Interfaces:**
- Consumes: `Tier`, `allocate` from Task 1.
- Produces:
  - constants: `LIGHTBOX`, `HERO`
  - types: `Run`, `Spot`, `BoutiquePlan`
  - functions:
    - `planBoutique(tier, front, depth): BoutiquePlan`
    - `placeOnRuns(runs, n): Spot[]`
    - `runCap(run): number`
    - `atlasSize(bakedMax): number`
    - `atlasGrid(size): { cols, rows, cw, ch, ph }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/boutiquePlan.test.ts
import { describe, expect, it } from 'vitest'
import { atlasGrid, atlasSize, LIGHTBOX, placeOnRuns, planBoutique, runCap } from '../src/config/boutiquePlan'
import { TIERS } from '../src/config/layoutMath'

const inside = (tier: keyof typeof TIERS, x: number, z: number) => {
  const { front, depth } = TIERS[tier]
  return Math.abs(x) <= front / 2 - 0.05 && z <= -0.3 && z >= -depth + 0.05
}

describe('planBoutique', () => {
  it('has roughly the agreed lightbox capacity per tier', () => {
    const cap = (t: 'flagship' | 'standard' | 'compact') => planBoutique(t, TIERS[t].front, TIERS[t].depth).runs.reduce((a, r) => a + runCap(r), 0)
    expect(cap('flagship')).toBeGreaterThanOrEqual(36)
    expect(cap('standard')).toBeGreaterThanOrEqual(20)
    expect(cap('compact')).toBeGreaterThanOrEqual(8)
  })
  it('keeps every item inside the unit and out of the doorway', () => {
    for (const t of ['flagship', 'standard', 'compact'] as const) {
      const p = planBoutique(t, TIERS[t].front, TIERS[t].depth)
      const spots = [...placeOnRuns(p.runs, 999), ...p.standees, ...p.models, p.screen, p.staff, { ...p.counter, yaw: 0 }]
      for (const s of spots) expect(inside(t, s.x, s.z), `${t} ${JSON.stringify(s)}`).toBe(true)
      for (const i of p.islands) expect(inside(t, i.x, i.z)).toBe(true)
      // Nothing but staff/standees in the first 1.2 m behind the opening.
      for (const s of placeOnRuns(p.runs, 999)) expect(Math.abs(s.x) < 3 && s.z > -1.5).toBe(false)
    }
  })
  it('only flagships get a fitting room', () => {
    expect(planBoutique('flagship', 24, 16).fitting).not.toBeNull()
    expect(planBoutique('standard', 12, 16).fitting).toBeNull()
  })
})

describe('placeOnRuns', () => {
  it('places n items at the lightbox pitch, centred per run', () => {
    const run = { x0: -5, z0: -10, x1: 5, z1: -10, yaw: 0 }
    const s = placeOnRuns([run], 3)
    expect(s.map((p) => +p.x.toFixed(2))).toEqual([-LIGHTBOX.pitch, 0, LIGHTBOX.pitch])
    expect(s.every((p) => p.z === -10 && p.yaw === 0)).toBe(true)
  })
  it('never exceeds the total capacity', () => {
    const p = planBoutique('compact', 6, 10)
    expect(placeOnRuns(p.runs, 999)).toHaveLength(p.runs.reduce((a, r) => a + runCap(r), 0))
  })
})

describe('atlas', () => {
  it('picks the size by quality and fits 7 columns', () => {
    expect(atlasSize(4096)).toBe(2048)
    expect(atlasSize(2048)).toBe(1536)
    expect(atlasSize(1024)).toBe(1024)
    const g = atlasGrid(2048)
    expect(g.cols).toBe(7)
    expect(g.rows * g.ch).toBeLessThanOrEqual(2048)
    expect(g.ph).toBeLessThan(g.ch)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/boutiquePlan.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/config/boutiquePlan.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/boutiquePlan.test.ts`
Expected: PASS. If the doorway assertion fails for a compact standee, it's expected: standees are excluded from that check (only `placeOnRuns` items are checked).

- [ ] **Step 5: Commit**

```bash
git add src/config/boutiquePlan.ts tests/boutiquePlan.test.ts
git commit -m "feat(layout): interior plan per shop tier (lightbox runs, hero, standees, islands)"
```

---

### Task 3: Tiers in the mall config and `buildLayout`

**Files:**
- Modify: `src/config/mall.ts` (whole `BrandDef`, `BRANDS`, `WingDef`, `WINGS`)
- Modify: `src/config/layout.ts` (`ShopLayout`, `Wing`, `buildLayout`, `shopArrival`)
- Modify: `src/world/banners.ts:275`, `src/ui/hud.ts` (`zoneTitles`), `src/world/boutique.ts:62-80` (ShopLayout literal)
- Test: `tests/layout.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `BrandDef.tier: Tier` and `BrandDef.split?: boolean`
  - `WingDef.left`, `WingDef.right`
  - `POPUP_BRAND_ID: string | null`
  - `wingOf(brandId): WingDef | undefined`
  - `ShopLayout.tier`, `front`, `depth`, `z0`, `z1`, `plazaDir`, `openings`, `popup`
  - `Wing.packed: PackedWing` and `Wing.nooks: WingNook[]`
  - `WingNook { side, z0, z1, rect }`

- [ ] **Step 1: Write the failing layout test**

```ts
// tests/layout.test.ts
import { describe, expect, it } from 'vitest'
import { buildLayout } from '../src/config/layout'
import { BRANDS } from '../src/config/mall'
import type { Section } from '../src/data/types'

const sections: Section[] = BRANDS.filter((b) => b.status === 'open').map((b) => ({ id: b.id, title: b.name, titleAr: b.nameAr, productIds: [] }))
const L = buildLayout(sections)

describe('mall layout with tiers', () => {
  it('has the agreed wing lengths', () => {
    expect(Object.fromEntries(L.wings.map((w) => [w.id, w.len]))).toEqual({ west: 60, north: 60, east: 48 })
  })
  it('places every brand exactly once', () => {
    const ids = L.shops.map((s) => s.id)
    for (const b of BRANDS) expect(ids.filter((x) => x === b.id), b.id).toHaveLength(1)
  })
  it('has no overlapping units', () => {
    const r = L.shops.map((s) => s.rect)
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const ov = Math.min(r[i].x1, r[j].x1) - Math.max(r[i].x0, r[j].x0) > 0.01 && Math.min(r[i].z1, r[j].z1) - Math.max(r[i].z0, r[j].z0) > 0.01
        expect(ov, `${L.shops[i].id} × ${L.shops[j].id}`).toBe(false)
      }
  })
  it('gives Le Voile a split flagship and compacts a narrow opening', () => {
    const lv = L.shops.find((s) => s.id === 'levoile')!
    expect([lv.tier, lv.front, lv.depth, lv.openings.length]).toEqual(['flagship', 24, 16, 2])
    const ax = L.shops.find((s) => s.id === 'axis')!
    expect([ax.tier, ax.front, ax.depth]).toEqual(['compact', 6, 10])
    expect(L.shops.find((s) => s.id === 'popup')?.popup).toBe(true)
  })
  it('pads the north wing right side with a nook zone', () => {
    const north = L.wings.find((w) => w.id === 'north')!
    expect(north.nooks).toHaveLength(1)
    expect(L.zones?.some((z) => z.id === 'wing-north')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/layout.test.ts`
Expected: FAIL (wing lengths are 48/48/36 and `tier` is undefined).

- [ ] **Step 3: Update `src/config/mall.ts`**

  1. Add `import type { Tier } from './layoutMath'`.
  2. In `BrandDef`, replace the `depth?: number` field and its doc comment with:

```ts
  /** Shop tier (package): flagship 24 × 16, standard 12 × 16, compact 6 × 10 (see layoutMath TIERS). */
  tier: Tier
  /** Flagship made of two standard fronts (Le Voile: baked boutique + lightbox hall). */
  split?: boolean
```

  3. Change `status: 'open' | 'soon'` to keep the same union.
  4. Add a `tier` to every entry of `BRANDS`:
     - `flagship`: dnd, nourhan, pistage, slip-and-go, nanosh, scarfest, jeno, levoile (also `split: true`; remove `depth: 16`)
     - `standard`: bezravoga, hashbag, rwan-designs, fashion-avenue, noha-collection
     - `compact`: axis, the-cause-wear, promax, and the generated `soon-N` entries
  5. Append the pop-up placeholder after the soon entries:

```ts
  { id: 'popup', name: '122 Pop-up', nameAr: 'بوب أب ١٢٢', initials: 'PU', color: '#9e197e', status: 'soon', tier: 'compact', display: 'rack', outfit: 'skirt', kinds: [] },
```

  6. Replace `WingDef.slots` and `WINGS`:

```ts
export interface WingDef {
  id: WingId
  nameEn: string
  nameAr: string
  /** Units from the plaza outwards on the left / right side. 'studio' / 'lounge' are mall amenities, 'popup' the guest unit. */
  left: string[]
  right: string[]
}

/** Guest brand in the pop-up unit this month (null → the "book this space" kiosk). */
export const POPUP_BRAND_ID: string | null = null

// 16 brands (8 flagship) + 4 Coming Soon + pop-up + Styling Studio + lounge.
export const WINGS: WingDef[] = [
  { id: 'west', nameEn: 'West Wing', nameAr: 'الجناح الغربي', left: ['levoile', 'noha-collection', 'bezravoga', 'soon-4', 'popup'], right: ['scarfest', 'nourhan', 'rwan-designs'] },
  { id: 'north', nameEn: 'North Wing', nameAr: 'الجناح الشمالي', left: ['pistage', 'dnd', 'lounge'], right: ['jeno', 'fashion-avenue', 'axis', 'the-cause-wear'] },
  { id: 'east', nameEn: 'East Wing', nameAr: 'الجناح الشرقي', left: ['slip-and-go', 'hashbag', 'promax', 'soon-1'], right: ['nanosh', 'studio', 'soon-2', 'soon-3'] },
]

export function wingOf(id: string): WingDef | undefined {
  return WINGS.find((w) => w.left.includes(id) || w.right.includes(id))
}
```

  7. Fix the header comment, "22 slots" → "the units".

- [ ] **Step 4: Update `src/config/layout.ts`**

  1. Imports:

```ts
import { NOOK_DEPTH, openingsFor, packWing, TIERS, type Opening, type PackedWing, type Side, type Tier, type UnitSpec } from './layoutMath'
import { brandById, POPUP_BRAND_ID, WINGS, type BrandDef, type WingDef, type WingId } from './mall'
```

  2. In `MALL`, remove `shopLen` and `shopDepth`. Keep `shopHeight`.
     - Every other use of `MALL.shopLen` / `MALL.shopDepth` is replaced in Tasks 4–6.
     - To keep this task compiling, re-add them temporarily as `shopLen: 12, shopDepth: 14` with the comment `/** @deprecated legacy furnishing (?nokit / lounge); tiers use ShopLayout.front/depth. */`.
  3. Add to `Wing`:

```ts
  /** Units and nooks packed along both sides (wing-local z). */
  packed: PackedWing
  nooks: WingNook[]
```

     and the type:

```ts
export interface WingNook {
  side: Side
  z0: number
  z1: number
  /** World footprint (a 4 m seating bay off the corridor). */
  rect: Rect
}
```

  4. Add to `ShopLayout` (after `side`):

```ts
  tier: Tier
  /** Frontage along the corridor and depth into the unit (m). */
  front: number
  depth: number
  /** Wing-local span along the corridor (z1 nearer the plaza). */
  z0: number
  z1: number
  /** Shop-local x direction that points towards the plaza (+1 / −1). */
  plazaDir: 1 | -1
  /** Walk-through openings on the front (shops only; empty otherwise). */
  openings: Opening[]
  /** The pop-up unit (guest brand or the "book this space" kiosk). */
  popup?: boolean
```

  5. Replace the body of `buildLayout` from `const { plazaHalf: W …` down to the `const all = …` line:

```ts
  const { plazaHalf: W, plazaDepth: A, corridorHalf: B } = MALL
  const wings: Wing[] = []
  const shops: ShopLayout[] = []
  const zones: { id: string; rect: Rect }[] = []
  let index = 0
  const resolve = (slot: string) => (slot === 'popup' ? (POPUP_BRAND_ID ?? 'popup') : slot)
  const tierOf = (slot: string): Tier => (slot === POPUP_BRAND_ID ? 'compact' : (brandById.get(slot)?.tier ?? 'standard'))

  for (const def of WINGS) {
    const { origin, yaw } = WING_FRAME[def.id]
    const spec = (slot: string): UnitSpec => ({ id: resolve(slot), tier: tierOf(resolve(slot)) })
    const packed = packWing(def.left.map(spec), def.right.map(spec))
    const len = packed.len
    const nooks: WingNook[] = packed.nooks.map((n) => ({
      ...n,
      rect: rectOf(origin, yaw, n.side === 'L' ? -B - NOOK_DEPTH : B, n.z0, n.side === 'L' ? -B : B + NOOK_DEPTH, n.z1),
    }))
    for (const n of nooks) zones.push({ id: `wing-${def.id}`, rect: n.rect })
    wings.push({ id: def.id, def, origin, yaw, len, rect: rectOf(origin, yaw, -B, -len, B, 0), packed, nooks })

    for (const u of packed.units) {
      const slot = u.id
      const brand = brandById.get(slot) ?? null
      const lx0 = u.side === 'L' ? -B - u.depth : B
      const lx1 = u.side === 'L' ? -B : B + u.depth
      const ex = u.side === 'L' ? -B : B
      const section = sections.find((s) => s.id === slot) ?? null
      const amenity = slot === 'studio' || slot === 'lounge' ? slot : undefined
      const kind: ShopLayout['kind'] = amenity ? 'lounge' : brand?.status === 'soon' || !section ? 'soon' : 'shop'
      const entrance = toWorld(origin, yaw, ex, (u.z0 + u.z1) / 2)
      const rect = rectOf(origin, yaw, lx0, u.z0, lx1, u.z1)
      shops.push({
        kind,
        id: slot,
        section: kind === 'shop' ? section : null,
        brand,
        style: kind === 'shop' && section ? sectionStyle(section.id, index) : null,
        amenity,
        index: index++,
        wing: def.id,
        side: u.side,
        tier: u.tier,
        front: u.front,
        depth: u.depth,
        z0: u.z0,
        z1: u.z1,
        plazaDir: u.side === 'L' ? -1 : 1,
        openings: kind === 'shop' ? openingsFor(u.tier, !!brand?.split) : [],
        popup: slot === 'popup' || (POPUP_BRAND_ID !== null && slot === POPUP_BRAND_ID),
        rect,
        entrance,
        yaw: yaw + (u.side === 'L' ? Math.PI / 2 : -Math.PI / 2),
        center: { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 },
      })
    }
  }
```

     and in the returned object add `zones,` after `shops,`. Remove the now-unused `D` and `L` destructures. `TIERS` is unused here; drop it from the import if tsc complains.
  6. `shopArrival`: arrive in front of the plaza-side opening (Le Voile's centre is the partition wall):

```ts
export function shopArrival(s: ShopLayout): Pose {
  if (s.arrival) return s.arrival
  const o = s.openings.find((x) => Math.sign(x.cx) === s.plazaDir) ?? s.openings[0]
  const p = toWorld(s.entrance, s.yaw, o?.cx ?? 0, -0.3)
  return { x: p.x, z: p.z, yaw: s.yaw }
}
```

- [ ] **Step 5: Fix the other consumers so `npx tsc --noEmit` passes**
  - `src/world/banners.ts:275`: `const wing = wingOf(br.id)`. Import `wingOf` and drop `WINGS` if it's unused.
  - `src/ui/hud.ts` `zoneTitles`: before the `soon` check, add `if (zone === 'popup') return both('popup')`.
    - Add i18n `popup: { ar: 'بوب أب ١٢٢', en: '122 Pop-up' }` to `src/i18n/i18n.ts`, next to `comingSoon`.
  - `src/world/boutique.ts` (the `ShopLayout` literal near line 62): add
    `tier: 'standard' as const, front: 12, depth: 14, z0: 0, z1: 0, plazaDir: 1 as const, openings: [],`
  - `src/world/mall.ts` and `src/world/corridor.ts` still read `wing.def.slots`. Temporarily replace `wing.def.slots` with `[...wing.def.left, ...wing.def.right]` in both files so the build stays green; Task 4 rewrites those blocks.
  - `src/world/bespoke/levoile.ts` and `src/config/boutique.ts`: no `depth` uses (checked).
  - Run `grep -rn "\.depth\b" src/config src/world/mall.ts` and fix any `brand.depth` read left in `mall.ts` (`depthOf`) to `TIERS[brandById.get(slot)?.tier ?? 'standard'].depth`. This is temporary until Task 4.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/config/mall.ts src/config/layout.ts src/world/banners.ts src/ui/hud.ts src/i18n/i18n.ts src/world/boutique.ts src/world/mall.ts src/world/corridor.ts tests/layout.test.ts
git commit -m "feat(layout): shop tiers in the mall config; wings packed by unit frontage"
```

---

### Task 4: Shell and corridor per unit

**Files:**
- Modify: `src/world/mall.ts`:
  - plaza walls ~lines 175–190;
  - the unit walls and fronts in `buildWing`, lines 248–299;
  - `plazaAO` `nOut`;
  - shop ceilings, lines 436–463.
- Modify: `src/world/corridor.ts`:
  - `rows`;
  - wainscot (lines 123–142);
  - pilasters and totems (147–184);
  - storefront finishing (188–206).
- Modify: `src/world/crowd.ts` `buildSpots` (lines 232–247).
- Modify: `src/world/liveMall.ts` none (the studio stays standard).

**Interfaces:**
- Consumes: `Wing.packed`, `Wing.nooks`, `ShopLayout.openings/front/depth/z0/z1/side`, plus `sideBoundaries`, `depthAt`, `frontSolidSpans`, `frontWallSpans`, `NOOK_DEPTH`.
- Produces: shells with openings matching `ShopLayout.openings`. Task 5's storefront sits in them.

- [ ] **Step 1: Plaza walls use the real depth of the first unit on each side**

In `buildMall` (`mall.ts`), add this helper after `const D = MALL.doorHalf`:

```ts
  /** How far a wing's first units reach out from its centre line (corridor half + deeper first unit). */
  const reachOf = (wing: Wing | undefined) => {
    if (!wing) return 0
    const first = (side: 'L' | 'R') => wing.packed.units.find((u) => u.side === side && u.z1 === 0)?.depth ?? 0
    return B + Math.max(first('L'), first('R'))
  }
```

  - Replace `const northOuter = north ? B + SD : 0` with `const northOuter = reachOf(north)`.
  - Replace `const reach = B + SD` with `const reach = reachOf(wing)`.
  - In `plazaAO()`, replace `const nOut = B + SD` with `const nOut = reachOf(layout.wings.find((w) => w.id === 'north'))`.
  - Remove `shopDepth: SD, shopLen: SL` from the `MALL` destructure if nothing else uses them.

- [ ] **Step 2: Back walls, separators, fronts and nooks per unit**

In `buildWing`, replace everything from the comment `// Back wall of each unit` through the end of the `wingShops.forEach(...)` block with:

```ts
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
    // Unit-local x on the front maps to wing z: left units run away from the plaza (+x → −z).
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
```

  - Add the imports: `import { depthAt, frontSolidSpans, NOOK_DEPTH, sideBoundaries } from '../config/layoutMath'`.
  - Make sure `bench` and `premiumPlanter` are imported from `./props` (`premiumPlanter` already is; check `bench`).
  - If `bench`'s signature differs (`bench(f, x, z, len = 2.2, rotY = 0)`), keep the call above.
- [ ] **Step 3: Shop ceilings and nook floors**

In the `for (const s of layout.shops)` ceiling loop, skip the six square light panels for brand shops (their slot lights come from the boutique):

```ts
    if (s.kind !== 'shop')
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 2; j++) {
          // …unchanged panel code…
        }
```

After the loop, add the nooks:

```ts
  for (const w of layout.wings)
    for (const n of w.nooks) {
      const { x0, x1, z0, z1 } = n.rect
      slab(x0 - 0.02, z0 - 0.02, x1 + 0.02, z1 + 0.02, SH)
      const stone = storeTexture('/textures/marble.jpg', [(x1 - x0) / 4, (z1 - z0) / 4])
      root.add(floorPlane(n.rect, new MeshStandardMaterial({ map: stone, color: '#f6efe4', roughness: 0.35 }), 0.002))
    }
```

- [ ] **Step 4: Corridor finishing per unit (`corridor.ts`)**
  1. Replace `const rows = Math.ceil(wing.def.slots.length / 2)` with `const rows = Math.round(len / L)` (the centre-line rhythm stays at 12 m; wing lengths are multiples of 12). Keep `const L = 12` locally: replace `MALL.shopLen` with the literal `12` and the comment `// centre-line rhythm (m)`.
  2. Replace the wainscot `shops.forEach((s, k) => {...})` block with:

```ts
  for (const s of shops) {
    const sd = s.side === 'L' ? -1 : 1
    const zc = (s.z0 + s.z1) / 2
    const wx = sd * B
    const toZ = (x: number) => (s.side === 'L' ? zc - x : zc + x)
    if (s.kind === 'shop') {
      for (const [a, b] of frontWallSpans(s.front, s.openings)) {
        const wLen = b - a
        const pz = toZ((a + b) / 2)
        wf.custom(uvBox(0.03, WH, wLen, 1), oak, sd * (B - 0.005), WH / 2, pz)
        wf.box(MAT.brass, sd * (B - 0.011), WH + 0.01, pz, 0.042, 0.04, wLen + 0.02)
        aoFloorJunction(wx, pz - wLen / 2, wx, pz + wLen / 2, -sd, 0, wf.base, 0.9, 0.5, 0.032)
      }
    } else if (s.kind === 'soon') aoFloorJunction(wx, s.z0, wx, s.z1, -sd, 0, wf.base)
  }
```

     Delete the now-unused `spans` helper.
  3. **Pilasters:** at every unit boundary on each side. Replace the double loop `for (let r = 1; r < rows; r++) for (const side of [-1, 1])` with:

```ts
  for (const side of ['L', 'R'] as const)
    for (const z of sideBoundaries(wing.packed, side)) wf.custom(pGeo, clad, (side === 'L' ? -1 : 1) * (B - PD / 2 + 0.005), PH / 2 - 0.01, z)
```

  4. **Screen totems:** only at boundaries on the 12 m rhythm, so compact pairs don't get a screen between them. Replace that double loop's header with

```ts
  for (const sideId of ['L', 'R'] as const)
    for (const z of sideBoundaries(wing.packed, sideId).filter((b) => Math.abs(b / L - Math.round(b / L)) < 0.01)) {
      const side = sideId === 'L' ? -1 : 1
```

     and close the extra brace. The body is unchanged and uses `z` and `side`.
  5. **Storefront finishing:** iterate openings. Replace the body of `for (const s of shops) { if (s.kind !== 'shop') continue … }` with:

```ts
  for (const s of shops) {
    if (s.kind !== 'shop') continue
    const sf = ctx.batcher.frame(new Matrix4().makeRotationY(s.yaw).setPosition(s.entrance.x, 0, s.entrance.z), ctx.colliders)
    for (const o of s.openings) {
      const jx = o.half + 0.04
      for (const x of [o.cx - jx, o.cx + jx]) {
        sf.box(MAT.brass, x, 1.95, 0.03, 0.12, 3.92, 0.08)
        sf.box(MAT.brass, x, 0.11, 0.045, 0.18, 0.23, 0.11)
      }
      sf.box(MAT.brass, o.cx, 3.93, 0.035, 2 * o.half + 0.26, 0.14, 0.09)
      sf.box(MAT.lightWarm, o.cx, 4.11, 0.05, 2 * o.half - 0.4, 0.05, 0.03)
      if (s.brand) {
        const mw = Math.min(2.4, 2 * o.half - 0.6)
        const mat = new Mesh(new PlaneGeometry(mw, mw / 2), imageMat(doormatTexture({ initials: s.brand.initials, color: s.brand.color, logo: s.brand.logo })))
        const p = toWorld(s.entrance, s.yaw, o.cx, 0.75)
        mat.rotation.set(-Math.PI / 2, s.yaw, 0, 'YXZ')
        mat.position.set(p.x, 0.006, p.z)
        ctx.root.add(mat)
      }
    }
  }
```

  6. Import `frontWallSpans, sideBoundaries` from `'../config/layoutMath'`.
- [ ] **Step 5: Crowd browsing spots fit each unit (`crowd.ts` `buildSpots`)**

```ts
    for (const s of this.shops) {
      const { front, depth, openings } = s.layout
      const list: Pose[] = []
      const hx = front / 2 - 1.5
      for (let lz = -2.4; lz >= -(depth - 2.5); lz -= 1.5)
        for (let lx = -hx; lx <= hx + 1e-6; lx += 1.5) {
          const p = this.local(s, lx, lz)
          // Walk in through the nearest opening.
          const door = openings.length ? openings.reduce((a, o) => (Math.abs(o.cx - lx) < Math.abs(a.cx - lx) ? o : a)) : null
          const inner = this.local(s, door?.cx ?? 0, -1.6)
          if (this.blocked(p.x, p.z, 0.45) || !this.clearLine(inner, p, 0.3)) continue
          const toBack = depth + lz
          const toSide = front / 2 - Math.abs(lx)
          const localYaw = toSide < toBack ? (lx < 0 ? -Math.PI / 2 : Math.PI / 2) : Math.PI
          list.push({ ...p, yaw: s.layout.yaw + localYaw })
        }
      this.browse.push(list)
    }
```

     Then check for any other use of the old `inner` variable in that method and remove it.
- [ ] **Step 6: Typecheck, test, and look**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

Then in the dev preview:
1. Reload `/?nodemo`, enter the mall, and teleport to the west and north wings (`lv.game.teleport('scarfest')`, `('jeno')`).
2. Take screenshots of the corridors. Check:
   - fronts line up with the openings;
   - no gaps between units;
   - the north-right nook has a bench;
   - no console errors (`read_console_messages {onlyErrors:true}`).

Interiors still use the old furnishing at this point, so they will look wrong. That's expected until Task 6.
- [ ] **Step 7: Commit**

```bash
git add src/world/mall.ts src/world/corridor.ts src/world/crowd.ts
git commit -m "feat(world): mall shell, corridor finishing and crowd spots follow shop tiers"
```

---

### Task 5: Lightbox atlas, showcase figures and the parameterised storefront

**Files:**
- Create: `src/world/lightbox.ts`
- Create: `src/world/showcase.ts`. This moves `alphaBounds` and the window-figure drawing out of `shop.ts` and generalises them to N figures.
- Modify: `src/world/displays.ts`: export `frameGeometry` and the `HL` material as `HOVER_MAT`.
- Modify: `src/world/shop.ts`:
  - `storefront()` and the window posters loop (lines 207–231) use `shop.openings`;
  - the soon/popup hoarding width;
  - the interior gate distance;
  - `buildLounge(…, depth)`.
- Modify: `src/world/signage.ts`: add `popupTexture()`.
- Modify: `src/i18n/i18n.ts`: `popupBook`.

**Interfaces:**
- Consumes: `LIGHTBOX`, `atlasSize`, `atlasGrid`, `Spot`.
- Produces (lightbox):
  - `buildLightboxes(ctx: LightboxCtx, f: BatchFrame, parent: Group, items: PlacedProduct[]): void`
  - `buildSectionPlaques(ctx: LightboxCtx, parent: Group, plaques: SectionPlaque[]): void`
  - types `PlacedProduct { product: Product; x: number; z: number; yaw: number }`, `SectionPlaque { section: Section; x: number; z: number; yaw: number; w: number }`, `LightboxCtx { interaction: Interaction; loaders: (() => Promise<unknown>)[]; atlas: number }`
- Produces (showcase):
  - `alphaBounds(thumb, w, h)`
  - `drawShowcase(g, im, thumb, p, x, y, cw, ch, k)` (draws one figure bottom-aligned in a cell)
  - `showcaseMesh(ctx: ShowcaseCtx, parent: Group, items: ShowcaseItem[], cell: number): Mesh | null`
  - types `ShowcaseItem { product: Product; x: number; y: number; z: number; yaw: number; w: number; h: number }`, `ShowcaseCtx { interaction: Interaction; loaders: (() => Promise<unknown>)[] }`

- [ ] **Step 1: Export the hover outline from `displays.ts`**

  - Change `const HL = new MeshBasicMaterial(...)` to `export const HOVER_MAT = new MeshBasicMaterial({ color: BRAND.magenta, toneMapped: false })` and add `const HL = HOVER_MAT` below it, so the other uses stay put.
  - Change `function frameGeometry` to `export function frameGeometry`.

- [ ] **Step 2: Create `src/world/showcase.ts`**

```ts
// Product figures that stand in the world (window plinths, standees, island
// risers): N products drawn into one canvas and shown as ONE merged mesh of
// alpha-tested quads. A tall cut-out stands like a mannequin; anything else
// is a mounted print. Invisible hit planes keep each one clickable.

import { FrontSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture, loadProductTexture, makeCanvas } from '../engine/textures'
import { displayImage, hasCutout, type Product } from '../data/types'
import { store } from '../state/store'
import type { Interaction } from '../interact/interaction'
import { imageMat } from './materials'
import { frameGeometry, HOVER_MAT } from './displays'
import { openProductLabel } from './shop'

export interface ShowcaseItem {
  product: Product
  /** Centre of the quad (shop-local) and its facing. */
  x: number
  y: number
  z: number
  yaw: number
  w: number
  h: number
}

export interface ShowcaseCtx {
  interaction: Interaction
  loaders: (() => Promise<unknown>)[]
}

const HIDDEN = new MeshBasicMaterial({ visible: false })

/**
 * Bounding box of the non-transparent pixels of a cutout, in `w`×`h` image pixels.
 * Measured on the small CPU thumbnail (reading the GPU-backed full-size canvas back
 * stalled frames), then padded by one sample so the crop never cuts the figure.
 */
export function alphaBounds(thumb: HTMLCanvasElement, w: number, h: number): { x: number; y: number; w: number; h: number } {
  // (moved verbatim from shop.ts)
}

/** Draws product `p` bottom-aligned into the cell (x, y, cw, ch); `k` scales the print margins. */
export function drawShowcase(g: CanvasRenderingContext2D, im: HTMLCanvasElement, thumb: HTMLCanvasElement, p: Product, x: number, y: number, cw: number, ch: number): void {
  const b = hasCutout(p) ? alphaBounds(thumb, im.width, im.height) : null
  if (b && b.h / b.w > 1.45) {
    // A full-length cutout stands like a mannequin.
    const sc = Math.min((cw * 0.94) / b.w, (ch * 0.98) / b.h)
    g.drawImage(im, b.x, b.y, b.w, b.h, x + (cw - b.w * sc) / 2, y + ch - b.h * sc, b.w * sc, b.h * sc)
    return
  }
  if (b) {
    // A product cut-out (bag, shoe, box): as large as fits, standing on the base.
    const sc = Math.min((cw * 0.9) / b.w, (ch * 0.9) / b.h)
    g.drawImage(im, b.x, b.y, b.w, b.h, x + (cw - b.w * sc) / 2, y + ch - b.h * sc, b.w * sc, b.h * sc)
    return
  }
  // Otherwise a mounted print standing on the base; a tall image is narrowed, not squashed.
  const maxW = cw * 0.86
  const maxH = ch * 0.62
  const ar = im.height / im.width
  const w = maxW * ar > maxH ? maxH / ar : maxW
  const h = w * ar
  const pad = cw * 0.04
  const py = y + ch - h - pad * 1.2
  const px = x + (cw - w) / 2
  g.fillStyle = '#fbf8f4'
  g.fillRect(px - pad, py - pad * 1.2, w + 2 * pad, h + 2.4 * pad)
  g.drawImage(im, px, py, w, h)
}

/** All items as one alpha-tested mesh in `parent` (cell = texture px per item, height 2 × width). */
export function showcaseMesh(ctx: ShowcaseCtx, parent: Group, items: ShowcaseItem[], cell: number): Mesh | null {
  if (!items.length || typeof document === 'undefined') return null
  const cols = Math.min(items.length, 8)
  const rows = Math.ceil(items.length / cols)
  const cw = cell
  const ch = cell * 2
  const W = cols * cw
  const H = rows * ch
  const quads = items.map((it, i) => {
    const q = new PlaneGeometry(it.w, it.h)
    const c = i % cols
    const r = Math.floor(i / cols)
    // Each item's cell keeps the item's aspect: the quad samples the bottom-centred w:h part of it.
    const cellAspect = cw / ch
    const itAspect = it.w / it.h
    const uw = itAspect < cellAspect ? (cw * (itAspect / cellAspect)) / W : cw / W
    const vh = itAspect < cellAspect ? ch / H : (ch * (cellAspect / itAspect)) / H
    const u0 = (c * cw) / W + (cw / W - uw) / 2
    const v0 = 1 - ((r + 1) * ch) / H
    const uv = q.getAttribute('uv')
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * uw, v0 + uv.getY(k) * vh)
    q.rotateY(it.yaw).translate(it.x, it.y, it.z)
    return q
  })
  const [canvas, g] = makeCanvas(W, H)
  const tex = canvasTexture(canvas)
  const mat = imageMat(tex)
  mat.side = FrontSide
  mat.alphaTest = 0.5
  const mesh = new Mesh(mergeGeometries(quads), mat)
  mesh.visible = false
  parent.add(mesh)
  // Hit planes + hover outlines.
  items.forEach((it) => {
    const hit = new Mesh(new PlaneGeometry(it.w, it.h), HIDDEN)
    hit.position.set(it.x, it.y, it.z)
    hit.rotation.y = it.yaw
    parent.add(hit)
    const hl = new Mesh(frameGeometry(it.w + 0.06, it.h + 0.06), HOVER_MAT)
    hl.position.set(0, 0, 0.004)
    hl.visible = false
    hit.add(hl)
    ctx.interaction.add({
      object: hit,
      kind: 'product',
      label: () => openProductLabel(it.product),
      onInteract: () => store.getState().openProduct(it.product.id),
      highlight: (on) => (hl.visible = on),
      maxDist: 3.6,
    })
  })
  ctx.loaders.push(() =>
    Promise.allSettled(
      items.map((it, i) =>
        loadProductTexture(displayImage(it.product), ch).then(({ image, thumb }) => {
          // Draw into the bottom-centred w:h part of the cell the quad samples.
          const cellAspect = cw / ch
          const itAspect = it.w / it.h
          const dw = itAspect < cellAspect ? cw * (itAspect / cellAspect) : cw
          const dh = itAspect < cellAspect ? ch : ch * (cellAspect / itAspect)
          const x = (i % cols) * cw + (cw - dw) / 2
          const y = Math.floor(i / cols) * ch + (ch - dh)
          drawShowcase(g, image as HTMLCanvasElement, thumb, it.product, x, y, dw, dh)
        }),
      ),
    ).then(() => {
      tex.needsUpdate = true
      mesh.visible = true
    }),
  )
  return mesh
}
```

Copy the body of `alphaBounds` verbatim from `shop.ts` (lines 307–331) where the comment says "moved verbatim", and delete it from `shop.ts`.

**Note on UV orientation:** `CanvasTexture` has `flipY = true`, so canvas row 0 is at v = 1. That's why `v0 = 1 - ((r + 1) * ch) / H` is the bottom of row r.

- [ ] **Step 3: Create `src/world/lightbox.ts`**

```ts
// Lightbox walls for the style-B boutiques. Every lightbox of a shop (campaign
// photo with a lit margin + a cream price plaque under it) is drawn into an
// atlas canvas (≤ 28 per atlas) and shown as ONE merged mesh per atlas, so a
// shop's draw calls don't grow with its products. Bronze housings are batched;
// an invisible hit plane per product keeps it clickable with a hover outline.

import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { atlasGrid, LIGHTBOX } from '../config/boutiquePlan'
import { BRAND } from '../config/brand'
import type { BatchFrame } from '../engine/batcher'
import { BLOOM_WEIGHT, registerBloom } from '../engine/bloom'
import { imagePacer } from '../engine/pace'
import { canvasTexture, loadProductTexture, makeCanvas } from '../engine/textures'
import { discountPercent, type Product, type Section } from '../data/types'
import { formatPrice } from '../i18n/i18n'
import { store } from '../state/store'
import type { Interaction } from '../interact/interaction'
import { BRONZE, CREAM, frameGeometry, HOVER_MAT } from './displays'
import { imageMat } from './materials'
import { BOUTIQUE_INK, boutiqueHeader } from './signage'
import { openProductLabel } from './shop'

export interface PlacedProduct {
  product: Product
  x: number
  z: number
  yaw: number
}

export interface SectionPlaque {
  section: Section
  x: number
  z: number
  yaw: number
  w: number
}

export interface LightboxCtx {
  interaction: Interaction
  loaders: (() => Promise<unknown>)[]
  /** Atlas side in px (atlasSize(bakedTextureMax)). */
  atlas: number
}

const HIDDEN = new MeshBasicMaterial({ visible: false })
const PENDING = new MeshBasicMaterial({ color: '#f3ead9' })
const HOUSING = new MeshBasicMaterial({ color: '#4a3a2c' })

/** Offset (dx along the face, dz out of it) from a placed item, in shop-local x/z. */
function at(it: { x: number; z: number; yaw: number }, dx: number, dz: number): [number, number] {
  const c = Math.cos(it.yaw)
  const s = Math.sin(it.yaw)
  return [it.x + dx * c + dz * s, it.z - dx * s + dz * c]
}

function fit(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number): void {
  g.font = font(px)
  while (px > 8 && g.measureText(text).width > maxW) g.font = font(--px)
}

function drawCell(g: CanvasRenderingContext2D, im: HTMLCanvasElement | null, p: Product, x: number, y: number, cw: number, ch: number, ph: number): void {
  const m = Math.round((cw * LIGHTBOX.margin) / (LIGHTBOX.w + 2 * LIGHTBOX.margin))
  // Lit margin, then the photo cover-cropped into the window.
  g.fillStyle = '#fff6e6'
  g.fillRect(x, y, cw, ph)
  if (im) {
    const w = cw - 2 * m
    const h = ph - 2 * m
    const s = Math.max(w / im.width, h / im.height)
    g.save()
    g.beginPath()
    g.rect(x + m, y + m, w, h)
    g.clip()
    g.drawImage(im, x + m + (w - im.width * s) / 2, y + m + (h - im.height * s) / 2, im.width * s, im.height * s)
    g.restore()
  }
  // Plaque: title, then price (sale: old price struck through + badge).
  const py = y + ph
  const pw = cw - 2 * m
  const pH = ch - ph
  g.fillStyle = '#f4ede3'
  g.fillRect(x + m, py, pw, pH)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = BOUTIQUE_INK
  fit(g, p.title, (px) => `500 ${px}px ${BRAND.fontLatin}`, Math.round(cw * 0.085), pw * 0.92)
  g.fillText(p.title, x + cw / 2, py + pH * 0.32)
  const off = discountPercent(p)
  const price = formatPrice(p.price, 'en')
  g.fillStyle = BRAND.magenta
  g.font = `700 ${Math.round(cw * 0.095)}px ${BRAND.fontUi}`
  if (p.compareAtPrice && off) {
    const old = formatPrice(p.compareAtPrice, 'en')
    g.textAlign = 'right'
    g.fillText(price, x + cw / 2 - cw * 0.02, py + pH * 0.72)
    g.textAlign = 'left'
    g.fillStyle = '#9a8f96'
    g.font = `400 ${Math.round(cw * 0.07)}px ${BRAND.fontUi}`
    const ox = x + cw / 2 + cw * 0.03
    g.fillText(old, ox, py + pH * 0.73)
    g.fillRect(ox, py + pH * 0.73, g.measureText(old).width, Math.max(1, cw * 0.006))
    // Badge on the photo's top corner.
    g.fillStyle = BRAND.magenta
    g.fillRect(x + m + cw * 0.04, y + m + cw * 0.04, cw * 0.24, cw * 0.1)
    g.fillStyle = '#fff'
    g.textAlign = 'center'
    g.font = `700 ${Math.round(cw * 0.06)}px ${BRAND.fontUi}`
    g.fillText(`-${off}%`, x + m + cw * 0.16, y + m + cw * 0.09)
  } else g.fillText(price, x + cw / 2, py + pH * 0.72)
}

/** Lightboxes for `items` (positions from placeOnRuns): housings batched, faces in atlases. */
export function buildLightboxes(ctx: LightboxCtx, f: BatchFrame, parent: Group, items: PlacedProduct[]): void {
  const L = LIGHTBOX
  const boxW = L.w + 2 * L.margin
  const boxH = L.h + 2 * L.margin
  // Housings: deep bronze-dark box behind each face, bronze frame bars, cream plaque backing.
  for (const it of items) {
    const [hx, hz] = at(it, 0, -0.045)
    f.box(HOUSING, hx, L.y, hz, boxW + 2 * L.frame, boxH + 2 * L.frame, 0.08, { rotY: it.yaw })
    for (const sy of [-1, 1]) {
      const [x, z] = at(it, 0, 0.01)
      f.box(BRONZE, x, L.y + sy * (boxH / 2 + L.frame / 2), z, boxW + 2 * L.frame, L.frame, 0.03, { rotY: it.yaw })
    }
    for (const sx of [-1, 1]) {
      const [x, z] = at(it, sx * (boxW / 2 + L.frame / 2), 0.01)
      f.box(BRONZE, x, L.y, z, L.frame, boxH, 0.03, { rotY: it.yaw })
    }
    const [px, pz] = at(it, 0, -0.012)
    f.box(CREAM, px, L.plaqueY, pz, L.plaqueW + 0.04, L.plaqueH + 0.04, 0.02, { rotY: it.yaw })
  }

  // Hit planes and hover outlines.
  for (const it of items) {
    const top = L.y + boxH / 2
    const bottom = L.plaqueY - L.plaqueH / 2
    const hit = new Mesh(new PlaneGeometry(boxW, top - bottom), HIDDEN)
    const [x, z] = at(it, 0, 0.012)
    hit.position.set(x, (top + bottom) / 2, z)
    hit.rotation.y = it.yaw
    parent.add(hit)
    const hl = new Mesh(frameGeometry(boxW + 0.1, top - bottom + 0.1), HOVER_MAT)
    hl.position.z = -0.004
    hl.visible = false
    hit.add(hl)
    ctx.interaction.add({
      object: hit,
      kind: 'product',
      label: () => openProductLabel(it.product),
      onInteract: () => store.getState().openProduct(it.product.id),
      highlight: (on) => (hl.visible = on),
      maxDist: 4,
    })
  }

  // Faces: one atlas (and one mesh) per grid's worth of items.
  const grid = atlasGrid(ctx.atlas)
  const per = grid.cols * grid.rows
  for (let a = 0; a * per < items.length; a++) {
    const batch = items.slice(a * per, (a + 1) * per)
    const S = ctx.atlas
    const quads = batch.flatMap((it, i) => {
      const c = i % grid.cols
      const r = Math.floor(i / grid.cols)
      const u0 = (c * grid.cw) / S
      const u1 = ((c + 1) * grid.cw) / S
      const vTop = 1 - (r * grid.ch) / S
      const vPhoto = 1 - (r * grid.ch + grid.ph) / S
      const vBottom = 1 - ((r + 1) * grid.ch) / S
      const inset = ((L.margin / boxW) * grid.cw) / S
      const face = (w: number, h: number, y: number, uu0: number, uu1: number, v0: number, v1: number) => {
        const q = new PlaneGeometry(w, h)
        const uv = q.getAttribute('uv')
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uu0 + uv.getX(k) * (uu1 - uu0), v0 + uv.getY(k) * (v1 - v0))
        const [x, z] = at(it, 0, 0)
        return q.rotateY(it.yaw).translate(x, y, z)
      }
      return [
        face(boxW, boxH, L.y, u0, u1, vPhoto, vTop),
        face(L.plaqueW, L.plaqueH, L.plaqueY, u0 + inset, u1 - inset, vBottom, vPhoto),
      ]
    })
    const mesh = new Mesh(mergeGeometries(quads), PENDING)
    parent.add(mesh)
    ctx.loaders.push(async () => {
      const [c, g] = makeCanvas(S, S)
      g.fillStyle = '#f3ead9'
      g.fillRect(0, 0, S, S)
      const imgs = await Promise.all(
        batch.map((it) =>
          loadProductTexture(it.product.images[1] ?? it.product.images[0], 512)
            .then((r) => r.image as HTMLCanvasElement)
            .catch(() => null),
        ),
      )
      for (let i = 0; i < batch.length; i++) {
        if (i % 4 === 0) await imagePacer.slot()
        drawCell(g, imgs[i], batch[i].product, (i % grid.cols) * grid.cw, Math.floor(i / grid.cols) * grid.ch, grid.cw, grid.ch, grid.ph)
      }
      const mat = imageMat(canvasTexture(c))
      registerBloom(mat, BLOOM_WEIGHT.lightbox)
      mesh.material = mat
    })
  }
}

/** Section plaques above lightbox groups: one atlas, one mesh. */
export function buildSectionPlaques(ctx: LightboxCtx, parent: Group, plaques: SectionPlaque[]): void {
  if (!plaques.length || typeof document === 'undefined') return
  const RH = 192
  const H = Math.min(4096, plaques.length * RH)
  const [c, g] = makeCanvas(1024, H)
  plaques.forEach((pl, i) => {
    const t = boutiqueHeader(pl.section)
    g.drawImage(t.image as HTMLCanvasElement, 0, i * RH)
    t.dispose()
  })
  const tex = canvasTexture(c)
  const quads = plaques.map((pl, i) => {
    const h = 0.3
    const q = new PlaneGeometry(pl.w, h)
    const uv = q.getAttribute('uv')
    const v1 = 1 - (i * RH) / H
    const v0 = 1 - ((i + 1) * RH) / H
    for (let k = 0; k < uv.count; k++) uv.setY(k, v0 + uv.getY(k) * (v1 - v0))
    const [x, z] = at(pl, 0, 0.004)
    return q.rotateY(pl.yaw).translate(x, LIGHTBOX.sectionY, z)
  })
  parent.add(new Mesh(mergeGeometries(quads), imageMat(tex)))
}
```

Remove the unused `px/pz` lines in `face` if lint complains; they're harmless placeholders for the 2 mm offset. Better: delete them and pass `at(it, 0, 0.002)` into `face` for the plaque only.

- [ ] **Step 4: Pop-up texture and i18n**

  1. In `signage.ts`, add after `comingSoonTexture()`:

```ts
/** Pop-up unit with no guest brand this month: plum hoarding, "122 Pop-up · Book this space". */
export function popupTexture(): CanvasTexture {
  const [c, g] = makeCanvas(1024, 640)
  const grad = g.createLinearGradient(0, 0, 0, 640)
  grad.addColorStop(0, '#5b2b82')
  grad.addColorStop(1, '#3e1c5c')
  g.fillStyle = grad
  g.fillRect(0, 0, 1024, 640)
  g.strokeStyle = 'rgba(232,194,122,0.8)'
  g.lineWidth = 6
  g.strokeRect(24, 24, 976, 592)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#f4ede3'
  g.font = `600 44px ${BRAND.fontLatin}`
  g.fillText(spaced('DISTRICT 122'), 512, 120)
  g.font = `700 120px ${BRAND.fontLatin}`
  g.fillText('POP-UP', 512, 260)
  g.font = `500 40px ${BRAND.fontLatin}`
  g.fillText("This month's guest brand", 512, 380)
  g.direction = 'rtl'
  g.font = `700 46px ${BRAND.fontUi}`
  g.fillText('براندك هنا الشهر الجاي · احجز المساحة', 512, 470)
  g.direction = 'ltr'
  g.fillStyle = '#e8c27a'
  g.font = `600 34px ${BRAND.fontLatin}`
  g.fillText('BOOK THIS SPACE', 512, 556)
  return canvasTexture(c)
}
```

  2. i18n: `popupBook: { ar: 'احجز المساحة دي لبراندك', en: 'Book this space for your brand' }`. It's used later by the hint label only if needed; keep it for the HUD.

- [ ] **Step 5: Parameterise the storefront in `shop.ts`**
  1. Imports: `import { showcaseMesh } from './showcase'`, `import { popupTexture } from './signage'` (merge into the existing signage import), `import type { Opening } from '../config/layoutMath'`.
  2. In `buildShop`:
     - Replace `const depth = MALL.shopDepth` and `const half = MALL.shopLen / 2` with `const depth = shop.depth` and `const half = shop.front / 2`.
     - Soon hoarding: `new PlaneGeometry(shop.front - 0.6, 3.75), imageMat(shop.popup ? popupTexture() : comingSoonTexture())` and the brass bar `shop.front - 0.5`.
  3. **Interior gate:** measure to the nearest point of the frontage. Replace the `near` line with:

```ts
      // Distance to the nearest point of the unit's frontage (long flagships don't pop).
      const dx = px - shop.entrance.x
      const dz = pz - shop.entrance.z
      const along = Math.max(-half, Math.min(half, dx * Math.cos(shop.yaw) - dz * Math.sin(shop.yaw)))
      const fx = shop.entrance.x + along * Math.cos(shop.yaw)
      const fz = shop.entrance.z - along * Math.sin(shop.yaw)
      const near = withinGate(handles.interiorVisible, Math.hypot(px - fx, pz - fz), 19, 3)
```

     Also change the lazy-load distance to the same frontage point: compute `fx`/`fz` the same way before the `load()` check and use `Math.hypot(px - fx, pz - fz) < 34`. (Hoist the frontage computation above both checks.)
  4. **Lounge:** `buildLounge(f, interior, loaders, ctx.kit ?? null, ctx.colliders, depth)`. In `buildLounge`, add a parameter `depth = 14` and delete its `const depth = MALL.shopDepth`.
  5. **Storefront:**
     - Change the signature to `storefront(f, group, shop, section, mono, products, loaders, tm)` (unchanged), and inside use `shop.front`/`shop.openings`.
     - Replace `const half = MALL.shopLen / 2` with `const half = shop.front / 2`.
     - Fascia: width `fw = Math.min(6, shop.front - 1.2)`, height `fh = 1.5 * fw / 6`, at `x = 0`. Scale the face plane `5.84 * fw/6 × 1.36 * fh/1.5` and the halo the same way.
     - Blade: unchanged (`bx = -half + 0.9`).
     - Replace the whole "Display windows" loop and the figure code (`const cx = (WIN.x0 + WIN.x1) / 2` through the end of the function) with:

```ts
  // Display windows (mirrored either side of each opening) and compact sidelights.
  const glass = windowGlass()
  const plinthXs: number[] = []
  for (const o of shop.openings) {
    if (o.sidelight) {
      for (const sx of [-1, 1]) {
        const a = o.cx + sx * o.sidelight.x0
        const b = o.cx + sx * o.sidelight.x1
        const x = (a + b) / 2
        const w = Math.abs(b - a)
        f.box(glass, x, 0.3 + 3.3 / 2, 0.02, w, 3.3, 0.012)
        f.box(MAT.brass, x, 0.3, 0.03, w + 0.04, 0.05, 0.05)
        f.box(MAT.brass, x, 3.6, 0.03, w + 0.04, 0.05, 0.05)
      }
      continue
    }
    if (!o.window) continue
    const W = o.window
    const vw = W.x1 - W.x0
    const gh = WIN.y1 - WIN.y0
    const gg = gh - 0.005
    const rz0 = 0.01
    for (const sx of [-1, 1]) {
      const x = o.cx + sx * (W.x0 + W.x1) / 2
      f.box(cream, x, 0.145, WIN.z / 2 - 0.005, vw, 0.31, WIN.z + 0.01, { collide: true })
      f.box(glass, x, WIN.y0 + gg / 2, WIN.z, vw, gg, 0.012)
      for (const ex of [W.x0, W.x1]) {
        const px = o.cx + sx * ex
        f.box(glass, px, WIN.y0 + gg / 2, (rz0 + WIN.z) / 2, 0.012, gg, WIN.z - rz0)
        f.box(MAT.brass, px, WIN.y0 + gh / 2, WIN.z, 0.04, gh, 0.04)
        f.box(MAT.brass, px, WIN.y0 + 0.004, WIN.z / 2, 0.04, 0.048, WIN.z)
      }
      f.box(MAT.brass, x, WIN.y0 + 0.005, WIN.z, vw + 0.04, 0.05, 0.04)
      f.box(MAT.brass, x, WIN.y1 - 0.015, WIN.z, vw + 0.04, 0.05, 0.04)
      f.box(cream, x, WIN.y1 + 0.12, WIN.z / 2 + 0.015, vw + 0.06, 0.24, WIN.z + 0.05)
      f.box(MAT.lightWarm, x, WIN.y1 - 0.005, WIN.z * 0.45, vw - 0.3, 0.02, 0.04)
      for (const pl of W.plinths) {
        const px = o.cx + sx * pl
        f.box(cream, px, (WIN.y0 + PLINTH_TOP - 0.02) / 2, 0.3, 0.72, PLINTH_TOP - 0.02 - WIN.y0 + 0.01, 0.4)
        f.box(MAT.brass, px, PLINTH_TOP - 0.01, 0.3, 0.74, 0.02, 0.42)
        f.box(MAT.lightWarm, px, PLINTH_TOP - 0.065, 0.502, 0.66, 0.025, 0.01)
        const cw = f.toWorld(px, WIN.y1 - 0.02, 0.3)
        addCone(cw.x, cw.y, cw.z, WIN.y1 - PLINTH_TOP - 0.05, 0.26, 0, 0)
        plinthXs.push(px)
      }
      const a = o.cx + sx * W.x0
      const b = o.cx + sx * W.x1
      aoFloorJunction(Math.min(a, b), WIN.z + 0.005, Math.max(a, b), WIN.z + 0.005, 0, 1, f.base, 0.25, 0.4)
    }
  }

  // Window figures: prefer clean cut-outs (they stand on the plinth like a mannequin).
  const rank = (p: Product) => (hasCutout(p) ? (p.modelOutfit ? 0 : 1) : 2)
  const ranked = [...products].sort((a, b) => rank(a) - rank(b))
  if (!ranked.length) return
  showcaseMesh(
    { interaction: ctx.interaction, loaders },
    group,
    plinthXs.map((x, i) => ({ product: ranked[i % ranked.length], x, y: PLINTH_TOP + FIG_H / 2, z: 0.3, yaw: 0, w: FIG_W, h: FIG_H })),
    tm / 2,
  )
```

     - `storefront` needs `ctx` for the interaction, so add `ctx: ShopContext` as its first parameter and update the call site. Remove the now-unused `WIN.x0/x1/poster/plinth` fields from `WIN` (keep `z`, `y0`, `y1`).
  6. **Window posters:** replace the `products.slice(0, 2).forEach(...)` block (window posters) with posters at every `o.window.posters` position, mirrored. Collect the x positions first:

```ts
  const posterXs = shop.openings.flatMap((o) => (o.window ? o.window.posters.flatMap((p) => [o.cx - p, o.cx + p]) : []))
  posterXs.forEach((x, i) => {
    const p = products[(i + 1) % Math.max(1, products.length)]
    if (!p) return
    const w = 1.38
    const h = w * (1306 / 1080)
    const y = 1.95
    // …the existing poster mesh / framedPlane / loader / interaction code, using x, y, w, h…
  })
```

     Keep the non-`mono` fallback branch working by giving it the same positions (all brands have `mono`, so in practice it's unused).

- [ ] **Step 6: Typecheck, test, look**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

Then in the preview:
1. Teleport to `pistage` (flagship), `noha-collection` (standard), `axis` (compact) and `levoile`.
2. Take a screenshot of each storefront from the corridor (`lv.game.teleport` then step back: `lv.game.playerPose`/move or use the corridor point in front).
3. Check:
   - the flagship has 2 long windows with 4 figures;
   - the compact has sidelights;
   - Le Voile shows 2 standard fronts;
   - the pop-up shows the plum kiosk;
   - no console errors.
- [ ] **Step 7: Commit**

```bash
git add src/world/lightbox.ts src/world/showcase.ts src/world/displays.ts src/world/shop.ts src/world/signage.ts src/i18n/i18n.ts
git commit -m "feat(world): storefronts per tier, lightbox atlas and showcase figure builders"
```

---

### Task 6: Campaign boutique interiors

**Files:**
- Create: `src/world/boutiqueShop.ts`
- Modify: `src/world/shop.ts`:
  - after the bespoke check, call `buildBoutique` instead of the kit/procedural furnishing and the old models/staff/counter code;
  - `rewardsCounter` keeps its signature.
- Modify: `src/interact/interaction.ts`: `InteractKind` adds `'catalog'`.
- Modify: `src/state/store.ts`:
  - `Overlay` adds `'brandCatalog'`;
  - `AppState.catalogBrand: string | null` (initial `null`, not persisted).

**Interfaces:**
- Consumes:
  - `planBoutique`, `placeOnRuns`, `atlasSize`, `HERO`, `LIGHTBOX`, `allocate`;
  - `buildLightboxes`, `buildSectionPlaques`;
  - `showcaseMesh`;
  - `rewardsCounter(ctx, f, interior, brandId, color, x, z)`.
- Produces:
  - `buildBoutique(ctx: ShopContext, f: BatchFrame, handles: ShopHandles, loaders: (() => Promise<unknown>)[], o: BoutiqueOpts): void`
  - `BoutiqueOpts { tier: Tier; front: number; depth: number; offsetX: number; products: Product[]; sections: Section[]; brand: BrandDef; skipCounter?: boolean }`

- [ ] **Step 1: Store and interaction types**
  - `interaction.ts`: add `| 'catalog'` to `InteractKind`.
  - `store.ts`:
    - add `| 'brandCatalog'` to `Overlay`;
    - in `AppState`, add `/** Brand whose full catalogue the "All products" overlay shows. */ catalogBrand: string | null` next to `rewardsBrand`;
    - add `catalogBrand: null,` to the initial state next to `rewardsBrand: null`.
  - Don't add it to `partialize`.

- [ ] **Step 2: Create `src/world/boutiqueShop.ts`**

```ts
// Style-B "campaign boutique" interior for a brand shop of any tier (spec
// 2026-10-06-shop-tiers-design §4): lightbox walls grouped by section with
// plaques, a hero campaign wall, standees on marble plinths, oak islands with
// product cut-outs, an "All products" screen, the 122 Coins counter, ceiling
// slot lights and (flagships) a fitting room. Positions come from the pure
// plan (config/boutiquePlan.ts); everything static is batched, every product
// face set is one atlas mesh.

import { Group, Mesh, PlaneGeometry } from 'three'
import { atlasSize, placeOnRuns, planBoutique, type BoutiquePlan, type Spot } from '../config/boutiquePlan'
import { allocate, type Tier } from '../config/layoutMath'
import type { BrandDef } from '../config/mall'
import { MALL } from '../config/layout'
import { BLOOM_WEIGHT, registerBloom } from '../engine/bloom'
import { canvasTexture, loadImage, loadProductTexture, makeCanvas } from '../engine/textures'
import { hasCutout, type Product, type Section } from '../data/types'
import { t } from '../i18n/i18n'
import { store } from '../state/store'
import type { BatchFrame } from '../engine/batcher'
import { BRAND } from '../config/brand'
import { addCone } from './glow'
import { MAT, imageMat, tintMat } from './materials'
import { blobShadow } from './props'
import { labelSign } from './signage'
import { buildLightboxes, buildSectionPlaques, type PlacedProduct, type SectionPlaque } from './lightbox'
import { showcaseMesh, type ShowcaseItem } from './showcase'
import { rewardsCounter, type ShopContext, type ShopHandles } from './shop'
import { BRONZE, OAK, OAK_DARK } from './displays'

export interface BoutiqueOpts {
  tier: Tier
  front: number
  depth: number
  /** Shift of this boutique inside the unit's frame (Le Voile's hall is one half of its flagship). */
  offsetX: number
  products: Product[]
  /** The brand's own sections (for grouping and plaques); one section = no plaques split. */
  sections: Section[]
  brand: BrandDef
  /** Leave out the 122 Coins counter (Le Voile's hall: the boutique half has one). */
  skipCounter?: boolean
}

export function buildBoutique(ctx: ShopContext, f: BatchFrame, handles: ShopHandles, loaders: (() => Promise<unknown>)[], o: BoutiqueOpts): void {
  const plan = planBoutique(o.tier, o.front, o.depth)
  const ox = o.offsetX
  const g = new Group()
  g.position.x = ox
  g.updateMatrix()
  handles.interior.add(g)
  const gf = ctx.batcher.frame(f.base.clone().multiply(g.matrix), ctx.colliders)
  const SH = MALL.shopHeight

  walls(gf, o, plan)
  slotLights(gf, plan, SH)

  // ------------------------------------------------ lightboxes by section
  const groups = sectionGroups(o)
  const capacity = placeOnRuns(plan.runs, 9999).length
  const counts = allocate(groups.map((s) => s.items.length), capacity)
  const picked = groups.flatMap((s, i) => s.items.slice(0, counts[i]).map((p) => ({ p, section: s.section })))
  const spots = placeOnRuns(plan.runs, picked.length)
  const placed: PlacedProduct[] = spots.map((s, i) => ({ product: picked[i].p, ...s }))
  const lctx = { interaction: ctx.interaction, loaders, atlas: atlasSize(ctx.bakedTextureMax()) }
  buildLightboxes(lctx, gf, g, placed)
  if (groups.length > 1) buildSectionPlaques(lctx, g, plaquesFor(spots, picked.map((x) => x.section)))

  // ---------------------------------------------------------------- hero
  const heroProduct = o.products.find((p) => p.modelOutfit) ?? o.products[0]
  if (heroProduct) hero(ctx, gf, g, plan, o.brand, heroProduct, loaders)

  // ------------------------------------------------ standees + islands
  const used = new Set(placed.map((x) => x.product.id))
  const rank = (p: Product) => (hasCutout(p) ? (p.modelOutfit ? 0 : 1) : 2)
  const standeeProducts = [...o.products].sort((a, b) => rank(a) - rank(b))
  const standees: ShowcaseItem[] = plan.standees.map((s, i) => {
    plinth(gf, s.x, s.z, ctx)
    const w = f.toWorld(s.x + ox, 0, s.z)
    addCone(w.x, SH - 0.05, w.z, SH - 2.0, 0.5, 0, 0)
    const sh = blobShadow(1.1, 1.1, 0.5)
    sh.position.set(s.x, 0.005, s.z)
    g.add(sh)
    return { product: standeeProducts[i % standeeProducts.length], x: s.x, y: 0.12 + 0.9, z: s.z, yaw: s.yaw, w: 0.9, h: 1.8 }
  })
  const islandPool = [...o.products.filter((p) => hasCutout(p) && !used.has(p.id)), ...o.products.filter((p) => hasCutout(p))]
  const islandItems: ShowcaseItem[] = []
  plan.islands.forEach((is, k) => {
    island(gf, is, o.brand.color)
    const n = Math.max(2, Math.min(4, Math.floor(is.w / 0.55)))
    for (let j = 0; j < n && islandPool.length; j++) {
      const p = islandPool[(k * 4 + j) % islandPool.length]
      const x = is.x + (j - (n - 1) / 2) * (is.w / n)
      gf.block(tintMat('#f3ece4', 1, 0.8), x, 0.79, is.z, 0.36, 0.08, 0.3)
      islandItems.push({ product: p, x, y: 0.87 + 0.25, z: is.z, yaw: 0, w: 0.42, h: 0.5 })
    }
  })
  const tm = ctx.textureMax()
  showcaseMesh({ interaction: ctx.interaction, loaders }, g, standees, tm / 2)
  showcaseMesh({ interaction: ctx.interaction, loaders }, g, islandItems, tm / 4)

  // --------------------------------------------- screen, counter, fitting
  screen(ctx, gf, g, plan.screen, o, loaders)
  if (!o.skipCounter) rewardsCounter(ctx, gf, g, o.brand.id, o.brand.color, plan.counter.x, plan.counter.z)
  if (plan.fitting) fitting(gf, g, plan.fitting)

  // ------------------------------------------------ models + assistant
  const modelProducts = o.products.filter((p) => p.modelOutfit)
  plan.models.slice(0, modelProducts.length).forEach((s, i) => {
    plinth(gf, s.x, s.z, ctx)
    const w = f.toWorld(s.x + ox, 0, s.z)
    handles.modelSpots.push({ x: w.x, z: w.z, yaw: handles.layout.yaw + s.yaw, product: modelProducts[i] })
  })
  if (!handles.staffSpot) {
    const w = f.toWorld(plan.staff.x + ox, 0, plan.staff.z)
    handles.staffSpot = { x: w.x, z: w.z, yaw: handles.layout.yaw + plan.staff.yaw }
  }
}

// ---------------------------------------------------------------------------

function sectionGroups(o: BoutiqueOpts): { section: Section; items: Product[] }[] {
  const byId = new Map(o.products.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const out = o.sections
    .map((section) => ({
      section,
      items: section.productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p && !seen.has(p.id) && (seen.add(p.id), true)),
    }))
    .filter((s) => s.items.length)
  const rest = o.products.filter((p) => !seen.has(p.id))
  if (rest.length) {
    const fallback = out[0]?.section ?? o.sections[0]
    if (out[0]) out[0].items.push(...rest)
    else if (fallback) out.push({ section: fallback, items: rest })
  }
  return out
}

/** One plaque over each run's contiguous stretch of the same section. */
function plaquesFor(spots: Spot[], sections: Section[]): SectionPlaque[] {
  const out: SectionPlaque[] = []
  let i = 0
  while (i < spots.length) {
    let j = i
    while (
      j + 1 < spots.length &&
      sections[j + 1] === sections[i] &&
      spots[j + 1].yaw === spots[i].yaw &&
      Math.hypot(spots[j + 1].x - spots[j].x, spots[j + 1].z - spots[j].z) < 1.2
    )
      j++
    const n = j - i + 1
    const a = spots[i]
    const b = spots[j]
    out.push({ section: sections[i], x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, yaw: a.yaw, w: Math.min(2.6, n * 1.1 - 0.15) })
    i = j + 1
  }
  return out
}

function walls(f: BatchFrame, o: BoutiqueOpts, plan: BoutiquePlan): void {
  const h = o.front / 2
  const SH = MALL.shopHeight
  const plaster = tintMat('#efe6d8', 1, 0.92)
  // Cream plaster on the inside faces (1 cm proud of the shell), bronze shadow-gap at the top.
  f.box(plaster, 0, SH / 2, -o.depth + 0.16, o.front - 0.3, SH, 0.02)
  for (const sx of [-1, 1]) {
    f.box(plaster, sx * (h - 0.16), SH / 2, -o.depth / 2 - 0.15, 0.02, SH, o.depth - 0.6)
    f.box(MAT.brass, sx * (h - 0.17), SH - 0.32, -o.depth / 2 - 0.15, 0.02, 0.03, o.depth - 0.6)
  }
  f.box(MAT.brass, 0, SH - 0.32, -o.depth + 0.17, o.front - 0.3, 0.03, 0.02)
  // Free-standing lightbox walls (flagships): oak plinth, cream body, bronze cap.
  for (const w of plan.freeWalls) {
    f.block(OAK_DARK, w.x, 0, w.z, 0.24, 0.12, w.len + 0.1, { collide: true })
    f.block(tintMat('#f3ece4', 1, 0.85), w.x, 0.12, w.z, 0.12, 2.42, w.len)
    f.box(BRONZE, w.x, 2.56, w.z, 0.16, 0.04, w.len + 0.04)
  }
}

function slotLights(f: BatchFrame, plan: BoutiquePlan, SH: number): void {
  for (const l of plan.lights) {
    const len = Math.hypot(l.x1 - l.x0, l.z1 - l.z0)
    const alongZ = Math.abs(l.z1 - l.z0) > Math.abs(l.x1 - l.x0)
    const x = (l.x0 + l.x1) / 2
    const z = (l.z0 + l.z1) / 2
    f.box(MAT.lightWarm, x, SH - 0.03, z, alongZ ? 0.06 : len, 0.02, alongZ ? len : 0.06)
  }
}

function plinth(f: BatchFrame, x: number, z: number, ctx: ShopContext): void {
  f.cyl(MAT.brass, x, 0, z, 0.47, 0.03)
  f.cyl(MAT.marbleTop, x, 0.03, z, 0.45, 0.09)
  const w = f.toWorld(x, 0, z)
  ctx.colliders.circles.push({ x: w.x, z: w.z, r: 0.5 })
}

function island(f: BatchFrame, is: { x: number; z: number; w: number; d: number }, color: string): void {
  f.block(OAK_DARK, is.x, 0, is.z, is.w - 0.1, 0.06, is.d - 0.1, { collide: true })
  f.block(OAK, is.x, 0.06, is.z, is.w, 0.68, is.d)
  f.block(MAT.marbleTop, is.x, 0.74, is.z, is.w + 0.04, 0.05, is.d + 0.04)
  f.box(BRONZE, is.x, 0.765, is.z + is.d / 2 + 0.021, is.w + 0.04, 0.05, 0.004)
  // Brand-colour inlay strip on the front face.
  f.box(tintMat(color, 1, 0.5), is.x, 0.42, is.z + is.d / 2 + 0.002, is.w * 0.8, 0.05, 0.004)
}

function hero(ctx: ShopContext, f: BatchFrame, g: Group, plan: BoutiquePlan, brand: BrandDef, p: Product, loaders: (() => Promise<unknown>)[]): void {
  const H = plan.hero
  f.box(MAT.brass, H.x, H.y, H.z - 0.02, H.w + 0.12, H.h + 0.12, 0.06)
  f.box(tintMat(brand.color, 1, 0.5), H.x, H.y - H.h / 2 - 0.08, H.z + 0.012, H.w + 0.12, 0.02, 0.004)
  const plane = new Mesh(new PlaneGeometry(H.w, H.h), imageMat(null, { color: '#f3ead9' }))
  plane.position.set(H.x, H.y, H.z + 0.015)
  g.add(plane)
  ctx.interaction.add({
    object: plane,
    kind: 'product',
    label: () => `${brand.name} · ${p.title}`,
    onInteract: () => store.getState().openProduct(p.id),
    maxDist: 6,
  })
  loaders.push(async () => {
    const W = 1024
    const Hh = Math.round((W * H.h) / H.w)
    const [c, cg] = makeCanvas(W, Hh)
    const { image } = await loadProductTexture(p.images[1] ?? p.images[0], 1024)
    const im = image as HTMLCanvasElement
    const s = Math.max(W / im.width, Hh / im.height)
    cg.drawImage(im, (W - im.width * s) / 2, (Hh - im.height * s) * 0.3, im.width * s, im.height * s)
    // Brand band along the bottom.
    const bh = Math.round(Hh * 0.18)
    cg.fillStyle = brand.color
    cg.globalAlpha = 0.92
    cg.fillRect(0, Hh - bh, W, bh)
    cg.globalAlpha = 1
    cg.fillStyle = '#fbf6ef'
    cg.textAlign = 'center'
    cg.textBaseline = 'middle'
    if (brand.logo) {
      try {
        const logo = await loadImage(brand.logo)
        const k = Math.min((W * 0.4) / logo.width, (bh * 0.7) / logo.height)
        cg.drawImage(logo, W / 2 - (logo.width * k) / 2, Hh - bh / 2 - (logo.height * k) / 2, logo.width * k, logo.height * k)
      } catch {
        cg.font = `600 ${Math.round(bh * 0.5)}px ${BRAND.fontLatin}`
        cg.fillText(brand.name.toUpperCase(), W / 2, Hh - bh / 2)
      }
    } else {
      cg.font = `600 ${Math.round(bh * 0.5)}px ${BRAND.fontLatin}`
      cg.fillText(brand.name.toUpperCase(), W / 2, Hh - bh / 2)
    }
    const mat = imageMat(canvasTexture(c))
    registerBloom(mat, BLOOM_WEIGHT.lightbox)
    plane.material = mat
  })
}

function screen(ctx: ShopContext, f: BatchFrame, g: Group, s: Spot, o: BoutiqueOpts, loaders: (() => Promise<unknown>)[]): void {
  const W = 0.9
  const H = 1.6
  const y = 1.5
  const c = Math.cos(s.yaw)
  const sn = Math.sin(s.yaw)
  f.box(MAT.brass, s.x - 0.03 * sn, y, s.z - 0.03 * c, W + 0.08, H + 0.08, 0.05, { rotY: s.yaw })
  const plane = new Mesh(new PlaneGeometry(W, H), imageMat(null, { color: '#1f1a17' }))
  plane.position.set(s.x, y, s.z)
  plane.rotation.y = s.yaw
  g.add(plane)
  ctx.interaction.add({
    object: plane,
    kind: 'catalog',
    label: () => t('browseAll', store.getState().lang),
    onInteract: () => store.getState().set({ overlay: 'brandCatalog', catalogBrand: o.brand.id }),
    maxDist: 3.6,
  })
  loaders.push(async () => {
    const [cv, cg] = makeCanvas(512, 910)
    cg.fillStyle = '#1f1a17'
    cg.fillRect(0, 0, 512, 910)
    cg.textAlign = 'center'
    cg.textBaseline = 'middle'
    cg.fillStyle = '#f4ede3'
    cg.font = `600 40px ${BRAND.fontLatin}`
    cg.fillText(o.brand.name.toUpperCase(), 256, 70)
    cg.fillStyle = '#e8c27a'
    cg.font = `500 26px ${BRAND.fontLatin}`
    cg.fillText(`ALL ${o.products.length} PRODUCTS`, 256, 118)
    cg.direction = 'rtl'
    cg.font = `700 30px ${BRAND.fontUi}`
    cg.fillText('كل المنتجات', 256, 160)
    cg.direction = 'ltr'
    const thumbs = o.products.slice(0, 9)
    const imgs = await Promise.all(thumbs.map((p) => loadProductTexture(p.images[0], 256).then((r) => r.image as HTMLCanvasElement).catch(() => null)))
    imgs.forEach((im, i) => {
      if (!im) return
      const cw = 150
      const x = 31 + (i % 3) * (cw + 10)
      const yy = 200 + Math.floor(i / 3) * (cw * 1.2 + 10)
      const sc = Math.max(cw / im.width, (cw * 1.2) / im.height)
      cg.save()
      cg.beginPath()
      cg.rect(x, yy, cw, cw * 1.2)
      cg.clip()
      cg.drawImage(im, x + (cw - im.width * sc) / 2, yy + (cw * 1.2 - im.height * sc) / 2, im.width * sc, im.height * sc)
      cg.restore()
    })
    cg.fillStyle = BRAND.magenta
    cg.fillRect(96, 830, 320, 56)
    cg.fillStyle = '#fff'
    cg.font = `700 26px ${BRAND.fontUi}`
    cg.fillText('TAP TO BROWSE', 256, 858)
    const mat = imageMat(canvasTexture(cv))
    registerBloom(mat, BLOOM_WEIGHT.screen)
    plane.material = mat
  })
}

function fitting(f: BatchFrame, g: Group, r: { x0: number; z0: number; x1: number; z1: number }): void {
  const curtain = tintMat('#6d3d8f', 1, 0.95)
  const zf = r.z1 // booth fronts face the shop (+z)
  const n = 2
  const bw = (r.x1 - r.x0) / n
  for (let i = 0; i <= n; i++) f.block(OAK, r.x0 + i * bw, 0, (r.z0 + zf) / 2, 0.08, 2.4, zf - r.z0, { collide: true })
  f.box(OAK, (r.x0 + r.x1) / 2, 2.44, zf, r.x1 - r.x0 + 0.08, 0.08, 0.08)
  for (let i = 0; i < n; i++) {
    const cx = r.x0 + (i + 0.5) * bw
    f.box(curtain, cx, 1.22, zf - 0.04, bw - 0.12, 2.3, 0.04, { collide: true })
  }
  f.cyl(tintMat('#c9b8a6', 1, 0.9), (r.x0 + r.x1) / 2, 0, zf + 1.1, 0.32, 0.42, { collide: true })
  const sign = new Mesh(new PlaneGeometry(1.4, 0.35), imageMat(labelSign('FITTING', 'البروفة', { bg: '#f4ede3', fg: '#6b4f35', w: 1024, h: 256 })))
  sign.position.set((r.x0 + r.x1) / 2, 2.75, zf + 0.05)
  g.add(sign)
}
```

  - `blobShadow(w, d, opacity)` (`props.ts:165`) returns a mesh that is already flat; `shop.ts` adds it to a group directly the same way.

- [ ] **Step 3: Use it from `buildShop`**

In `shop.ts`, after `if (shop.brand && ctx.bespoke?.[shop.brand.id]?.(ctx, f, handles, loaders)) return handles`, delete everything up to `return handles` at the end of `buildShop`:
- the tinted back wall;
- the inner fascia;
- the plants;
- `ProductDisplay`;
- the kit/procedural switch;
- showcase models;
- the staff spot;
- the rewards counter.

Replace it with:

```ts
  if (shop.brand)
    buildBoutique(ctx, f, handles, loaders, {
      tier: shop.tier,
      front: shop.front,
      depth: shop.depth,
      offsetX: 0,
      products,
      sections: brandSubsections(shop.brand.id).length ? brandSubsections(shop.brand.id) : [section],
      brand: shop.brand,
    })
  return handles
```

Then:
- import `buildBoutique` from `./boutiqueShop` and `brandSubsections` from `'../data/mallCatalog'`;
- keep `ProductDisplay`, `rackDisplay`, … and `furnishWithKit` in the file (they're still used by nothing; mark them with `// Legacy furnishing (pre-tiers), kept for reference until the cleanup pass.`), or delete them if tsc reports unused-locals errors (the tsconfig decides).

**Circular import note:** `boutiqueShop.ts` imports `rewardsCounter` from `shop.ts`, and `shop.ts` imports `buildBoutique`. Both are function declarations used at call time, so ES module cycles are fine (the same pattern as `displays.ts` ↔ `shop.ts`).

- [ ] **Step 4: Typecheck, test, look and measure**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

In the preview:
1. Teleport into `pistage`, `nourhan`, `noha-collection`, `hashbag`, `axis`, `the-cause-wear` and `popup`.
2. Take a screenshot of each from inside the doorway looking in.
3. Check:
   - lightboxes are on the walls with photos and plaques, and grouped with section plaques;
   - the hero shows at the back;
   - standees stand on plinths;
   - islands show bags/shoes for HashBag / Slip & Go;
   - hovering a lightbox shows the plum outline, and E opens the product;
   - the screen label reads "Browse all products";
   - no console errors.
4. Run the Task 0 measurement snippet and paste the numbers into the perf notes under "After tiers (Task 6)". Draw calls inside a flagship should be at most baseline + 30.
- [ ] **Step 5: Commit**

```bash
git add src/world/boutiqueShop.ts src/world/shop.ts src/interact/interaction.ts src/state/store.ts docs/superpowers/notes/2026-10-06-shop-tiers-perf.md
git commit -m "feat(world): campaign boutique interiors per shop tier"
```

---

### Task 7: "All products" overlay

**Files:**
- Create: `src/ui/brandCatalog.ts`
- Modify: `src/main.ts` (mount it after `mountSocial`)
- Modify: `src/i18n/i18n.ts`: `allProducts`, `browseAll`, `productsCount`
- Modify: `src/styles/live.css`: `.brand-catalog` styles

**Interfaces:**
- Consumes:
  - `store.catalogBrand`, the `'brandCatalog'` overlay;
  - `brandSubsections(brandId)`;
  - `catalog()`;
  - `webImage(url, 'small')`;
  - `formatPrice`;
  - `paint`, `el`, `esc`, `onAction`, `ICONS`, `GameBridge`.
- Produces: `mountBrandCatalog(root: HTMLElement, game: GameBridge): void`.

- [ ] **Step 1: Add the i18n strings**

```ts
  allProducts: { ar: 'كل المنتجات', en: 'All products' },
  browseAll: { ar: 'اتفرجي على كل المنتجات', en: 'Browse all products' },
  productsCount: { ar: 'منتج', en: 'products' },
```

- [ ] **Step 2: Create `src/ui/brandCatalog.ts`**

```ts
// "All products" overlay, opened from a shop's screen: the brand's sections as
// tabs and a grid of its products; a product opens the usual product sheet.

import { brandById } from '../config/mall'
import { brandSubsections } from '../data/mallCatalog'
import { webImage } from '../data/webImage'
import type { Product } from '../data/types'
import { formatPrice, t } from '../i18n/i18n'
import { catalog, store, watch } from '../state/store'
import { el, esc, ICONS, onAction, paint, type GameBridge } from './dom'

export function mountBrandCatalog(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil hidden')
  root.appendChild(veil)
  let tab = 0

  const render = () => {
    const s = store.getState()
    const brand = s.catalogBrand ? brandById.get(s.catalogBrand) : null
    if (s.overlay !== 'brandCatalog' || !brand) {
      veil.classList.add('hidden')
      return
    }
    const L = s.lang
    const cat = catalog()
    const subs = brandSubsections(brand.id)
    const sections = subs.length ? subs : cat.sections.filter((x) => x.id === brand.id)
    const total = new Set(sections.flatMap((x) => x.productIds)).size
    tab = Math.min(tab, Math.max(0, sections.length - 1))
    const sec = sections[tab]
    const items = (sec?.productIds ?? []).map((id) => cat.byId.get(id)).filter((p): p is Product => !!p)
    const name = L === 'ar' ? brand.nameAr : brand.name
    paint(
      veil,
      `<div class="card wide brand-catalog" role="dialog" aria-modal="true" aria-label="${esc(t('allProducts', L))} · ${esc(name)}">
        <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        <div class="card-body">
          <div class="eyebrow">${esc(t('allProducts', L))} · ${total} ${esc(t('productsCount', L))}</div>
          <h2>${esc(name)}</h2>
          ${
            sections.length > 1
              ? `<div class="bc-tabs" role="tablist">${sections
                  .map((x, i) => `<button role="tab" class="bc-tab ${i === tab ? 'on' : ''}" aria-selected="${i === tab}" data-action="tab" data-i="${i}">${esc(L === 'ar' ? x.titleAr || x.title : x.title)}</button>`)
                  .join('')}</div>`
              : ''
          }
          <div class="bc-grid">${items
            .map(
              (p) => `<button class="bc-item" data-action="open" data-id="${esc(p.id)}">
                <img src="${esc(webImage(p.images[0], 'small'))}" alt="" loading="lazy" />
                <span class="bc-title">${esc(p.title)}</span>
                <span class="bc-price">${esc(formatPrice(p.price, L))}${p.compareAtPrice ? ` <s>${esc(formatPrice(p.compareAtPrice, L))}</s>` : ''}</span>
              </button>`,
            )
            .join('')}</div>
        </div>
      </div>`,
    )
  }

  onAction(veil, {
    close: () => game.resume(),
    tab: (b) => {
      tab = Number(b.dataset.i) || 0
      render()
    },
    open: (b) => store.getState().openProduct(b.dataset.id!),
  })
  veil.addEventListener('click', (e) => {
    if (e.target === veil) game.resume()
  })
  watch((s) => s.overlay, (o, prev) => {
    if (o === 'brandCatalog' && prev !== 'brandCatalog') tab = 0
    render()
  })
  watch((s) => s.lang, render)
}
```

If `t('close', …)` isn't a key, use the key the rewards overlay uses for its close label (it calls `t('close', L)`, so it exists).

- [ ] **Step 3: Styles (append to `src/styles/live.css`)**

```css
.brand-catalog { max-inline-size: min(960px, 94vw); }
.brand-catalog .bc-tabs { display: flex; gap: 8px; overflow-x: auto; padding-block: 6px 12px; scrollbar-width: none; }
.brand-catalog .bc-tab { white-space: nowrap; padding: 8px 14px; border-radius: 999px; background: var(--magenta-050); color: var(--magenta); font-weight: 700; }
.brand-catalog .bc-tab.on { background: var(--magenta); color: #fff; }
.brand-catalog .bc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; max-block-size: min(62vh, 640px); overflow-y: auto; padding-block-end: 8px; }
.brand-catalog .bc-item { display: flex; flex-direction: column; gap: 4px; text-align: start; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 2px 10px -6px rgba(70, 20, 55, 0.35); }
.brand-catalog .bc-item img { inline-size: 100%; aspect-ratio: 1080 / 1306; object-fit: cover; background: #f3ece4; }
.brand-catalog .bc-title { padding-inline: 10px; font-size: 13px; line-height: 1.3; }
.brand-catalog .bc-price { padding-inline: 10px; padding-block-end: 10px; font-weight: 700; color: var(--magenta); font-size: 14px; }
.brand-catalog .bc-price s { color: var(--muted); font-weight: 400; margin-inline-start: 4px; }
@media (max-width: 560px) { .brand-catalog .bc-grid { grid-template-columns: repeat(2, 1fr); } }
```

- [ ] **Step 4: Mount it.** In `src/main.ts`, add `import { mountBrandCatalog } from './ui/brandCatalog'` and call `mountBrandCatalog(uiRoot, game)` right after `mountSocial(uiRoot, game)`.
- [ ] **Step 5: Check**

Run: `npx tsc --noEmit && npx vitest run`, then in the preview:
1. Teleport to `pistage` and interact with the screen (or call `lv.store.getState().set({overlay:'brandCatalog', catalogBrand:'pistage'})`).
2. Take a screenshot: tabs plus a grid. Click a product: the product sheet opens.
3. Switch to Arabic: the layout flips (RTL).
4. Mobile preset screenshot: 2 columns.
- [ ] **Step 6: Commit**

```bash
git add src/ui/brandCatalog.ts src/main.ts src/i18n/i18n.ts src/styles/live.css
git commit -m "feat(ui): All products overlay from each shop's screen"
```

---

### Task 8: Le Voile flagship (baked boutique + lightbox hall)

**Files:**
- Modify: `src/world/bespoke/levoile.ts`

**Interfaces:**
- Consumes: `ShopLayout.plazaDir/front/depth`, `buildBoutique` (Task 6), `brandSubsections('levoile')`.

- [ ] **Step 1: Offset the baked half and build the hall**

  1. In `levoileInterior`, compute the half offset first:

```ts
  const lay = handles.layout
  /** The baked boutique fills the plaza-side half of the flagship; the other half is the lightbox hall. */
  const off = lay.front > 12 ? (lay.plazaDir * lay.front) / 4 : 0
```

  2. Apply `off`:
     - `g.position.set(off, 0, FRONT_Z - GLASS_Z)`
     - `local(x, z)` returns `{ x: x + off, z: … }`. Add `off` as a parameter: `function local(x, z, off = 0)`, and call it with `off`.
     - the fill box `f.box(CREAM, off, …)` and `f.box(BRONZE, off, …)`
     - the logo sign `sign.position.set(off, …)`
     - the rewards counter uses `rc.x` (already through `local`).
  3. Before `return true`, add the hall and the partition:

```ts
  if (off) {
    // Partition between the two halves (cream both faces), full shop height.
    f.box(CREAM, 0, MALL.shopHeight / 2, -lay.depth / 2 - 0.15, 0.3, MALL.shopHeight, lay.depth - 0.3, { collide: true, occlude: true })
    buildBoutique(ctx, f, handles, loaders, {
      tier: 'standard',
      front: lay.front / 2,
      depth: lay.depth,
      offsetX: -off,
      products,
      sections: brandSubsections('levoile'),
      brand: brandById.get('levoile')!,
      skipCounter: true,
    })
  }
```

  4. Imports: `MALL` from `'../../config/layout'`, `buildBoutique` from `'../boutiqueShop'`, `brandSubsections` from `'../../data/mallCatalog'`.
  5. Pass `skipCounter: true` in the `buildBoutique` call above: the boutique half already has Le Voile's 122 Coins counter.
  6. `buildBoutique` only sets `staffSpot` if none is set (the boutique's greeter stays).
  7. The `modelSpots` pushed by the hall are extra models. Keep them (Le Voile has 8 `modelOutfit` products).
- [ ] **Step 2: Check**

Run: `npx tsc --noEmit && npx vitest run`.

In the preview:
1. `lv.game.teleport('levoile')`. The arrival is in front of the plaza-side opening, so the baked boutique is ahead.
2. Walk or teleport to the other half: `lv.game` has no direct API, so step the player with `lv.game.teleport` to the shop and then set the pose via the player controller if exposed. Otherwise approach from the corridor.
3. Take screenshots of both halves. Check:
   - the partition sits between them;
   - the hall's hero and lightboxes show Le Voile products;
   - the boutique is unchanged;
   - no console errors.
- [ ] **Step 3: Commit**

```bash
git add src/world/bespoke/levoile.ts src/world/boutiqueShop.ts
git commit -m "feat(world): Le Voile flagship, baked boutique plus a lightbox hall"
```

---

### Task 9: Final verification, mobile pass and docs

**Files:**
- Modify: `docs/superpowers/notes/2026-10-06-shop-tiers-perf.md`
- Modify: `CLAUDE.md` (the "District 122 structure" bullets for Brands/Layout/Product display)
- Modify: `README.md` (only if it describes slot sizes)

- [ ] **Step 1: Full gates**

Run: `npm test && npm run build`
Expected: all tests pass, and the build succeeds (the `tsc` + vite build).

- [ ] **Step 2: Desktop walk-through** (dev preview `/?nodemo`).
  1. Screenshot one flagship (`jeno`), one standard (`hashbag`), one compact (`promax`), the pop-up, a nook, and Le Voile's hall.
  2. Read the console errors: none expected.
  3. Run the Task 0 measurement and record it under "After tiers (final)".
- [ ] **Step 3: Mobile pass**
  1. `resize_window {preset: "mobile"}` and reload.
  2. Set `quality` low as in Task 0, then measure and screenshot a flagship and a compact interior.
  3. Check:
     - the atlas is 1024 (`lv.engine.renderer.info.memory.textures` before and after entering a flagship, noted);
     - touching a lightbox opens the product.
  4. Reset with `resize_window {preset: "desktop"}`.
  5. **Acceptance:** FPS ≥ baseline − 10 % and flagship draw calls ≤ baseline + 30.
     - If FPS misses the target, apply the first lever that fixes it:
       1. Lower `textureMax / 4` for island figures.
       2. Merge the section plaques into the lightbox atlas.
       3. Skip the cones on Medium.
     - Re-measure and record the lever.
- [ ] **Step 4: Docs.** In `CLAUDE.md`, under "District 122 structure", update:
  - **Brands and slots:** `BrandDef.tier` (flagship 24×16 / standard 12×16 / compact 6×10, `split` for Le Voile), `WINGS` `left`/`right`, `POPUP_BRAND_ID`, the pop-up kiosk.
  - **Layout:** units packed by frontage (`config/layoutMath.ts`, unit-tested), nooks pad the shorter side, `ShopLayout.tier/front/depth/openings/plazaDir`.
  - **Product display:** brand shops are style-B campaign boutiques (`world/boutiqueShop.ts`, `config/boutiquePlan.ts`):
    - lightbox atlas per shop (`world/lightbox.ts`, one mesh per ≤ 28 products);
    - showcase figures (`world/showcase.ts`);
    - an "All products" screen → `ui/brandCatalog.ts`.
    - Mention that the old `furnishWithKit` / rack displays are legacy.
  - **Design:** link `docs/superpowers/specs/2026-10-06-shop-tiers-design.md`.
- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/superpowers/notes/2026-10-06-shop-tiers-perf.md
git commit -m "docs: shop tiers in CLAUDE.md, final performance numbers"
```
