// Light halos: "glow without bloom". Every area agent marks its light sources with
// addLightHalo(); buildHalos() turns them into ONE InstancedMesh of additive billboard
// sprites (a 128² radial canvas, warm by default). They are visible on every quality tier,
// so Low and Medium read the same light sources that bloom picks up on High; on High the
// sprite also eats the bloom mask (BLOOM_WEIGHT.halo), so the halo itself blooms.
//
// Billboarding is done in the vertex shader (the instance's translation in view space plus
// the quad's corners scaled by the instance's x scale = the halo radius), so one draw call
// covers every halo of the mall whatever the camera does.

import {
  Color,
  CustomBlending,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Vector3,
  ZeroFactor,
  type Object3D,
  type Texture,
} from 'three'
import { canvasTexture, makeCanvas } from '../engine/textures'
import { BLOOM_WEIGHT, onBloomSources } from '../engine/bloom'
import { THEME } from './theme'

interface Halo {
  p: Vector3
  r: number
  c: Color
}

const pending: Halo[] = []
const built: InstancedMesh[] = []
/** 0 with bloom off; BLOOM_WEIGHT.halo while the High composer runs (see bloom.ts). */
const mask = { value: 0 }
let hooked = false
let sprite: Texture | null = null
let geometry: PlaneGeometry | null = null
/** Sprite opacity: the core adds ~0.5 of the halo colour (soft on Low/Medium; bloom tops it up on High). */
export const HALO_OPACITY = 0.6

/**
 * Queues a halo of radius `r` metres (the sprite is 2r across) centred at (x, y, z).
 * `color` is sRGB; the default is the theme's warm light. Call before buildHalos().
 */
export function addLightHalo(x: number, y: number, z: number, r: number, color: string = THEME.warmLight): void {
  pending.push({ p: new Vector3(x, y, z), r, c: new Color(color) })
}

/** Halos queued and not yet built. */
export function pendingHaloCount(): number {
  return pending.length
}

/** Halo instances built so far (over every buildHalos call). */
export function builtHaloCount(): number {
  return built.reduce((n, m) => n + m.count, 0)
}

/** Current bloom-mask weight of the halo sprites (0 off, BLOOM_WEIGHT.halo on). */
export function haloMaskWeight(): number {
  return mask.value
}

function haloTexture(): Texture | null {
  if (typeof document === 'undefined') return null
  if (sprite) return sprite
  const S = 128
  const [c, g] = makeCanvas(S, S)
  const img = g.createImageData(S, S)
  const h = (S - 1) / 2
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.min(1, Math.hypot(x - h, y - h) / h)
      // A soft core that stays bright to ~15 % of the radius, then a long smooth tail.
      const a = Math.min(1, 1.08 * Math.pow(1 - d, 2.4))
      const k = (y * S + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255
      img.data[k + 3] = Math.round(a * 255)
    }
  g.putImageData(img, 0, 0)
  sprite = canvasTexture(c)
  return sprite
}

const BILLBOARD_VERTEX = /* glsl */ `
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  float haloR = length( instanceMatrix[ 0 ].xyz );
  mvPosition.xy += position.xy * haloR;
  gl_Position = projectionMatrix * mvPosition;
`

/** Premultiplied additive colour; alpha carries the bloom mask (× uMask) for the high pass. */
const MASK_FRAGMENT = /* glsl */ `
  gl_FragColor = vec4( gl_FragColor.rgb * gl_FragColor.a, gl_FragColor.a * uMask );
`

function haloMaterial(): MeshBasicMaterial {
  const mat = new MeshBasicMaterial({
    map: haloTexture(),
    color: '#ffffff',
    transparent: true,
    opacity: HALO_OPACITY,
    depthWrite: false,
    toneMapped: false,
    blending: CustomBlending,
    // Colour: premultiplied additive. Alpha: dst *= 1 − src.a (the mask that bloom.ts
    // reads; with uMask = 0 the canvas alpha is untouched, as on Low/Medium).
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMask = mask
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', BILLBOARD_VERTEX)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uMask;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + MASK_FRAGMENT)
  }
  mat.customProgramCacheKey = () => 'lightHalo'
  if (!hooked) {
    hooked = true
    onBloomSources((on) => {
      mask.value = on ? BLOOM_WEIGHT.halo : 0
    })
  }
  return mat
}

/**
 * Builds every queued halo into one InstancedMesh under `parent` and returns it; null when
 * nothing was queued. Called once from the shell build after every area has added its
 * halos (a later call builds a second batch for halos added since).
 */
export function buildHalos(parent: Object3D): InstancedMesh | null {
  if (!pending.length) return null
  geometry ??= new PlaneGeometry(2, 2)
  const mesh = new InstancedMesh(geometry, haloMaterial(), pending.length)
  const m = new Matrix4()
  pending.forEach((h, i) => {
    m.makeScale(h.r, h.r, h.r).setPosition(h.p)
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, h.c)
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.frustumCulled = false
  // After the floor pools (renderOrder 2) so a halo over a pool adds on top of it.
  mesh.renderOrder = 3
  mesh.name = 'lightHalos'
  parent.add(mesh)
  built.push(mesh)
  pending.length = 0
  return mesh
}
