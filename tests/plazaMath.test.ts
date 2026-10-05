import { describe, expect, it } from 'vitest'
import { toWorld } from '../src/config/layout'
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
