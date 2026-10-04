// Décor kit: fixture pieces cut from the baked Le Voile boutique
// (public/models/mall/kit.glb + kit.json, produced by `node scripts/bake-store.mjs`).
// Every piece keeps its baked Cycles lighting (unlit material) and shares the
// atlas textures, so clones are cheap. Missing kit → shops use procedural props.

import { Box3, MeshBasicMaterial, SRGBColorSpace, Vector3, type Mesh, type MeshStandardMaterial, type Object3D, type WebGLRenderer } from 'three'
import type { CollisionWorld } from '../engine/colliders'

export interface KitPieceInfo {
  /** Footprint/height in metres: [width (x), height (y), depth (z)] as authored. */
  size: [number, number, number]
  /** Direction the piece's front faces, as authored (three.js coords). */
  front: [number, number, number]
}

export const KIT_URL = '/models/mall/kit.glb'
export const KIT_INDEX_URL = '/models/mall/kit.json'

export class Kit {
  private readonly pieces = new Map<string, Object3D>()
  readonly info: Record<string, KitPieceInfo>

  private constructor(root: Object3D, info: Record<string, KitPieceInfo>, renderer: WebGLRenderer) {
    this.info = info
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    const unlit = new Map<string, MeshBasicMaterial>()
    root.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) {
        const src = m.material as MeshStandardMaterial
        if (src.map) {
          let mat = unlit.get(src.map.uuid)
          if (!mat) {
            src.map.colorSpace = SRGBColorSpace
            src.map.anisotropy = aniso
            mat = new MeshBasicMaterial({ map: src.map, toneMapped: false })
            unlit.set(src.map.uuid, mat)
          }
          m.material = mat
        }
      }
      if (o.name.startsWith('kit_') && o.parent === root) this.pieces.set(o.name.slice(4), o)
    })
  }

  static async load(renderer: WebGLRenderer, onProgress?: (p: number) => void): Promise<Kit | null> {
    if (new URLSearchParams(location.search).has('nokit')) return null
    try {
      const res = await fetch(KIT_INDEX_URL, { cache: 'no-cache' })
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
      const index = (await res.json()) as { pieces: Record<string, KitPieceInfo> }
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/loaders/DRACOLoader.js'),
      ])
      const draco = new DRACOLoader().setDecoderPath('/draco/')
      const gltf = await new GLTFLoader()
        .setDRACOLoader(draco)
        .loadAsync(KIT_URL, (e) => e.total && onProgress?.(e.loaded / e.total))
      draco.dispose()
      return new Kit(gltf.scene, index.pieces, renderer)
    } catch (err) {
      console.info('[kit] not available, using procedural props:', err)
      return null
    }
  }

  has(name: string): boolean {
    return this.pieces.has(name)
  }

  /**
   * Clone a piece into `parent` at local (x, z), rotated so its front faces
   * `face` (a yaw: front → (sin face, 0, cos face) in the parent's frame).
   * Adds a world-space collider for the footprint unless collide === false.
   */
  place(name: string, parent: Object3D, x: number, z: number, face: number, colliders?: CollisionWorld, opts: { y?: number; collide?: boolean } = {}): Object3D | null {
    const src = this.pieces.get(name)
    const info = this.info[name]
    if (!src || !info) return null
    const o = src.clone()
    const frontYaw = Math.atan2(info.front[0], info.front[2])
    o.position.set(x, opts.y ?? 0, z)
    o.rotation.set(0, face - frontYaw, 0)
    parent.add(o)
    o.traverse((c) => {
      c.matrixAutoUpdate = false
      c.updateMatrix()
    })
    if (colliders && opts.collide !== false) {
      o.updateWorldMatrix(true, true) // include parents: shops are placed before the first render
      const box = new Box3().setFromObject(o)
      // Shrink a little so aisles stay walkable; walls of bays sit flush anyway.
      box.expandByVector(new Vector3(-0.08, 0, -0.08))
      box.min.y = 0
      box.max.y = Math.min(box.max.y, 2)
      if (box.max.x > box.min.x && box.max.z > box.min.z) colliders.addBox(box)
    }
    return o
  }
}
