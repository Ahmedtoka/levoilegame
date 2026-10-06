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
  /** Head UV mask: R lips, G cheeks, B eyelids (tinted per character). */
  faceMask: Texture
}

/** Iris colour of the eye texture (the runtime tints it towards the character's). */
export const IRIS_REF = '#5a3a22'

/** Average cheek colour of the skin atlas (printed by build_avatar.py as SKIN_REF): the tint reference. */
export const SKIN_REF = '#c8ab94'

export interface AvatarMaterial extends MeshStandardMaterial {
  /**
   * palette: colour per part; blink: 0 open … 1 eyes closed; fabrics: a texture
   * per garment part, shown where fabricOn (x top, y bottom, z hijab) is 1.
   */
  userData: {
    palette: Color[]
    blink: { value: number }
    fabrics: Record<FabricPart, { value: Texture }>
    fabricOn: { value: Vector3 }
    /** Face tints: iris, lips, blush colour and (in .w of lvFaceOn) their strengths. */
    face: { iris: Color; lips: Color; blush: Color; on: Vector3 }
  }
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
  const mat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: DoubleSide, normalMap: tex.skinNormal }) as AvatarMaterial
  // Bitmoji: almost no surface relief; the skin map only breaks up the face a little.
  mat.normalScale.set(0.25, 0.25)
  mat.userData.palette = palette
  const blink = { value: 0 }
  mat.userData.blink = blink
  const fabrics = { top: { value: blankTexture() }, bottom: { value: blankTexture() }, hijab: { value: blankTexture() } }
  const fabricOn = { value: new Vector3() }
  mat.userData.fabrics = fabrics
  mat.userData.fabricOn = fabricOn
  const face = { iris: new Color(IRIS_REF), lips: new Color('#c96f7b'), blush: new Color('#e9a0a8'), on: new Vector3(0, 0.55, 0.3) }
  mat.userData.face = face
  mat.defines = { USE_UV: '' }
  const skinRef = new Color(SKIN_REF)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lvPal = { value: palette }
    shader.uniforms.lvSkinRef = { value: skinRef }
    shader.uniforms.lvSkin = { value: tex.skin }
    shader.uniforms.lvHair = { value: tex.hair }
    shader.uniforms.lvHairN = { value: tex.hairNormal }
    shader.uniforms.lvEyes = { value: tex.eyes }
    shader.uniforms.lvFaceMask = { value: tex.faceMask }
    shader.uniforms.lvIris = { value: face.iris }
    shader.uniforms.lvIrisRef = { value: new Color(IRIS_REF) }
    shader.uniforms.lvLips = { value: face.lips }
    shader.uniforms.lvBlush = { value: face.blush }
    shader.uniforms.lvFaceOn = { value: face.on }
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
uniform sampler2D lvFaceMask;
uniform vec3 lvIris;
uniform vec3 lvIrisRef;
uniform vec3 lvLips;
uniform vec3 lvBlush;
uniform vec3 lvFaceOn;
uniform float lvBlink;
uniform sampler2D lvLogo;
uniform sampler2D lvFabTop;
uniform sampler2D lvFabBottom;
uniform sampler2D lvFabHijab;
uniform vec3 lvFabOn;
varying float vPart;
varying vec3 vLvPos;
varying vec3 vLvNrm;
// Cloth: soft, broad folds only (Bitmoji-like: big shapes, no visible weave). Tangent-space normal.
vec3 lvClothNormal(vec3 p, vec3 n) {
  float h = p.y;
  float ang = atan(p.z, p.x);
  float f1 = sin(ang * 9.0 + h * 6.0) * 0.5;
  float f2 = cos(ang * 9.0 + h * 6.0 + 1.3) * 0.5;
  float gather = smoothstep(1.45, 0.3, h) * 0.5 + 0.1;
  return normalize(vec3(vec2(f1, f2) * gather * 0.14, 1.0));
}
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
  if (lvI == ${PARTS.indexOf('face')}) {
    vec3 m = texture2D(lvFaceMask, vUv).rgb;
    lvC = mix(lvC, lvBlush * lvC * 1.6, m.g * lvFaceOn.z);
    lvC = mix(lvC, lvLips, m.r * lvFaceOn.y);
  }
} else if (lvI == ${PARTS.indexOf('hair')} || lvI == ${PARTS.indexOf('brows')}) {
  // Strands read on any hair colour: dark hair keeps lighter highlights, light hair keeps shadow between locks.
  float lvHl = dot(texture2D(lvHair, vUv).rgb, vec3(0.3, 0.59, 0.11));
  lvC = lvC * (0.45 + 1.5 * lvHl) + vec3(0.05) * lvHl * lvHl;
} else if (lvI == ${PARTS.indexOf('eyes')}) {
  vec3 lvE = texture2D(lvEyes, vUv).rgb;
  // The iris is the darker, saturated part of the eye texture: tint only that.
  float lvIrisMask = smoothstep(0.75, 0.35, dot(lvE, vec3(0.33)));
  lvC = mix(lvE, lvE * (lvIris / max(lvIrisRef, vec3(0.02))), lvIrisMask * lvFaceOn.x);
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
if (lvI == ${PARTS.indexOf('hair')} || lvI == ${PARTS.indexOf('brows')}) roughnessFactor = 0.55;
else if (lvI == ${PARTS.indexOf('face')} || lvI == ${PARTS.indexOf('skin')}) roughnessFactor = 0.78;
else if (lvI == ${PARTS.indexOf('eyes')}) roughnessFactor = 0.25;
else if (lvI == ${PARTS.indexOf('glasses')}) roughnessFactor = 0.3;
else roughnessFactor = 0.96;`,
      )
      // Bitmoji shading: the colour is the colour. One soft key light wraps around the form with a
      // wide, gentle terminator (no hard bands, no specular), a faint cool fill from the sky, a soft
      // darkening in the folds (ambient term from the normal's downward tilt), and a thin light rim.
      .replace(
        '#include <opaque_fragment>',
        `vec3 lvN = normalize(normal);
vec3 lvBase = diffuseColor.rgb;
// Bitmoji key light: from the camera's upper-front, so the face is always lit wherever she turns
// (the mall's own sun stays for the environment; characters carry their own portrait light).
vec3 lvKeyDir = normalize(normalize(vViewPosition) * 0.75 + vec3(0.25, 0.55, 0.0));
float lvNdl = dot(lvN, lvKeyDir);
float lvKey = smoothstep(-0.6, 0.85, lvNdl);           // wrapped, soft
float lvSky = 0.5 + 0.5 * lvN.y;                        // up-facing surfaces a touch brighter
float lvShade = mix(0.74, 1.0, lvKey) * mix(0.94, 1.04, lvSky);
vec3 lvLit = lvBase * lvShade;
// Skin: warm, slightly translucent shadow; eyes stay bright and glossy.
if (lvI == ${PARTS.indexOf('face')} || lvI == ${PARTS.indexOf('skin')}) lvLit = lvBase * mix(vec3(0.82, 0.72, 0.68), vec3(1.0), lvKey) * mix(0.97, 1.04, lvSky);
if (lvI == ${PARTS.indexOf('eyes')}) lvLit = lvBase * mix(0.85, 1.0, lvKey);
// Hair: one soft specular band.
if (lvI == ${PARTS.indexOf('hair')}) {
  vec3 lvH = normalize(normalize(vViewPosition) + lvKeyDir);
  lvLit += vec3(0.18) * pow(saturate(dot(lvN, lvH)), 24.0);
}
float lvRim = pow(1.0 - saturate(dot(lvN, normalize(vViewPosition))), 3.0);
lvLit += lvRim * 0.06;
// Keep three.js's own result only as a small fraction (environment reflections on the eyes/glasses).
float lvPbr = (lvI == ${PARTS.indexOf('eyes')} || lvI == ${PARTS.indexOf('glasses')}) ? 0.35 : 0.0;
outgoingLight = mix(lvLit, outgoingLight, lvPbr);
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'lv-avatar'
  return mat
}
