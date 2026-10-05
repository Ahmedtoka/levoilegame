import { describe, expect, it } from 'vitest'
import { CustomBlending, MeshBasicMaterial, NormalBlending, OneFactor, ZeroFactor } from 'three'
import { registerBloom, setBloomSources } from '../src/engine/bloom'

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

  it('ignores transparent materials (their alpha is not a mask)', () => {
    const fade = new MeshBasicMaterial({ transparent: true, opacity: 0.4 })
    registerBloom(fade, 1)
    setBloomSources(true)
    expect(fade.blending).toBe(NormalBlending)
    expect(fade.opacity).toBe(0.4)
    setBloomSources(false)
  })
})

