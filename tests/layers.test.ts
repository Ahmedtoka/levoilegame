import { describe, expect, it } from 'vitest'
import { Group } from 'three'
import { addContactShadow, buildDecals } from '../src/world/decals'
import { addCone, addHalo, buildGlows, setGlowsVisible } from '../src/world/glow'

describe('decals', () => {
  it('builds one instanced mesh with every shadow, then resets', () => {
    addContactShadow(0, 0, 2, 1)
    addContactShadow(3, -4, 1, 1, Math.PI / 2)
    const g = new Group()
    const m = buildDecals(g)
    expect(m?.count).toBe(2)
    expect(g.children).toHaveLength(1)
    expect(buildDecals(new Group())).toBeNull()
  })
})

describe('glow', () => {
  it('builds halos and cones and toggles visibility', () => {
    addHalo(0, 4, 0, 0.4)
    addHalo(1, 4, 0, 0.4)
    addCone(0, 6, 0, 5, 1, 0.1, 0)
    const g = new Group()
    const meshes = buildGlows(g, false)
    expect(meshes.map((m) => m.count).sort()).toEqual([1, 2])
    expect(meshes.every((m) => !m.visible)).toBe(true)
    setGlowsVisible(true)
    expect(meshes.every((m) => m.visible)).toBe(true)
  })
})
