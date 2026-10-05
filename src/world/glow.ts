// Additive warm glows (pendant halos, stage light cones, light pools on the
// floor). Medium/High only: toggled with quality.fancyDecor via setGlowsVisible().

import { AdditiveBlending, Color, ConeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3, type Object3D } from 'three'
import { canvasTexture, makeCanvas } from '../engine/textures'
import { FLOOR_FX_LAYER } from '../engine/layers'

const halos: Matrix4[] = []
const cones: Matrix4[] = []
const pools: Matrix4[] = []
const rects: { m: Matrix4; c: Color }[] = []
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

/** Warm pool of light on the floor centred at (x, z), w × d metres (an ellipse; yaw turns it). */
export function addPool(x: number, z: number, w: number, d: number, yaw = 0): void {
  const q = new Quaternion().setFromAxisAngle(_y, yaw)
  pools.push(new Matrix4().compose(new Vector3(x, 0.011, z), q, new Vector3(w, 1, d)))
}

/**
 * Soft rectangular backlight halo on a wall (lightbox fascias): a w × h quad
 * centred at (x, y, z) facing `yaw`, tinted `color`. One instanced call for all.
 */
export function addRectHalo(x: number, y: number, z: number, w: number, h: number, yaw: number, color: string): void {
  const q = new Quaternion().setFromAxisAngle(_y, yaw)
  rects.push({ m: new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(w, h, 1)), c: new Color(color) })
}

function rectHaloTexture() {
  // Alpha falls off with the distance outside an inner rectangle (the lightbox's footprint).
  const W = 256
  const H = 128
  const [c, g] = makeCanvas(W, H)
  const img = g.createImageData(W, H)
  const ix = 26
  const iy = 24
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = Math.max(0, ix - x, x - (W - 1 - ix)) / ix
      const dy = Math.max(0, iy - y, y - (H - 1 - iy)) / iy
      const d = Math.min(1, Math.hypot(dx, dy))
      const a = Math.pow(1 - d, 2.2)
      const k = (y * W + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255
      img.data[k + 3] = Math.round(a * 255)
    }
  g.putImageData(img, 0, 0)
  return canvasTexture(c)
}

function poolTexture() {
  const [c, g] = makeCanvas(128, 128)
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.18)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return canvasTexture(c)
}

function layer(geo: SphereGeometry | ConeGeometry | PlaneGeometry, opacity: number, list: Matrix4[], parent: Object3D, visible: boolean, pool = false): InstancedMesh {
  const mat = new MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity, depthWrite: false, blending: AdditiveBlending })
  if (pool) {
    mat.map = typeof document === 'undefined' ? null : poolTexture()
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -1
    mat.polygonOffsetUnits = -2
  }
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
  // Light pools: flat unit quads on the floor, drawn after the floor decals.
  if (pools.length) {
    const m = layer(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0.45, pools, parent, visible, true)
    m.renderOrder = 2
    m.layers.set(FLOOR_FX_LAYER)
    out.push(m)
  }
  if (rects.length && typeof document !== 'undefined') {
    const mat = new MeshBasicMaterial({ map: rectHaloTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, rects.length)
    rects.forEach((r, i) => {
      mesh.setMatrixAt(i, r.m)
      mesh.setColorAt(i, r.c)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    mesh.visible = visible
    mesh.renderOrder = 1
    parent.add(mesh)
    out.push(mesh)
  }
  rects.length = 0
  halos.length = 0
  cones.length = 0
  pools.length = 0
  built.push(...out)
  return out
}

export function setGlowsVisible(v: boolean): void {
  for (const m of built) m.visible = v
}
