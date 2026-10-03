import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import type { CollisionWorld } from '../engine/colliders'
import type { Input } from './input'
import type { CameraView } from '../state/store'
import type { Character } from '../actors/character'

const WALK = 3.3
const RUN = 6.2
const EYE = 1.6
const LOOK_SENS = 0.0022

export class Player {
  readonly pos = new Vector3()
  readonly vel = new Vector3()
  yaw = 0
  pitch = -0.04
  readonly radius = 0.3
  view: CameraView = 'first'
  avatar: Character | null = null
  /** Horizontal speed this frame (m/s), for footsteps and avatar animation. */
  speed = 0
  private bob = 0
  private camDist = 3

  teleport(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z)
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = -0.04
  }

  forward(out = new Vector3()): Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
  }

  update(dt: number, input: Input, world: CollisionWorld, active: boolean): void {
    if (active) {
      const [dx, dy] = input.consumeLook()
      this.yaw -= dx * LOOK_SENS
      this.pitch = MathUtils.clamp(this.pitch - dy * LOOK_SENS, -1.2, 1.15)
      this.yaw += input.turn() * 2.2 * dt
    } else input.consumeLook()

    const { x, y, run } = active ? input.axes() : { x: 0, y: 0, run: false }
    const s = Math.sin(this.yaw)
    const c = Math.cos(this.yaw)
    const speed = run ? RUN : WALK
    // forward = (-sin, -cos), right = (cos, -sin)
    const tx = (-s * y + c * x) * speed
    const tz = (-c * y - s * x) * speed
    const k = 1 - Math.exp(-dt * (x || y ? 10 : 14))
    this.vel.x += (tx - this.vel.x) * k
    this.vel.z += (tz - this.vel.z) * k

    // Sub-step so fast movement can't tunnel through thin walls.
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.12))
    for (let i = 0; i < steps; i++) {
      this.pos.x += (this.vel.x * dt) / steps
      this.pos.z += (this.vel.z * dt) / steps
      world.resolveCircle(this.pos, this.radius)
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z)
    this.bob += dt * this.speed * 2.1
  }

  applyCamera(camera: PerspectiveCamera, world: CollisionWorld, dt: number): void {
    camera.rotation.order = 'YXZ'
    camera.rotation.set(this.pitch, this.yaw, 0)
    const bobY = this.view === 'first' ? Math.sin(this.bob * 2) * 0.025 * Math.min(1, this.speed / WALK) : 0
    if (this.view === 'first') {
      camera.position.set(this.pos.x, EYE + bobY, this.pos.z)
    } else {
      const target = new Vector3(this.pos.x, 1.5, this.pos.z)
      const dir = new Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch),
      )
      const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
      const back = dir.clone().negate()
      const want = 3.1
      const hit = world.raycast(target, back, want + 0.3) - 0.3
      const dist = MathUtils.clamp(hit, 0.6, want)
      this.camDist += (dist - this.camDist) * Math.min(1, dt * (dist < this.camDist ? 20 : 4))
      camera.position.copy(target).addScaledVector(back, this.camDist).addScaledVector(right, 0.35)
      camera.position.y = Math.max(camera.position.y, 0.6)
    }
    if (this.avatar) {
      this.avatar.root.visible = this.view === 'third'
      this.avatar.root.position.set(this.pos.x, 0, this.pos.z)
      // Face the walking direction, or the camera direction when standing.
      const target = this.speed > 0.3 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw + Math.PI
      this.avatar.root.rotation.y = lerpAngle(this.avatar.root.rotation.y, target, Math.min(1, dt * 10))
      this.avatar.walk = Math.min(1, this.speed / WALK)
      this.avatar.walkRate = this.speed
    }
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}
