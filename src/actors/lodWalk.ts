// Material for static character LODs drawn in a BatchedMesh, with a cheap walk
// cycle in the vertex shader so a distant walker's legs and arms already swing
// when her full rig takes over (no "legs start moving" pop at the swap).
//
// Per instance, the walk phase and blend ride in the otherwise unused bottom row
// of the instance matrix (elements 3 and 7); the shader reads them and restores
// an affine matrix before anything else uses it. Per vertex, `aSwing` holds the
// limb's pivot (xyz, root space) and its signed swing amplitude (w, 0 = rigid),
// written by Character.lodGeometry().

import { DoubleSide, MeshStandardMaterial, type Matrix4 } from 'three'

/** Vertex-coloured standard material with the LOD walk patch. */
export function lodWalkMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: DoubleSide })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSwing;')
      .replace(
        '#include <batching_vertex>',
        `#include <batching_vertex>
#ifdef USE_BATCHING
  float lvPhase = batchingMatrix[0][3];
  float lvWalk = batchingMatrix[1][3];
  batchingMatrix[0][3] = 0.0;
  batchingMatrix[1][3] = 0.0;
#else
  float lvPhase = 0.0;
  float lvWalk = 0.0;
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
if (lvWalk > 0.001) {
  if (aSwing.w != 0.0) {
    float a = sin(lvPhase) * aSwing.w * lvWalk;
    float ca = cos(a);
    float sa = sin(a);
    vec3 p = transformed - aSwing.xyz;
    transformed = aSwing.xyz + vec3(p.x, p.y * ca - p.z * sa, p.y * sa + p.z * ca);
  }
  transformed.y += abs(cos(lvPhase)) * 0.035 * lvWalk;
}`,
      )
  }
  mat.customProgramCacheKey = () => 'lv-lod-walk'
  return mat
}

/**
 * Stores the walk phase / blend in the instance matrix's bottom row. Call this last:
 * the matrix is no longer affine for CPU-side use (bounds, culling, sorting), so the
 * BatchedMesh using it must have perObjectFrustumCulled and sortObjects off.
 */
export function encodeWalk(m: Matrix4, phase: number, walk: number): Matrix4 {
  m.elements[3] = walk > 0.001 ? phase % (Math.PI * 2) : 0
  m.elements[7] = walk > 0.001 ? walk : 0
  return m
}
