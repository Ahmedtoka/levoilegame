// Fake ambient occlusion: soft dark gradient bands where surfaces meet
// (wall/floor, wall/ceiling). One shared gradient texture, one InstancedMesh
// for the whole mall. Strips float ≥ 1 cm off their surface and use a
// polygon offset, so they never z-fight with what they darken.

import { DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Vector3, type Object3D } from 'three'
import { canvasTexture, makeCanvas } from '../engine/textures'
import { FLOOR_FX_LAYER } from '../engine/layers'

const items: Matrix4[] = []
const _a = new Vector3()
const _b = new Vector3()
const _u = new Vector3()
const _t = new Vector3()
const _n = new Vector3()
const _m = new Vector3()

type V3 = readonly [number, number, number]

/**
 * A strip whose dark edge runs from `a` to `b` and fades out over `h` metres
 * towards `up` (a unit direction on the surface). `base` maps local → world.
 */
export function addAOStrip(a: V3, b: V3, up: V3, h: number, base?: Matrix4): void {
  _a.set(...a)
  _b.set(...b)
  _u.set(...up)
  if (base) {
    _a.applyMatrix4(base)
    _b.applyMatrix4(base)
    _u.transformDirection(base)
  }
  _t.subVectors(_b, _a)
  const len = _t.length()
  if (len < 0.05) return
  _t.normalize()
  _n.crossVectors(_t, _u).normalize()
  _m.addVectors(_a, _b).multiplyScalar(0.5)
  const m = new Matrix4().makeBasis(_t.multiplyScalar(len), _u.clone().multiplyScalar(h), _n)
  m.setPosition(_m)
  items.push(m)
}

/** Junction of a wall face with the floor: a band up the wall and one out on the floor.
 * (x0,z0)→(x1,z1) runs along the wall face; (nx,nz) points away from the wall. */
export function aoFloorJunction(x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, base?: Matrix4, wallH = 0.6, floorW = 0.5, o = 0.012): void {
  addAOStrip([x0 + nx * o, 0, z0 + nz * o], [x1 + nx * o, 0, z1 + nz * o], [0, 1, 0], wallH, base)
  addAOStrip([x0, 0.009, z0], [x1, 0.009, z1], [nx, 0, nz], floorW, base)
}

/** Junction of a wall face with a ceiling at height `y`: a band down the wall
 * (optional) and one along the ceiling underside. */
export function aoCeilJunction(x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, y: number, base?: Matrix4, wallH = 0.5, ceilW = 0.45): void {
  const o = 0.012
  if (wallH > 0) addAOStrip([x0 + nx * o, y, z0 + nz * o], [x1 + nx * o, y, z1 + nz * o], [0, -1, 0], wallH, base)
  addAOStrip([x0, y - 0.01, z0], [x1, y - 0.01, z1], [nx, 0, nz], ceilW, base)
}

let tex: ReturnType<typeof canvasTexture> | null = null
function aoTexture() {
  if (tex) return tex
  const [c, g] = makeCanvas(4, 128)
  // Canvas bottom = v 0 = the junction (dark), fading to clear at v 1.
  const grad = g.createLinearGradient(0, 128, 0, 0)
  grad.addColorStop(0, 'rgba(48,34,24,0.5)')
  grad.addColorStop(0.25, 'rgba(48,34,24,0.24)')
  grad.addColorStop(0.6, 'rgba(48,34,24,0.07)')
  grad.addColorStop(1, 'rgba(48,34,24,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 128)
  tex = canvasTexture(c)
  return tex
}

export function buildAOStrips(parent: Object3D): InstancedMesh | null {
  if (!items.length) return null
  const mat = new MeshBasicMaterial({
    map: typeof document === 'undefined' ? null : aoTexture(),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  })
  const geo = new PlaneGeometry(1, 1).translate(0, 0.5, 0)
  const mesh = new InstancedMesh(geo, mat, items.length)
  items.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.instanceMatrix.needsUpdate = true
  mesh.renderOrder = 1
  mesh.frustumCulled = false
  mesh.name = 'ao-strips'
  mesh.layers.set(FLOOR_FX_LAYER)
  parent.add(mesh)
  items.length = 0
  return mesh
}
