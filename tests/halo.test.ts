import { describe, expect, it } from 'vitest'
import { Color, CustomBlending, Group, InstancedMesh, Matrix4, OneFactor, Vector3 } from 'three'
import { addLightHalo, buildHalos, builtHaloCount, haloMaskWeight, pendingHaloCount } from '../src/world/halo'
import { BLOOM_WEIGHT, setBloomSources } from '../src/engine/bloom'

describe('light halos', () => {
  it('builds nothing when no halo was queued', () => {
    expect(buildHalos(new Group())).toBeNull()
  })

  it('packs every queued halo into one instanced sprite mesh', () => {
    const parent = new Group()
    addLightHalo(1, 2, 3, 0.8)
    addLightHalo(-4, 5, 6, 1.5, '#ff00ff')
    expect(pendingHaloCount()).toBe(2)
    const mesh = buildHalos(parent)
    expect(mesh).toBeInstanceOf(InstancedMesh)
    expect(mesh!.count).toBe(2)
    expect(parent.children).toEqual([mesh])
    expect(pendingHaloCount()).toBe(0)
    expect(builtHaloCount()).toBe(2)
    // Position and radius live in the instance matrix (the vertex shader billboards it).
    const m = new Matrix4()
    mesh!.getMatrixAt(1, m)
    expect(new Vector3().setFromMatrixPosition(m).toArray()).toEqual([-4, 5, 6])
    expect(new Vector3().setFromMatrixColumn(m, 0).length()).toBeCloseTo(1.5)
    const c = new Color()
    mesh!.getColorAt(1, c)
    expect(c.getHexString()).toBe('ff00ff')
    // Premultiplied additive, no depth write, never frustum-culled as a whole.
    const mat = mesh!.material
    expect(mat.blending).toBe(CustomBlending)
    expect(mat.blendSrc).toBe(OneFactor)
    expect(mat.blendDst).toBe(OneFactor)
    expect(mat.depthWrite).toBe(false)
    expect(mat.transparent).toBe(true)
    expect(mesh!.frustumCulled).toBe(false)
    // A second build only takes the halos added since.
    expect(buildHalos(parent)).toBeNull()
    addLightHalo(0, 0, 0, 1)
    expect(buildHalos(parent)!.count).toBe(1)
    expect(builtHaloCount()).toBe(3)
  })

  it('eats the bloom mask only while bloom is on', () => {
    expect(haloMaskWeight()).toBe(0)
    setBloomSources(true)
    expect(haloMaskWeight()).toBe(BLOOM_WEIGHT.halo)
    setBloomSources(false)
    expect(haloMaskWeight()).toBe(0)
  })
})
