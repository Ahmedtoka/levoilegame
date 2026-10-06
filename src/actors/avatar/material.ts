// The avatar's single material: every vertex carries a `part` index (see
// PARTS in ./pieces) that picks its colour from a per-character palette; the face
// part also lays the canvas-drawn face over the skin, the logo part the brand logo.
// One shader program for every character (only the uniforms differ).

import { CanvasTexture, Color, MeshStandardMaterial, type Texture } from 'three'
import { PARTS, type Part } from './pieces'

export interface AvatarMaterial extends MeshStandardMaterial {
  userData: { palette: Color[] }
}

let blankTex: Texture | null = null

/** 1×1 transparent stand-in when a character has no logo. */
export function blankTexture(): Texture {
  if (!blankTex) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    blankTex = new CanvasTexture(c)
  }
  return blankTex
}

export function avatarMaterial(colors: Record<Part, string>, face: Texture, logo: Texture): AvatarMaterial {
  const palette = PARTS.map((p) => new Color(colors[p]))
  const mat = new MeshStandardMaterial({ roughness: 0.84, metalness: 0 }) as AvatarMaterial
  mat.userData.palette = palette
  mat.defines = { USE_UV: '' }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lvPal = { value: palette }
    shader.uniforms.lvFace = { value: face }
    shader.uniforms.lvLogo = { value: logo }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float part;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = part;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 lvPal[${PARTS.length}];
uniform sampler2D lvFace;
uniform sampler2D lvLogo;
varying float vPart;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
int lvI = int(vPart + 0.5);
vec3 lvC = lvPal[lvI];
if (lvI == ${PARTS.indexOf('face')}) {
  vec4 f = texture2D(lvFace, vUv);
  lvC = mix(lvC, f.rgb, f.a);
} else if (lvI == ${PARTS.indexOf('logo')}) {
  // The logo texture is shared (flipY on) while glTF UVs run top-down: flip v.
  vec4 l = texture2D(lvLogo, vec2(vUv.x, 1.0 - vUv.y));
  lvC = mix(lvC, l.rgb, l.a);
}
diffuseColor.rgb *= lvC;`,
      )
  }
  mat.customProgramCacheKey = () => 'lv-avatar'
  return mat
}
