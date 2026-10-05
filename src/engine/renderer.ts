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
import { FLOOR_FX_LAYER } from './layers'

export class Engine {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  quality: QualitySettings
  private readonly listeners: ((q: QualitySettings) => void)[] = []

  constructor(container: HTMLElement, level: QualityLevel) {
    this.quality = qualitySettings(level)
    this.renderer = new WebGLRenderer({
      antialias: level !== 'low',
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.92
    this.renderer.setPixelRatio(this.quality.pixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)
    this.renderer.domElement.id = 'scene'
    container.appendChild(this.renderer.domElement)
    setMaxAnisotropy(this.renderer, this.quality.anisotropy)

    this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.12, 140)
    // Floor-level overlays (AO strips, light pools, contact shadows) live on FLOOR_FX_LAYER:
    // the main camera sees them, the floor reflector's virtual camera (layer 0 only) skips them.
    this.camera.layers.enable(FLOOR_FX_LAYER)
    this.scene.background = new Color('#ebe4da')
    this.scene.fog = new Fog('#ebe4da', 45, 120)

    // Soft studio-like image-based lighting gives the premium "showroom" look
    // for almost no cost; two real lights add direction.
    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.42
    pmrem.dispose()

    this.scene.add(new HemisphereLight('#fff3e6', '#b9a796', 0.75))
    const sun = new DirectionalLight('#ffe9cf', 1.25)
    sun.position.set(-8, 30, -6)
    this.scene.add(sun)

    window.addEventListener('resize', () => this.resize())
  }

  onQualityChange(fn: (q: QualitySettings) => void): void {
    this.listeners.push(fn)
  }

  setQuality(level: QualityLevel): void {
    if (level === this.quality.level) return
    this.quality = qualitySettings(level)
    this.renderer.setPixelRatio(this.quality.pixelRatio)
    this.resize()
    for (const fn of this.listeners) fn(this.quality)
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
  }

  render(): void {
    // Cheap per-frame check: catches rotations/viewport changes that don't fire resize.
    if (window.innerWidth !== this.size.w || window.innerHeight !== this.size.h) this.resize()
    this.renderer.render(this.scene, this.camera)
  }
}
