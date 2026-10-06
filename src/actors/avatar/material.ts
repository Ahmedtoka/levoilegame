// The avatar's single material: every vertex carries a `part` index (see
// PARTS in ./pieces) that picks its colour from a per-character palette. The
// textured parts sample the shared atlases exported by the Blender build: the
// face and hands the skin atlas (tinted towards the palette's skin tone), hair
// and brows the hair atlas (a strand mask times the hair colour), the eyes the
// iris texture; the logo part lays the brand logo on the vest. One shader program
// for every character (only the uniforms differ).

import { CanvasTexture, Color, DoubleSide, MeshStandardMaterial, Vector3, type Texture } from 'three'
import { PARTS, type Part } from './pieces'

/** Garment parts that can wear a fabric texture (try-on). */
export type FabricPart = 'top' | 'bottom' | 'hijab'

/** Atlases shared by every character (loaded once with the kit). */
export interface AvatarTextures {
  skin: Texture
  skinNormal: Texture
  hair: Texture
  hairNormal: Texture
  eyes: Texture
}

/** Average cheek colour of the skin atlas (printed by build_avatar.py as SKIN_REF): the tint reference. */
export const SKIN_REF = '#c8ab94'

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

export function avatarMaterial(colors: Record<Part, string>, tex: AvatarTextures, logo: Texture): AvatarMaterial {
  const palette = PARTS.map((p) => new Color(colors[p]))
  // Double-sided: garments are open shells (hems, sleeves, hijab drape) seen from below too.
  const mat = new MeshStandardMaterial({ roughness: 0.84, metalness: 0, side: DoubleSide, normalMap: tex.skinNormal }) as AvatarMaterial
  mat.userData.palette = palette
  const blink = { value: 0 }
  mat.userData.blink = blink
  const fabrics = { top: { value: blankTexture() }, bottom: { value: blankTexture() }, hijab: { value: blankTexture() } }
  const fabricOn = { value: new Vector3() }
  mat.userData.fabrics = fabrics
  mat.userData.fabricOn = fabricOn
  mat.defines = { USE_UV: '' }
  const skinRef = new Color(SKIN_REF)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lvPal = { value: palette }
    shader.uniforms.lvSkinRef = { value: skinRef }
    shader.uniforms.lvSkin = { value: tex.skin }
    shader.uniforms.lvHair = { value: tex.hair }
    shader.uniforms.lvHairN = { value: tex.hairNormal }
    shader.uniforms.lvEyes = { value: tex.eyes }
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
uniform vec3 lvSkinRef;
uniform sampler2D lvSkin;
uniform sampler2D lvHair;
uniform sampler2D lvHairN;
uniform sampler2D lvEyes;
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
if (lvI == ${PARTS.indexOf('face')} || lvI == ${PARTS.indexOf('skin')}) {
  // The atlas is one skin tone: shift it towards this character's (ratio in linear light).
  lvC = texture2D(lvSkin, vUv).rgb * (lvPal[${PARTS.indexOf('skin')}] / max(lvSkinRef, vec3(0.02)));
} else if (lvI == ${PARTS.indexOf('hair')} || lvI == ${PARTS.indexOf('brows')}) {
  lvC = texture2D(lvHair, vUv).rgb * lvC * 1.7;
} else if (lvI == ${PARTS.indexOf('eyes')}) {
  lvC = texture2D(lvEyes, vUv).rgb;
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
      // Normal maps: the skin atlas on face/hands, the hair atlas on hair/brows, flat elsewhere.
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 lvMapN = vec3(0.0, 0.0, 1.0);
if (lvI == ${PARTS.indexOf('face')} || lvI == ${PARTS.indexOf('skin')}) lvMapN = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
else if (lvI == ${PARTS.indexOf('hair')} || lvI == ${PARTS.indexOf('brows')}) lvMapN = texture2D(lvHairN, vUv).xyz * 2.0 - 1.0;
lvMapN.xy *= normalScale;
// tbn comes from normal_fragment_begin (derivative-based: the pieces carry no tangents).
normal = normalize(tbn * lvMapN);`,
      )
      // Skin is smoother than cloth; hair has a soft sheen.
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
if (lvI == ${PARTS.indexOf('hair')} || lvI == ${PARTS.indexOf('brows')}) roughnessFactor = 0.42;
else if (lvI == ${PARTS.indexOf('face')} || lvI == ${PARTS.indexOf('skin')}) roughnessFactor = 0.6;
else if (lvI == ${PARTS.indexOf('eyes')}) roughnessFactor = 0.2;`,
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
