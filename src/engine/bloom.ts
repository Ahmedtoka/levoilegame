import { CustomBlending, NormalBlending, OneFactor, ZeroFactor, type Material, type MeshBasicMaterial } from 'three'

/**
 * Bloom sources, selected with an alpha mask.
 *
 * With bloom on (High), the scene is drawn into an 8-bit target that behaves exactly like
 * the canvas (see post.ts). Every ordinary material leaves alpha at 1 there:
 * - opaque materials write 1;
 * - normal blending keeps 1 over 1;
 * - additive blending clamps at 1.
 * A registered source instead writes alpha = 1 − weight. Its colour is unchanged, but it
 * uses a replace blend instead of the opaque path, which would force alpha to 1. The bloom
 * high pass multiplies its luminance threshold by (1 − alpha). So only these materials can
 * glow; lit cream walls, white UI planes, product photos and additive floor pools never do,
 * however bright they are. Anything drawn over a source (glass, a character) covers its mask
 * as well. With bloom off, each material gets its normal blending and opacity back, so Low
 * and Medium render exactly as before.
 */
export const BLOOM_WEIGHT = {
  /** Warm light panels, slot lights, pendant globes, can lenses. */
  light: 0.55,
  /** Shop lightbox fascias and blade signs (the threshold leaves the darker brand field out). */
  lightbox: 0.3,
  /** Screens: a faint glow on their brightest parts only. */
  screen: 0.05,
}

interface Entry {
  mat: MeshBasicMaterial
  opacity: number
  blendSrc: Material['blendSrc']
  blendDst: Material['blendDst']
  weight: number
}

const entries: Entry[] = []
let active = false

/** Registers an opaque bloom source; `weight` (0–1) scales how strongly it can glow. */
export function registerBloom(mat: MeshBasicMaterial, weight: number): void {
  if (mat.transparent || entries.some((e) => e.mat === mat)) return
  const e: Entry = { mat, opacity: mat.opacity, blendSrc: mat.blendSrc, blendDst: mat.blendDst, weight }
  entries.push(e)
  if (active) apply(e)
}

/** Switches every registered material between writing the bloom mask and its normal state. */
export function setBloomSources(on: boolean): void {
  if (on === active) return
  active = on
  for (const e of entries) apply(e)
}

function apply(e: Entry): void {
  const { mat } = e
  if (active) {
    mat.blending = CustomBlending
    mat.blendSrc = OneFactor
    mat.blendDst = ZeroFactor
    mat.blendSrcAlpha = OneFactor
    mat.blendDstAlpha = ZeroFactor
    mat.opacity = 1 - e.weight
  } else {
    mat.blending = NormalBlending
    mat.blendSrc = e.blendSrc
    mat.blendDst = e.blendDst
    mat.blendSrcAlpha = null
    mat.blendDstAlpha = null
    mat.opacity = e.opacity
  }
  mat.needsUpdate = true
}
