// Additive warm glows (pendant halos, stage light cones). Medium/High only:
// toggled with quality.fancyDecor via setGlowsVisible().

import { AdditiveBlending, ConeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3, type Object3D } from 'three'

const halos: Matrix4[] = []
const cones: Matrix4[] = []
let built: InstancedMesh[] = []
const _y = new Vector3(0, 1, 0)
const _x = new Vector3(1, 0, 0)

export function addHalo(x: number, y: number, z: number, r: number): void {
  halos.push(new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(r, r, r)))
}

export function addCone(x: number, y: number, z: number, length: number, radius: number, tiltX: number, yaw: number): void {
  const q = new Quaternion().setFromAxisAngle(_y, yaw).multiply(new Quaternion().setFromAxisAngle(_x, tiltX))
  cones.push(new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(radius, length, radius)))
}

function layer(geo: SphereGeometry | ConeGeometry, opacity: number, list: Matrix4[], parent: Object3D, visible: boolean): InstancedMesh {
  const mat = new MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity, depthWrite: false, blending: AdditiveBlending })
  const mesh = new InstancedMesh(geo, mat, list.length)
  list.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  mesh.visible = visible
  parent.add(mesh)
  return mesh
}

export function buildGlows(parent: Object3D, visible: boolean): InstancedMesh[] {
  const out: InstancedMesh[] = []
  if (halos.length) out.push(layer(new SphereGeometry(1, 16, 12), 0.13, halos, parent, visible))
  // Unit cone: ConeGeometry's apex is at +0.5; translating by −0.5 puts the apex
  // at the origin and the base at y = −1, so it opens downwards by `length`.
  if (cones.length) out.push(layer(new ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0), 0.06, cones, parent, visible))
  halos.length = 0
  cones.length = 0
  built.push(...out)
  return out
}

export function setGlowsVisible(v: boolean): void {
  for (const m of built) m.visible = v
}
