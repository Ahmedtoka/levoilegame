// The avatar's single material: every vertex carries a `part` index (see
// PARTS in ./pieces) that picks its colour from a per-character palette; the face
// part also lays the canvas-drawn face over the skin, the logo part the brand logo.
// One shader program for every character (only the uniforms differ).

import { CanvasTexture, Color, DoubleSide, MeshStandardMaterial, Vector3, type Texture } from 'three'
import { PARTS, type Part } from './pieces'

/** Garment parts that can wear a fabric texture (try-on). */
export type FabricPart = 'top' | 'bottom' | 'hijab'

export interface AvatarMaterial extends MeshStandardMaterial {
  /**
   * palette: colour per part; blink: 0 open … 1 eyes closed; fabrics: a texture
   * per garment part, shown where fabricOn (x top, y bottom, z hijab) is 1.
   */
  userData: { palette: Color[]; blink: { value: number }; fabrics: Record<FabricPart, { value: Texture }>; fabricOn: { value: Vector3 } }
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

export function avatarMaterial(colors: Record<Part, string>, face: Texture, logo: Texture, faceClosed: Texture = face): AvatarMaterial {
  const palette = PARTS.map((p) => new Color(colors[p]))
  // Double-sided: garments are open shells (hems, sleeves, hijab drape) seen from below too.
  const mat = new MeshStandardMaterial({ roughness: 0.84, metalness: 0, side: DoubleSide }) as AvatarMaterial
  mat.userData.palette = palette
  const blink = { value: 0 }
  mat.userData.blink = blink
  const fabrics = { top: { value: blankTexture() }, bottom: { value: blankTexture() }, hijab: { value: blankTexture() } }
  const fabricOn = { value: new Vector3() }
  mat.userData.fabrics = fabrics
  mat.userData.fabricOn = fabricOn
  mat.defines = { USE_UV: '' }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lvPal = { value: palette }
    shader.uniforms.lvFace = { value: face }
    shader.uniforms.lvFaceClosed = { value: faceClosed }
    shader.uniforms.lvBlink = blink
    shader.uniforms.lvLogo = { value: logo }
    shader.uniforms.lvFabTop = fabrics.top
    shader.uniforms.lvFabBottom = fabrics.bottom
    shader.uniforms.lvFabHijab = fabrics.hijab
    shader.uniforms.lvFabOn = fabricOn
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float part;\nvarying float vPart;\nvarying vec3 vLvPos;\nvarying vec3 vLvNrm;')
      // Bind-pose position/normal: a fabric print stays put on the cloth as she moves.
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = part;\nvLvPos = position;\nvLvNrm = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 lvPal[${PARTS.length}];
uniform sampler2D lvFace;
uniform sampler2D lvFaceClosed;
uniform float lvBlink;
uniform sampler2D lvLogo;
uniform sampler2D lvFabTop;
uniform sampler2D lvFabBottom;
uniform sampler2D lvFabHijab;
uniform vec3 lvFabOn;
varying float vPart;
varying vec3 vLvPos;
varying vec3 vLvNrm;
// Triplanar fabric: ~0.5 m per repeat, blended by the bind-pose normal.
vec3 lvFabric(sampler2D t) {
  vec3 w = pow(abs(normalize(vLvNrm)), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec2 s = vec2(2.0);
  return texture2D(t, vLvPos.zy * s).rgb * w.x + texture2D(t, vLvPos.xz * s).rgb * w.y + texture2D(t, vLvPos.xy * s).rgb * w.z;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
int lvI = int(vPart + 0.5);
vec3 lvC = lvPal[lvI];
if (lvI == ${PARTS.indexOf('face')}) {
  vec4 f = lvBlink > 0.5 ? texture2D(lvFaceClosed, vUv) : texture2D(lvFace, vUv);
  lvC = mix(lvC, f.rgb, f.a);
} else if (lvI == ${PARTS.indexOf('logo')}) {
  // The logo texture is shared (flipY on) while glTF UVs run top-down: flip v.
  vec4 l = texture2D(lvLogo, vec2(vUv.x, 1.0 - vUv.y));
  lvC = mix(lvC, l.rgb, l.a);
} else if (lvI == ${PARTS.indexOf('top')} && lvFabOn.x > 0.5) {
  lvC = lvFabric(lvFabTop);
} else if (lvI == ${PARTS.indexOf('bottom')} && lvFabOn.y > 0.5) {
  lvC = lvFabric(lvFabBottom);
} else if (lvI == ${PARTS.indexOf('hijab')} && lvFabOn.z > 0.5) {
  lvC = lvFabric(lvFabHijab);
}
diffuseColor.rgb *= lvC;`,
      )
      // Hair has a soft sheen.
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
if (lvI == ${PARTS.indexOf('hair')}) roughnessFactor = 0.42;`,
      )
      // Soft rim light: lifts the silhouette off the background (stylised, nearly free).
      .replace(
        '#include <opaque_fragment>',
        `float lvRim = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
outgoingLight += lvRim * (diffuseColor.rgb * 0.35 + 0.06);
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'lv-avatar'
  return mat
}
