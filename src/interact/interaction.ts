// Crosshair / tap raycasting against registered interactables, with wall
// occlusion and a distance limit measured from the player.

import { Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three'
import type { CollisionWorld } from '../engine/colliders'
import { store } from '../state/store'

export type InteractKind = 'product' | 'model' | 'staff' | 'cashier' | 'exit' | 'customer' | 'treasure' | 'wheel' | 'deal' | 'rewards'

export interface Interactable {
  object: Object3D
  kind: InteractKind
  /** Prompt text in the current language. */
  label: () => string
  onInteract: () => void
  highlight?: (on: boolean) => void
  maxDist?: number
  /** When false the target is skipped (e.g. a shopper who isn't looking at anything). */
  enabled?: () => boolean
}

const _center = new Vector2(0, 0)
const _ndc = new Vector2()
const _dir = new Vector3()

export class Interaction {
  private readonly ray = new Raycaster()
  private readonly targets: Object3D[] = []
  private readonly map = new Map<Object3D, Interactable>()
  current: Interactable | null = null
  /** Called after a target is activated (E / click / tap), with the world point that was hit. */
  onActivate: (it: Interactable, point: Vector3) => void = () => {}
  private promptKey = ''
  /** World point of the last successful pick, and of the current crosshair target. */
  private readonly hitPoint = new Vector3()
  private readonly currentPoint = new Vector3()

  constructor() {
    this.ray.far = 12
  }

  add(i: Interactable): void {
    this.targets.push(i.object)
    this.map.set(i.object, i)
  }

  private pick(camera: Camera, ndc: Vector2, player: Vector3, world: CollisionWorld): Interactable | null {
    this.ray.setFromCamera(ndc, camera)
    const hits = this.ray.intersectObjects(this.targets, false)
    for (const h of hits) {
      const it = this.map.get(h.object)
      if (!it || (it.enabled && !it.enabled())) continue
      const dx = h.point.x - player.x
      const dz = h.point.z - player.z
      if (Math.hypot(dx, dz) > (it.maxDist ?? 3.4)) return null
      // A wall between the camera and the target blocks it.
      _dir.copy(this.ray.ray.direction)
      const wall = world.raycast(this.ray.ray.origin, _dir, h.distance)
      if (wall < h.distance - 0.05) return null
      this.hitPoint.copy(h.point)
      return it
    }
    return null
  }

  /** Per-frame: update the hovered target and prompt. Returns a tapped target if any. */
  update(camera: Camera, player: Vector3, world: CollisionWorld, active: boolean, isTouch: boolean): void {
    let next: Interactable | null = null
    if (active) next = this.pick(camera, _center, player, world)
    if (next) this.currentPoint.copy(this.hitPoint)
    if (next !== this.current) {
      this.current?.highlight?.(false)
      next?.highlight?.(true)
      this.current = next
    }
    const key = next ? `${next.label()}` : ''
    if (key !== this.promptKey) {
      this.promptKey = key
      store.getState().set({ prompt: next ? { text: key, key: isTouch ? '' : 'E' } : null })
    }
  }

  /** Interact at a screen position (touch tap / drag-look click). */
  tapAt(x: number, y: number, camera: Camera, player: Vector3, world: CollisionWorld): boolean {
    _ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1)
    const it = this.pick(camera, _ndc, player, world)
    if (it) {
      it.onInteract()
      this.onActivate(it, this.hitPoint)
      return true
    }
    return false
  }

  trigger(): boolean {
    if (!this.current) return false
    const it = this.current
    it.onInteract()
    this.onActivate(it, this.currentPoint)
    return true
  }

  /** Re-evaluate labels (language change). */
  refresh(): void {
    this.promptKey = '__'
  }
}
