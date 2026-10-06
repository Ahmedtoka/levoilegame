import { describe, expect, it } from 'vitest'
import { buildLayout, rectContains, shopZone, type MallLayout } from '../src/config/layout'
import { BENCH_SPOTS, BENCH_SPOT_IDS, benchSpots, brandSections, callBudget } from '../src/bench/spots'

const L = buildLayout(brandSections())

/** Same order as Game.zoneAt(): shops, wings, extra zones, cashier, atrium, else boulevard. */
function zoneAt(layout: MallLayout, x: number, z: number): string {
  for (const s of layout.shops) if (rectContains(s.rect, x, z)) return shopZone(s)
  for (const w of layout.wings) if (rectContains(w.rect, x, z)) return `wing-${w.id}`
  for (const zn of layout.zones ?? []) if (rectContains(zn.rect, x, z)) return zn.id
  if (rectContains(layout.cashier.zone, x, z)) return 'cashier'
  if (rectContains(layout.atrium, x, z)) return 'atrium'
  return 'boulevard'
}

const EXPECTED = [
  'atrium-entrance',
  'atrium-up',
  'atrium-stage',
  'atrium-cashier',
  'wing-west-mouth',
  'wing-north-mouth',
  'wing-east-mouth',
  'wing-north-mid',
  'wing-west-nook',
  'storefront-pistage',
  'storefront-axis',
  'shop-pistage',
  'shop-hashbag',
  'shop-axis',
  'shop-levoile',
  'shop-levoile-hall',
  'soon-1',
  'popup',
]

describe('bench spots', () => {
  it('defines every agreed spot', () => {
    expect(BENCH_SPOT_IDS).toEqual(EXPECTED)
  })

  it('reports the zone Game.zoneAt() gives at each pose', () => {
    for (const [id, s] of Object.entries(benchSpots(L))) expect(zoneAt(L, s.x, s.z), id).toBe(s.zone)
  })

  it('keeps pitch within the player clamp and poses finite', () => {
    for (const [id, s] of Object.entries(BENCH_SPOTS)) {
      expect(Math.abs(s.pitch), id).toBeLessThanOrEqual(1.2)
      for (const v of [s.x, s.z, s.yaw]) expect(Number.isFinite(v), id).toBe(true)
    }
  })

  it('puts shop spots inside their unit and storefront spots in the corridor', () => {
    expect(BENCH_SPOTS['shop-pistage'].zone).toBe('pistage')
    expect(BENCH_SPOTS['shop-levoile'].zone).toBe('levoile')
    expect(BENCH_SPOTS['shop-levoile-hall'].zone).toBe('levoile')
    expect(BENCH_SPOTS['storefront-pistage'].zone).toBe('wing-north')
    expect(BENCH_SPOTS['soon-1'].zone).toBe('wing-east')
    expect(BENCH_SPOTS['popup'].zone).toBe('wing-west')
    // The two Le Voile openings are different spots.
    expect(BENCH_SPOTS['shop-levoile'].x).not.toBeCloseTo(BENCH_SPOTS['shop-levoile-hall'].x, 1)
  })

  it('has the agreed draw-call budgets', () => {
    expect(callBudget('atrium')).toBe(220)
    expect(callBudget('wing-north')).toBe(300)
    expect(callBudget('pistage')).toBe(130)
  })
})
