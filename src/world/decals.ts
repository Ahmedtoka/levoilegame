// Soft contact shadows under furniture: one InstancedMesh for the whole mall.
// They make pieces sit on the floor (a cheap stand-in for baked AO).

import { InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type Object3D } from 'three'
import { blobShadowTexture } from '../engine/textures'

const items: Matrix4[] = []
const _q = new Quaternion()
const _qy = new Quaternion()
const _x = new Vector3(1, 0, 0)
const _y = new Vector3(0, 1, 0)

export function addContactShadow(x: number, z: number, w: number, d: number, yaw = 0): void {
  _q.setFromAxisAngle(_y, yaw).multiply(_qy.setFromAxisAngle(_x, -Math.PI / 2))
  items.push(new Matrix4().compose(new Vector3(x, 0.008, z), _q.clone(), new Vector3(w, d, 1)))
}

export function buildDecals(parent: Object3D): InstancedMesh | null {
  if (!items.length) return null
  const mat = new MeshBasicMaterial({
    map: typeof document === 'undefined' ? null : blobShadowTexture(),
    color: typeof document === 'undefined' ? '#000000' : '#ffffff',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  })
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, items.length)
  items.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.instanceMatrix.needsUpdate = true
  mesh.renderOrder = 1
  mesh.frustumCulled = false
  parent.add(mesh)
  items.length = 0
  return mesh
}
