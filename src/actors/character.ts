// District 122 characters: one stylised base (big head, slim body) skinned to the
// Quaternius UAL skeleton (CC0) and animated by its clips. Built from garment
// pieces of public/models/avatar/avatar.glb (scripts/blender/build_avatar.py),
// merged into ONE skinned mesh with ONE material per character.
//
// MODESTY RULE (no exceptions): there is no body mesh. A character is garment
// pieces + head + hands only; every look covers neck to ankles and shoulders to
// wrists (enforced by piecesFor). Most wear hijab. root stays invisible until the
// character is fully built.

import {
  AnimationMixer,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Vector3,
  type AnimationAction,
  type Bone,
  type Object3D,
  type Texture,
} from 'three'
import { blobShadow } from '../world/props'
import { avatarKit, clipStride, cloneBones, mergedGeometry, shapeHead } from './avatar/kit'
import { avatarMaterial, blankTexture, type AvatarMaterial, type FabricPart } from './avatar/material'
import { twoBoneIK } from './avatar/ik'
import { PARTS, piecesFor, type AvatarOutfit, type HeadWear, type Part } from './avatar/pieces'

export type { AvatarOutfit, HeadWear } from './avatar/pieces'
export type Pose = 'idle' | 'handOnHip' | 'model' | 'clasped' | 'relaxed'

/** What the game needs from any character. */
export interface Persona {
  readonly root: Group
  readonly hitbox: Object3D
  lookTarget: Vector3 | null
  walk: number
  /** Ground speed while walking (m/s); the walk/jog clips play to match it (no foot sliding). */
  walkRate: number
  update(dt: number, t: number): void
  wave(): void
  setOutfitColors(top: string | null, bottom: string | null): void
  /** Static LOD snapshot (vertex colours + `aSwing` for the LOD walk shader). */
  lodGeometry(): BufferGeometry | null
  /** Bumped whenever the outfit colours change (an LOD snapshot is then stale). */
  readonly colorVersion: number
  /** Walk-cycle phase in radians (shared by the rig and its LOD). */
  readonly walkPhase: number
  /** Advance the walk cycle without posing the rig (while it is drawn as an LOD). */
  stepWalk(dt: number): void
}

export interface Look {
  skin: string
  /** Face preset (see FACE_STYLES). */
  face: number
  outfit: AvatarOutfit
  top: string
  bottom: string
  /** Trim: abaya band and cuffs, dress belt. */
  trim: string
  shoes: string
  head: HeadWear
  vest?: { color: string; logo: Texture | null }
  pose: Pose
  height?: number
  /** Selfie / editor refinements (see avatar/look.ts). */
  iris?: string
  lips?: string
  brows?: string
  faceWidth?: number
  jaw?: number
  browThick?: number
}

/** The model stands ~1.84 m (head enlarged ×1.15 in the build); scaled to ~1.66 m. */
const BASE_SCALE = 0.9
const HITBOX = new CylinderGeometry(0.34, 0.34, 1.8, 8)
const HIDDEN = new MeshBasicMaterial({ visible: false })
const BOUNDS = new Sphere(new Vector3(0, 1.0, 0), 1.25)
const TWO_PI = Math.PI * 2

// Hand targets in skeleton space (Y up, +Z forward, the character's left is +X).
const POSE_HANDS: Partial<Record<Pose, { l?: [Vector3, Vector3]; r?: [Vector3, Vector3] }>> = {
  clasped: {
    l: [new Vector3(0.035, 1.0, 0.17), new Vector3(0.45, 1.05, -0.35)],
    r: [new Vector3(-0.035, 0.99, 0.17), new Vector3(-0.45, 1.05, -0.35)],
  },
  handOnHip: { l: [new Vector3(0.2, 1.02, 0.03), new Vector3(0.7, 1.3, -0.25)] },
  model: { r: [new Vector3(-0.2, 1.02, 0.03), new Vector3(-0.7, 1.3, -0.25)] },
}
/** Skirt hinge bones (skirt_f / skirt_b) follow the leading / trailing thigh by these gains. */
const SKIRT_FRONT = 0.85
const SKIRT_BACK = 0.75
/** The library clips hold the arms a little wide for a bulkier body: tuck them in. */
const ARM_TUCK = 0.14
const WAVE_TARGET = new Vector3(-0.32, 1.78, 0.1)
const WAVE_POLE = new Vector3(-0.8, 1.3, -0.1)

const _v = new Vector3()
const _v2 = new Vector3()
const _q = new Quaternion()
const _q2 = new Quaternion()
const _q3 = new Quaternion()
const _q4 = new Quaternion()
const _fwd = new Vector3()
const _down = new Vector3()
const _axis = new Vector3()
const _m = new Matrix4()
const _up = new Vector3(0, 1, 0)

export function createCharacter(look: Look, seed: number): Character {
  return new Character(look, seed)
}

/** Colours of every part for a look. */
export function lookColors(look: Look): Record<Part, string> {
  const hijab = look.head.kind === 'hijab' ? look.head.color : look.top
  return {
    face: look.skin,
    skin: look.skin,
    top: look.top,
    bottom: look.bottom,
    trim: look.trim,
    shoes: look.shoes,
    hijab,
    accent: look.head.kind === 'hijab' ? (look.head.accent ?? hijab) : hijab,
    hair: look.head.kind === 'hair' ? look.head.color : '#2b1d16',
    vest: look.vest?.color ?? look.top,
    logo: look.vest?.color ?? look.top,
    eyes: '#ffffff',
    brows: look.brows ?? (look.head.kind === 'hair' ? look.head.color : '#2b1d16'),
  }
}

export class Character implements Persona {
  readonly root = new Group()
  readonly look: Look
  lookTarget: Vector3 | null = null
  walk = 0
  walkRate = 1
  colorVersion = 0

  private readonly mesh: SkinnedMesh | null = null
  private readonly mat: AvatarMaterial | null = null
  private readonly mixer: AnimationMixer | null = null
  private readonly idle: AnimationAction | null = null
  private readonly walkAction: AnimationAction | null = null
  private readonly jogAction: AnimationAction | null = null
  /** Ground distance per loop of the walk / jog clip at skeleton scale. */
  private walkStride = 1.4
  private jogStride = 2.2
  private readonly bones = new Map<string, Bone>()
  private readonly phase: number
  private readonly skirtRest = new Map<Bone, Quaternion>()
  private headYaw = 0
  /** Seconds to the next blink (negative while the eyes are closed). */
  private blinkIn = 1 + Math.random() * 4
  private waving = 0
  private time = 0

  constructor(look: Look, seed = Math.random() * 100) {
    this.look = look
    this.phase = seed
    // Never render while being assembled; shown only once fully dressed and merged.
    this.root.visible = false
    this.root.scale.setScalar(look.height ?? 1)
    this.root.add(blobShadow(0.9, 0.9, 0.9), this.hitbox)

    const kit = avatarKit()
    if (!kit) return // model unavailable: nothing is ever drawn (never a partial body)

    const pieces = piecesFor({ outfit: look.outfit, head: look.head, vest: !!look.vest, logo: !!look.vest?.logo })
    this.mat = avatarMaterial(lookColors(look), kit.tex, look.vest?.logo ?? blankTexture())
    const face = this.mat.userData.face
    if (look.iris) face.iris.set(look.iris)
    if (look.lips) face.lips.set(look.lips)
    face.on.set(look.iris ? 1 : 0, look.lips ? 0.75 : 0.5, 0.3)
    const { root: rootBone, bones, byName } = cloneBones(kit)
    this.bones = byName
    for (const n of ['skirt_f', 'skirt_b']) {
      const b = byName.get(n)
      if (b) this.skirtRest.set(b, b.quaternion.clone())
    }
    let geometry = mergedGeometry(kit, pieces)
    // A shaped head needs its own copy (the merged geometry is shared per piece set).
    const fw = look.faceWidth ?? 1
    const jw = look.jaw ?? 1
    const bt = look.browThick ?? 1
    if (fw !== 1 || jw !== 1 || bt !== 1) {
      geometry = geometry.clone()
      shapeHead(geometry, fw, jw, bt)
    }
    const mesh = new SkinnedMesh(geometry, this.mat)
    mesh.add(rootBone)
    mesh.bind(new Skeleton(bones, kit.boneInverses), kit.bindMatrix)
    mesh.boundingSphere = BOUNDS
    mesh.scale.setScalar(BASE_SCALE)
    this.mesh = mesh
    this.root.add(mesh)

    this.mixer = new AnimationMixer(mesh)
    const idleClip = kit.clips.get('Idle_Loop')
    const skirt = look.outfit !== 'pants'
    const walkClip = kit.clips.get(skirt ? 'Walk_Modest' : 'Walk_Loop') ?? kit.clips.get('Walk_Loop')
    const jogClip = kit.clips.get(skirt ? 'Jog_Modest' : 'Jog_Fwd_Loop') ?? kit.clips.get('Jog_Fwd_Loop')
    if (idleClip) {
      this.idle = this.mixer.clipAction(idleClip)
      this.idle.play()
      this.idle.time = (seed * 0.37) % idleClip.duration
    }
    if (walkClip) {
      this.walkAction = this.mixer.clipAction(walkClip)
      this.walkAction.play()
      this.walkAction.setEffectiveWeight(0)
      this.walkAction.time = (seed * 0.61) % walkClip.duration
      this.walkStride = clipStride(kit, walkClip)
    }
    if (jogClip) {
      this.jogAction = this.mixer.clipAction(jogClip)
      this.jogAction.play()
      this.jogAction.setEffectiveWeight(0)
      this.jogStride = clipStride(kit, jogClip)
    }
    this.pose(0, 0)
    // Fully built and dressed.
    this.root.visible = true
  }

  /** Walk-cycle phase (radians) of the walk clip, shared with the LOD shader. */
  get walkPhase(): number {
    const a = this.walkAction
    if (!a) return 0
    return (a.time / a.getClip().duration) * TWO_PI
  }

  /** Walk clip speed: the old procedural cadence (4 + 1.6·rate rad/s) mapped onto the clip. */
  /** Clip speed so one loop covers its stride at the current ground speed. */
  private timeScaleFor(a: AnimationAction | null, stride: number): number {
    if (!a) return 1
    const scale = BASE_SCALE * this.root.scale.x
    const speed = Math.max(0.35, this.walkRate)
    return (speed / (stride * scale)) * a.getClip().duration
  }

  private walkTimeScale(): number {
    return this.timeScaleFor(this.walkAction, this.walkStride)
  }

  /** Walk -> jog blend by ground speed (the player's normal pace is brisk). */
  private jogBlend(): number {
    const v = this.walkRate
    const t = Math.min(1, Math.max(0, (v - 2.2) / 0.9))
    return t * t * (3 - 2 * t)
  }

  stepWalk(dt: number): void {
    const a = this.walkAction
    if (!a || this.walk <= 0.01) return
    const d = a.getClip().duration
    a.time = (a.time + dt * this.walkTimeScale()) % d
  }

  update(dt: number, t: number): void {
    this.time = t
    this.pose(dt, t)
    this.blink(dt)
  }

  /** A quick blink every few seconds (sometimes a double one). */
  private blink(dt: number): void {
    const b = this.mat?.userData.blink
    if (!b) return
    this.blinkIn -= dt
    if (this.blinkIn < -0.12) this.blinkIn = Math.random() < 0.15 ? 0.18 : 2.2 + Math.random() * 3.5
    b.value = this.blinkIn < 0 ? 1 : 0
  }

  private pose(dt: number, t: number): void {
    if (!this.mixer || !this.mesh) return
    const w = Math.min(1, Math.max(0, this.walk))
    this.idle?.setEffectiveWeight(1 - w)
    const j = this.jogAction ? this.jogBlend() : 0
    if (this.walkAction) {
      this.walkAction.setEffectiveWeight(w * (1 - j))
      this.walkAction.timeScale = w > 0.01 ? this.walkTimeScale() : 0
    }
    if (this.jogAction) {
      this.jogAction.setEffectiveWeight(w * j)
      this.jogAction.timeScale = w > 0.01 ? this.timeScaleFor(this.jogAction, this.jogStride) : 0
      // Keep the two cycles in step so the blend never crosses its legs.
      if (this.walkAction && j > 0 && j < 1) {
        const wa = this.walkAction
        this.jogAction.time = (wa.time / wa.getClip().duration) * this.jogAction.getClip().duration
      }
    }
    this.mixer.update(dt)
    this.mesh.updateMatrixWorld(true)
    this.tuckArms()
    this.driveSkirt()

    // Pose: hands placed by IK while standing (fades out as she walks).
    const still = 1 - w
    const hands = POSE_HANDS[this.look.pose]
    if (hands && still > 0.01) {
      if (hands.l) this.reach('l', hands.l[0], hands.l[1], still)
      if (hands.r && this.waving <= 0) this.reach('r', hands.r[0], hands.r[1], still)
    }

    // Greeting wave (right arm).
    if (this.waving > 0) {
      this.waving -= dt
      const k = Math.min(1, this.waving * 2, (2.2 - this.waving) * 3)
      _v2.copy(WAVE_TARGET)
      _v2.x += Math.sin(t * 9) * 0.07
      this.reach('r', _v2, WAVE_POLE, Math.max(0, k))
    }

    // Head: look at the target, otherwise a gentle drift.
    const head = this.bones.get('Head')
    if (head) {
      let yaw = Math.sin(t * 0.37 + this.phase * 2) * 0.22 * still
      if (this.lookTarget) {
        const local = this.root.worldToLocal(_v.copy(this.lookTarget))
        yaw = Math.max(-1.0, Math.min(1.0, Math.atan2(local.x, local.z)))
      }
      this.headYaw += (yaw - this.headYaw) * Math.min(1, dt * 3)
      if (Math.abs(this.headYaw) > 1e-3) {
        // Turn about the character's up axis, whatever the bone's local axes are.
        head.getWorldQuaternion(_q)
        this.root.getWorldQuaternion(_q2)
        const upW = _v.copy(_up).applyQuaternion(_q2)
        _q.premultiply(new Quaternion().setFromAxisAngle(upW, this.headYaw))
        head.parent!.getWorldQuaternion(_q2)
        head.quaternion.copy(_q2.invert().multiply(_q))
        head.updateMatrixWorld(true)
      }
    }
  }

  /**
   * Long skirts: the front / back panels hinge at the hips with the leg that is
   * furthest forward / back, so a striding shin never pokes through the cloth.
   * (Same rule as drive_skirt in scripts/blender/build_avatar.py.)
   */
  private driveSkirt(): void {
    const sf = this.bones.get('skirt_f')
    const sb = this.bones.get('skirt_b')
    if (!sf || !sb) return
    this.root.getWorldQuaternion(_q2)
    const fwd = _fwd.set(0, 0, 1).applyQuaternion(_q2)
    const down = _down.set(0, -1, 0).applyQuaternion(_q2)
    let front = 0
    let back = 0
    for (const sd of ['l', 'r']) {
      const th = this.bones.get(`thigh_${sd}`)
      const ca = this.bones.get(`calf_${sd}`)
      if (!th || !ca) continue
      ca.getWorldPosition(_v).sub(th.getWorldPosition(_v2))
      const a = Math.atan2(_v.dot(fwd), _v.dot(down))
      front = Math.max(front, a)
      back = Math.min(back, a)
    }
    // Rotating "down" towards "forward" is a turn about down × forward.
    const axis = _axis.crossVectors(down, fwd).normalize()
    for (const [bone, angle] of [
      [sf, front * SKIRT_FRONT],
      [sb, back * SKIRT_BACK],
    ] as const) {
      // No clip animates them: start from the rest pose, then swing in world space.
      bone.quaternion.copy(this.skirtRest.get(bone)!)
      bone.updateMatrixWorld(true)
      bone.getWorldQuaternion(_q)
      _q.premultiply(_q3.setFromAxisAngle(axis, angle))
      bone.parent!.getWorldQuaternion(_q4)
      bone.quaternion.copy(_q4.invert().multiply(_q))
      bone.updateMatrixWorld(true)
    }
  }

  /** Rotate each upper arm towards the body about the character's forward axis. */
  private tuckArms(): void {
    this.root.getWorldQuaternion(_q2)
    const fwd = _v.set(0, 0, 1).applyQuaternion(_q2)
    for (const [side, sign] of [['l', -1], ['r', 1]] as const) {
      const up = this.bones.get(`upperarm_${side}`)
      if (!up) continue
      up.getWorldQuaternion(_q)
      _q.premultiply(new Quaternion().setFromAxisAngle(fwd, sign * ARM_TUCK))
      up.parent!.getWorldQuaternion(_q2)
      up.quaternion.copy(_q2.invert().multiply(_q))
      up.updateMatrixWorld(true)
      this.root.getWorldQuaternion(_q2)
    }
  }

  /** Two-bone IK of one arm onto a hand target given in skeleton space. */
  private reach(side: 'l' | 'r', target: Vector3, pole: Vector3, weight: number): void {
    const up = this.bones.get(`upperarm_${side}`)
    const lo = this.bones.get(`lowerarm_${side}`)
    const hand = this.bones.get(`hand_${side}`)
    if (!up || !lo || !hand || !this.mesh) return
    const mw = this.mesh.matrixWorld
    twoBoneIK(up, lo, hand, _v.copy(target).applyMatrix4(mw), _v2.copy(pole).applyMatrix4(mw), weight)
  }

  /** Attach a prop (e.g. a shopping bag) to the right hand, hanging below it. */
  holdInRightHand(obj: Object3D): void {
    const hand = this.bones.get('hand_r')
    if (!hand) {
      obj.position.set(-0.3, 0.75, 0)
      this.root.add(obj)
      return
    }
    this.root.updateMatrixWorld(true)
    // Desired world transform: upright (character's yaw), just below the hand.
    hand.getWorldPosition(_v)
    this.root.getWorldQuaternion(_q)
    const s = this.root.getWorldScale(_v2).x
    _v.y -= 0.02 * s
    _m.compose(_v, _q, _v2.setScalar(s))
    _m.premultiply(new Matrix4().copy(hand.matrixWorld).invert())
    _m.decompose(obj.position, obj.quaternion, obj.scale)
    hand.add(obj)
  }

  /** Recolour the outfit (e.g. to match the featured product). */
  setOutfitColors(top: string | null, bottom: string | null): void {
    const pal = this.mat?.userData.palette
    if (!pal) return
    if (top) {
      pal[PARTS.indexOf('top')].set(top)
      if (this.look.head.kind === 'hair') pal[PARTS.indexOf('hijab')].set(top)
    }
    if (bottom) pal[PARTS.indexOf('bottom')].set(bottom)
    if (top || bottom) this.colorVersion++
  }

  /** Colour each part shows from afar (a worn fabric's average, else the palette). */
  private readonly lodColor = new Map<number, Color>()

  /**
   * Wear a fabric texture on a garment part (virtual try-on), or go back to the
   * plain colour with null. The fabric's average colour stands in for distant LODs.
   */
  wearFabric(part: FabricPart, fabric: { texture: Texture; avg: string } | null): void {
    const u = this.mat?.userData
    if (!u) return
    const idx = PARTS.indexOf(part)
    const axis = part === 'top' ? 'x' : part === 'bottom' ? 'y' : 'z'
    if (fabric) {
      u.fabrics[part].value = fabric.texture
      u.fabricOn.value[axis] = 1
      u.palette[idx].set('#ffffff')
      this.lodColor.set(idx, new Color(fabric.avg))
    } else {
      u.fabricOn.value[axis] = 0
      u.palette[idx].set(lookColors(this.look)[part])
      this.lodColor.delete(idx)
    }
    this.colorVersion++
  }

  wave(): void {
    this.waving = 2.2
  }

  /**
   * The whole character in its standing pose as one static, vertex-coloured mesh
   * (root space) for distant LODs; legs and arms carry `aSwing` pivots so the LOD
   * walk shader can swing them.
   */
  lodGeometry(): BufferGeometry | null {
    const mesh = this.mesh
    const kitGeo = mesh?.geometry
    if (!mesh || !kitGeo || !this.mat) return null
    // Pose the rig standing still (then restore the walk blend).
    const walk = this.walk
    const wave = this.waving
    this.walk = 0
    this.waving = 0
    this.pose(0, this.time)
    this.walk = walk
    this.waving = wave
    this.root.updateMatrixWorld(true)

    const pos = kitGeo.attributes.position
    const nrm = kitGeo.attributes.normal
    const part = kitGeo.attributes.part
    const skinIndex = kitGeo.attributes.skinIndex
    const skinWeight = kitGeo.attributes.skinWeight
    const n = pos.count
    const out = new Float32Array(n * 3)
    const outN = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const swing = new Float32Array(n * 4)
    const pal = this.mat.userData.palette
    const skeleton = mesh.skeleton
    const bones = skeleton.bones
    // Bone matrices of THIS pose (the renderer refreshes them only when it draws).
    skeleton.update()
    const bm = skeleton.boneMatrices
    if (!bm) return null
    // Per bone: vertex (bind space) -> root space, all in one matrix.
    const toRoot = new Matrix4().copy(this.root.matrixWorld).invert().multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse)
    const boneM = bones.map((_, j) => new Matrix4().fromArray(bm, j * 16).premultiply(toRoot).multiply(mesh.bindMatrix).elements)
    // Limb of each bone (for the LOD walk swing).
    const rootInv = new Matrix4().copy(this.root.matrixWorld).invert()
    const pivot = (name: string) => {
      const b = this.bones.get(name)
      return b ? b.getWorldPosition(new Vector3()).applyMatrix4(rootInv) : new Vector3()
    }
    const modest = this.look.outfit !== 'pants'
    const limbs: { re: RegExp; p: Vector3; amp: number }[] = [
      { re: /^(thigh|calf|foot|ball)_l/, p: pivot('thigh_l'), amp: modest ? 0.32 : 0.55 },
      { re: /^(thigh|calf|foot|ball)_r/, p: pivot('thigh_r'), amp: modest ? -0.32 : -0.55 },
      { re: /^(upperarm|lowerarm|hand)_l/, p: pivot('upperarm_l'), amp: -0.4 },
      { re: /^(upperarm|lowerarm|hand)_r/, p: pivot('upperarm_r'), amp: 0.4 },
    ]
    const boneLimb = bones.map((b) => limbs.find((l) => l.re.test(b.name)) ?? null)
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const nx = nrm.getX(i)
      const ny = nrm.getY(i)
      const nz = nrm.getZ(i)
      let px = 0
      let py = 0
      let pz = 0
      let qx = 0
      let qy = 0
      let qz = 0
      let best = 0
      let bw = -1
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k)
        if (w <= 0) continue
        const j = skinIndex.getComponent(i, k)
        const e = boneM[j]
        px += w * (e[0] * x + e[4] * y + e[8] * z + e[12])
        py += w * (e[1] * x + e[5] * y + e[9] * z + e[13])
        pz += w * (e[2] * x + e[6] * y + e[10] * z + e[14])
        qx += w * (e[0] * nx + e[4] * ny + e[8] * nz)
        qy += w * (e[1] * nx + e[5] * ny + e[9] * nz)
        qz += w * (e[2] * nx + e[6] * ny + e[10] * nz)
        if (w > bw) {
          bw = w
          best = j
        }
      }
      out[i * 3] = px
      out[i * 3 + 1] = py
      out[i * 3 + 2] = pz
      const ql = Math.hypot(qx, qy, qz) || 1
      outN[i * 3] = qx / ql
      outN[i * 3 + 1] = qy / ql
      outN[i * 3 + 2] = qz / ql
      const pi = Math.round(part.getX(i))
      const c = this.lodColor.get(pi) ?? pal[pi]
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
      const limb = boneLimb[best]
      if (limb) {
        swing[i * 4] = limb.p.x
        swing[i * 4 + 1] = limb.p.y
        swing[i * 4 + 2] = limb.p.z
        swing[i * 4 + 3] = limb.amp
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(out, 3))
    g.setAttribute('color', new BufferAttribute(col, 3))
    g.setAttribute('normal', new BufferAttribute(outN, 3))
    g.setAttribute('aSwing', new BufferAttribute(swing, 4))
    if (kitGeo.index) g.setIndex(kitGeo.index.clone())
    return g
  }

  /** Invisible capsule-ish proxy used for interaction raycasts (cheaper than the body meshes). */
  readonly hitbox: Object3D = (() => {
    const m = new Mesh(HITBOX, HIDDEN)
    m.position.y = 0.9
    return m
  })()
}
