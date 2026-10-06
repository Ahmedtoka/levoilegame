import { describe, expect, it } from 'vitest'
import { tryOnPlan } from '../src/actors/avatar/tryOn'
import { modestyProblems, piecesFor } from '../src/actors/avatar/pieces'

const plan = (title: string, section = 'x') => tryOnPlan({ title, section })

describe('try-on plan', () => {
  it('recognises garments in English and Arabic', () => {
    expect(plan('Linen Abaya')?.outfit).toBe('abaya')
    expect(plan('Sprinkles dress')?.outfit).toBe('dress')
    expect(plan('Wide leg jeans')).toMatchObject({ outfit: 'pants', parts: ['bottom'] })
    expect(plan('Pleated skirt')).toMatchObject({ outfit: 'skirt', parts: ['bottom'] })
    expect(plan('Misty cardigan')).toMatchObject({ parts: ['top'] })
    expect(plan('Flake set')).toMatchObject({ outfit: 'pants', parts: ['top', 'bottom'] })
    expect(plan('Chiffon printed scarf')).toMatchObject({ parts: ['hijab'] })
    expect(plan('فستان كتان')?.outfit).toBe('dress')
  })

  it('skips things that are not worn as clothes', () => {
    expect(plan('Leather bag')).toBeNull()
    expect(plan('Printed women flip-flops')).toBeNull()
    expect(plan('Probar box')).toBeNull()
  })

  it('every try-on outfit stays modest', () => {
    for (const t of ['abaya', 'dress', 'jeans', 'skirt', 'set', 'blouse', 'scarf']) {
      const p = plan(t)
      const outfit = p?.outfit ?? 'skirt'
      for (const head of [{ kind: 'hijab', style: 'classic', color: '#000' }, { kind: 'hair', style: 'long', color: '#000' }] as const)
        expect(modestyProblems(piecesFor({ outfit, head }))).toEqual([])
    }
  })
})
