// Procedural furniture and decor. Everything static goes through the batcher
// (instanced); only image-bearing parts are individual meshes.

import { IcosahedronGeometry, Mesh, PlaneGeometry, Vector3, type Material } from 'three'
import type { BatchFrame } from '../engine/batcher'
import { blobShadowTexture, rng } from '../engine/textures'
import { MAT } from './materials'
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
