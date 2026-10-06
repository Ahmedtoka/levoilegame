export type QualityLevel = 'low' | 'medium' | 'high'

export interface QualitySettings {
  level: QualityLevel
  pixelRatio: number
  /** Planar reflections on the plaza floor and the corridor you are in. */
  reflections: boolean
  /** Bloom on the light sources (EffectComposer). */
  bloom: boolean
  /** Longest side of product textures uploaded to the GPU. */
  textureMax: number
  /** Longest side of baked-store atlases (glTF); 4096² uploads stall integrated GPUs. */
  bakedTextureMax: number
  /** Light-shaft cones and other additive decor. */
  fancyDecor: boolean
  /** Distance beyond which characters stop rendering/animating. */
  characterDistance: number
  /**
   * How far crowd shoppers stay drawn as static LOD instances (one draw call for
   * all of them). Well past characterDistance, into the fog, so they don't pop.
   */
  crowdLodDistance: number
  anisotropy: number
}

export const QUALITY_ORDER: QualityLevel[] = ['low', 'medium', 'high']

export function qualitySettings(level: QualityLevel): QualitySettings {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  switch (level) {
    case 'low':
      return { level, pixelRatio: Math.min(dpr, 1), reflections: false, bloom: false, textureMax: 512, bakedTextureMax: 1024, fancyDecor: false, characterDistance: 22, crowdLodDistance: 45, anisotropy: 1 }
    case 'medium':
      return { level, pixelRatio: Math.min(dpr, 1.5), reflections: false, bloom: false, textureMax: 1024, bakedTextureMax: 2048, fancyDecor: true, characterDistance: 32, crowdLodDistance: 70, anisotropy: 4 }
    case 'high':
      return { level, pixelRatio: dpr, reflections: true, bloom: true, textureMax: 1024, bakedTextureMax: 4096, fancyDecor: true, characterDistance: 45, crowdLodDistance: 95, anisotropy: 8 }
  }
}

export function isTouchDevice(): boolean {
  // ?touch forces the touch HUD on a desktop browser (layout checks).
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 || new URLSearchParams(location.search).has('touch')
}

/** Best guess from device class and GPU string; refined at runtime by the FPS governor. */
export function detectQuality(): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const mem = nav.deviceMemory ?? 4
  let gpu = ''
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase()
  } catch {
    /* ignore */
  }
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low'
  if (isTouchDevice()) return cores >= 8 && mem >= 6 ? 'medium' : 'low'
  if (/intel|uhd|iris|mali|adreno/.test(gpu) || cores <= 4) return 'medium'
  return 'high'
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'))
  } catch {
    return false
  }
}

/**
 * Watches frame times and steps quality down when the average stays low.
 * Only active while quality is "auto".
 */
export class FpsGovernor {
  private frames = 0
  private acc = 0
  private cooldown = 3
  fps = 60
  private readonly onDowngrade: () => boolean
  /** Called with the average fps of each 2 s window (dynamic resolution). */
  onWindow: (fps: number) => void = () => {}

  constructor(onDowngrade: () => boolean) {
    this.onDowngrade = onDowngrade
  }

  tick(dt: number): void {
    this.frames++
    this.acc += dt
    if (this.acc < 2) return
    this.fps = this.frames / this.acc
    this.frames = 0
    this.acc = 0
    this.onWindow(this.fps)
    if (this.cooldown > 0) {
      this.cooldown--
      return
    }
    if (this.fps < 28 && this.onDowngrade()) this.cooldown = 3
  }
}

export const RES_SCALE_MIN = 0.7

/**
 * Dynamic resolution (touch + auto quality): one step per governor window. Drops the render
 * scale when the frame rate misses the target, and raises it again only after three good
 * windows in a row so it doesn't oscillate.
 */
export function resolutionStep(scale: number, fps: number, target: number, streak: number): { scale: number; streak: number } {
  if (fps < target * 0.85) return { scale: Math.max(RES_SCALE_MIN, Math.round((scale - 0.1) * 100) / 100), streak: 0 }
  if (fps >= target * 0.95 && scale < 1) {
    if (streak + 1 >= 3) return { scale: Math.min(1, Math.round((scale + 0.05) * 100) / 100), streak: 0 }
    return { scale, streak: streak + 1 }
  }
  return { scale, streak: 0 }
}
