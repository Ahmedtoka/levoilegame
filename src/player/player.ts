import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import type { CollisionWorld } from '../engine/colliders'
import type { Input } from './input'
import type { CameraView } from '../state/store'
import type { Character } from '../actors/character'
import { LOOK_SENS, angleDelta, ease, focusAngles, smoothLook, walkStep, yawToward, type WalkStatus } from './controlsMath'

const WALK = 3.3
const RUN = 6.2
const EYE = 1.6
const BOB = 0.015
const FOCUS_TIME = 0.35
const PITCH_MIN = -1.2
const PITCH_MAX = 1.15

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
  /** Tap-to-walk target, null when not walking. */
  walk: { x: number; z: number; stall: number } | null = null
  /** Called when a tap-to-walk ends (arrived, stalled or cancelled). */
  onWalkEnd: (status: WalkStatus | 'cancelled') => void = () => {}
  private bob = 0
  private camDist = 3
  /** Look target fed by mouse/touch deltas; the camera eases towards it. */
  private targetYaw = 0
  private targetPitch = -0.04
  /** Last values written by update(), to notice external writes (teleports, dev tools). */
  private lastYaw = 0
  private lastPitch = -0.04
  private focus: { fromYaw: number; fromPitch: number; yaw: number; pitch: number; t: number } | null = null
  private readonly pivot = new Vector3()
  private pivotReady = false

  teleport(x: number, z: number, yaw: number): void {
    this.pos.set(x, 0, z)
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = -0.04
    this.syncLook()
    this.focus = null
    this.pivotReady = false
    if (this.walk) this.endWalk('cancelled')
  }

  forward(out = new Vector3()): Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
  }

  /** Start walking in a straight line to a floor point (tap-to-walk). */
  walkTo(x: number, z: number): void {
    this.walk = { x, z, stall: 0 }
  }

  cancelWalk(): void {
    if (this.walk) this.endWalk('cancelled')
  }

  /** Ease the view to centre a world point over FOCUS_TIME (first person only). */
  focusOn(point: { x: number; y: number; z: number }): void {
    if (this.view !== 'first') return
    const a = focusAngles({ x: this.pos.x, y: EYE, z: this.pos.z }, point)
    this.focus = {
      fromYaw: this.yaw,
      fromPitch: this.pitch,
      yaw: this.yaw + angleDelta(this.yaw, a.yaw),
      pitch: MathUtils.clamp(a.pitch, PITCH_MIN, PITCH_MAX),
      t: 0,
    }
  }

  private syncLook(): void {
    this.targetYaw = this.lastYaw = this.yaw
    this.targetPitch = this.lastPitch = this.pitch
  }

  private endWalk(status: WalkStatus | 'cancelled'): void {
    this.walk = null
    this.onWalkEnd(status)
  }

  update(dt: number, input: Input, world: CollisionWorld, active: boolean): void {
    // Someone set yaw/pitch directly (teleport, dev tools): adopt it as the target.
    if (this.yaw !== this.lastYaw || this.pitch !== this.lastPitch) this.syncLook()

    const [dx, dy] = input.consumeLook()
    const looking = active && (dx !== 0 || dy !== 0)
    if (active) {
      this.targetYaw -= dx * LOOK_SENS
      this.targetPitch = MathUtils.clamp(this.targetPitch - dy * LOOK_SENS, PITCH_MIN, PITCH_MAX)
      // Keyboard turning keeps its direct rate.
      const turn = input.turn() * 2.2 * dt
      this.targetYaw += turn
      this.yaw += turn
    }

    const { x, y, run } = active ? input.axes() : { x: 0, y: 0, run: false }
    // Any joystick / WASD input, or an overlay opening, cancels tap-to-walk.
    if (this.walk && (x || y || !active)) this.endWalk('cancelled')

    const s = Math.sin(this.yaw)
    const c = Math.cos(this.yaw)
    const speed = run ? RUN : WALK
    // forward = (-sin, -cos), right = (cos, -sin)
    let tx = (-s * y + c * x) * speed
    let tz = (-c * y - s * x) * speed
    let moving = !!(x || y)

    if (this.walk) {
      const w = this.walk
      const r = walkStep(this.pos, this.vel, w, w.stall, dt)
      if (r.status !== 'walking') this.endWalk(r.status)
      else {
        w.stall = r.stall
        tx = r.dirX * r.gain * WALK
        tz = r.dirZ * r.gain * WALK
        moving = true
        // Turn to face the walking direction (unless the user is looking around).
        if (!looking && !this.focus) {
          const want = yawToward(r.dirX, r.dirZ)
          this.targetYaw += angleDelta(this.targetYaw, want) * ease(dt, 5)
        }
      }
    }

    const k = 1 - Math.exp(-dt * (moving ? 10 : 14))
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

    // Look: a product focus animation wins; otherwise ease towards the target.
    if (this.focus) {
      const f = this.focus
      f.t = Math.min(1, f.t + dt / FOCUS_TIME)
      const e = f.t * f.t * (3 - 2 * f.t)
      this.yaw = f.fromYaw + (f.yaw - f.fromYaw) * e
      this.pitch = f.fromPitch + (f.pitch - f.fromPitch) * e
      this.targetYaw = this.yaw
      this.targetPitch = this.pitch
      if (f.t >= 1) this.focus = null
    } else {
      const l = smoothLook(this, { yaw: this.targetYaw, pitch: this.targetPitch }, dt)
      this.yaw = l.yaw
      this.pitch = l.pitch
    }
    this.lastYaw = this.yaw
    this.lastPitch = this.pitch
  }

  applyCamera(camera: PerspectiveCamera, world: CollisionWorld, dt: number): void {
    camera.rotation.order = 'YXZ'
    camera.rotation.set(this.pitch, this.yaw, 0)
    const bobY = this.view === 'first' ? Math.sin(this.bob * 2) * BOB * Math.min(1, this.speed / WALK) : 0
    if (this.view === 'first') {
      camera.position.set(this.pos.x, EYE + bobY, this.pos.z)
      this.pivotReady = false
    } else {
      // The orbit pivot follows the player with exponential smoothing.
      const want = _want.set(this.pos.x, 1.5, this.pos.z)
      if (!this.pivotReady || this.pivot.distanceToSquared(want) > 9) {
        this.pivot.copy(want)
        this.pivotReady = true
      } else this.pivot.lerp(want, ease(dt, 14))
      const target = this.pivot
      const back = _dir.set(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        -Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch),
      )
      const right = _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
      const wantDist = 3.1
      const hit = world.raycast(target, back, wantDist + 0.3) - 0.3
      const dist = MathUtils.clamp(hit, 0.6, wantDist)
      // Collision pull-in is instant; release eases out.
      if (dist < this.camDist) this.camDist = dist
      else this.camDist += (dist - this.camDist) * ease(dt, 4)
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

const _want = new Vector3()
const _dir = new Vector3()
const _right = new Vector3()

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t
}
