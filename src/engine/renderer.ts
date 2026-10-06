import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { qualitySettings, type QualityLevel, type QualitySettings } from './quality'
import { setMaxAnisotropy } from './textures'
import { FLOOR_FX_LAYER, MIRROR_LAYER } from './layers'
import { BloomPipeline, bloomSupported } from './post'
import { setBloomSources } from './bloom'
import { THEME } from '../world/theme'

export class Engine {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  quality: QualitySettings
  /** Bloom composer, only while quality.bloom (High). */
  private post: BloomPipeline | null = null
  private readonly antialias: boolean
  /** Dynamic resolution multiplier on the tier's pixel ratio (1 = full). */
  private resScale = 1
  private readonly listeners: ((q: QualitySettings) => void)[] = []

  constructor(container: HTMLElement, level: QualityLevel) {
    this.quality = qualitySettings(level)
    this.antialias = level !== 'low'
    this.renderer = new WebGLRenderer({
      antialias: this.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = THEME.lighting.exposure
    this.renderer.setPixelRatio(this.quality.pixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)
    // Frames can be several renderer.render() calls (mirror passes, bloom): count the whole frame.
    this.renderer.info.autoReset = false
    this.renderer.domElement.id = 'scene'
    container.appendChild(this.renderer.domElement)
    setMaxAnisotropy(this.renderer, this.quality.anisotropy)

    this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.12, 140)
    // Floor-level overlays (AO strips, light pools, contact shadows) live on FLOOR_FX_LAYER:
    // the main camera sees them, the floor reflector's virtual camera (layer 0 only) skips them.
    this.camera.layers.enable(FLOOR_FX_LAYER)
    // Night mall (world/theme.ts): the far end of a corridor fades into a warm near-black.
    this.scene.background = new Color(THEME.fog)
    this.scene.fog = new Fog(THEME.fog, THEME.fogNear, THEME.fogFar)

    // A low studio environment keeps bronze and marble reflective for almost no cost;
    // the warm hemisphere from above and a faint sun give the light its direction. The
    // visible light comes from the décor: lightboxes, slot lights, halos, pools and washes.
    const { lighting } = THEME
    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = lighting.env
    pmrem.dispose()

    const hemi = new HemisphereLight(lighting.hemiSky, lighting.hemiGround, lighting.hemi)
    const sun = new DirectionalLight(lighting.sunColor, lighting.sun)
    sun.position.set(-8, 30, -6)
    // three.js only uses lights whose layers the camera sees: the floor mirrors' cameras
    // render MIRROR_LAYER alone, so the lights must be on it too (or reflections go unlit).
    for (const l of [hemi, sun]) {
      l.layers.enable(MIRROR_LAYER)
      this.scene.add(l)
    }

    this.syncPost()
    window.addEventListener('resize', () => this.resize())
  }

  /** Creates or disposes the bloom composer to match the quality level. */
  private syncPost(): void {
    const want = this.quality.bloom && !new URLSearchParams(location.search).has('nobloom') && bloomSupported()
    if (want && !this.post) {
      this.post = new BloomPipeline(this.renderer, this.scene, this.camera, this.antialias ? 4 : 0)
    } else if (!want && this.post) {
      this.post.dispose()
      this.post = null
    }
    setBloomSources(want)
  }

  /** Draw calls of the last frame: total, and how many of them were bloom/output passes. */
  frameCalls(): { total: number; post: number } {
    const total = this.renderer.info.render.calls
    return { total, post: this.post ? total - this.post.sceneCalls : 0 }
  }

  onQualityChange(fn: (q: QualitySettings) => void): void {
    this.listeners.push(fn)
  }

  setQuality(level: QualityLevel): void {
    if (level === this.quality.level) return
    this.quality = qualitySettings(level)
    this.resScale = 1
    this.renderer.setPixelRatio(this.quality.pixelRatio)
    this.syncPost()
    this.resize()
    for (const fn of this.listeners) fn(this.quality)
  }

  get resolutionScale(): number {
    return this.resScale
  }

  setResolutionScale(scale: number): void {
    if (scale === this.resScale) return
    this.resScale = scale
    this.renderer.setPixelRatio(this.quality.pixelRatio * scale)
    this.resize()
  }

  private size = { w: 0, h: 0 }

  resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.size = { w, h }
    this.camera.aspect = w / h
    this.camera.fov = w < h ? 80 : 70
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.post?.setSize()
  }

  render(): void {
    // Cheap per-frame check: catches rotations/viewport changes that don't fire resize.
    if (window.innerWidth !== this.size.w || window.innerHeight !== this.size.h) this.resize()
    this.renderer.info.reset()
    if (this.post) this.post.render()
    else this.renderer.render(this.scene, this.camera)
  }
}
