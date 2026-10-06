// Pure, DOM-free helpers for the player controls (look smoothing, tap-to-walk,
// product focus, touch tuning). Unit-tested in tests/controls.test.ts.

interface V3 {
  x: number
  y: number
  z: number
}
interface V2 {
  x: number
  z: number
}

/** Mouse look sensitivity (rad per px). */
export const LOOK_SENS = 0.0022
/** Look smoothing rate: the camera eases with 1 − exp(−dt·LOOK_RATE). */
export const LOOK_RATE = 25
/** Max floor distance (along the pick ray) for tap-to-walk. */
export const TAP_MAX_DIST = 25
/** Tap-to-walk stops this close to the target. */
export const ARRIVE_DIST = 0.25
/** Tap-to-walk gives up after this long without progress. */
export const STALL_TIME = 1
/** Below this speed towards the target (m/s) the walk counts as not progressing. */
const PROGRESS_SPEED = 0.3
/** Within this distance the walk slows down so it stops cleanly. */
const SLOW_DIST = 1.5
const MIN_GAIN = 0.25

export function ease(dt: number, rate: number): number {
  return 1 - Math.exp(-dt * rate)
}

/** One frame of look smoothing towards the target yaw/pitch. */
export function smoothLook(
  cur: { yaw: number; pitch: number },
  target: { yaw: number; pitch: number },
  dt: number,
): { yaw: number; pitch: number } {
  const k = ease(dt, LOOK_RATE)
  if (k === 0) return { yaw: cur.yaw, pitch: cur.pitch }
  return { yaw: cur.yaw + (target.yaw - cur.yaw) * k, pitch: cur.pitch + (target.pitch - cur.pitch) * k }
}

/** Where a ray meets the floor (y = 0), or null if it doesn't within maxDist. `dir` is unit length. */
export function floorPoint(origin: V3, dir: V3, maxDist = TAP_MAX_DIST): { x: number; z: number; dist: number } | null {
  if (dir.y >= -1e-4 || origin.y <= 0) return null
  const t = -origin.y / dir.y
  if (t > maxDist) return null
  return { x: origin.x + dir.x * t, z: origin.z + dir.z * t, dist: t }
}

export type WalkStatus = 'walking' | 'arrived' | 'stalled'

/**
 * One frame of tap-to-walk (`vel` must be the measured, post-collision velocity): the direction and speed gain (0..1) to walk at,
 * the updated stall timer, and whether the walk is over.
 */
export function walkStep(
  pos: V2,
  vel: V2,
  target: V2,
  stall: number,
  dt: number,
): { status: WalkStatus; dirX: number; dirZ: number; gain: number; stall: number } {
  const dx = target.x - pos.x
  const dz = target.z - pos.z
  const dist = Math.hypot(dx, dz)
  if (dist <= ARRIVE_DIST) return { status: 'arrived', dirX: 0, dirZ: 0, gain: 0, stall: 0 }
  const dirX = dx / dist
  const dirZ = dz / dist
  const towards = vel.x * dirX + vel.z * dirZ
  const nextStall = towards < PROGRESS_SPEED ? stall + dt : 0
  if (nextStall >= STALL_TIME - 1e-9) return { status: 'stalled', dirX, dirZ, gain: 0, stall: nextStall }
  const gain = Math.min(1, Math.max(MIN_GAIN, dist / SLOW_DIST))
  return { status: 'walking', dirX, dirZ, gain, stall: nextStall }
}

/** Yaw that faces the (dx, dz) direction, with the player's forward = (−sin yaw, −cos yaw). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

/** Yaw and pitch that centre `point` from `eye`. */
export function focusAngles(eye: V3, point: V3): { yaw: number; pitch: number } {
  const dx = point.x - eye.x
  const dz = point.z - eye.z
  return { yaw: yawToward(dx, dz), pitch: Math.atan2(point.y - eye.y, Math.hypot(dx, dz)) }
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Touch look sensitivity (rad per px), scaled by screen width. */
export function touchLookSens(width: number): number {
  return Math.min(0.0073, Math.max(0.0024, (0.00484 * 900) / Math.max(600, width)))
}

/** Actual velocity from the post-collision displacement (what the stall logic must use). */
export function measuredVelocity(before: V2, after: V2, dt: number): V2 {
  if (dt <= 0) return { x: 0, z: 0 }
  return { x: (after.x - before.x) / dt, z: (after.z - before.z) / dt }
}

/** Joystick vector from a knob offset (px): dead zone, clamped to the radius, y up = forward. */
export function stickVector(dx: number, dy: number, radius: number, dead = 8): { x: number; y: number } {
  const len = Math.hypot(dx, dy)
  if (len < dead) return { x: 0, y: 0 }
  const s = len > radius ? radius / len : 1
  return { x: (dx * s) / radius, y: (-dy * s) / radius }
}

/**
 * Sprint lock (touch): dragging the stick well past its rim, mostly straight up, arms auto-run;
 * releasing while armed keeps the player running forward until the stick is touched again.
 */
export function sprintLockArmed(dx: number, dy: number, radius: number): boolean {
  return -dy > radius * 1.9 && Math.abs(dx) < radius * 0.9
}

/** Touch look sensitivity steps offered in the settings (multiplier on touchLookSens). */
export const SENSITIVITY_STEPS = [0.6, 1, 1.5, 2] as const

/**
 * Frame limiter: whether a display refresh at `now` should render, given the last rendered time
 * and the cap (0 = uncapped). The 2 ms slack keeps a 60 cap from skipping frames on a 60 Hz screen.
 */
export function shouldRender(now: number, last: number, cap: number): boolean {
  return cap <= 0 || now - last >= 1000 / cap - 2
}
