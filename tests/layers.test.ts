import { describe, expect, it } from 'vitest'
import { Group } from 'three'
import { addContactShadow, buildDecals } from '../src/world/decals'
import { addCone, addHalo, addPool, buildGlows, setGlowsVisible, SHOW_POOLS } from '../src/world/glow'
import { addAOStrip, aoCeilJunction, aoFloorJunction, buildAOStrips } from '../src/world/aoStrips'
import { tiledPlane, uvBox } from '../src/world/finish'
import { FLOOR_FX_LAYER } from '../src/engine/layers'
import { Matrix4, Vector3 } from 'three'

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

  it('accumulates glows across multiple buildGlows calls and toggles all', () => {
    // First batch: one halo
    addHalo(0, 4, 0, 0.4)
    const g = new Group()
    const batch1 = buildGlows(g, false)
    expect(batch1).toHaveLength(1)
    expect(batch1[0].visible).toBe(false)

    // Second batch: another halo
    addHalo(5, 4, 0, 0.4)
    const batch2 = buildGlows(g, false)
    expect(batch2).toHaveLength(1)
    expect(batch2[0].visible).toBe(false)

    // Toggle all: should affect both batches
    setGlowsVisible(true)
    expect(batch1[0].visible).toBe(true)
    expect(batch2[0].visible).toBe(true)

    // Empty call doesn't drop earlier meshes
    const batch3 = buildGlows(g, false)
    expect(batch3).toHaveLength(0)
    expect(batch1[0].visible).toBe(true)
    expect(batch2[0].visible).toBe(true)
  })
})

describe('light pools', () => {
  it('builds one floor layer on the floor-FX layer, hidden (SHOW_POOLS off) and untouched by the glow toggle', () => {
    addPool(0, -5, 2.8, 2.8)
    addPool(3, -5, 2.8, 2.8)
    const meshes = buildGlows(new Group(), false)
    expect(meshes).toHaveLength(1)
    expect(meshes[0].count).toBe(2)
    expect(meshes[0].layers.isEnabled(FLOOR_FX_LAYER)).toBe(true)
    expect(meshes[0].layers.isEnabled(0)).toBe(false)
    setGlowsVisible(true)
    expect(meshes[0].visible).toBe(SHOW_POOLS)
  })
})

describe('ao strips', () => {
  it('places the dark edge on the a→b line and fades along `up`', () => {
    addAOStrip([0, 0, 0], [4, 0, 0], [0, 1, 0], 0.6)
    const m = buildAOStrips(new Group())!
    const mat = new Matrix4()
    m.getMatrixAt(0, mat)
    // Unit quad spans x −0.5..0.5, y 0..1: (−0.5,0) → a, (0.5,0) → b, (0,1) → 0.6 up from the middle.
    expect(new Vector3(-0.5, 0, 0).applyMatrix4(mat).toArray().map((v) => +v.toFixed(5))).toEqual([0, 0, 0])
    expect(new Vector3(0.5, 0, 0).applyMatrix4(mat).toArray().map((v) => +v.toFixed(5))).toEqual([4, 0, 0])
    expect(new Vector3(0, 1, 0).applyMatrix4(mat).toArray().map((v) => +v.toFixed(5))).toEqual([2, 0.6, 0])
    expect(m.layers.isEnabled(FLOOR_FX_LAYER)).toBe(true)
  })

  it('junction helpers add a wall band and a floor/ceiling band, then reset', () => {
    aoFloorJunction(0, 0, 0, -6, 1, 0)
    aoCeilJunction(0, 0, 0, -6, 1, 0, 6, undefined, 0)
    const m = buildAOStrips(new Group())
    expect(m?.count).toBe(3)
    expect(buildAOStrips(new Group())).toBeNull()
  })
})

describe('finish geometry', () => {
  it('uvBox repeats UVs per metre of each face and is cached', () => {
    const g = uvBox(0.03, 1.1, 2.94, 1)
    const uv = g.getAttribute('uv')
    let maxU = 0
    let maxV = 0
    for (let i = 0; i < 4; i++) {
      maxU = Math.max(maxU, uv.getX(i))
      maxV = Math.max(maxV, uv.getY(i))
    }
    // +x face: u spans depth (z = 2.94 m), v spans height (1.1 m).
    expect(maxU).toBeCloseTo(2.94)
    expect(maxV).toBeCloseTo(1.1)
    expect(uvBox(0.03, 1.1, 2.94, 1)).toBe(g)
  })

  it('tiledPlane maps world metres to UV periods with an offset', () => {
    const g = tiledPlane(4.8, 9.6, 4.8, 2.4, 0)
    const pos = g.getAttribute('position')
    const uv = g.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) {
      expect(uv.getX(i)).toBeCloseTo((pos.getX(i) + 2.4) / 4.8)
      expect(uv.getY(i)).toBeCloseTo(-pos.getZ(i) / 4.8)
      expect(pos.getY(i)).toBeCloseTo(0)
    }
  })
})
