import { REVISION, SRGBColorSpace, UnsignedByteType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/**
 * Bloom on the light sources only (night mall: the lightboxes, slot lights, globes and halos
 * are the brightest things in the frame, so they carry a visible glow). The threshold is on
 * sRGB-encoded luminance and applies only to masked sources (bloom.ts). The warm lights sit
 * at about 0.86; a halo sprite alone peaks near 0.5 and only crosses it where it adds onto
 * a light source (which is where halos sit). A lightbox's cream lettering crosses it, its
 * darker brand-colour field mostly does not.
 */
export const BLOOM = { strength: 0.25, radius: 0.5, threshold: 0.72, smoothWidth: 0.25 }

/**
 * The composer's scene targets are flagged like an XR target, so three.js renders into
 * them exactly as it renders to the canvas:
 * - per-material tone mapping: ACES on lit materials, none on `toneMapped: false` images;
 * - sRGB encoding in the shaders, into an 8-bit buffer, so blending and clamping happen
 *   in the same space and precision as on the canvas.
 * The frame therefore matches the direct render pixel for pixel, apart from the bloom on
 * top, and the last pass is a plain copy.
 * A standard composer instead tone-maps everything in its OutputPass, which would dim every
 * unlit sign, photo and screen, and it blends in linear space.
 * In WebGLRenderer the flag only feeds:
 * - the tone mapping and output colour space of each program (WebGLPrograms, getProgram);
 * - the colour space used for ShaderMaterial colour uniforms (UniformsUtils);
 * - the internal format of the multisampled colour buffer (WebGLTextures). Here it is set
 *   explicitly to linear RGBA8, which is what the canvas is, so encoded values are stored
 *   as they are.
 */
/** The three.js release `canvasLikeTarget` was checked against (its `isXRRenderTarget` use is internal). */
export const BLOOM_THREE_REVISION = '186'
let warned = false

/**
 * False on any other three.js release: bloom stays off (with one console warning) until the
 * `isXRRenderTarget` behaviour above has been re-checked and BLOOM_THREE_REVISION bumped.
 */
export function bloomSupported(revision: string = REVISION): boolean {
  if (revision === BLOOM_THREE_REVISION) return true
  if (!warned) {
    warned = true
    console.warn(`[bloom] disabled: checked against three r${BLOOM_THREE_REVISION}, running r${revision}`)
  }
  return false
}

function canvasLikeTarget(rt: WebGLRenderTarget): void {
  rt.texture.colorSpace = SRGBColorSpace
  // Plain RGBA8 storage (not SRGB8_ALPHA8): the shaders already encode, and the multisampled
  // buffer and its resolve texture must share one format.
  rt.texture.internalFormat = 'RGBA8'
  ;(rt as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true
}

/** Bright-pass that only lets masked bloom sources through: weight = 1 − alpha (see bloom.ts). */
const MASKED_HIGH_PASS = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D( tDiffuse, vUv );
    float v = dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    float w = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v ) * ( 1.0 - clamp( texel.a, 0.0, 1.0 ) );
    gl_FragColor = vec4( texel.rgb * w, 1.0 );
  }`

/**
 * Final copy to the canvas with alpha forced to 1: the scene buffer's alpha holds the bloom
 * mask, and three.js always creates its context with an alpha channel, so a plain copy
 * would let the page show through the light sources.
 */
const OpaqueCopyShader = {
  name: 'OpaqueCopyShader',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4( texture2D( tDiffuse, vUv ).rgb, 1.0 );
    }`,
}

/**
 * Masked bloom. UnrealBloomPass itself works at half the composer's resolution (bright pass
 * and first mip), and its mips go down from there.
 */
class MaskedBloomPass extends UnrealBloomPass {
  constructor(resolution: Vector2) {
    super(resolution, BLOOM.strength, BLOOM.radius, BLOOM.threshold)
    ;(this.highPassUniforms as Record<string, { value: unknown }>).smoothWidth.value = BLOOM.smoothWidth
    this.materialHighPassFilter.fragmentShader = MASKED_HIGH_PASS
    this.materialHighPassFilter.needsUpdate = true
  }
}

/** High-quality frame: scene → bloom → canvas, through an EffectComposer. Low/Medium never create one. */
export class BloomPipeline {
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  /** Draw calls the scene pass took in the last frame (the rest of the frame is post-processing). */
  sceneCalls = 0

  private readonly renderer: WebGLRenderer
  private readonly size = new Vector2()

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, samples: number) {
    this.renderer = renderer
    const { x, y } = renderer.getDrawingBufferSize(this.size)
    const rt = new WebGLRenderTarget(x, y, { type: UnsignedByteType, samples })
    rt.texture.name = 'Bloom.scene'
    this.composer = new EffectComposer(renderer, rt)
    canvasLikeTarget(this.composer.renderTarget1)
    canvasLikeTarget(this.composer.renderTarget2)

    const scenePass = new RenderPass(scene, camera)
    const renderScene = scenePass.render.bind(scenePass)
    scenePass.render = (r, w, rb, dt, mask) => {
      renderScene(r, w, rb, dt, mask)
      this.sceneCalls = r.info.render.calls
    }
    this.composer.addPass(scenePass)
    this.bloom = new MaskedBloomPass(new Vector2(x, y))
    this.composer.addPass(this.bloom)
    // Already tone-mapped and sRGB-encoded: the canvas just gets a copy.
    this.composer.addPass(new ShaderPass(OpaqueCopyShader))
    this.setSize()
  }

  /** Matches the canvas' drawing buffer (call after renderer.setSize / setPixelRatio). */
  setSize(): void {
    const { x, y } = this.renderer.getDrawingBufferSize(this.size)
    // Work in device pixels: the drawing buffer is already rounded, CSS size × ratio may not be.
    this.composer.setPixelRatio(1)
    this.composer.setSize(x, y)
  }

  render(): void {
    this.composer.render()
  }

  dispose(): void {
    for (const p of this.composer.passes) p.dispose()
    this.composer.dispose()
  }
}
