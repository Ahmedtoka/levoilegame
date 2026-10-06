import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Color, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from 'three'

/** Every URL the fake loader was asked for, in order. */
const requested: string[] = []

vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>()
  class FakeTextureLoader {
    load(url: string, onLoad?: (t: Texture) => void): Texture {
      requested.push(url)
      const t = new three.Texture()
      // Pretend a 1024² (or 512² for .s.webp) image arrived.
      const n = url.endsWith('.s.webp') ? 512 : 1024
      t.image = { width: n, height: n }
      queueMicrotask(() => onLoad?.(t))
      return t
    }
  }
  return { ...three, TextureLoader: FakeTextureLoader }
})

const pbr = await import('../src/engine/pbr')
const { PBR_NAMES, pbrMaterial, pbrTextureBytes, pbrTint, pbrUrl, setPbrQuality, resetPbrCache } = pbr

const tick = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  requested.length = 0
  resetPbrCache()
  setPbrQuality({ textureMax: 1024, anisotropy: 4 })
})

describe('pbrUrl', () => {
  it('maps a name and map to /textures/pbr/<name>/<map>.webp, .s.webp at 512', () => {
    expect(pbrUrl('marble-dark', 'color', 1024)).toBe('/textures/pbr/marble-dark/color.webp')
    expect(pbrUrl('marble-dark', 'normal', 512)).toBe('/textures/pbr/marble-dark/normal.s.webp')
    expect(pbrUrl('oak-dark', 'roughness', 256)).toBe('/textures/pbr/oak-dark/roughness.s.webp')
  })

  it('lists the nine library names', () => {
    expect(PBR_NAMES).toEqual(['marble-dark', 'marble-cream', 'oak-dark', 'bronze-brushed', 'plaster-cream', 'velvet-plum', 'carpet-dark', 'concrete-dark', 'leather-tan'])
  })
})

describe('pbrMaterial', () => {
  it('throws on an unknown name', () => {
    expect(() => pbrMaterial('granite' as never)).toThrow(/unknown PBR texture/)
  })

  it('returns the same material for the same name and options, a new one for other options', () => {
    const a = pbrMaterial('oak-dark', { color: '#5b3f2a' })
    const b = pbrMaterial('oak-dark', { color: '#5b3f2a' })
    const c = pbrMaterial('oak-dark', { color: '#5b3f2a', repeat: [2, 2] })
    const d = pbrMaterial('oak-dark')
    expect(a).toBe(b)
    expect(c).not.toBe(a)
    expect(d).not.toBe(a)
    expect(a).toBeInstanceOf(MeshStandardMaterial)
  })

  it('loads the 1K colour + normal maps by default, the 512 ones when textureMax ≤ 512', async () => {
    pbrMaterial('marble-cream')
    expect(requested).toEqual(['/textures/pbr/marble-cream/color.webp', '/textures/pbr/marble-cream/normal.webp'])
    requested.length = 0
    resetPbrCache()
    setPbrQuality({ textureMax: 512, anisotropy: 1 })
    pbrMaterial('marble-cream')
    // Loads go through the shared image semaphore (2 at a time): the next pair waits a tick.
    await tick()
    expect(requested).toEqual(['/textures/pbr/marble-cream/color.s.webp', '/textures/pbr/marble-cream/normal.s.webp'])
  })

  it('shares one texture per map between materials of the same name, and only adds the roughness map on request', async () => {
    const a = pbrMaterial('leather-tan')
    const b = pbrMaterial('leather-tan', { roughness: 0.3 })
    expect(a.map).toBe(b.map)
    expect(a.normalMap).toBe(b.normalMap)
    expect(a.roughnessMap).toBeNull()
    const c = pbrMaterial('leather-tan', { roughnessMap: true })
    expect(c.roughnessMap).not.toBeNull()
    await tick()
    expect(requested.filter((u) => u.includes('roughness'))).toHaveLength(1)
    expect(requested).toHaveLength(3)
  })

  it('sets colour spaces, wrapping and repeat', () => {
    const m = pbrMaterial('plaster-cream', { repeat: [3, 1.5] })
    expect(m.map!.colorSpace).toBe(SRGBColorSpace)
    expect(m.normalMap!.colorSpace).toBe(NoColorSpace)
    expect(m.map!.wrapS).toBe(RepeatWrapping)
    expect(m.map!.repeat.x).toBe(3)
    expect(m.map!.repeat.y).toBe(1.5)
    expect(m.normalMap!.repeat.x).toBe(3)
    // A repeat other than the default clones the shared texture (repeat lives on the texture).
    expect(m.map).not.toBe(pbrMaterial('plaster-cream').map)
  })

  it('keeps one stable texture per map that receives the image when it arrives, clones included', async () => {
    const shared = pbrMaterial('carpet-dark')
    const repeated = pbrMaterial('carpet-dark', { repeat: [2, 2] })
    expect(shared.map!.image).toBeFalsy()
    expect(repeated.map!.version).toBe(0)
    await tick()
    expect(shared.map!.image).toEqual({ width: 1024, height: 1024 })
    expect(shared.map!.version).toBeGreaterThan(0)
    // The clone shares the Source: the image lands there too, and it is marked for upload.
    expect(repeated.map!.image).toEqual({ width: 1024, height: 1024 })
    expect(repeated.map!.version).toBeGreaterThan(0)
    // Still the same texture object the material was given.
    expect(pbrMaterial('carpet-dark').map).toBe(shared.map)
  })

  it('applies per-name defaults and the overrides', () => {
    const bronze = pbrMaterial('bronze-brushed')
    expect(bronze.metalness).toBe(1)
    expect(bronze.roughness).toBeCloseTo(0.35)
    const leather = pbrMaterial('leather-tan')
    expect(leather.color.getHexString()).toBe('ffffff')
    const custom = pbrMaterial('leather-tan', { roughness: 0.6, metalness: 0.5, color: '#8a6a3a', normalScale: 0.4 })
    expect(custom.roughness).toBe(0.6)
    expect(custom.metalness).toBe(0.5)
    expect(custom.color.getHexString()).toBe('8a6a3a')
    expect(custom.normalScale.x).toBeCloseTo(0.4)
  })

  it('normalises tinted names so the requested colour is the mean colour on screen', () => {
    // material colour × the map's mean albedo = the colour asked for (THEME tones land as written).
    const want = new Color('#8a6a3a')
    const bronze = pbrMaterial('bronze-brushed')
    const [tr, tg, tb] = pbrTint('bronze-brushed')
    expect(tr).toBeLessThan(1)
    expect(bronze.color.r * tr).toBeCloseTo(want.r, 3)
    expect(bronze.color.g * tg).toBeCloseTo(want.g, 3)
    expect(bronze.color.b * tb).toBeCloseTo(want.b, 3)
    const wantOak = new Color('#5b3f2a')
    const oak = pbrMaterial('oak-dark', { color: '#5b3f2a' })
    const [or, og, ob] = pbrTint('oak-dark')
    expect(oak.color.r * or).toBeCloseTo(wantOak.r, 3)
    expect(oak.color.g * og).toBeCloseTo(wantOak.g, 3)
    expect(oak.color.b * ob).toBeCloseTo(wantOak.b, 3)
    // Untinted names are a plain multiplier.
    expect(pbrTint('marble-dark')).toEqual([1, 1, 1])
  })

  it('estimates the GPU bytes of the loaded maps', async () => {
    pbrMaterial('marble-dark')
    await tick()
    // colour + normal at 1024², RGBA with mipmaps.
    expect(pbrTextureBytes()).toBeCloseTo(2 * 1024 * 1024 * 4 * 1.333, -4)
  })
})
