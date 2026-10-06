import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Texture } from 'three'
import { estimateTextureBytes } from '../src/bench/run'

function tex(w: number, h: number, mips = true): Texture {
  const t = new Texture({ width: w, height: h } as unknown as HTMLImageElement)
  t.generateMipmaps = mips
  return t
}

describe('bench texture estimate', () => {
  it('sums w*h*4 (+33% with mipmaps) once per distinct texture, over every material slot', () => {
    const root = new Group()
    const shared = tex(1024, 1024)
    const normal = tex(512, 256, false)
    root.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ map: shared })))
    root.add(new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ map: shared, normalMap: normal })))
    root.add(new Mesh(new PlaneGeometry(), [new MeshBasicMaterial({ map: tex(0, 0) }), new MeshBasicMaterial()]))
    const est = estimateTextureBytes(root)
    expect(est.scene).toBeCloseTo(1024 * 1024 * 4 * 1.333 + 512 * 256 * 4, 0)
    expect(est.uploaded).toBe(est.scene)
    expect(est.hist).toEqual({ '1024': 1, '512': 1 })
  })

  it('counts only uploaded textures in the resident figure and buckets by the longer side', () => {
    const root = new Group()
    const big = tex(2048, 1536)
    const small = tex(100, 300)
    root.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ map: big })))
    root.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ map: small })))
    const est = estimateTextureBytes(root, (t) => t === small)
    expect(est.scene).toBeGreaterThan(est.uploaded)
    expect(est.uploaded).toBeCloseTo(100 * 300 * 4 * 1.333, 0)
    expect(est.hist).toEqual({ '<512': 1 })
  })

  it('ignores render-target textures and empty scenes', () => {
    const root = new Group()
    const rt = tex(1024, 1024)
    Object.assign(rt, { isRenderTargetTexture: true })
    root.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ map: rt })))
    expect(estimateTextureBytes(root).scene).toBe(0)
    expect(estimateTextureBytes(new Group()).uploaded).toBe(0)
  })
})
