import { describe, expect, it } from 'vitest'
import { shouldRender, sprintLockArmed } from '../src/player/controlsMath'
import { RES_SCALE_MIN, resolutionStep, touchTier } from '../src/engine/quality'

describe('sprintLockArmed', () => {
  it('arms only on a long, mostly vertical upward drag', () => {
    expect(sprintLockArmed(0, -120, 56)).toBe(true)
    expect(sprintLockArmed(0, -80, 56)).toBe(false)
    expect(sprintLockArmed(70, -120, 56)).toBe(false)
    expect(sprintLockArmed(0, 120, 56)).toBe(false)
  })
})

describe('shouldRender', () => {
  it('never skips when uncapped', () => {
    expect(shouldRender(1, 0, 0)).toBe(true)
  })
  it('keeps every frame of a 60 Hz screen at a 60 cap', () => {
    expect(shouldRender(16.6, 0, 60)).toBe(true)
  })
  it('halves a 120 Hz screen at a 60 cap and a 60 Hz screen at a 30 cap', () => {
    expect(shouldRender(8.3, 0, 60)).toBe(false)
    expect(shouldRender(16.7, 0, 30)).toBe(false)
    expect(shouldRender(33.3, 0, 30)).toBe(true)
  })
})

describe('resolutionStep', () => {
  it('drops the scale when the frame rate misses the target, down to the floor', () => {
    expect(resolutionStep(1, 40, 60, 2)).toEqual({ scale: 0.9, streak: 0 })
    expect(resolutionStep(RES_SCALE_MIN, 20, 60, 0).scale).toBe(RES_SCALE_MIN)
  })
  it('raises it only after three good windows', () => {
    let s = { scale: 0.8, streak: 0 }
    s = resolutionStep(s.scale, 60, 60, s.streak)
    s = resolutionStep(s.scale, 60, 60, s.streak)
    expect(s).toEqual({ scale: 0.8, streak: 2 })
    s = resolutionStep(s.scale, 60, 60, s.streak)
    expect(s).toEqual({ scale: 0.85, streak: 0 })
  })
  it('holds at full scale and in the dead band', () => {
    expect(resolutionStep(1, 60, 60, 0)).toEqual({ scale: 1, streak: 0 })
    expect(resolutionStep(0.8, 54, 60, 2)).toEqual({ scale: 0.8, streak: 0 })
  })
})

describe('touchTier', () => {
  it('picks High only on flagship GPUs with 8 cores and 8 GB', () => {
    expect(touchTier(8, 8, 'adreno (tm) 750')).toBe('high')
    expect(touchTier(8, 8, 'adreno (tm) 830')).toBe('high')
    expect(touchTier(8, 8, 'apple gpu')).toBe('high')
    expect(touchTier(8, 8, 'arm immortalis-g720')).toBe('high')
    expect(touchTier(8, 4, 'adreno (tm) 750')).toBe('low')
    expect(touchTier(8, 8, 'adreno (tm) 619')).toBe('medium')
    expect(touchTier(8, 6, 'mali-g57 mc2')).toBe('medium')
    expect(touchTier(4, 4, 'mali-g52')).toBe('low')
  })
})
