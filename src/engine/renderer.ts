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

    this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 140)
    this.scene.background = new Color('#f6f1f3')
    this.scene.fog = new Fog('#f6f1f3', 45, 120)

    // Soft studio-like image-based lighting gives the premium "showroom" look
    // for almost no cost; two real lights add direction.
    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.42
    pmrem.dispose()

    this.scene.add(new HemisphereLight('#fff6fa', '#c9b3bd', 0.62))
    const sun = new DirectionalLight('#fff1e2', 1.35)
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
