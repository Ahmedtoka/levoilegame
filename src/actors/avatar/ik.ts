// Analytic two-bone IK (after Daniel Holden's "simple two joint IK"): rotates the
// upper and lower bones so the end bone reaches a world-space target, bending
// towards a pole. Works on any skeleton regardless of its local bone axes, which
// is why poses (clasped hands, hand on hip, waving) are written as hand targets.

import { Quaternion, Vector3, type Object3D } from 'three'

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _t = new Vector3()
const _ac = new Vector3()
const _ab = new Vector3()
const _ba = new Vector3()
const _bc = new Vector3()
const _at = new Vector3()
const _axis0 = new Vector3()
const _axis1 = new Vector3()
const _bend = new Vector3()
const _qa = new Quaternion()
const _qb = new Quaternion()
const _inv = new Quaternion()
const _origA = new Quaternion()
const _origB = new Quaternion()

const clampDot = (x: number) => Math.min(1, Math.max(-1, x))

/**
 * Pose `upper` and `lower` so `end` reaches `target` (world), elbow/knee towards
 * `pole` (world). `weight` blends from the current pose (0) to the full solve (1).
 * World matrices must be current; they are refreshed for the chain afterwards.
 */
export function twoBoneIK(upper: Object3D, lower: Object3D, end: Object3D, target: Vector3, pole: Vector3, weight = 1): void {
  if (weight <= 0) return
  upper.getWorldPosition(_a)
  lower.getWorldPosition(_b)
  end.getWorldPosition(_c)
  _t.copy(target)
  const lab = _b.distanceTo(_a)
  const lcb = _c.distanceTo(_b)
  const lat = Math.min(Math.max(_t.distanceTo(_a), 1e-4), lab + lcb - 1e-4)

  _ac.subVectors(_c, _a).normalize()
  _ab.subVectors(_b, _a).normalize()
  _ba.subVectors(_a, _b).normalize()
  _bc.subVectors(_c, _b).normalize()
  _at.subVectors(_t, _a).normalize()

  const acab0 = Math.acos(clampDot(_ac.dot(_ab)))
  const babc0 = Math.acos(clampDot(_ba.dot(_bc)))
  const acat0 = Math.acos(clampDot(_ac.dot(_at)))
  const acab1 = Math.acos(clampDot((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)))
  const babc1 = Math.acos(clampDot((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb)))

  // Bend plane from the pole; fall back to the current elbow when degenerate.
  _bend.subVectors(pole, _a)
  _axis0.crossVectors(_ac, _bend)
  if (_axis0.lengthSq() < 1e-10) _axis0.crossVectors(_ac, _ab)
  _axis0.normalize()
  _axis1.crossVectors(_ac, _at)
  const turn = _axis1.lengthSq() > 1e-10
  _axis1.normalize()

  _origA.copy(upper.quaternion)
  _origB.copy(lower.quaternion)
  upper.getWorldQuaternion(_qa)
  lower.getWorldQuaternion(_qb)

  // Local-space rotations (axis expressed in each bone's frame).
  _inv.copy(_qa).invert()
  const r0 = new Quaternion().setFromAxisAngle(_axis0.clone().applyQuaternion(_inv), acab1 - acab0)
  const r2 = turn ? new Quaternion().setFromAxisAngle(_axis1.clone().applyQuaternion(_inv), acat0) : new Quaternion()
  _inv.copy(_qb).invert()
  const r1 = new Quaternion().setFromAxisAngle(_axis0.clone().applyQuaternion(_inv), babc1 - babc0)

  // World order: bend (r0) first, then swing onto the target (r2) -> local a_lr * r2 * r0.
  upper.quaternion.multiply(r2).multiply(r0).normalize()
  lower.quaternion.multiply(r1).normalize()
  if (weight < 1) {
    upper.quaternion.copy(_origA.slerp(upper.quaternion, weight))
    lower.quaternion.copy(_origB.slerp(lower.quaternion, weight))
  }
  upper.updateMatrixWorld(true)
}
