import { describe, expect, it } from 'vitest'
import { pickNearest, withinGate } from '../src/engine/hysteresis'

describe('withinGate', () => {
  it('enters below the limit and leaves only past limit + margin', () => {
    expect(withinGate(false, 18.9, 19, 3)).toBe(true)
    expect(withinGate(false, 19.5, 19, 3)).toBe(false)
    expect(withinGate(true, 21.9, 19, 3)).toBe(true)
    expect(withinGate(true, 22, 19, 3)).toBe(false)
  })

  it('does not flicker while hovering around the limit', () => {
    let v = false
    const seen: boolean[] = []
    for (const d of [19.2, 18.9, 19.1, 18.95, 19.3, 20.5, 21.8, 19.4]) seen.push((v = withinGate(v, d, 19, 3)))
    expect(seen).toEqual([false, true, true, true, true, true, true, true])
  })
})

describe('pickNearest', () => {
  it('takes the nearest within the limit, at most max', () => {
    expect(pickNearest([5, 2, 12, 3], [false, false, false, false], 2, 9, 1.5)).toEqual([false, true, false, true])
  })

  it('keeps an existing pick against a newcomer that is only slightly closer', () => {
    // 0 had the slot at 4.0; 1 comes in at 3.5 (less than the 1.5 m margin closer).
    expect(pickNearest([4, 3.5], [true, false], 1, 9, 1.5)).toEqual([true, false])
    // A newcomer clearly closer takes it.
    expect(pickNearest([4, 2], [true, false], 1, 9, 1.5)).toEqual([false, true])
  })

  it('keeps a pick slightly past the limit, drops it beyond the margin', () => {
    expect(pickNearest([9.8], [true], 4, 9, 1.5)).toEqual([true])
    expect(pickNearest([9.8], [false], 4, 9, 1.5)).toEqual([false])
    expect(pickNearest([10.6], [true], 4, 9, 1.5)).toEqual([false])
  })
})
