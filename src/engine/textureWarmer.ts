// Uploads textures to the GPU ahead of their first draw, a few per frame.
//
// three.js uploads a texture the first time something using it is drawn. In the
// mall that happens in bursts: a shop interior turning visible (or the player
// turning round in a wing) draws dozens of never-seen product, card-panel and
// baked-store textures in ONE frame, which stalled it for 100–700 ms. The warmer
// scans the scene now and then (hidden objects included) and uploads whatever
// has never been uploaded, within a small per-frame budget, so those textures
// are already resident by the time they come into view.
//
// The scene has ~5k objects, so the scan itself is spread over frames too.
// Meshes hidden on their own (e.g. the baked store's unused garments) are
// skipped; hidden groups (culled shop interiors) are walked, that's the point.

import type { Material, Object3D, Texture, WebGLRenderer } from 'three'

const SLOTS = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'lightMap', 'bumpMap'] as const

export class TextureWarmer {
  private readonly renderer: WebGLRenderer
  private readonly root: Object3D
  private readonly queue: Texture[] = []
  private readonly queued = new WeakSet<Texture>()
  private nextScan = 0
  private walk: Iterator<Object3D> | null = null

  constructor(renderer: WebGLRenderer, root: Object3D) {
    this.renderer = renderer
    this.root = root
  }

  /** Has this texture's current content been uploaded? */
  private uploaded(t: Texture): boolean {
    const p = this.renderer.properties.get(t) as { __version?: number }
    return p.__version === t.version
  }

  private visit(o: Object3D): void {
    const mat = (o as Object3D & { material?: Material | Material[] }).material
    if (!mat) return
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const rec = m as unknown as Record<string, Texture | null | undefined>
      for (const k of SLOTS) {
        const t = rec[k]
        // version 0 = image not loaded yet; re-uploads of redrawn canvases are left to the renderer.
        if (!t || t.version === 0 || this.queued.has(t) || (t as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) continue
        const p = this.renderer.properties.get(t) as { __version?: number }
        if (p.__version !== undefined) continue
        this.queued.add(t)
        this.queue.push(t)
      }
    }
  }

  /** Call once per frame before rendering. */
  update(now: number, maxPerFrame = 1, budgetMs = 4): void {
    if (!this.walk && now >= this.nextScan) this.walk = walkScene(this.root)
    if (this.walk) {
      for (let i = 0; i < SCAN_PER_FRAME; i++) {
        const r = this.walk.next()
        if (r.done) {
          this.walk = null
          this.nextScan = now + 1500
          break
        }
        this.visit(r.value)
      }
    }
    const t0 = performance.now()
    let n = 0
    while (this.queue.length && n < maxPerFrame && performance.now() - t0 < budgetMs) {
      const t = this.queue.shift()!
      if (this.uploaded(t)) continue
      this.renderer.initTexture(t)
      n++
    }
  }

  /**
   * Upload everything uploadable now (boot, behind the loading screen): the mall's
   * static canvases (section plaques, signage, screens) are big, ~20–40 ms each,
   * and trickling them in one per frame made the first minutes of play stutter.
   */
  flush(): number {
    for (const o of walkScene(this.root)) this.visit(o)
    let n = 0
    while (this.queue.length) {
      const t = this.queue.shift()!
      if (this.uploaded(t)) continue
      this.renderer.initTexture(t)
      n++
    }
    return n
  }

  get pending(): number {
    return this.queue.length
  }
}

const SCAN_PER_FRAME = 300

/** Depth-first walk that skips meshes hidden on their own (and their children). */
function* walkScene(root: Object3D): Generator<Object3D> {
  const stack: Object3D[] = [root]
  while (stack.length) {
    const o = stack.pop()!
    if (!o.visible && (o as Object3D & { isMesh?: boolean }).isMesh) continue
    yield o
    for (let i = o.children.length - 1; i >= 0; i--) stack.push(o.children[i])
  }
}
