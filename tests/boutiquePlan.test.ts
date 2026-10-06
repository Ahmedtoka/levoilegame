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
