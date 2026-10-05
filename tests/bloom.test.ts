import { describe, expect, it } from 'vitest'
import { CustomBlending, DstColorFactor, Group, Matrix4, MeshBasicMaterial, MeshStandardMaterial, NormalBlending, OneFactor, OneMinusSrcColorFactor, REVISION, ZeroFactor } from 'three'
import { registerBloom, setBloomSources } from '../src/engine/bloom'
import { BLOOM_THREE_REVISION, bloomSupported } from '../src/engine/post'
import { isMirrored, markMirrored, MIRROR_LAYER } from '../src/engine/layers'
import { Batcher, UNIT_BOX } from '../src/engine/batcher'

describe('bloom sources', () => {
  it('write the mask (alpha = 1 − weight) while bloom is on and restore exactly when off', () => {
    const light = new MeshBasicMaterial({ color: '#fff3dc' })
    const sign = new MeshBasicMaterial({ color: '#ffffff', opacity: 1, toneMapped: false })
    registerBloom(light, 1)
    setBloomSources(true)
    // Registered while bloom is on: applied immediately.
    registerBloom(sign, 0.3)
    for (const [m, w] of [[light, 1], [sign, 0.3]] as const) {
      expect(m.blending).toBe(CustomBlending)
      expect(m.blendSrc).toBe(OneFactor)
      expect(m.blendDst).toBe(ZeroFactor)
      expect(m.blendSrcAlpha).toBe(OneFactor)
      expect(m.blendDstAlpha).toBe(ZeroFactor)
      expect(m.opacity).toBeCloseTo(1 - w)
    }
    // The colour itself never changes.
    expect(light.color.getHexString()).toBe('fff3dc')
    setBloomSources(false)
    for (const m of [light, sign]) {
      expect(m.blending).toBe(NormalBlending)
      expect(m.blendSrcAlpha).toBeNull()
      expect(m.blendDstAlpha).toBeNull()
      expect(m.opacity).toBe(1)
    }
    expect(sign.toneMapped).toBe(false)
  })

  it('restores the original colour blend factors', () => {
    const m = new MeshBasicMaterial()
    m.blendSrc = DstColorFactor
    m.blendDst = OneMinusSrcColorFactor
    registerBloom(m, 0.5)
    setBloomSources(true)
    expect(m.blendSrc).toBe(OneFactor)
    setBloomSources(false)
    expect(m.blendSrc).toBe(DstColorFactor)
    expect(m.blendDst).toBe(OneMinusSrcColorFactor)
  })

  it('ignores transparent materials (their alpha is not a mask)', () => {
    const fade = new MeshBasicMaterial({ transparent: true, opacity: 0.4 })
    registerBloom(fade, 1)
    setBloomSources(true)
    expect(fade.blending).toBe(NormalBlending)
    expect(fade.opacity).toBe(0.4)
    setBloomSources(false)
  })
})

describe('mirror layer', () => {
  it('puts batched geometry with a mirrored material on MIRROR_LAYER only', () => {
    const wall = new MeshStandardMaterial()
    const prop = new MeshStandardMaterial()
    markMirrored(wall)
    expect(isMirrored(wall)).toBe(true)
    expect(isMirrored(prop)).toBe(false)
    const b = new Batcher()
    b.add(UNIT_BOX, wall, new Matrix4())
    b.add(UNIT_BOX, prop, new Matrix4())
    const [w, p] = b.build(new Group())
    expect(w.layers.isEnabled(MIRROR_LAYER)).toBe(true)
    expect(w.layers.isEnabled(0)).toBe(true)
    expect(p.layers.isEnabled(MIRROR_LAYER)).toBe(false)
  })
})

describe('bloom three.js guard', () => {
  it('runs on the checked three.js release and is off on any other', () => {
    // canvasLikeTarget relies on WebGLRenderer internals (isXRRenderTarget): an upgrade must re-check them.
    expect(REVISION).toBe(BLOOM_THREE_REVISION)
    expect(bloomSupported()).toBe(true)
    expect(bloomSupported('999')).toBe(false)
  })
})
