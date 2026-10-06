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
