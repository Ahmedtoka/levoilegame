import type { Material } from 'three'

/**
 * Render layer for floor-level overlays (AO strips, light pools, contact
 * shadows). The main camera enables it; the floor Reflectors' virtual cameras
 * do not, so the mirror pass skips these draws.
 */
export const FLOOR_FX_LAYER = 1

/**
 * Render layer for what the corridor floor mirrors show: the architecture and the
 * lights (batched walls, ceilings, trims, light lines, globes) plus the shop lightboxes.
 * Products, characters and props stay out, so a corridor mirror pass costs a few dozen
 * draw calls instead of a second full scene. The main camera does not need this layer,
 * because these objects stay on layer 0 as well.
 */
export const MIRROR_LAYER = 2

const mirrored = new WeakSet<Material>()

/** Batched geometry drawn with these materials is put on MIRROR_LAYER (see Batcher.build). */
export function markMirrored(...mats: Material[]): void {
  for (const m of mats) mirrored.add(m)
}

export function isMirrored(mat: Material): boolean {
  return mirrored.has(mat)
}
