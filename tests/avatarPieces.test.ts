import { describe, expect, it } from 'vitest'
import { modestyProblems, piecesFor, PIECE_PART, type AvatarOutfit, type HeadWear } from '../src/actors/avatar/pieces'

const OUTFITS: AvatarOutfit[] = ['abaya', 'dress', 'skirt', 'pants']
const HEADS: HeadWear[] = [
  { kind: 'hijab', style: 'classic', color: '#000' },
  { kind: 'hijab', style: 'long', color: '#000', accent: '#fff' },
  { kind: 'hair', style: 'long', color: '#000' },
  { kind: 'hair', style: 'bun', color: '#000' },
  { kind: 'hair', style: 'ponytail', color: '#000' },
  { kind: 'hair', style: 'bob', color: '#000' },
]

describe('avatar pieces (modesty rule)', () => {
  it('every outfit × headwear × vest combination is fully covered', () => {
    for (const outfit of OUTFITS)
      for (const head of HEADS)
        for (const vest of [false, true]) {
          const pieces = piecesFor({ outfit, head, vest, logo: vest })
          expect(modestyProblems(pieces)).toEqual([])
          for (const p of pieces) expect(PIECE_PART[p]).toBeDefined()
        }
  })

  it('never includes a body piece — only garments, head and hands carry skin', () => {
    const skin = Object.entries(PIECE_PART).filter(([, part]) => part === 'skin' || part === 'face').map(([n]) => n)
    expect(skin.sort()).toEqual(['hands', 'head'])
  })

  it('rejects looks missing a top, a long bottom or leggings under a skirt', () => {
    expect(modestyProblems(['head', 'hands', 'shoes', 'skirt_flare', 'leggings', 'hijab_classic'])).toContain('no long-sleeved top')
    expect(modestyProblems(['head', 'hands', 'shoes', 'upper', 'hijab_classic'])).toContain('no long skirt or trousers')
    expect(modestyProblems(['head', 'hands', 'shoes', 'upper', 'skirt_flare', 'hijab_classic'])).toContain('no leggings under the skirt')
    expect(modestyProblems(['head', 'hands', 'shoes', 'upper_abaya', 'hijab_classic'])).toContain('no leggings under the skirt')
    expect(modestyProblems(['head', 'hands', 'shoes', 'upper_abaya', 'leggings', 'hijab_classic'])).toEqual([])
  })
})
