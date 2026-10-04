# Plaza + Corridors Finishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 122 Mall plaza a central events stage with a live LED screen and seating, and finish the three wing corridors in warm luxury (inlays, islands, pendants, column screens, storefront frames, wayfinding, end walls).

**Architecture:**
- **Pure layout and slide logic** lives in DOM-free modules (`plazaMath.ts`, `screenSlides.ts`), unit-tested with Vitest.
- **3D construction** is in `plaza.ts` and `corridor.ts`:
  - static parts go through the existing `Batcher` (instanced) and `CollisionWorld`;
  - live screens use a shared `ScreenFeed` (`screens.ts`) that renders slides into two canvas textures with a cross-fade;
  - contact shadows and additive glows are each one `InstancedMesh` for the whole mall (`decals.ts`, `glow.ts`).
- **Wiring:** `main.ts` builds the plaza and corridors after the shell; the crowd gets a `watching` activity.

**Tech Stack:** TypeScript (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`), Three.js r186, Vite 8, Zustand vanilla, Vitest (new dev dependency).

**Spec:** `docs/superpowers/specs/2026-10-05-plaza-corridors-finishing-design.md`

## Global Constraints

- **Palette:**

| Name | Value |
|---|---|
| cream | `#f4ede3` |
| oak | `#b98a5c` |
| bronze | `MAT.brass` (`#b08a5c`) |
| plum accent | `#5b2b82` (`BRAND.magenta`) |
| gold | `#c8a46e` |
| warm light | `MAT.lightWarm` (`#fff3dc`, unlit) |

- **Layout constants:** don't change the geometry in `src/config/layout.ts` (plaza x ±22, z −34..0; corridors x ±6 local; rows 12 m; ceilings: plaza 9 m, corridor 6 m).
- **Budgets:** plaza ≤ 220 draw calls, wing ≤ 300 draw calls; screens redraw ≤ 2×/s and only when visible (within 45 m and in the frustum).
- **Quality gating:** additive glows and cones are visible only when `quality.fancyDecor` is true (Medium/High).
- **Bilingual baked text:** every canvas text drawn in 3D is bilingual (EN + AR), so it doesn't depend on the UI language. New UI strings go in `src/i18n/i18n.ts` in both `ar` (Egyptian) and `en`.
- **Modesty rule:** unchanged; no new character looks are introduced.
- **No new runtime dependencies;** Vitest is dev-only.

**Spec clarifications (decided while planning; also update the spec in Task 1):**
1. `buildPlaza` and `buildCorridor` are called from `main.ts` (`buildMall`) after `buildShell`, because they need `interaction` and actions. `mall.ts` only removes the old medallion position, centre benches, runner and centre light strips.
2. The stage and its steps are **not walkable** (the player has no vertical movement); both collide.
3. Corridor column screens share **one feed per wing** (all screens in a wing show the same slide).

---

## File structure

| File | Responsibility |
|---|---|
| `tests/plazaMath.test.ts` (new) | Unit tests for seating arcs and watch spots |
| `tests/screenSlides.test.ts` (new) | Unit tests for slide selection |
| `tests/layers.test.ts` (new) | Unit tests for decal/glow instancing |
| `src/world/plazaMath.ts` (new) | `arcSeats()`, `stageWatchSpots()`; pure math, no DOM |
| `src/world/screenSlides.ts` (new) | `buildSlides()`: which slides to show, plus their actions; pure |
| `src/world/screens.ts` (new) | `ScreenFeed` (canvas pair, cross-fade, visibility gating, drawing) and `screenMesh()` |
| `src/world/decals.ts` (new) | `addContactShadow()`, `buildDecals()`; one InstancedMesh |
| `src/world/glow.ts` (new) | `addHalo()`, `addCone()`, `buildGlows()`, `setGlowsVisible()` |
| `src/world/plaza.ts` (new) | Stage, LED screen, truss, seating, planters, plaza column screens |
| `src/world/corridor.ts` (new) | Per-wing finishing |
| `src/world/signage.ts` (modify) | `doormatTexture()`, `wingDirectoryTexture()`, `wayfindingTexture()`, `starInlayTexture()` |
| `src/world/mall.ts` (modify) | Move the medallion to z −9.5, drop the centre benches, runner and centre strips, toggle glows in `setQuality` |
| `src/main.ts` (modify) | Call `buildPlaza`/`buildCorridor`, build the decal/glow layers, update the feeds |
| `src/social/types.ts`, `src/social/mockPresence.ts`, `src/world/crowd.ts`, `src/world/liveMall.ts` (modify) | `watching` activity |
| `src/i18n/i18n.ts` (modify) | `screenOpen`, `screenGoTo` |
| `package.json` (modify) | Vitest dev dependency + `test` script |

---

### Task 1: Test infrastructure + plaza seating math

**Files:**
- Modify: `package.json`
- Create: `src/world/plazaMath.ts`
- Test: `tests/plazaMath.test.ts`
- Modify: `docs/superpowers/specs/2026-10-05-plaza-corridors-finishing-design.md` (record the 3 clarifications above under a new "Planning clarifications" heading at the end)

**Interfaces:**
- Produces:
  - `export interface SeatPose { x: number; z: number; yaw: number }`
  - `export function arcSeats(cx: number, cz: number, radii: number[], halfArc: number, aisle: number, seg: number): SeatPose[]`: bench segments of length `seg` on each radius, in the arc ±`halfArc` (radians) around the +z direction from (cx, cz), leaving an `aisle`-metre gap in the middle. `yaw` turns local +z to face (cx, cz).
  - `export function stageWatchSpots(cx: number, cz: number, r: number, n: number, spread: number): SeatPose[]`: `n` standing spots on radius `r` spread over ±`spread` radians, facing (cx, cz).

- [ ] **Step 1: Add Vitest**

Run:
```bash
npm i -D vitest@^3
```
Then add `"test": "vitest run"` to `"scripts"` in `package.json`.

- [ ] **Step 2: Write the failing test** `tests/plazaMath.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { arcSeats, stageWatchSpots } from '../src/world/plazaMath'

describe('arcSeats', () => {
  const seats = arcSeats(0, -21.5, [6.5, 8, 9.5], (48 * Math.PI) / 180, 2, 0.9)

  it('places segments on every radius', () => {
    for (const r of [6.5, 8, 9.5]) {
      const onR = seats.filter((s) => Math.abs(Math.hypot(s.x, s.z + 21.5) - r) < 1e-6)
      expect(onR.length).toBeGreaterThan(4)
    }
  })

  it('keeps the centre aisle clear', () => {
    for (const s of seats) expect(Math.abs(s.x)).toBeGreaterThan(0.9)
  })

  it('stays inside the arc and in front of the stage (towards the entrance)', () => {
    for (const s of seats) {
      expect(s.z).toBeGreaterThan(-21.5)
      expect(Math.abs(Math.atan2(s.x, s.z + 21.5))).toBeLessThanOrEqual((48 * Math.PI) / 180 + 1e-6)
    }
  })

  it('faces the focus point', () => {
    for (const s of seats) {
      const fx = Math.sin(s.yaw)
      const fz = Math.cos(s.yaw)
      const tx = (0 - s.x) / Math.hypot(s.x, s.z + 21.5)
      const tz = (-21.5 - s.z) / Math.hypot(s.x, s.z + 21.5)
      expect(fx * tx + fz * tz).toBeGreaterThan(0.999)
    }
  })

  it('is symmetric left/right', () => {
    const left = seats.filter((s) => s.x < 0).length
    const right = seats.filter((s) => s.x > 0).length
    expect(left).toBe(right)
  })
})

describe('stageWatchSpots', () => {
  it('returns n spots on the radius, facing the focus', () => {
    const spots = stageWatchSpots(0, -21.5, 11, 6, 0.5)
    expect(spots).toHaveLength(6)
    for (const s of spots) {
      expect(Math.hypot(s.x, s.z + 21.5)).toBeCloseTo(11, 6)
      expect(Math.sin(s.yaw) * -s.x + Math.cos(s.yaw) * (-21.5 - s.z)).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/plazaMath.test.ts`
Expected: FAIL, "Failed to resolve import ../src/world/plazaMath".

- [ ] **Step 4: Implement** `src/world/plazaMath.ts`

```ts
// Pure layout maths for the plaza stage area (no DOM, unit-tested).

export interface SeatPose {
  x: number
  z: number
  /** Yaw that turns local +z towards the focus point. */
  yaw: number
}

const facing = (x: number, z: number, cx: number, cz: number) => Math.atan2(cx - x, cz - z)

/**
 * Bench segments along concentric arcs in front of a focus (the stage screen).
 * The arc opens towards +z (the entrance); a centre aisle of `aisle` metres stays clear.
 */
export function arcSeats(cx: number, cz: number, radii: number[], halfArc: number, aisle: number, seg: number): SeatPose[] {
  const out: SeatPose[] = []
  for (const r of radii) {
    const aisleAng = aisle / 2 / r
    const n = Math.floor(((halfArc - aisleAng) * r) / seg)
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++) {
        const a = side * (aisleAng + ((i + 0.5) * seg) / r)
        const x = cx + Math.sin(a) * r
        const z = cz + Math.cos(a) * r
        out.push({ x, z, yaw: facing(x, z, cx, cz) })
      }
  }
  return out
}

/** Standing spots for shoppers watching the stage, spread over ±spread radians. */
export function stageWatchSpots(cx: number, cz: number, r: number, n: number, spread: number): SeatPose[] {
  const out: SeatPose[] = []
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1)
    const x = cx + Math.sin(a) * r
    const z = cz + Math.cos(a) * r
    out.push({ x, z, yaw: facing(x, z, cx, cz) })
  }
  return out
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/plazaMath.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Record the clarifications in the spec.** Append to the spec:

```markdown
## Planning clarifications (2026-10-05)

1. `buildPlaza` / `buildCorridor` are called from `main.ts` (`buildMall`) after `buildShell` (they need `interaction` and screen actions). `mall.ts` only moves the medallion to (0, −9.5) and removes the centre benches, the corridor runner and the centre light strips.
2. The stage and its steps are not walkable (no vertical movement); both collide.
3. Corridor column screens share one `ScreenFeed` per wing.
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/world/plazaMath.ts tests/plazaMath.test.ts docs/superpowers/specs/2026-10-05-plaza-corridors-finishing-design.md
git commit -m "feat(plaza): seating arc + watch-spot maths with vitest"
```

---

### Task 2: Contact-shadow and glow layers

**Files:**
- Create: `src/world/decals.ts`, `src/world/glow.ts`
- Test: `tests/layers.test.ts`
- Modify: `src/world/mall.ts` (`setQuality` → `setGlowsVisible(q.fancyDecor)`)

**Interfaces:**
- Produces:
  - `addContactShadow(x: number, z: number, w: number, d: number, yaw?: number): void`
  - `buildDecals(parent: Object3D): InstancedMesh | null`: builds one InstancedMesh from everything added so far, then clears the list.
  - `addHalo(x: number, y: number, z: number, r: number): void`
  - `addCone(x: number, y: number, z: number, length: number, radius: number, tiltX: number, yaw: number): void`: the apex is at (x, y, z) and the cone opens downwards (tilted by `tiltX` about local x, then rotated by `yaw`).
  - `buildGlows(parent: Object3D, visible: boolean): InstancedMesh[]`
  - `setGlowsVisible(v: boolean): void`

- [ ] **Step 1: Write the failing test** `tests/layers.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { Group } from 'three'
import { addContactShadow, buildDecals } from '../src/world/decals'
import { addCone, addHalo, buildGlows, setGlowsVisible } from '../src/world/glow'

describe('decals', () => {
  it('builds one instanced mesh with every shadow, then resets', () => {
    addContactShadow(0, 0, 2, 1)
    addContactShadow(3, -4, 1, 1, Math.PI / 2)
    const g = new Group()
    const m = buildDecals(g)
    expect(m?.count).toBe(2)
    expect(g.children).toHaveLength(1)
    expect(buildDecals(new Group())).toBeNull()
  })
})

describe('glow', () => {
  it('builds halos and cones and toggles visibility', () => {
    addHalo(0, 4, 0, 0.4)
    addHalo(1, 4, 0, 0.4)
    addCone(0, 6, 0, 5, 1, 0.1, 0)
    const g = new Group()
    const meshes = buildGlows(g, false)
    expect(meshes.map((m) => m.count).sort()).toEqual([1, 2])
    expect(meshes.every((m) => !m.visible)).toBe(true)
    setGlowsVisible(true)
    expect(meshes.every((m) => m.visible)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/layers.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement** `src/world/decals.ts`

```ts
// Soft contact shadows under furniture: one InstancedMesh for the whole mall.
// They make pieces sit on the floor (a cheap stand-in for baked AO).

import { InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type Object3D } from 'three'
import { blobShadowTexture } from '../engine/textures'

const items: Matrix4[] = []
const _q = new Quaternion()
const _qy = new Quaternion()
const _x = new Vector3(1, 0, 0)
const _y = new Vector3(0, 1, 0)

export function addContactShadow(x: number, z: number, w: number, d: number, yaw = 0): void {
  _q.setFromAxisAngle(_y, yaw).multiply(_qy.setFromAxisAngle(_x, -Math.PI / 2))
  items.push(new Matrix4().compose(new Vector3(x, 0.008, z), _q.clone(), new Vector3(w, d, 1)))
}

export function buildDecals(parent: Object3D): InstancedMesh | null {
  if (!items.length) return null
  const mat = new MeshBasicMaterial({
    map: typeof document === 'undefined' ? null : blobShadowTexture(),
    color: typeof document === 'undefined' ? '#000000' : '#ffffff',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  })
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, items.length)
  items.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.instanceMatrix.needsUpdate = true
  mesh.renderOrder = 1
  mesh.frustumCulled = false
  parent.add(mesh)
  items.length = 0
  return mesh
}
```

- [ ] **Step 4: Implement** `src/world/glow.ts`

```ts
// Additive warm glows (pendant halos, stage light cones). Medium/High only:
// toggled with quality.fancyDecor via setGlowsVisible().

import { AdditiveBlending, ConeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3, type Object3D } from 'three'

const halos: Matrix4[] = []
const cones: Matrix4[] = []
let built: InstancedMesh[] = []
const _y = new Vector3(0, 1, 0)
const _x = new Vector3(1, 0, 0)

export function addHalo(x: number, y: number, z: number, r: number): void {
  halos.push(new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(r, r, r)))
}

export function addCone(x: number, y: number, z: number, length: number, radius: number, tiltX: number, yaw: number): void {
  const q = new Quaternion().setFromAxisAngle(_y, yaw).multiply(new Quaternion().setFromAxisAngle(_x, tiltX))
  cones.push(new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(radius, length, radius)))
}

function layer(geo: SphereGeometry | ConeGeometry, opacity: number, list: Matrix4[], parent: Object3D, visible: boolean): InstancedMesh {
  const mat = new MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity, depthWrite: false, blending: AdditiveBlending })
  const mesh = new InstancedMesh(geo, mat, list.length)
  list.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  mesh.visible = visible
  parent.add(mesh)
  return mesh
}

export function buildGlows(parent: Object3D, visible: boolean): InstancedMesh[] {
  const out: InstancedMesh[] = []
  if (halos.length) out.push(layer(new SphereGeometry(1, 16, 12), 0.13, halos, parent, visible))
  // Unit cone: ConeGeometry's apex is at +0.5; translating by −0.5 puts the apex
  // at the origin and the base at y = −1, so it opens downwards by `length`.
  if (cones.length) out.push(layer(new ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0), 0.06, cones, parent, visible))
  halos.length = 0
  cones.length = 0
  built = out
  return out
}

export function setGlowsVisible(v: boolean): void {
  for (const m of built) m.visible = v
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/layers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Toggle glows with quality** in `src/world/mall.ts`

Add `import { setGlowsVisible } from './glow'` at the top. Inside `buildShell`, in `const setQuality = (q: QualitySettings) => {`, add as the first line:
```ts
    setGlowsVisible(q.fancyDecor)
```

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit` (expected: no output).

```bash
git add src/world/decals.ts src/world/glow.ts src/world/mall.ts tests/layers.test.ts
git commit -m "feat(world): instanced contact-shadow and glow layers"
```

---

### Task 3: Slide selection (pure)

**Files:**
- Create: `src/world/screenSlides.ts`
- Test: `tests/screenSlides.test.ts`

**Interfaces:**
- Consumes: `FlashSale`, `GroupDeal` from `src/social/types.ts`
- Produces:
  - `export type SlideKind = 'flash' | 'deal' | 'brand' | 'games' | 'welcome'`
  - `export type SlideAction = { type: 'teleport'; target: string } | { type: 'product'; id: string } | { type: 'wheel' } | null`
  - `export interface SlideSpec { kind: SlideKind; brandId?: string; productId?: string; endsAt?: number; joined?: number; target?: number; percent?: number; action: SlideAction }`
  - `export interface SlideInput { kinds: SlideKind[]; flash: FlashSale | null; groupDeal: GroupDeal | null; brandIds: string[]; brandIndex: number; demo: boolean; now: number }`
  - `export function buildSlides(i: SlideInput): SlideSpec[]`

- [ ] **Step 1: Write the failing test** `tests/screenSlides.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildSlides, type SlideInput } from '../src/world/screenSlides'

const base: SlideInput = {
  kinds: ['flash', 'deal', 'brand', 'games', 'welcome'],
  flash: null,
  groupDeal: null,
  brandIds: ['axis', 'nourhan'],
  brandIndex: 0,
  demo: true,
  now: 1_000_000,
}
const flash = { sectionId: 'nourhan', percent: 20, startsAt: 999_000, endsAt: 1_100_000 }
const deal = { productId: 'levoile-x', target: 10, joined: 7, endsAt: 2_000_000, percent: 25, userJoined: false, unlocked: false, recent: [] }

describe('buildSlides', () => {
  it('skips flash/deal slides without data', () => {
    expect(buildSlides(base).map((s) => s.kind)).toEqual(['brand', 'games', 'welcome'])
  })

  it('adds an active flash sale first with a teleport action', () => {
    const s = buildSlides({ ...base, flash })
    expect(s[0]).toMatchObject({ kind: 'flash', brandId: 'nourhan', percent: 20, action: { type: 'teleport', target: 'nourhan' } })
  })

  it('ignores an expired flash sale', () => {
    expect(buildSlides({ ...base, flash: { ...flash, endsAt: 999_999 } })[0].kind).toBe('brand')
  })

  it('adds the group deal with a product action', () => {
    const s = buildSlides({ ...base, groupDeal: deal })
    expect(s.find((x) => x.kind === 'deal')).toMatchObject({ productId: 'levoile-x', joined: 7, target: 10, action: { type: 'product', id: 'levoile-x' } })
  })

  it('rotates brands with brandIndex', () => {
    expect(buildSlides({ ...base, brandIndex: 1 }).find((x) => x.kind === 'brand')?.brandId).toBe('nourhan')
    expect(buildSlides({ ...base, brandIndex: 2 }).find((x) => x.kind === 'brand')?.brandId).toBe('axis')
  })

  it('shows no flash/deal when the demo is off', () => {
    expect(buildSlides({ ...base, flash, groupDeal: deal, demo: false }).map((s) => s.kind)).toEqual(['brand', 'games', 'welcome'])
  })

  it('respects the kinds list (corridor feeds)', () => {
    expect(buildSlides({ ...base, kinds: ['flash', 'brand'], flash }).map((s) => s.kind)).toEqual(['flash', 'brand'])
  })

  it('maps games to the wheel and welcome to no action', () => {
    const s = buildSlides(base)
    expect(s.find((x) => x.kind === 'games')?.action).toEqual({ type: 'wheel' })
    expect(s.find((x) => x.kind === 'welcome')?.action).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/screenSlides.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement** `src/world/screenSlides.ts`

```ts
// Which slides a screen shows right now, and what pressing E on each does.
// Pure (no DOM) so it's unit-tested; screens.ts draws them.

import type { FlashSale, GroupDeal } from '../social/types'

export type SlideKind = 'flash' | 'deal' | 'brand' | 'games' | 'welcome'
export type SlideAction = { type: 'teleport'; target: string } | { type: 'product'; id: string } | { type: 'wheel' } | null

export interface SlideSpec {
  kind: SlideKind
  brandId?: string
  productId?: string
  endsAt?: number
  joined?: number
  target?: number
  percent?: number
  action: SlideAction
}

export interface SlideInput {
  kinds: SlideKind[]
  flash: FlashSale | null
  groupDeal: GroupDeal | null
  brandIds: string[]
  brandIndex: number
  demo: boolean
  now: number
}

export function buildSlides(i: SlideInput): SlideSpec[] {
  const out: SlideSpec[] = []
  for (const kind of i.kinds) {
    if (kind === 'flash') {
      const f = i.flash
      if (i.demo && f && i.now >= f.startsAt && i.now < f.endsAt)
        out.push({ kind, brandId: f.sectionId, percent: f.percent, endsAt: f.endsAt, action: { type: 'teleport', target: f.sectionId } })
    } else if (kind === 'deal') {
      const d = i.groupDeal
      if (i.demo && d && i.now < d.endsAt)
        out.push({ kind, productId: d.productId, joined: d.joined, target: d.target, percent: d.percent, endsAt: d.endsAt, action: { type: 'product', id: d.productId } })
    } else if (kind === 'brand') {
      if (i.brandIds.length) {
        const brandId = i.brandIds[i.brandIndex % i.brandIds.length]
        out.push({ kind, brandId, action: { type: 'teleport', target: brandId } })
      }
    } else if (kind === 'games') out.push({ kind, action: { type: 'wheel' } })
    else out.push({ kind, action: null })
  }
  return out
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/screenSlides.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/screenSlides.ts tests/screenSlides.test.ts
git commit -m "feat(screens): slide selection with actions"
```

---

### Task 4: ScreenFeed (drawing, cross-fade, visibility gating)

**Files:**
- Create: `src/world/screens.ts`
- Modify: `src/i18n/i18n.ts` (add `screenOpen`, `screenGoTo` in the live-mall block)

**Interfaces:**
- Consumes: `buildSlides`, `SlideSpec`, `SlideKind` (Task 3); `store`, `catalog` (`src/state/store.ts`); `brandById` (`src/config/mall.ts`); `demoEnabled` (`src/social/index.ts`); `loadImage`, `loadProductTexture`, `makeCanvas`, `canvasTexture` (`src/engine/textures.ts`); `shopFascia` (`src/world/signage.ts`); `t` (i18n); `Interaction` (`src/interact/interaction.ts`).
- Produces:
  - `export interface ScreenActions { teleport(id: string): void; openProduct(id: string): void; openWheel(): void }`
  - `export class ScreenFeed`:
    - `constructor(opts: { kinds: SlideKind[]; brandIds: string[]; portrait: boolean; interval?: number })`
    - `readonly matA: MeshBasicMaterial`
    - `readonly matB: MeshBasicMaterial`
    - `current(): SlideSpec | null`
    - `addScreen(o: Object3D): void`
    - `update(dt: number, camera: Camera): void`
  - `export function screenMesh(feed: ScreenFeed, w: number, h: number): Group`: the plane pair (B 2 mm in front of A); add it to the scene and call `feed.addScreen()` on it.
  - `export function registerScreen(interaction: Interaction, hit: Object3D, feed: ScreenFeed, actions: ScreenActions): void`

- [ ] **Step 1: Add the i18n keys** inside `STRINGS`, right after `// ---- live mall ----`:

```ts
  screenOpen: { ar: 'شوفي العرض', en: 'See the offer' },
  screenGoTo: { ar: 'روحي لـ', en: 'Go to' },
```

- [ ] **Step 2: Implement** `src/world/screens.ts`

```ts
// Live screens (stage LED, plaza columns, corridor columns). A ScreenFeed owns
// two canvas textures: A shows the current slide, B fades in the next one,
// then A is redrawn and B hidden. All screens of a feed share the two
// materials, so a feed costs two textures however many screens show it.
// Redraws happen only on slide changes / countdown ticks, and only while one
// of the feed's screens is within 45 m and inside the camera frustum.

import { Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, Vector3, type Camera, type CanvasTexture, type Object3D } from 'three'
import { BRAND } from '../config/brand'
import { brandById } from '../config/mall'
import { canvasTexture, loadImage, loadProductTexture, makeCanvas } from '../engine/textures'
import { t } from '../i18n/i18n'
import type { Interaction } from '../interact/interaction'
import { catalog, store } from '../state/store'
import { demoEnabled } from '../social'
import { buildSlides, type SlideKind, type SlideSpec } from './screenSlides'
import { shopFascia } from './signage'

export interface ScreenActions {
  teleport(id: string): void
  openProduct(id: string): void
  openWheel(): void
}

const FADE = 0.5
const _pv = new Matrix4()
const _fr = new Frustum()
const _s = new Sphere()
const _v = new Vector3()
const imgCache = new Map<string, HTMLImageElement | HTMLCanvasElement | null>()

/** Image by URL (product photo / logo), null until loaded; `onLoad` asks for a redraw. */
function img(url: string, onLoad: () => void, product = true): HTMLImageElement | HTMLCanvasElement | null {
  if (imgCache.has(url)) return imgCache.get(url) ?? null
  imgCache.set(url, null)
  const p = product ? loadProductTexture(url, 512).then((r) => r.image as HTMLCanvasElement) : loadImage(url)
  p.then((i) => {
    imgCache.set(url, i)
    onLoad()
  }).catch(() => {})
  return null
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function cover(g: CanvasRenderingContext2D, im: HTMLImageElement | HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / im.width, h / im.height)
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  g.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s)
  g.restore()
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, weight = 700, font = BRAND.fontUi, rtl = false): void {
  g.fillStyle = color
  g.font = `${weight} ${px}px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.direction = rtl ? 'rtl' : 'ltr'
  g.fillText(s, x, y)
  g.direction = 'ltr'
}

export class ScreenFeed {
  readonly matA: MeshBasicMaterial
  readonly matB: MeshBasicMaterial
  private readonly canA: HTMLCanvasElement
  private readonly canB: HTMLCanvasElement
  private readonly texA: CanvasTexture
  private readonly texB: CanvasTexture
  private readonly kinds: SlideKind[]
  private readonly brandIds: string[]
  private readonly portrait: boolean
  private readonly interval: number
  private readonly screens: Object3D[] = []
  private slides: SlideSpec[] = []
  private index = 0
  private brandIndex = 0
  private timer = 0
  private fade = -1
  private tick = 0
  private dirty = true

  constructor(opts: { kinds: SlideKind[]; brandIds: string[]; portrait: boolean; interval?: number }) {
    this.kinds = opts.kinds
    this.brandIds = opts.brandIds
    this.portrait = opts.portrait
    this.interval = opts.interval ?? 6
    const [w, h] = this.portrait ? [576, 1024] : [1024, 576]
    ;[this.canA] = makeCanvas(w, h)
    ;[this.canB] = makeCanvas(w, h)
    this.texA = canvasTexture(this.canA)
    this.texB = canvasTexture(this.canB)
    this.matA = new MeshBasicMaterial({ map: this.texA, toneMapped: false })
    this.matB = new MeshBasicMaterial({ map: this.texB, toneMapped: false, transparent: true, opacity: 0, depthWrite: false })
    this.rebuild()
  }

  addScreen(o: Object3D): void {
    this.screens.push(o)
  }

  current(): SlideSpec | null {
    return this.slides[this.index % Math.max(1, this.slides.length)] ?? null
  }

  private rebuild(): void {
    const s = store.getState()
    this.slides = buildSlides({ kinds: this.kinds, flash: s.flash, groupDeal: s.groupDeal, brandIds: this.brandIds, brandIndex: this.brandIndex, demo: demoEnabled, now: Date.now() })
  }

  private visible(camera: Camera): boolean {
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _fr.setFromProjectionMatrix(_pv)
    for (const o of this.screens) {
      o.getWorldPosition(_v)
      if (_v.distanceTo(camera.position) < 45 && _fr.intersectsSphere(_s.set(_v, 3))) return true
    }
    return false
  }

  update(dt: number, camera: Camera): void {
    if (!this.visible(camera)) return
    if (this.fade >= 0) {
      this.fade += dt / FADE
      this.matB.opacity = Math.min(1, this.fade)
      if (this.fade >= 1) {
        this.draw(this.canA, this.current())
        this.texA.needsUpdate = true
        this.matB.opacity = 0
        this.fade = -1
      }
      return
    }
    this.timer += dt
    this.tick += dt
    if (this.timer >= this.interval) {
      this.timer = 0
      this.index++
      if (this.index >= this.slides.length) {
        this.index = 0
        this.brandIndex++
      }
      this.rebuild()
      this.draw(this.canB, this.current())
      this.texB.needsUpdate = true
      this.fade = 0
      return
    }
    // Countdowns tick once a second; first paint / image loads set `dirty`.
    const cur = this.current()
    if (this.dirty || (this.tick >= 1 && (cur?.kind === 'flash' || cur?.kind === 'deal'))) {
      this.tick = 0
      this.dirty = false
      this.rebuild()
      this.draw(this.canA, this.current())
      this.texA.needsUpdate = true
    }
  }

  private draw(c: HTMLCanvasElement, s: SlideSpec | null): void {
    const g = c.getContext('2d')!
    const W = c.width
    const H = c.height
    const P = this.portrait
    const redraw = () => (this.dirty = true)
    const grad = g.createLinearGradient(0, 0, W, H)
    if (!s || s.kind === 'flash' || s.kind === 'games' || s.kind === 'welcome') {
      grad.addColorStop(0, '#3e1c5c')
      grad.addColorStop(1, '#5b2b82')
    } else {
      grad.addColorStop(0, '#fbf6f2')
      grad.addColorStop(1, '#efe6da')
    }
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    g.strokeStyle = BRAND.gold
    g.lineWidth = 6
    g.strokeRect(12, 12, W - 24, H - 24)
    const cx = W / 2
    if (!s || s.kind === 'welcome') {
      const logo = img(BRAND.logoWhite, redraw, false)
      if (logo) cover(g, logo, cx - (P ? 230 : 320), H / 2 - (P ? 130 : 110), P ? 460 : 640, P ? 130 : 180)
      text(g, 'SHOP · PLAY · MEET', cx, H * (P ? 0.66 : 0.78), P ? 34 : 40, '#f1e6ff', 600, BRAND.fontLatin)
      text(g, 'اتسوقي · العبي · قابلي صحابك', cx, H * (P ? 0.74 : 0.88), P ? 34 : 34, BRAND.gold, 700, BRAND.fontUi, true)
      return
    }
    if (s.kind === 'flash') {
      const b = brandById.get(s.brandId ?? '')
      text(g, '⚡ FLASH SALE · فلاش سيل', cx, H * 0.16, P ? 40 : 48, BRAND.gold, 800)
      text(g, `−${s.percent}%`, cx, H * (P ? 0.36 : 0.42), P ? 190 : 210, '#ffffff', 800, BRAND.fontLatin)
      text(g, b?.name ?? '', cx, H * (P ? 0.56 : 0.66), P ? 56 : 64, '#ffffff', 700, BRAND.fontLatin)
      text(g, b?.nameAr ?? '', cx, H * (P ? 0.64 : 0.77), P ? 46 : 48, '#f1e6ff', 700, BRAND.fontUi, true)
      text(g, mmss((s.endsAt ?? 0) - Date.now()), cx, H * (P ? 0.8 : 0.9), P ? 64 : 52, BRAND.gold, 800, BRAND.fontLatin)
      return
    }
    if (s.kind === 'games') {
      text(g, '🎡  🛂  ✨  🪙', cx, H * 0.3, P ? 90 : 110, '#ffffff', 400)
      text(g, 'Play & earn 122 Coins', cx, H * 0.55, P ? 48 : 60, '#ffffff', 700, BRAND.fontLatin)
      text(g, 'العبي واكسبي 122 Coins', cx, H * 0.7, P ? 48 : 56, BRAND.gold, 800, BRAND.fontUi, true)
      text(g, 'Wheel · Passport · Hidden logos', cx, H * 0.84, P ? 30 : 34, '#f1e6ff', 600, BRAND.fontLatin)
      return
    }
    if (s.kind === 'deal') {
      const p = catalog().byId.get(s.productId ?? '')
      const ph = p ? img(p.images[0], redraw) : null
      const [px, py, pw, phh] = P ? [60, 60, W - 120, H * 0.48] : [40, 40, W * 0.42, H - 80]
      if (ph) cover(g, ph, px, py, pw, phh)
      const tx = P ? cx : W * 0.72
      const ty = P ? H * 0.58 : H * 0.18
      text(g, '👥 Group deal · صفقة جماعية', tx, ty, P ? 34 : 38, '#5b2b82', 800)
      text(g, `${s.joined}/${s.target}`, tx, ty + (P ? 110 : 120), P ? 120 : 130, '#2a1f33', 800, BRAND.fontLatin)
      const bw = P ? W - 160 : W * 0.44
      g.fillStyle = '#e6d9ee'
      g.fillRect(tx - bw / 2, ty + (P ? 190 : 210), bw, 22)
      g.fillStyle = '#5b2b82'
      g.fillRect(tx - bw / 2, ty + (P ? 190 : 210), (bw * Math.min(s.joined ?? 0, s.target ?? 1)) / (s.target ?? 1), 22)
      text(g, `−${s.percent}% · ${mmss((s.endsAt ?? 0) - Date.now())}`, tx, ty + (P ? 270 : 290), P ? 46 : 50, '#5b2b82', 800, BRAND.fontLatin)
      if (p) text(g, p.title, tx, ty + (P ? 330 : 350), P ? 30 : 32, '#6b4f35', 600, BRAND.fontLatin)
      return
    }
    // brand
    const b = brandById.get(s.brandId ?? '')
    const sec = catalog().sections.find((x) => x.id === s.brandId)
    if (!b || !sec) return
    const fascia = shopFascia(sec, '', { initials: b.initials, color: b.color, logo: b.logo })
    const fh = P ? 150 : 180
    g.drawImage(fascia.image as HTMLCanvasElement, P ? 30 : 160, 30, P ? W - 60 : W - 320, fh)
    const prods = sec.productIds.slice(0, 2).map((id) => catalog().byId.get(id)).filter((p) => !!p)
    prods.forEach((p, k) => {
      const ph = img(p!.images[0], redraw)
      const [x, y, w, h] = P ? [40 + k * ((W - 100) / 2 + 20), fh + 60, (W - 100) / 2, H * 0.5] : [60 + k * (W / 2 - 40), fh + 50, W / 2 - 100, H - fh - 150]
      if (ph) cover(g, ph, x, y, w, h)
    })
    text(g, `Discover ${b.name} · اكتشفي ${b.nameAr}`, cx, H - (P ? 90 : 50), P ? 34 : 38, b.color, 800)
  }
}

export function screenMesh(feed: ScreenFeed, w: number, h: number): Group {
  const g = new Group()
  const geo = new PlaneGeometry(w, h)
  const a = new Mesh(geo, feed.matA)
  const b = new Mesh(geo, feed.matB)
  b.position.z = 0.002
  b.renderOrder = 2
  g.add(a, b)
  return g
}

/** E / tap on a screen performs the current slide's action. */
export function registerScreen(interaction: Interaction, hit: Object3D, feed: ScreenFeed, actions: ScreenActions): void {
  interaction.add({
    object: hit,
    kind: 'deal',
    enabled: () => !!feed.current()?.action,
    label: () => {
      const s = feed.current()
      const L = store.getState().lang
      if (s?.action?.type === 'teleport') {
        const b = brandById.get(s.action.target)
        return `${t('screenGoTo', L)} ${L === 'ar' ? (b?.nameAr ?? '') : (b?.name ?? '')}`
      }
      return t('screenOpen', L)
    },
    onInteract: () => {
      const a = feed.current()?.action
      if (!a) return
      if (a.type === 'teleport') actions.teleport(a.target)
      else if (a.type === 'product') actions.openProduct(a.id)
      else actions.openWheel()
    },
    maxDist: 9,
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. If `noUnusedLocals` flags anything, delete the unused import; don't silence it.

- [ ] **Step 4: Run all the tests**

Run: `npm test`
Expected: all pass (`screens.ts` isn't imported by the tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/screens.ts src/i18n/i18n.ts
git commit -m "feat(screens): ScreenFeed with cross-fade, visibility gating and actions"
```

---

### Task 5: Plaza stage, LED screen, truss, seating, planters, column screens

**Files:**
- Create: `src/world/plaza.ts`
- Modify: `src/world/mall.ts` (move the medallion to z −9.5; remove the two centre benches)
- Modify: `src/main.ts` (build the plaza, layers and feed updates)

**Interfaces:**
- Consumes: `arcSeats`, `stageWatchSpots` (Task 1); `addContactShadow`, `buildDecals`, `addCone`, `buildGlows` (Task 2); `ScreenFeed`, `screenMesh`, `registerScreen`, `ScreenActions` (Task 4); `Batcher`, `CollisionWorld`, `Interaction`, `Kit`, `MAT`, `tintMat`, `plant`.
- Produces:
  - `export const STAGE = { x: 0, z: -21.5, screenZ: -22.9 } as const`
  - `export interface PlazaCtx { root: Object3D; batcher: Batcher; colliders: CollisionWorld; interaction: Interaction; kit: Kit | null; actions: ScreenActions }`
  - `export function buildPlaza(ctx: PlazaCtx): { feeds: ScreenFeed[] }`
  - `export function stageSpots(): SeatPose[]`: 6 watch spots (used by the crowd in Task 6).

- [ ] **Step 1: Implement** `src/world/plaza.ts`

```ts
// The plaza's events stage: oak + bronze stage with steps, a two-faced LED
// screen (front: live carousel; back: brand reel), a lighting truss with
// cones, three curved rows of seating, planters and portrait screens on the
// plaza columns. Static parts are batched; screens share feeds.

import { Matrix4, type Object3D } from 'three'
import type { Batcher } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import type { Interaction } from '../interact/interaction'
import type { Kit } from './kit'
import { MAT, tintMat } from './materials'
import { plant } from './props'
import { arcSeats, stageWatchSpots, type SeatPose } from './plazaMath'
import { addContactShadow } from './decals'
import { addCone } from './glow'
import { ScreenFeed, registerScreen, screenMesh, type ScreenActions } from './screens'
import { BRANDS } from '../config/mall'

export const STAGE = { x: 0, z: -21.5, screenZ: -22.9 } as const

export interface PlazaCtx {
  root: Object3D
  batcher: Batcher
  colliders: CollisionWorld
  interaction: Interaction
  kit: Kit | null
  actions: ScreenActions
}

export function stageSpots(): SeatPose[] {
  return stageWatchSpots(STAGE.x, STAGE.z, 11, 6, 0.5)
}

export function buildPlaza(ctx: PlazaCtx): { feeds: ScreenFeed[] } {
  const f = ctx.batcher.frame(new Matrix4(), ctx.colliders)
  const oak = tintMat('#b98a5c', 1, 0.55)
  const cream = tintMat('#f3ece4', 1, 0.8)
  const plum = tintMat('#6d3d8f', 1, 0.9)
  const { x: sx, z: sz } = STAGE

  // ------------------------------------------------------------ the stage
  f.block(cream, sx, 0, sz, 9, 0.4, 4.5, { collide: true })
  f.block(oak, sx, 0.4, sz, 9.04, 0.05, 4.54)
  f.box(MAT.brass, sx, 0.425, sz + 2.27, 9.06, 0.06, 0.04)
  f.box(MAT.lightWarm, sx, 0.33, sz + 2.26, 8.6, 0.05, 0.02)
  f.block(cream, sx, 0, sz + 2.45, 7, 0.3, 0.4, { collide: true })
  f.block(cream, sx, 0, sz + 2.8, 7, 0.15, 0.3, { collide: true })
  addContactShadow(sx, sz, 10.5, 6.5)

  // ------------------------------------------------------- LED screen
  const sz2 = STAGE.screenZ
  for (const px of [-3.7, 3.7]) f.block(MAT.brass, px, 0.45, sz2, 0.2, 6.2, 0.2)
  f.box(MAT.brass, sx, 4.47, sz2, 7.45, 4.35, 0.12)
  f.box(MAT.black, sx, 4.47, sz2, 7.3, 4.2, 0.18)
  const front = new ScreenFeed({ kinds: ['flash', 'deal', 'brand', 'games', 'welcome'], brandIds: BRANDS.filter((b) => b.status === 'open').map((b) => b.id), portrait: false })
  const back = new ScreenFeed({ kinds: ['brand'], brandIds: BRANDS.filter((b) => b.status === 'open').map((b) => b.id), portrait: false, interval: 4 })
  const fm = screenMesh(front, 7, 3.94)
  fm.position.set(sx, 4.47, sz2 + 0.1)
  ctx.root.add(fm)
  front.addScreen(fm)
  registerScreen(ctx.interaction, fm.children[0], front, ctx.actions)
  const bm = screenMesh(back, 7, 3.94)
  bm.position.set(sx, 4.47, sz2 - 0.1)
  bm.rotation.y = Math.PI
  ctx.root.add(bm)
  back.addScreen(bm)
  registerScreen(ctx.interaction, bm.children[0], back, ctx.actions)

  // ------------------------------------------------------- lighting truss
  const tz0 = sz - 1.8
  const tz1 = sz + 1.7
  for (const px of [-5, 5]) {
    f.block(MAT.brass, px, 0, tz0, 0.3, 7.35, 0.3, { collide: true })
    f.box(MAT.brass, px, 7.2, (tz0 + tz1) / 2, 0.3, 0.3, tz1 - tz0)
  }
  f.box(MAT.brass, sx, 7.2, tz0, 10.3, 0.3, 0.3)
  f.box(MAT.brass, sx, 7.2, tz1, 10.3, 0.3, 0.3)
  for (const cx of [-3.75, -2.25, -0.75, 0.75, 2.25, 3.75]) {
    f.cyl(MAT.black, cx, 6.6, tz1, 0.13, 0.45)
    // Cone from the can down to the stage top, tilted back towards the stage.
    addCone(cx, 6.6, tz1, 6.2, 1.1, -Math.atan2(1.2, 6.2), 0)
  }

  // ------------------------------------------------------- seating
  for (const s of arcSeats(sx, sz, [6.5, 8, 9.5], (48 * Math.PI) / 180, 2, 0.9)) {
    f.block(cream, s.x, 0, s.z, 0.86, 0.28, 0.55, { rotY: s.yaw, collide: true })
    f.block(plum, s.x, 0.28, s.z, 0.84, 0.13, 0.5, { rotY: s.yaw })
    f.block(MAT.brass, s.x, 0.0, s.z, 0.88, 0.04, 0.57, { rotY: s.yaw })
    addContactShadow(s.x, s.z, 1.15, 0.85, s.yaw)
  }

  // ------------------------------------------------------- planters
  for (const [px, pz] of [[-6.4, sz - 1.7], [6.4, sz - 1.7], [-6.4, sz + 2.3], [6.4, sz + 2.3]] as const) {
    if (!ctx.kit?.place('plant', ctx.root, px, pz, px < 0 ? 0.6 : -0.6, ctx.colliders)) {
      f.cyl(MAT.marbleTop, px, 0, pz, 0.7, 0.6, { collide: true })
      f.cyl(MAT.brass, px, 0.6, pz, 0.72, 0.03)
      plant(f, px, pz, 1.2, 70 + Math.round(px + pz))
    }
    addContactShadow(px, pz, 1.9, 1.9)
  }

  // ------------------------------------------------ plaza column screens
  // Columns at (±8, −6) and (±8, −28); the screen faces the plaza centre.
  const colFeed = new ScreenFeed({ kinds: ['flash', 'deal', 'brand', 'games'], brandIds: BRANDS.filter((b) => b.status === 'open').map((b) => b.id), portrait: true })
  for (const [cx, cz] of [[-8, -6], [8, -6], [-8, -28], [8, -28]] as const) {
    const yaw = Math.atan2(sx - cx, sz - cz)
    const m = screenMesh(colFeed, 1.0, 1.78)
    m.position.set(cx + Math.sin(yaw) * 0.47, 2.1, cz + Math.cos(yaw) * 0.47)
    m.rotation.y = yaw
    ctx.root.add(m)
    colFeed.addScreen(m)
    registerScreen(ctx.interaction, m.children[0], colFeed, ctx.actions)
  }

  return { feeds: [front, back, colFeed] }
}
```

- [ ] **Step 2: Update** `src/world/mall.ts`

Replace the medallion block. Find:
```ts
  // Medallion with the mall logo in the middle of the plaza.
  const mid = -A / 2
```
Replace it with:
```ts
  // Medallion with the mall logo, between the entrance and the stage seating.
  const mid = -A / 2
  const medZ = -9.5
```
In the next 3 positions inside that block (`ring.position.set(0, 0.005, mid)`, `disc.position.set(0, 0.004, mid)`, `logo.position.set(0, 0.006, mid)`), change `mid` to `medZ`.

Remove these two lines (the centre benches):
```ts
  bench(f, -6.2, mid, 2.6, Math.PI / 2)
  bench(f, 6.2, mid, 2.6, Math.PI / 2)
```
And change the comment `// Seating around the medallion: the community meeting point.` to `// Side benches by the entrance.`

- [ ] **Step 3: Wire it up in** `src/main.ts`

Add these imports:
```ts
import { buildPlaza } from './world/plaza'
import { buildDecals } from './world/decals'
import { buildGlows } from './world/glow'
import type { ScreenFeed, ScreenActions } from './world/screens'
```
In `buildMall`, after `const live = buildLiveMall(game, shops, vestLogo)` and its two following lines, add:
```ts
  const actions: ScreenActions = {
    teleport: (id) => game.teleport(id),
    openProduct: (id) => store.getState().openProduct(id),
    openWheel: () => store.getState().set({ overlay: 'wheel' }),
  }
  const feeds: ScreenFeed[] = []
  feeds.push(...buildPlaza({ root: engine.scene, batcher, colliders, interaction: game.interaction, kit, actions }).feeds)
  buildDecals(engine.scene)
  buildGlows(engine.scene, engine.quality.fancyDecor)
  game.updaters.push((dt) => {
    for (const fd of feeds) fd.update(dt, engine.camera)
  })
```
(Task 7 inserts the corridor feeds before `buildDecals`.)

- [ ] **Step 4: Typecheck, test and build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; tests pass; "built in".

- [ ] **Step 5: Visual check.** Start the dev server with the preview tool (`preview_start` name `dev`) and take screenshots with the scratchpad Playwright harness (`shot.mjs`) of:
- the plaza from the entrance: `g.player.teleport(0,-3.5,0); g.player.pitch=-0.05`;
- the stage close-up: `g.player.teleport(0,-13,0); g.player.pitch=0.08`;
- the seating from the stage side: `g.player.teleport(6,-19,2.3)`;
- a column screen: `g.player.teleport(4,-9,0.9)`.

Expected:
- the stage, both screen faces and the seating arcs render;
- the slides change every 6 s (take two shots 7 s apart);
- the cones show on High;
- no console errors.

Also check:
- E on the stage screen during a flash sale (`lv.social.deals.nextFlash = 0`, wait 2 s) teleports to that brand;
- the player can't walk into the stage, steps, benches or planters.

- [ ] **Step 6: Commit**

```bash
git add src/world/plaza.ts src/world/mall.ts src/main.ts
git commit -m "feat(plaza): events stage with live LED screen, truss, seating and column screens"
```

---

### Task 6: Crowd "watching" activity

**Files:**
- Modify: `src/social/types.ts:11` (the `Activity` union)
- Modify: `src/social/mockPresence.ts` (`pickActivity`, `assign`, duration table)
- Modify: `src/world/crowd.ts` (`CrowdPlaces.stage`, the `target()` case)
- Modify: `src/world/liveMall.ts` (pass `stage: stageSpots()`)

**Interfaces:**
- Consumes: `stageSpots()` (Task 5)
- Produces: `Activity` includes `'watching'`; `CrowdPlaces` gains `stage: { x: number; z: number; yaw: number }[]`

- [ ] **Step 1: Types.** In `src/social/types.ts`, change:
```ts
export type Activity = 'browsing' | 'buying' | 'playing' | 'styling' | 'friends' | 'leaving'
```
to:
```ts
export type Activity = 'browsing' | 'buying' | 'playing' | 'styling' | 'friends' | 'leaving' | 'watching'
```

- [ ] **Step 2: Presence.** In `src/social/mockPresence.ts`:

Add a constant next to `MAX_PLAYERS`:
```ts
export const STAGE_SPOTS = 6
```
In `pickActivity()`, before `return 'browsing'`, add:
```ts
    if (x < 0.4 && this.countOf('watching') < STAGE_SPOTS) return 'watching'
```
In `assign()`, add a branch after the `styling` branch:
```ts
    } else if (a === 'watching') {
      const used = new Set(this.list.filter((x) => x.activity === 'watching' && x !== m).map((x) => x.spot))
      m.spot = [0, 1, 2, 3, 4, 5].find((i) => !used.has(i)) ?? 0
      m.sectionId = null
```
In the `dur` table, add:
```ts
      watching: [30, 60],
```

- [ ] **Step 3: Crowd.** In `src/world/crowd.ts`, extend `CrowdPlaces`:
```ts
  /** Standing spots facing the stage screen. */
  stage: Pose[]
```
In `target()`, add before `case 'playing':`:
```ts
      case 'watching': {
        const p = this.places.stage[m.spot % Math.max(1, this.places.stage.length)]
        return p ? { to: p, key: `watch${m.spot}` } : null
      }
```

- [ ] **Step 4: Live mall.** In `src/world/liveMall.ts`, add `import { stageSpots } from './plaza'` and change:
```ts
    const places: CrowdPlaces = { wheel: wheel.centre, studio: studioPoses }
```
to:
```ts
    const places: CrowdPlaces = { wheel: wheel.centre, studio: studioPoses, stage: stageSpots() }
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

Then in the browser (dev server):
```js
lv.game.enterMall(); await new Promise(r=>setTimeout(r,90000)); lv.social.presence.members().filter(m=>m.activity==='watching').length
```
Expected: ≥ 1 within 90 s, or call the private method directly:
```js
const P=lv.social.presence; P.assign(P.members()[0],'watching')
```
Then screenshot from (0, −6), facing −z: shoppers stand facing the screen.

- [ ] **Step 6: Commit**

```bash
git add src/social/types.ts src/social/mockPresence.ts src/world/crowd.ts src/world/liveMall.ts
git commit -m "feat(crowd): shoppers watch the stage screen"
```

---

### Task 7: Corridor finishing A: floor inlays, islands, pendants, ceiling coves

**Files:**
- Create: `src/world/corridor.ts`
- Modify: `src/world/signage.ts` (add `starInlayTexture()`)
- Modify: `src/world/mall.ts` (remove the runner and centre light strips)
- Modify: `src/main.ts` (call `buildCorridor` per wing)

**Interfaces:**
- Consumes: `Wing`, `ShopLayout`, `toWorld`, `MALL` (`config/layout.ts`); `addContactShadow`, `addHalo` (Task 2); `ScreenFeed`, `ScreenActions` (Task 4).
- Produces:
  - `export interface CorridorCtx { root: Object3D; batcher: Batcher; colliders: CollisionWorld; interaction: Interaction; kit: Kit | null; actions: ScreenActions }`
  - `export function buildCorridor(ctx: CorridorCtx, wing: Wing, shops: ShopLayout[]): { feeds: ScreenFeed[] }`: Tasks 8 and 9 extend the same function.

- [ ] **Step 1: Add** `starInlayTexture()` to the end of `src/world/signage.ts`

```ts
/** 8-point marble star with a bronze ring, for the corridor floor (transparent outside the ring). */
let starTex: CanvasTexture | null = null
export function starInlayTexture(): CanvasTexture {
  if (starTex) return starTex
  const S = 512
  const [c, g] = makeCanvas(S, S)
  const cx = S / 2
  g.fillStyle = '#efe7dc'
  g.beginPath()
  g.arc(cx, cx, 240, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#d9c9b3'
  g.beginPath()
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 90 : 210
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cx + Math.sin(a) * r)
  }
  g.closePath()
  g.fill()
  g.strokeStyle = '#b08a5c'
  g.lineWidth = 14
  g.beginPath()
  g.arc(cx, cx, 238, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = 4
  g.beginPath()
  g.arc(cx, cx, 100, 0, Math.PI * 2)
  g.stroke()
  starTex = canvasTexture(c)
  return starTex
}
```

- [ ] **Step 2: Create** `src/world/corridor.ts`

```ts
// Warm-luxury finishing for one wing corridor, built in the wing's local frame
// (origin = mouth on the plaza, local −Z away from it, corridor x ±6):
// bronze floor inlays + marble stars, islands (planters + bench), pendant
// lights with halos, ceiling coves. Tasks 8–9 add screens, storefront
// framing, portal, wayfinding and the end wall.

import { Group, Matrix4, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three'
import { MALL, toWorld, type ShopLayout, type Wing } from '../config/layout'
import type { Batcher } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import type { Interaction } from '../interact/interaction'
import type { Kit } from './kit'
import { MAT, tintMat } from './materials'
import { plant } from './props'
import { addContactShadow } from './decals'
import { addHalo } from './glow'
import { starInlayTexture } from './signage'
import type { ScreenActions, ScreenFeed } from './screens'

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

  void shops
  return { feeds: [] }
}
```

- [ ] **Step 3: Remove the runner and centre strips** in `src/world/mall.ts` (`buildWing`).

Delete:
```ts
    const runner = new Mesh(new PlaneGeometry(2.6, len - 1), tintMat('#d8cbb8', 1, 0.6))
    runner.rotation.x = -Math.PI / 2
    runner.position.set(0, 0.004, -len / 2 - 0.5)
    group.add(runner)
```
Replace:
```ts
    // Corridor ceiling with light strips.
    wf.box(MAT.ceiling, 0, BH + 0.1, -len / 2, 2 * B, 0.2, len)
    for (let z = -2; z > -len + 1; z -= 4) {
      wf.box(MAT.lightPanel, -3, BH - 0.02, z - 1.5, 0.18, 0.04, 3)
      wf.box(MAT.lightPanel, 3, BH - 0.02, z - 1.5, 0.18, 0.04, 3)
    }
```
with:
```ts
    // Corridor ceiling (coves and pendants come from corridor.ts).
    wf.box(MAT.ceiling, 0, BH + 0.1, -len / 2, 2 * B, 0.2, len)
```
Change `// Corridor floor + runner` to `// Corridor floor`.

- [ ] **Step 4: Call it from** `src/main.ts` (in `buildMall`, right before `buildDecals(engine.scene)`):

```ts
  for (const w of layout.wings)
    feeds.push(...buildCorridor({ root: engine.scene, batcher, colliders, interaction: game.interaction, kit, actions }, w, layout.shops.filter((s) => s.wing === w.id)).feeds)
```
Add `import { buildCorridor } from './world/corridor'`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`. Then take screenshots:
- the north wing from its mouth: `g.player.teleport(0,-36,0); g.player.pitch=-0.06`;
- an island close-up: `g.player.teleport(-2.5,-44,0.4)`.

Expected: bronze lines and stars on the floor, islands with plants and benches, two rows of pendants with halos (High), coves along the ceiling edges, and no runner.

Crowd check: after 60 s, `lv.game.live.crowd.agents.filter(a=>a.stuck>1.5).length` is 0 in at least 3 samples taken 10 s apart.

- [ ] **Step 6: Commit**

```bash
git add src/world/corridor.ts src/world/signage.ts src/world/mall.ts src/main.ts
git commit -m "feat(corridor): floor inlays, islands, pendant lights and ceiling coves"
```

---

### Task 8: Corridor finishing B: column screens, storefront framing, doormats

**Files:**
- Modify: `src/world/corridor.ts`
- Modify: `src/world/signage.ts` (add `doormatTexture()`)

**Interfaces:**
- Consumes: `ScreenFeed`, `screenMesh`, `registerScreen` (Task 4); `ShopLayout.brand` (`BrandDef`: `initials`, `color`, `logo`).
- Produces: `buildCorridor` returns `{ feeds: [wingFeed] }`.

- [ ] **Step 1: Add** `doormatTexture()` to `src/world/signage.ts`

```ts
/** Doormat in the brand colour with its monogram (logo image when available). */
export function doormatTexture(m: Monogram): CanvasTexture {
  const [c, g] = makeCanvas(512, 256)
  g.fillStyle = m.color
  g.fillRect(0, 0, 512, 256)
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.lineWidth = 8
  g.strokeRect(16, 16, 480, 224)
  drawMonogram(g, { ...m, color: m.color }, 256, 128, 78)
  return withLogo(canvasTexture(c), m.logo, (img) => {
    g.fillStyle = '#f7f2ec'
    g.fillRect(36, 36, 440, 184)
    fitImage(g, img, 256, 128, 400, 150)
  })
}
```

- [ ] **Step 2: Extend** `buildCorridor` in `src/world/corridor.ts`. Replace `void shops` and `return { feeds: [] }` with:

```ts
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
      // Flat on the floor (X −90°), then turned with the shop (Y first in YXZ order).
      mat.rotation.set(-Math.PI / 2, s.yaw, 0, 'YXZ')
      mat.position.set(p.x, 0.006, p.z)
      ctx.root.add(mat)
    }
  }

  return { feeds: [feed] }
```

Update the imports at the top of `corridor.ts`:
```ts
import { Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three'
import { imageMat, MAT, tintMat } from './materials'
import { doormatTexture, starInlayTexture } from './signage'
import { ScreenFeed, registerScreen, screenMesh, type ScreenActions } from './screens'
```
(and remove the old `import type { ScreenActions, ScreenFeed } from './screens'`).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`. Then take screenshots:
- a column screen: `g.player.teleport(-2,-12,1.2)` in the west wing coordinates (use `toWorld(wing.origin, wing.yaw, -2, -12)` and yaw `wing.yaw + 1.2` in the harness);
- a storefront with its doormat: teleport to `shopArrival` + 4 m back towards the corridor, facing the shop.

Expected: portrait screens on the walls between storefronts, cycling that wing's brands; bronze frames around the openings; a lightbox strip under each fascia; uplights under the posters; doormats in the brand colour.

Also: E on a column screen teleports to its brand.

- [ ] **Step 4: Commit**

```bash
git add src/world/corridor.ts src/world/signage.ts
git commit -m "feat(corridor): column screens, storefront frames and brand doormats"
```

---

### Task 9: Corridor finishing C: wing portal, directory board, wayfinding, end wall, wall gradient

**Files:**
- Modify: `src/world/corridor.ts`
- Modify: `src/world/signage.ts` (add `wingDirectoryTexture()`, `wayfindingTexture()`, `wallGradientTexture()`)

**Interfaces:**
- Consumes: `labelSign`, `fitText` (inside `signage.ts`); `loadProductTexture`, `makeCanvas`, `canvasTexture`; `BRAND`; `catalog`.
- Produces: no new exports beyond the three texture helpers.

- [ ] **Step 1: Add the texture helpers** to `src/world/signage.ts`

```ts
export interface DirectoryRow {
  name: string
  nameAr: string
  color: string
}

/** Wing directory board: the wing name, then every unit in order. */
export function wingDirectoryTexture(titleEn: string, titleAr: string, rows: DirectoryRow[]): CanvasTexture {
  const [c, g] = makeCanvas(512, 940)
  g.fillStyle = '#fbf8f4'
  g.fillRect(0, 0, 512, 940)
  g.fillStyle = '#8a6a46'
  g.fillRect(0, 0, 512, 150)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `600 44px ${BRAND.fontLatin}`
  g.fillText(titleEn, 256, 55)
  g.direction = 'rtl'
  g.font = `700 38px ${BRAND.fontUi}`
  g.fillText(titleAr, 256, 108)
  g.direction = 'ltr'
  const rowH = Math.min(96, 760 / Math.max(1, rows.length))
  rows.forEach((r, i) => {
    const y = 175 + i * rowH + rowH / 2
    g.fillStyle = r.color
    g.fillRect(24, y - rowH / 2 + 8, 12, rowH - 16)
    g.fillStyle = BRAND.ink
    g.textAlign = 'left'
    fitText(g, r.name, (px) => `600 ${px}px ${BRAND.fontLatin}`, Math.min(32, rowH * 0.38), 240)
    g.fillText(r.name, 52, y)
    g.textAlign = 'right'
    g.direction = 'rtl'
    fitText(g, r.nameAr, (px) => `700 ${px}px ${BRAND.fontUi}`, Math.min(30, rowH * 0.36), 170)
    g.fillText(r.nameAr, 488, y)
    g.direction = 'ltr'
    g.fillStyle = 'rgba(0,0,0,0.06)'
    g.fillRect(24, y + rowH / 2 - 1, 464, 1)
  })
  return canvasTexture(c)
}

/** Hanging wayfinding sign face: "Ahead / قدامك" and up to 4 unit names. */
export function wayfindingTexture(headEn: string, headAr: string, names: string[]): CanvasTexture {
  const [c, g] = makeCanvas(1024, 256)
  g.fillStyle = '#f4ede3'
  g.fillRect(0, 0, 1024, 256)
  g.fillStyle = '#8a6a46'
  g.fillRect(0, 0, 230, 256)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `600 40px ${BRAND.fontLatin}`
  g.fillText(headEn, 115, 92)
  g.direction = 'rtl'
  g.font = `700 40px ${BRAND.fontUi}`
  g.fillText(headAr, 115, 168)
  g.direction = 'ltr'
  g.fillStyle = BRAND.ink
  const line = names.slice(0, 4).join('  ·  ')
  fitText(g, line, (px) => `600 ${px}px ${BRAND.fontLatin}`, 52, 760)
  g.fillText(line, 627, 128)
  return canvasTexture(c)
}

/** Vertical shade for the bottom of corridor walls (dark at the floor → clear). */
let wallGrad: CanvasTexture | null = null
export function wallGradientTexture(): CanvasTexture {
  if (wallGrad) return wallGrad
  const [c, g] = makeCanvas(4, 128)
  const grad = g.createLinearGradient(0, 128, 0, 0)
  grad.addColorStop(0, 'rgba(60,40,30,0.32)')
  grad.addColorStop(1, 'rgba(60,40,30,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 128)
  wallGrad = canvasTexture(c)
  return wallGrad
}
```

- [ ] **Step 2: Extend** `buildCorridor` in `src/world/corridor.ts`. Insert before `return { feeds: [feed] }`:

```ts
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
  wf.box(cream, -4.6, 1.3, -1.5, 1.3, 2.36, 0.12)
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
  Promise.all(
    tiles.map((s, i) => {
      const p = catalog().byId.get(s.section!.productIds[0])
      return p ? loadProductTexture(p.images[0], 512).then(({ image }) => {
        const im = image as HTMLCanvasElement
        const sc = Math.max(tileW / im.width, 820 / im.height)
        eg.save()
        eg.beginPath()
        eg.rect(i * tileW + 6, 6, tileW - 12, 808)
        eg.clip()
        eg.drawImage(im, i * tileW + (tileW - im.width * sc) / 2, (820 - im.height * sc) / 2, im.width * sc, im.height * sc)
        eg.restore()
      }) : Promise.resolve()
    }),
  )
    .then(() => loadImage(BRAND.logo))
    .then((logo) => {
      eg.fillStyle = 'rgba(251,248,244,0.92)'
      eg.fillRect(724, 300, 600, 220)
      const s = Math.min(540 / logo.width, 180 / logo.height)
      eg.drawImage(logo, 1024 - (logo.width * s) / 2, 410 - (logo.height * s) / 2, logo.width * s, logo.height * s)
      endTex.needsUpdate = true
    })
    .catch(() => {
      endTex.needsUpdate = true
    })
  for (const x of [-4.6, 4.6])
    if (!ctx.kit?.place('plant', group, x, -len + 1.0, 0, ctx.colliders)) plant(wf, x, -len + 1.0, 1.2, 140 + Math.round(x))

  // ----------------------------------------------------------- wall shade
  // Dark-to-clear band at the base of the solid wall between storefronts.
  wallGeo ??= new PlaneGeometry(6, 1.1)
  wallMat ??= new MeshBasicMaterial({ map: wallGradientTexture(), transparent: true, depthWrite: false })
  for (let r = 0; r <= rows; r++)
    for (const side of [-1, 1]) wf.custom(wallGeo, wallMat, side * (B - 0.01), 0.55, -r * L, 1, side < 0 ? Math.PI / 2 : -Math.PI / 2)
```

Add these module-level declarations next to `starGeo`:
```ts
let wallGeo: PlaneGeometry | null = null
let wallMat: MeshBasicMaterial | null = null

/** A world point's z in the wing's local frame (distance along the corridor, negative away from the plaza). */
function toLocalZ(wing: Wing, p: { x: number; z: number }): number {
  const dx = p.x - wing.origin.x
  const dz = p.z - wing.origin.z
  return dx * Math.sin(wing.yaw) + dz * Math.cos(wing.yaw)
}
```
Update the imports:
```ts
import { BRAND } from '../config/brand'
import { canvasTexture, loadImage, loadProductTexture, makeCanvas } from '../engine/textures'
import { catalog } from '../state/store'
import { doormatTexture, starInlayTexture, wallGradientTexture, wayfindingTexture, wingDirectoryTexture } from './signage'
```

- [ ] **Step 3: Verify `toLocalZ` with a quick unit test.** Add to `tests/plazaMath.test.ts`:

```ts
import { toWorld } from '../src/config/layout'

describe('toWorld round-trip used by corridor.toLocalZ', () => {
  it('local z maps back for every wing yaw', () => {
    for (const yaw of [0, Math.PI / 2, -Math.PI / 2]) {
      const o = { x: 3, z: -20 }
      const p = toWorld(o, yaw, 2.5, -17)
      const dz = (p.x - o.x) * Math.sin(yaw) + (p.z - o.z) * Math.cos(yaw)
      expect(dz).toBeCloseTo(-17, 6)
    }
  })
})
```
Run: `npm test`
Expected: PASS. If it fails, `toLocalZ` in `corridor.ts` is wrong; fix the formula to match the test.

- [ ] **Step 4: Verify visually**

Run: `npx tsc --noEmit && npm run build`. Then take screenshots:
- each wing mouth from the plaza (the portal and directory board readable);
- the mid-wing hanging sign from both directions;
- each end wall (photo collage + logo + plants);
- a wall section showing the base shade.

Expected: everything legible, no z-fighting on the inlays, gradient bands behind the posters (posters drawn in front).

- [ ] **Step 5: Commit**

```bash
git add src/world/corridor.ts src/world/signage.ts tests/plazaMath.test.ts
git commit -m "feat(corridor): wing portal, directory board, wayfinding, end wall and wall shade"
```

---

### Task 10: Performance pass, crowd check, docs

**Files:**
- Modify: `CLAUDE.md` (the 122 Mall structure section)
- Modify: `README.md` (performance table + plaza/corridor notes)

- [ ] **Step 1: Measure.** Use the scratchpad `perf.mjs` (headed msedge, as before) with spots:
  - plaza `(0,-3.5,0)`;
  - north wing `(0,-38,0)`;
  - west wing `toWorld({x:-22,z:-20}, Math.PI/2, 0, -6)` facing `Math.PI/2`;
  - shop `teleport('nourhan')`.

  Run it for `?nolock&nodemo`, `?nolock&crowd=30` and `?nolock&crowd=50`.

Expected (High tier, desktop): plaza ≤ 220 calls, wings ≤ 300 calls, all ≥ 45 FPS.

If over budget, apply in this order:
1. reduce pendant rows to every 8 m;
2. drop the halos (glows) on Medium;
3. merge the stage screen frame boxes.

Re-measure after each step.

- [ ] **Step 2: Crowd stuck check.** In the browser:

```js
lv.game.enterMall(); for (let i=0;i<6;i++){ await new Promise(r=>setTimeout(r,10000)); console.log(lv.game.live.crowd.agents.filter(a=>a.stuck>1.5).length) }
```
Expected: 0 in at least 5 of the 6 samples.

- [ ] **Step 3: Docs.**
- `CLAUDE.md`: under "122 Mall structure", add one bullet:
  - "Plaza/corridor finishing: `plaza.ts` (stage + LED + seating), `corridor.ts` (per-wing finishing), `screens.ts`/`screenSlides.ts` (live screens, shared feeds), `decals.ts`/`glow.ts` (instanced contact shadows / additive glows, glows hidden on Low)."
- `README.md`: replace the performance table with the new numbers from Step 1, and add one paragraph describing the stage and the corridor finishing.

- [ ] **Step 4: Final verification and commit**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

```bash
git add CLAUDE.md README.md
git commit -m "docs: plaza stage + corridor finishing, perf numbers"
```

Then send the user the before/after screenshots (plaza, stage, seating, each wing, storefront, end wall) and the perf table.
