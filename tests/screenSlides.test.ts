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
