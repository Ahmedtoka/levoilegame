import { describe, expect, it } from 'vitest'
import { defaultAvatar, randomAvatar, sanitizeAvatar } from '../src/actors/avatar/look'
import { modestyProblems, piecesFor } from '../src/actors/avatar/pieces'

describe('saved avatar', () => {
  it('keeps a valid save as is', () => {
    const d = randomAvatar()
    expect(sanitizeAvatar(JSON.parse(JSON.stringify(d)))).toEqual(JSON.parse(JSON.stringify(d)))
  })

  it('repairs a broken or hand-edited save', () => {
    expect(sanitizeAvatar(null)).toBeNull()
    const s = sanitizeAvatar({ outfit: 'bikini', skin: 'red', face: 99, top: 'javascript:', head: { kind: 'hair', style: 'shaved' } })!
    expect(s.outfit).toBe(defaultAvatar().outfit)
    expect(s.skin).toBe(defaultAvatar().skin)
    expect(s.face).toBe(defaultAvatar().face)
    expect(s.top).toBe(defaultAvatar().top)
    expect(s.head.kind).toBe('hijab')
  })

  it('every random look is modest', () => {
    let seed = 1
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 300; i++) {
      const d = randomAvatar(r)
      expect(modestyProblems(piecesFor({ outfit: d.outfit, head: d.head }))).toEqual([])
    }
  })
})
