// Planar floor reflections (High only): a Reflector just under a semi-transparent floor.
// The mirror camera renders one layer: layer 0 for the plaza (the whole scene minus the
// FLOOR_FX_LAYER overlays), MIRROR_LAYER for the corridors (architecture and lights only).

import { Box3, Frustum, Matrix4, PlaneGeometry, type Camera, type Material, type Object3D } from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'

export interface FloorMirrorOptions {
  /** Group the mirror is added to (its local frame). */
  parent: Object3D
  /** Size of the mirrored floor and its centre in `parent`'s frame (y = floor level). */
  width: number
  depth: number
  x: number
  z: number
  /** The floor's world-space box: the mirror pass only runs while it is in the view frustum. */
  worldBox: Box3
  /** Reflector tint (blended with the mirror image; darker = fainter reflection). */
  color: number
  /** Fraction of the window size used for the mirror texture (0.5 = half resolution). */
  scale: number
  /** The one layer the mirror camera renders. */
  layer: number
}

const _fr = new Frustum()
const _pv = new Matrix4()

/**
 * A lazily created floor Reflector that can be fully released. `setEnabled(false)` disposes
 * its render target, material and geometry. While enabled, the mirror pass runs only when
 * the mirror is visible and its floor box is in view. A large plane's bounding sphere passes
 * the frustum test from far outside the floor.
 */
export class FloorMirror {
  private reflector: Reflector | null = null
  private readonly opts: FloorMirrorOptions
  private layer: number

  constructor(opts: FloorMirrorOptions) {
    this.opts = opts
    this.layer = opts.layer
  }

  /** Changes the one layer the mirror camera renders. */
  setLayer(layer: number): void {
    this.layer = layer
  }

  get enabled(): boolean {
    return this.reflector !== null
  }

  setEnabled(on: boolean): void {
    if (on && !this.reflector) this.reflector = this.create()
    else if (!on && this.reflector) {
      const r = this.reflector
      r.removeFromParent()
      r.geometry.dispose()
      r.dispose()
      this.reflector = null
    }
  }

  /** Shows or hides the (enabled) mirror without releasing it. */
  setVisible(v: boolean): void {
    if (this.reflector) this.reflector.visible = v
  }

  private create(): Reflector {
    const o = this.opts
    const r = new Reflector(new PlaneGeometry(o.width, o.depth), {
      textureWidth: Math.max(2, Math.round(window.innerWidth * o.scale)),
      textureHeight: Math.max(2, Math.round(window.innerHeight * o.scale)),
      color: o.color,
      clipBias: 0.003,
    })
    r.name = 'floorMirror'
    r.rotation.x = -Math.PI / 2
    // 2 mm under the floor: never coplanar with it.
    r.position.set(o.x, -0.002, o.z)
    // The mirror camera is a clone of the main camera, layers included: limit it to `layer`.
    const mirror = this
    const rr = r as unknown as { getReflectionCamera(cam: Camera): Camera }
    const getCam = rr.getReflectionCamera.bind(r)
    rr.getReflectionCamera = (cam) => {
      const rc = getCam(cam)
      rc.layers.set(mirror.layer)
      return rc
    }
    const pass = r.onBeforeRender
    const box = o.worldBox
    r.onBeforeRender = function (...args: Parameters<typeof pass>) {
      const cam = args[2]
      _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
      _fr.setFromProjectionMatrix(_pv)
      if (_fr.intersectsBox(box)) pass.apply(this, args)
    }
    o.parent.add(r)
    return r
  }
}

/** Switches a floor material between opaque and see-through over its mirror. */
export function setFloorSeeThrough(mat: Material, opacity: number): void {
  const transparent = opacity < 0.999
  mat.opacity = opacity
  if (mat.transparent !== transparent) {
    mat.transparent = transparent
    mat.needsUpdate = true
  }
}
