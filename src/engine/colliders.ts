// Static collision: axis-aligned boxes resolved against the player's
// capsule, approximated as a circle on the XZ plane.

import { Box3, Ray, Vector3 } from 'three'

const WALK_MIN_Y = 0.15 // ignore floor decals / rugs
const WALK_MAX_Y = 1.9 // ignore overhead signs and headers

export class CollisionWorld {
  readonly boxes: Box3[] = []
  /** Boxes that block the player (subset by height band). */
  private walk: Box3[] = []
  private readonly _ray = new Ray()
  private readonly _hit = new Vector3()

  /** Walls: block interaction rays and the third-person camera. */
  readonly occluders: Box3[] = []

  addBox(b: Box3, occluder = false): void {
    this.boxes.push(b)
    if (occluder) this.occluders.push(b)
    if (b.max.y > WALK_MIN_Y && b.min.y < WALK_MAX_Y) this.walk.push(b)
  }

  /** Dynamic obstacles (characters) are circles; kept separately so they can be rebuilt. */
  circles: { x: number; z: number; r: number }[] = []

  /** Push a circle at pos (XZ) with radius r out of every overlapping box/circle. */
  resolveCircle(pos: Vector3, r: number): void {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.walk) {
        if (pos.x + r < b.min.x || pos.x - r > b.max.x || pos.z + r < b.min.z || pos.z - r > b.max.z) continue
        const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x))
        const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z))
        const dx = pos.x - cx
        const dz = pos.z - cz
        const d2 = dx * dx + dz * dz
        if (d2 > r * r) continue
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2)
          pos.x += (dx / d) * (r - d)
          pos.z += (dz / d) * (r - d)
        } else {
          // Centre inside the box: leave along the shallowest axis.
          const left = pos.x - b.min.x + r
          const right = b.max.x - pos.x + r
          const back = pos.z - b.min.z + r
          const front = b.max.z - pos.z + r
          const m = Math.min(left, right, back, front)
          if (m === left) pos.x -= left
          else if (m === right) pos.x += right
          else if (m === back) pos.z -= back
          else pos.z += front
        }
      }
      for (const c of this.circles) {
        const dx = pos.x - c.x
        const dz = pos.z - c.z
        const min = r + c.r
        const d2 = dx * dx + dz * dz
        if (d2 >= min * min || d2 < 1e-8) continue
        const d = Math.sqrt(d2)
        pos.x += (dx / d) * (min - d)
        pos.z += (dz / d) * (min - d)
      }
    }
  }

  /** Distance to the first wall hit along a ray (third-person camera, line of sight), or maxDist. */
  raycast(origin: Vector3, dir: Vector3, maxDist: number): number {
    this._ray.set(origin, dir)
    let best = maxDist
    for (const b of this.occluders) {
      if (b.containsPoint(origin)) continue
      const hit = this._ray.intersectBox(b, this._hit)
      if (hit) {
        const d = hit.distanceTo(origin)
        if (d < best) best = d
      }
    }
    return best
  }
}
