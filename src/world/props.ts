// Procedural furniture and decor. Everything static goes through the batcher
// (instanced); only image-bearing parts are individual meshes.

import { BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3, type Material } from 'three'
import type { BatchFrame } from '../engine/batcher'
import { blobShadowTexture, rng } from '../engine/textures'
import { MAT } from './materials'
import { marbleCladMat, uvBox } from './finish'
import { MeshBasicMaterial } from 'three'

const LEAF = new IcosahedronGeometry(0.5, 0)

export function plant(f: BatchFrame, x: number, z: number, scale = 1, seed = 1): void {
  const r = rng(seed)
  f.cyl(MAT.pot, x, 0, z, 0.32 * scale, 0.55 * scale, { collide: true })
  f.cyl(MAT.brass, x, 0.55 * scale, z, 0.335 * scale, 0.04 * scale)
  f.cyl(MAT.woodDark, x, 0.55 * scale, z, 0.04 * scale, 0.9 * scale)
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2
    const d = r() * 0.32 * scale
    const y = (0.95 + r() * 0.85) * scale
    f.custom(LEAF, i % 3 ? MAT.leaf : MAT.leafDark, x + Math.cos(a) * d, y, z + Math.sin(a) * d, (0.35 + r() * 0.3) * scale, r() * 6)
  }
}

// --------------------------------------------------------- premium planters
// A marble planter with a bronze lip holding a slim olive tree: a gently leaning
// trunk with two branches and a rounded canopy of overlapping low-poly clumps in
// two greens. Everything goes through the batcher (instanced), so every planter in
// the mall shares the same handful of draw calls.

let clump: BufferGeometry | null = null
/**
 * One faceted canopy clump shared by every tree (one draw call): a subdivided
 * icosahedron with welded vertex jitter, and per-face vertex colours mixing two
 * greens, lighter on top and darker underneath.
 */
function canopyClump(): BufferGeometry {
  if (clump) return clump
  const g = new IcosahedronGeometry(0.5, 1) // non-indexed: 3 vertices per face
  const pos = g.getAttribute('position')
  const v = new Vector3()
  const hash = (x: number, y: number, z: number, k: number) => {
    const h = Math.sin(x * 12.9898 * k + y * 78.233 + z * 37.719) * 43758.5453
    return h - Math.floor(h)
  }
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    // Hash the (shared) vertex position, so duplicated face vertices move together.
    v.multiplyScalar(0.86 + hash(v.x, v.y, v.z, 7) * 0.24)
    v.y *= 0.82 // slightly flattened, like a clipped olive head
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  const light = new Color('#93ad7b')
  const dark = new Color('#5c7c55')
  const col = new Float32Array(pos.count * 3)
  const c = new Color()
  for (let f = 0; f < pos.count; f += 3) {
    const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3
    const t = Math.min(1, Math.max(0, y / 0.82 + 0.5)) // 0 underside → 1 crown
    const pick = hash(pos.getX(f), pos.getY(f), pos.getZ(f), 3) < 0.35 + t * 0.4 ? light : dark
    c.copy(dark).lerp(pick, 0.55 + t * 0.45)
    for (let k = 0; k < 3; k++) c.toArray(col, (f + k) * 3)
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.computeVertexNormals()
  return (clump = g)
}

/** Unit planter body (marble UVs), scaled uniformly per planter so all share one bucket. */
const BODY_W = 0.62
const BODY_H = 0.67

let planterMats: { leaf: Material; bark: Material } | null = null
function mats() {
  return (planterMats ??= {
    leaf: new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true, emissive: new Color('#26331e'), emissiveIntensity: 0.35 }),
    bark: new MeshStandardMaterial({ color: '#6b5846', roughness: 0.9 }),
  })
}

/**
 * Square marble planter (≈0.72 m, bronze lip and toe) with a sculptural olive tree.
 * `scale` sizes the whole piece; the planter collides.
 */
export function premiumPlanter(f: BatchFrame, x: number, z: number, seed = 1, scale = 1): void {
  const r = rng(seed)
  const m = mats()
  const W = 0.62 * scale
  const H = 0.72 * scale
  // Body: marble cladding, a recessed dark toe so it floats, a bronze band and lip.
  f.custom(uvBox(BODY_W, BODY_H, BODY_W, 0.9), marbleCladMat(), x, 0.05 * scale + (BODY_H * scale) / 2, z, scale, 0)
  f.collider(x, z, W + 0.04, W + 0.04, 1.2)
  f.block(MAT.black, x, 0, z, W - 0.06 * scale, 0.05 * scale, W - 0.06 * scale)
  f.block(MAT.brass, x, 0.12 * scale, z, W + 0.012, 0.035 * scale, W + 0.012)
  // Lip: a bronze frame round the rim (four bars), the dark soil set just inside it.
  const LW = W + 0.04 * scale
  const lt = 0.045 * scale
  for (const sgn of [-1, 1]) {
    f.block(MAT.brass, x + (sgn * (LW - lt)) / 2, H - 0.03 * scale, z, lt, 0.04 * scale, LW)
    f.block(MAT.brass, x, H - 0.03 * scale, z + (sgn * (LW - lt)) / 2, LW - 2 * lt, 0.04 * scale, lt)
  }
  f.block(MAT.black, x, H - 0.04 * scale, z, LW - 2 * lt + 0.004, 0.04 * scale + 0.004, LW - 2 * lt + 0.004)
  // Trunk: two leaning segments, then two branches up into the canopy.
  const lean = (r() - 0.5) * 0.12 * scale
  const yaw = r() * Math.PI * 2
  const dx = Math.cos(yaw) * lean
  const dz = Math.sin(yaw) * lean
  const base = new Vector3(x, H - 0.02 * scale, z)
  const mid = new Vector3(x + dx, H + 0.75 * scale, z + dz)
  const top = new Vector3(x + dx * 0.4, H + 1.35 * scale, z + dz * 0.4)
  f.bar(m.bark, base, mid, 0.05 * scale)
  f.bar(m.bark, mid, top, 0.04 * scale)
  const forks: Vector3[] = []
  for (let i = 0; i < 2; i++) {
    const a = yaw + Math.PI * (i + 0.15 + r() * 0.2)
    const tip = new Vector3(mid.x + Math.cos(a) * 0.32 * scale, H + (1.2 + r() * 0.15) * scale, mid.z + Math.sin(a) * 0.32 * scale)
    f.bar(m.bark, new Vector3(mid.x, mid.y - 0.02, mid.z), tip, 0.028 * scale)
    forks.push(tip)
  }
  // Canopy: a rounded head of overlapping clumps, lighter on top and outside.
  const geo = canopyClump()
  const cy = H + 1.48 * scale
  const head: [number, number, number, number][] = [
    [0, 0.1 * scale, 0, 0.92],
    [forks[0].x - x, forks[0].y - cy + 0.08 * scale, forks[0].z - z, 0.64],
    [forks[1].x - x, forks[1].y - cy + 0.08 * scale, forks[1].z - z, 0.64],
  ]
  for (let i = 0; i < 6; i++) {
    const a = yaw + (i / 6) * Math.PI * 2 + 0.3
    const d = 0.36 + r() * 0.08
    head.push([Math.cos(a) * d * scale, (-0.04 + r() * 0.2) * scale, Math.sin(a) * d * scale, 0.5 + r() * 0.12])
  }
  head.push([dx * 0.4, 0.38 * scale, dz * 0.4, 0.6])
  head.forEach(([ox, oy, oz, s], i) => {
    f.custom(geo, m.leaf, x + ox, cy + oy, z + oz, s * scale, r() * 6 + i)
  })
}

/** Tall slim planter with grass-like leaves (for shop corners). */
export function slimPlant(f: BatchFrame, x: number, z: number, seed = 2): void {
  const r = rng(seed)
  f.block(MAT.plinth, x, 0, z, 0.42, 0.7, 0.42, { collide: true })
  for (let i = 0; i < 6; i++) {
    f.custom(LEAF, MAT.leaf, x + (r() - 0.5) * 0.25, 0.95 + r() * 0.6, z + (r() - 0.5) * 0.25, 0.22 + r() * 0.15, r() * 6)
  }
}

export function bench(f: BatchFrame, x: number, z: number, len = 2.2, rotY = 0): void {
  const along = rotY !== 0
  const sx = along ? 0.6 : len
  const sz = along ? len : 0.6
  f.block(MAT.sofa, x, 0.22, z, sx, 0.22, sz, { collide: true })
  f.block(MAT.brass, x, 0, z, sx * 0.9, 0.22, sz * 0.9)
}

export function column(f: BatchFrame, x: number, z: number, height: number): void {
  f.cyl(MAT.trim, x, 0, z, 0.42, height, { collide: true })
  f.cyl(MAT.brass, x, 0.25, z, 0.45, 0.06)
  f.cyl(MAT.brass, x, height - 0.35, z, 0.45, 0.06)
  f.cyl(MAT.plinth, x, 0, z, 0.5, 0.25)
}

/** Soft contact shadow decal. */
export function blobShadow(w: number, d: number, opacity = 1): Mesh {
  const m = new Mesh(
    new PlaneGeometry(w, d),
    new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, opacity, depthWrite: false }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.012
  m.renderOrder = 1
  return m
}

/** Image plane, optionally framed (frame drawn via the batcher). */
export function framedPlane(
  f: BatchFrame,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  frameMat: Material = MAT.brass,
  depth = 0.04,
): void {
  const t = 0.04
  f.box(frameMat, x, y + h / 2 + t / 2, z, w + t * 2, t, depth)
  f.box(frameMat, x, y - h / 2 - t / 2, z, w + t * 2, t, depth)
  f.box(frameMat, x - w / 2 - t / 2, y, z, t, h, depth)
  f.box(frameMat, x + w / 2 + t / 2, y, z, t, h, depth)
}

export const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z)
