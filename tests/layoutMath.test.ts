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
