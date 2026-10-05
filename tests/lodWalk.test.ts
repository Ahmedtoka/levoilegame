import { describe, expect, it } from 'vitest'
import { Matrix4, Vector3 } from 'three'
import { encodeWalk } from '../src/actors/lodWalk'

describe('encodeWalk', () => {
  it('stores phase and blend in the bottom row only', () => {
    const m = new Matrix4().makeTranslation(1, 2, 3)
    encodeWalk(m, 7, 0.8)
    expect(m.elements[3]).toBeCloseTo(7 % (Math.PI * 2))
    expect(m.elements[7]).toBeCloseTo(0.8)
    expect(new Vector3().setFromMatrixPosition(m).toArray()).toEqual([1, 2, 3])
  })

  it('keeps a standing LOD affine (the walk is off)', () => {
    const m = encodeWalk(new Matrix4(), 3, 0)
    expect(m.elements[3]).toBe(0)
    expect(m.elements[7]).toBe(0)
  })
})
