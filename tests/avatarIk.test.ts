import { describe, expect, it } from 'vitest'
import { Bone, Group, Vector3 } from 'three'
import { twoBoneIK } from '../src/actors/avatar/ik'

function arm() {
  // Shoulder at the origin, a T-pose arm along +X: elbow at 0.3, hand at 0.6.
  const root = new Group()
  const upper = new Bone()
  const lower = new Bone()
  const hand = new Bone()
  lower.position.set(0.3, 0, 0)
  hand.position.set(0.3, 0, 0)
  upper.add(lower)
  lower.add(hand)
  root.add(upper)
  root.rotation.y = 0.7 // an arbitrary character yaw must not matter
  root.updateMatrixWorld(true)
  return { root, upper, lower, hand }
}

describe('twoBoneIK', () => {
  it('puts the hand on a reachable target', () => {
    const { root, upper, lower, hand } = arm()
    const target = root.localToWorld(new Vector3(0.2, -0.35, 0.15))
    const pole = root.localToWorld(new Vector3(0.3, 0, -0.5))
    twoBoneIK(upper, lower, hand, target, pole)
    root.updateMatrixWorld(true)
    expect(hand.getWorldPosition(new Vector3()).distanceTo(target)).toBeLessThan(1e-3)
  })

  it('stretches towards an unreachable target without breaking', () => {
    const { root, upper, lower, hand } = arm()
    const target = root.localToWorld(new Vector3(0, -2, 0))
    twoBoneIK(upper, lower, hand, target, root.localToWorld(new Vector3(0, 0, -1)))
    root.updateMatrixWorld(true)
    const p = hand.getWorldPosition(new Vector3())
    const a = upper.getWorldPosition(new Vector3())
    const dir = p.clone().sub(a).normalize()
    expect(dir.dot(target.clone().sub(a).normalize())).toBeGreaterThan(0.999)
  })

  it('weight 0 leaves the pose alone', () => {
    const { upper, lower, hand } = arm()
    const q = upper.quaternion.clone()
    twoBoneIK(upper, lower, hand, new Vector3(0, -1, 0), new Vector3(0, 0, -1), 0)
    expect(upper.quaternion.equals(q)).toBe(true)
  })
})
