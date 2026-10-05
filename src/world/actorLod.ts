// Static LODs for the mall's placed characters (shop staff, showcase models,
// stylists, concierge, cashier): every one of them is also an instance in ONE
// BatchedMesh (plus one InstancedMesh of blob shadows), so they can stay drawn far
// beyond the full-rig distance and independently of the shop-interior culling —
// no more staff and models appearing all at once when an interior turns on.
//
// They stand still, so the LOD is the same snapshot as the idle rig. A recoloured
// outfit (models pick up their product's colours once its photo has loaded)
// refreshes that character's snapshot.

import { BatchedMesh, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type BufferGeometry, type Object3D } from 'three'
import type { Persona } from '../actors/character'
import { lodWalkMaterial } from '../actors/lodWalk'
import { blobShadowTexture } from '../engine/textures'

interface Entry {
  c: Persona
  gid: number
  iid: number
  version: number
  shown: boolean
}

const _m = new Matrix4()
const _shadowM = new Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.012, 0)

export class ActorLods {
  private readonly batch: BatchedMesh
  private readonly shadows: InstancedMesh
  private readonly entries = new Map<Persona, Entry>()
  private si = 0

  constructor(parent: Object3D, characters: Persona[]) {
    const geos: [Persona, BufferGeometry][] = []
    for (const c of characters) {
      const g = c.lodGeometry()
      if (g) geos.push([c, g])
    }
    // A recoloured snapshot has the same topology, so it fits its reserved range.
    const verts = geos.reduce((n, [, g]) => n + g.attributes.position.count, 0)
    const idx = geos.reduce((n, [, g]) => n + (g.index?.count ?? 0), 0)
    this.batch = new BatchedMesh(Math.max(1, geos.length), Math.max(1, verts), Math.max(1, idx), lodWalkMaterial())
    this.batch.frustumCulled = false // per-instance culling (perObjectFrustumCulled) still applies
    this.batch.sortObjects = false
    for (const [c, g] of geos) {
      const gid = this.batch.addGeometry(g)
      const iid = this.batch.addInstance(gid)
      this.batch.setVisibleAt(iid, false)
      this.entries.set(c, { c, gid, iid, version: c.colorVersion, shown: false })
    }
    parent.add(this.batch)
    const mat = new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, opacity: 0.9, depthWrite: false })
    this.shadows = new InstancedMesh(new PlaneGeometry(0.9, 0.9), mat, Math.max(1, geos.length))
    this.shadows.renderOrder = 1
    this.shadows.frustumCulled = false
    this.shadows.count = 0
    parent.add(this.shadows)
  }

  has(c: Persona): boolean {
    return this.entries.has(c)
  }

  /** Whether the character's LOD was drawn last frame (for hysteresis). */
  shown(c: Persona): boolean {
    return this.entries.get(c)?.shown ?? false
  }

  /** Start of a frame: the shadow list is rebuilt by show(). */
  begin(): void {
    this.si = 0
  }

  /** Draw (or hide) the character's LOD at its current root transform. */
  show(c: Persona, on: boolean): void {
    const e = this.entries.get(c)
    if (!e) return
    if (on && e.version !== c.colorVersion) {
      // The outfit changed colour: re-snapshot (same topology, fits the reserved range).
      const g = c.lodGeometry()
      e.version = c.colorVersion
      if (g) this.batch.setGeometryAt(e.gid, g)
    }
    if (on) {
      const r = c.root
      r.updateMatrix()
      this.batch.setMatrixAt(e.iid, r.matrix)
      _m.copy(r.matrix).multiply(_shadowM)
      this.shadows.setMatrixAt(this.si++, _m)
    }
    if (on !== e.shown) this.batch.setVisibleAt(e.iid, on)
    e.shown = on
  }

  /** End of a frame: commit the shadow instances. */
  end(): void {
    this.shadows.count = this.si
    this.shadows.instanceMatrix.needsUpdate = true
  }
}
