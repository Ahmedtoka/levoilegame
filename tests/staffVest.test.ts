import { describe, expect, it } from 'vitest'
import { luminance, staffLook, staffVestColor } from '../src/actors/palette'
import { BRAND } from '../src/config/brand'
import { BRANDS } from '../src/config/mall'

describe('staff vest colour', () => {
  it('measures relative luminance', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
    expect(luminance('#808080')).toBeCloseTo(0.2159, 3)
  })

  it('keeps the mall plum without a brand', () => {
    expect(staffVestColor()).toBe(BRAND.magenta)
    expect(staffVestColor(null)).toBe(BRAND.magenta)
    expect(staffVestColor('plum')).toBe(BRAND.magenta)
  })

  it('uses the brand colour when it is dark enough', () => {
    expect(staffVestColor('#6b2fbf')).toBe('#6b2fbf')
    expect(staffVestColor('#2e8b3a')).toBe('#2e8b3a')
  })

  it('darkens very light brand colours to a readable mid tone, keeping the hue', () => {
    const v = staffVestColor('#fff2b0')
    expect(v).not.toBe('#fff2b0')
    expect(luminance(v)).toBeCloseTo(0.3, 1)
    expect(staffVestColor('#ffffff')).toMatch(/^#(9[45])\1\1$/)
    for (const b of BRANDS) expect(luminance(staffVestColor(b.color))).toBeLessThanOrEqual(0.7)
  })

  it('staffLook wears the brand colour, the concierge the plum', () => {
    expect(staffLook(3, null, 'clasped', '#0f8a7a').vest?.color).toBe('#0f8a7a')
    expect(staffLook(99, null, 'clasped').vest?.color).toBe(BRAND.magenta)
  })
})
