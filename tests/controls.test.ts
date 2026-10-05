import { describe, expect, it } from 'vitest'
import {
  ARRIVE_DIST,
  LOOK_RATE,
  STALL_TIME,
  focusAngles,
  floorPoint,
  smoothLook,
  stickVector,
  touchLookSens,
  walkStep,
  yawToward,
} from '../src/player/controlsMath'

describe('smoothLook', () => {
  it('eases by 1 − exp(−dt·25)', () => {
    const k = 1 - Math.exp(-(1 / 60) * LOOK_RATE)
    const r = smoothLook({ yaw: 0, pitch: 0 }, { yaw: 1, pitch: -0.5 }, 1 / 60)
    expect(r.yaw).toBeCloseTo(k, 10)
    expect(r.pitch).toBeCloseTo(-0.5 * k, 10)
  })

  it('does not move with dt = 0 and converges for long dt', () => {
    expect(smoothLook({ yaw: 0.2, pitch: 0.1 }, { yaw: 1, pitch: 1 }, 0)).toEqual({ yaw: 0.2, pitch: 0.1 })
    const r = smoothLook({ yaw: 0, pitch: 0 }, { yaw: 2, pitch: 0.4 }, 1)
    expect(r.yaw).toBeCloseTo(2, 6)
    expect(r.pitch).toBeCloseTo(0.4, 6)
  })

  it('reaches ~99% of a step within 0.2 s at 60 fps (no noticeable lag)', () => {
    let s = { yaw: 0, pitch: 0 }
    for (let i = 0; i < 12; i++) s = smoothLook(s, { yaw: 1, pitch: 0 }, 1 / 60)
    expect(s.yaw).toBeGreaterThan(0.99)
  })
})

describe('floorPoint', () => {
  const eye = { x: 0, y: 1.6, z: 0 }

  it('hits the y = 0 plane ahead', () => {
    const d = Math.hypot(0, -1.6, -4)
    const p = floorPoint(eye, { x: 0, y: -1.6 / d, z: -4 / d })
    expect(p).not.toBeNull()
    expect(p!.x).toBeCloseTo(0, 6)
    expect(p!.z).toBeCloseTo(-4, 6)
    expect(p!.dist).toBeCloseTo(d, 6)
  })

  it('rejects rays that look level or up', () => {
    expect(floorPoint(eye, { x: 0, y: 0, z: -1 })).toBeNull()
    expect(floorPoint(eye, { x: 0, y: 0.3, z: -0.95 })).toBeNull()
  })

  it('rejects hits beyond the max distance (25 m)', () => {
    const far = { x: 0, y: -0.04, z: -0.9992 } // hits ~40 m out
    expect(floorPoint(eye, far)).toBeNull()
    expect(floorPoint(eye, far, 50)).not.toBeNull()
  })
})

describe('walkStep', () => {
  const target = { x: 0, z: -10 }

  it('walks towards the target at full gain when far', () => {
    const r = walkStep({ x: 0, z: 0 }, { x: 0, z: -3 }, target, 0, 1 / 60)
    expect(r.status).toBe('walking')
    expect(r.dirX).toBeCloseTo(0, 6)
    expect(r.dirZ).toBeCloseTo(-1, 6)
    expect(r.gain).toBe(1)
    expect(r.stall).toBe(0)
  })

  it('slows down near the target', () => {
    const r = walkStep({ x: 0, z: -9.4 }, { x: 0, z: -2 }, target, 0, 1 / 60)
    expect(r.status).toBe('walking')
    expect(r.gain).toBeLessThan(1)
    expect(r.gain).toBeGreaterThan(0)
  })

  it('arrives within the arrival distance', () => {
    const r = walkStep({ x: 0, z: -10 + ARRIVE_DIST * 0.5 }, { x: 0, z: -1 }, target, 0, 1 / 60)
    expect(r.status).toBe('arrived')
  })

  it('accumulates stall time when not progressing and stops after 1 s', () => {
    let stall = 0
    let status = 'walking'
    let t = 0
    while (status === 'walking' && t < 3) {
      const r = walkStep({ x: 0, z: 0 }, { x: 0, z: 0 }, target, stall, 0.1)
      stall = r.stall
      status = r.status
      t += 0.1
    }
    expect(status).toBe('stalled')
    expect(t).toBeGreaterThanOrEqual(STALL_TIME - 1e-9)
    expect(t).toBeLessThan(STALL_TIME + 0.15)
  })

  it('resets the stall timer once progress resumes', () => {
    const r = walkStep({ x: 0, z: 0 }, { x: 0, z: -3 }, target, 0.9, 0.1)
    expect(r.status).toBe('walking')
    expect(r.stall).toBe(0)
  })

  it('counts sliding sideways along a wall as no progress', () => {
    const r = walkStep({ x: 0, z: 0 }, { x: 3, z: 0 }, target, 0, 0.1)
    expect(r.stall).toBeCloseTo(0.1, 9)
  })
})

describe('yawToward / focusAngles', () => {
  it('matches the player forward convention (−sin yaw, −cos yaw)', () => {
    for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0.3, 0.7]]) {
      const yaw = yawToward(dx, dz)
      const l = Math.hypot(dx, dz)
      expect(-Math.sin(yaw)).toBeCloseTo(dx / l, 9)
      expect(-Math.cos(yaw)).toBeCloseTo(dz / l, 9)
    }
  })

  it('aims pitch at a point below or above the eye', () => {
    const a = focusAngles({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0.6, z: -1 })
    expect(a.yaw).toBeCloseTo(0, 9)
    expect(a.pitch).toBeCloseTo(-Math.PI / 4, 9)
    const b = focusAngles({ x: 0, y: 1.6, z: 0 }, { x: -2, y: 1.6, z: 0 })
    expect(b.yaw).toBeCloseTo(Math.PI / 2, 9)
    expect(b.pitch).toBeCloseTo(0, 9)
  })
})

describe('touch helpers', () => {
  it('scales look sensitivity with screen width, clamped', () => {
    expect(touchLookSens(390)).toBeCloseTo(0.0022 * 900 / 600, 9)
    expect(touchLookSens(900)).toBeCloseTo(0.0022, 9)
    expect(touchLookSens(1200)).toBeCloseTo(0.0022 * 900 / 1200, 9)
    expect(touchLookSens(5000)).toBeGreaterThan(0.0022 * 900 / 5000)
  })

  it('applies an 8 px joystick dead zone', () => {
    expect(stickVector(5, -5, 56)).toEqual({ x: 0, y: 0 })
    const v = stickVector(0, -56, 56)
    expect(v.x).toBeCloseTo(0, 9)
    expect(v.y).toBeCloseTo(1, 9)
    const c = stickVector(200, 0, 56)
    expect(c.x).toBeCloseTo(1, 9)
  })
})
