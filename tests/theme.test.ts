import { describe, expect, it } from 'vitest'
import { THEME } from '../src/world/theme'

const HEX = /^#[0-9a-f]{6}$/i

/** Every string leaf of an object (recursively). */
function strings(o: unknown, path = 'THEME'): [string, string][] {
  if (typeof o === 'string') return [[path, o]]
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => strings(v, `${path}.${k}`))
  return []
}

describe('THEME', () => {
  it('holds valid 6-digit hex colours for every string token', () => {
    const all = strings(THEME)
    expect(all.length).toBeGreaterThan(15)
    for (const [path, v] of all) expect(v, path).toMatch(HEX)
  })

  it('keeps the night-mall rig within sane ranges', () => {
    const { lighting: l } = THEME
    expect(l.env).toBeGreaterThanOrEqual(0)
    expect(l.env).toBeLessThanOrEqual(0.5)
    expect(l.exposure).toBeGreaterThanOrEqual(0.6)
    expect(l.exposure).toBeLessThanOrEqual(1.3)
    expect(l.hemi).toBeGreaterThan(0)
    expect(l.hemi).toBeLessThanOrEqual(1.5)
    expect(l.sun).toBeGreaterThanOrEqual(0)
    expect(l.sun).toBeLessThanOrEqual(1.5)
    expect(THEME.fogNear).toBeGreaterThan(5)
    expect(THEME.fogFar).toBeGreaterThan(THEME.fogNear)
    expect(THEME.fogFar).toBeLessThanOrEqual(140) // inside the camera's far plane
  })

  it('keeps roughness values in 0–1', () => {
    for (const [k, v] of Object.entries(THEME.roughness)) {
      expect(v, k).toBeGreaterThanOrEqual(0)
      expect(v, k).toBeLessThanOrEqual(1)
    }
  })

  it('is darker at the ceiling than on the walls (night mall)', () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(lum(THEME.ceiling)).toBeLessThan(lum(THEME.wallShadow))
    expect(lum(THEME.wallShadow)).toBeLessThan(lum(THEME.wall))
    expect(lum(THEME.ceilingCoffer)).toBeLessThanOrEqual(lum(THEME.ceiling))
    expect(lum(THEME.floorBorder)).toBeLessThanOrEqual(lum(THEME.floor))
  })
})
