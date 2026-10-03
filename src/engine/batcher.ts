// Collects static primitives and emits one InstancedMesh per (geometry,
// material) pair — the whole mall's walls, shelves, posts, lights and plinths
// end up in a handful of draw calls.

import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import type { CollisionWorld } from './colliders'

export const UNIT_BOX = new BoxGeometry(1, 1, 1)
export const UNIT_CYL = new CylinderGeometry(0.5, 0.5, 1, 20)
export const UNIT_SPHERE = new SphereGeometry(0.5, 16, 12)

interface Bucket {
  geo: BufferGeometry
  mat: Material
  matrices: Matrix4[]
}

const _q = new Quaternion()
const _up = new Vector3(0, 1, 0)

export class Batcher {
  private buckets = new Map<string, Bucket>()

  add(geo: BufferGeometry, mat: Material, m: Matrix4): void {
    const key = `${geo.uuid}|${mat.uuid}`
    let b = this.buckets.get(key)
    if (!b) this.buckets.set(key, (b = { geo, mat, matrices: [] }))
    b.matrices.push(m)
  }

  /** Drawing context with a base transform (e.g. a shop's local frame). */
  frame(base = new Matrix4(), colliders?: CollisionWorld): BatchFrame {
    return new BatchFrame(this, base, colliders)
  }

  build(parent: Object3D): InstancedMesh[] {
    const out: InstancedMesh[] = []
    for (const b of this.buckets.values()) {
      const mesh = new InstancedMesh(b.geo, b.mat, b.matrices.length)
      b.matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.matrixAutoUpdate = false
      parent.add(mesh)
      out.push(mesh)
    }
    this.buckets.clear()
    return out
  }
}

export class BatchFrame {
  readonly batcher: Batcher
  readonly base: Matrix4
  readonly colliders?: CollisionWorld

  constructor(batcher: Batcher, base: Matrix4, colliders?: CollisionWorld) {
    this.batcher = batcher
    this.base = base
    this.colliders = colliders
  }

  private place(geo: BufferGeometry, mat: Material, pos: Vector3, scale: Vector3, rotY: number, collide: boolean, occlude = false): void {
    _q.setFromAxisAngle(_up, rotY)
    const local = new Matrix4().compose(pos, _q, scale)
    const world = this.base.clone().multiply(local)
    this.batcher.add(geo, mat, world)
    if (collide && this.colliders) {
      geo.computeBoundingBox()
      this.colliders.addBox(geo.boundingBox!.clone().applyMatrix4(world), occlude)
    }
  }

  /** Box centred at (x, y, z) with size (sx, sy, sz). */
  box(mat: Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, opts: { rotY?: number; collide?: boolean; occlude?: boolean } = {}): void {
    this.place(UNIT_BOX, mat, new Vector3(x, y, z), new Vector3(sx, sy, sz), opts.rotY ?? 0, opts.collide ?? false, opts.occlude ?? false)
  }

  /** Box resting on y0 (bottom face at y0). */
  block(mat: Material, x: number, y0: number, z: number, sx: number, sy: number, sz: number, opts: { rotY?: number; collide?: boolean } = {}): void {
    this.box(mat, x, y0 + sy / 2, z, sx, sy, sz, opts)
  }

  /** Vertical cylinder resting on y0. */
  cyl(mat: Material, x: number, y0: number, z: number, radius: number, height: number, opts: { collide?: boolean } = {}): void {
    this.place(UNIT_CYL, mat, new Vector3(x, y0 + height / 2, z), new Vector3(radius * 2, height, radius * 2), 0, opts.collide ?? false)
  }

  /** Horizontal bar between two points at the same height (for rails). */
  bar(mat: Material, a: Vector3, b: Vector3, radius: number): void {
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const len = a.distanceTo(b)
    const dir = b.clone().sub(a).normalize()
    const q = new Quaternion().setFromUnitVectors(_up, dir)
    const local = new Matrix4().compose(mid, q, new Vector3(radius * 2, len, radius * 2))
    this.batcher.add(UNIT_CYL, mat, this.base.clone().multiply(local))
  }

  sphere(mat: Material, x: number, y: number, z: number, r: number, sy = 1): void {
    this.place(UNIT_SPHERE, mat, new Vector3(x, y, z), new Vector3(r * 2, r * 2 * sy, r * 2), 0, false)
  }

  custom(geo: BufferGeometry, mat: Material, x: number, y: number, z: number, scale = 1, rotY = 0): void {
    this.place(geo, mat, new Vector3(x, y, z), new Vector3(scale, scale, scale), rotY, false)
  }

  /** Register a collider in local coordinates without drawing anything. */
  collider(x: number, z: number, sx: number, sz: number, height = 2): void {
    if (!this.colliders) return
    const b = new Box3(new Vector3(x - sx / 2, 0, z - sz / 2), new Vector3(x + sx / 2, height, z + sz / 2))
    this.colliders.addBox(b.applyMatrix4(this.base))
  }

  toWorld(x: number, y: number, z: number): Vector3 {
    return new Vector3(x, y, z).applyMatrix4(this.base)
  }
}
