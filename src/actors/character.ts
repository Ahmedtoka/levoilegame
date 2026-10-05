// Stylized low-poly character built from primitives on a tiny rig of
// Groups (hips, spine, neck, head, arms, legs). Faces +Z. One base body,
// varied by outfit silhouette, colours, hijab/hair style, vest and pose.

import {
  BufferAttribute,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  type Object3D,
  type Texture,
  type Material,
  type Color,
  Color as ThreeColor,
  Matrix4,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildHair, buildHijab, fabric, type HairStyle, type HijabStyle } from './hijab'
import { bakeVertexColors } from './bake'
import type { OutfitStyle } from '../config/sections'
import { blobShadow } from '../world/props'
import { imageMat } from '../world/materials'

export type Pose = 'idle' | 'handOnHip' | 'model' | 'clasped' | 'relaxed'

/** What the game needs from any character. */
export interface Persona {
  readonly root: Group
  readonly hitbox: Object3D
  lookTarget: Vector3 | null
  walk: number
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
  top: string
  bottom: string
  outfit: OutfitStyle
  shoes: string
  head: { kind: 'hijab'; color: string; style: HijabStyle; accent?: string } | { kind: 'hair'; color: string; style: HairStyle }
  vest?: { color: string; logo: Texture | null }
  pose: Pose
  height?: number
}

const lathe = (pts: [number, number][], seg = 22, phiStart = 0, phiLen = Math.PI * 2) =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    seg,
    phiStart,
    phiLen,
  )

// Shared geometries — spine-local unless noted (spine origin = waist, y 0.95).
const G = {
  torso: lathe([
    [0.001, 0.0],
    [0.15, 0.0],
    [0.145, 0.12],
    [0.162, 0.28],
    [0.17, 0.36],
    [0.15, 0.43],
    [0.06, 0.47],
    [0.001, 0.47],
  ]),
  abaya: lathe([
    [0.31, -0.93],
    [0.275, -0.6],
    [0.215, -0.22],
    [0.17, 0.02],
    [0.162, 0.2],
    [0.175, 0.34],
    [0.152, 0.43],
    [0.06, 0.47],
    [0.001, 0.47],
  ]),
  skirt: lathe([
    [0.32, -0.9],
    [0.27, -0.5],
    [0.185, -0.08],
    [0.152, 0.03],
    [0.001, 0.03],
  ]),
  vest: lathe(
    [
      [0.158, -0.02],
      [0.168, 0.14],
      [0.18, 0.29],
      [0.186, 0.36],
      [0.162, 0.43],
      [0.1, 0.465],
    ],
    20,
    0.32,
    Math.PI * 2 - 0.64,
  ),
  leg: new CapsuleGeometry(0.068, 0.72, 4, 10),
  /** Wide-leg trousers: flared cylinder per leg. */
  wideLeg: new CylinderGeometry(0.078, 0.112, 0.84, 12, 1),
  upperArm: new CapsuleGeometry(0.046, 0.22, 4, 8),
  foreArm: new CapsuleGeometry(0.04, 0.2, 4, 8),
  hand: new SphereGeometry(0.042, 10, 8),
  neck: new CylinderGeometry(0.045, 0.05, 0.12, 10),
  head: new SphereGeometry(0.105, 20, 16),
  eye: new SphereGeometry(0.0115, 8, 6),
  glint: new SphereGeometry(0.0038, 6, 4),
  brow: new CapsuleGeometry(0.0052, 0.026, 2, 6),
  nose: new SphereGeometry(0.011, 8, 6),
  lips: new SphereGeometry(0.016, 10, 6),
  cheek: new SphereGeometry(0.017, 10, 6),
  shoe: new SphereGeometry(0.06, 10, 6),
  logo: new PlaneGeometry(0.1, 0.026),
}

const skinCache = new Map<string, MeshStandardMaterial>()
function skinMat(c: string): MeshStandardMaterial {
  let m = skinCache.get(c)
  if (!m) skinCache.set(c, (m = new MeshStandardMaterial({ color: c, roughness: 0.62 })))
  return m
}
const HITBOX = new CylinderGeometry(0.34, 0.34, 1.8, 8)
const HIDDEN = new MeshBasicMaterial({ visible: false })
const EYE_MAT = new MeshStandardMaterial({ color: '#2a1d22', roughness: 0.3 })
const GLINT_MAT = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 })
const LIPS_MAT = new MeshStandardMaterial({ color: '#c4707a', roughness: 0.5 })

/** Cached plain colour material (merged into the vertex-coloured mesh by bake.ts). */
const tintCache = new Map<string, MeshStandardMaterial>()
function tint(c: string): MeshStandardMaterial {
  let m = tintCache.get(c)
  if (!m) tintCache.set(c, (m = new MeshStandardMaterial({ color: c, roughness: 0.7 })))
  return m
}
/** Skin shade mixed towards a colour (soft blush, nose shading). */
function shade(skin: string, toward: string, k: number): string {
  return `#${new ThreeColor(skin).lerp(new ThreeColor(toward), k).getHexString()}`
}

interface Arm {
  shoulder: Group
  elbow: Group
}

/**
 * The only character factory. Characters are procedural: clothing is part of the
 * same merged mesh as the body, so a character can never render without clothes.
 *
 * MODESTY RULE (no exceptions): every character is fully and modestly dressed —
 * abaya / long dress, or long sleeves with a long skirt or wide trousers. Only the
 * face and hands are skin; legs and neck are always covered. Most wear hijab.
 */
export function createCharacter(look: Look, seed: number): Character {
  return new Character(look, seed)
}

export class Character implements Persona {
  readonly root = new Group()
  readonly look: Look
  /** 0..1 blend of the walk cycle (avatar only). */
  walk = 0
  walkRate = 0
  /** World point the head should turn towards (players nearby), or null. */
  lookTarget: Vector3 | null = null
  waving = 0

  private readonly body = new Group()
  private readonly hips = new Group()
  private readonly spine = new Group()
  private readonly head = new Group()
  private readonly legs: Group[] = []
  private readonly armL: Arm
  private readonly armR: Arm
  private readonly topMat: MeshStandardMaterial
  private readonly bottomMat: MeshStandardMaterial
  private readonly phase: number
  walkPhase = 0
  colorVersion = 0
  private headYaw = 0
  private readonly base: Record<string, number> = {}
  private readonly recolor: (source: Material, color: Color) => void

  constructor(look: Look, seed = Math.random() * 100) {
    this.look = look
    this.phase = seed
    // Never render while being assembled; shown only once fully dressed and merged.
    this.root.visible = false
    const s = look.height ?? 1
    this.root.scale.setScalar(s)
    this.topMat = new MeshStandardMaterial({ color: look.top, roughness: 0.88 })
    this.bottomMat = new MeshStandardMaterial({ color: look.bottom, roughness: 0.88 })
    const skin = skinMat(look.skin)

    this.root.add(this.body)
    this.hips.position.y = 0.95
    this.spine.position.y = 0.95
    this.body.add(this.hips, this.spine)

    // Legs (always present so the avatar can walk). Always clothed: wide trousers
    // for 'pants', otherwise the bottoms colour under the long hem — never skin.
    const wide = look.outfit === 'pants'
    for (const side of [1, -1]) {
      const pivot = new Group()
      pivot.position.set(0.085 * side, 0, 0)
      const leg = new Mesh(wide ? G.wideLeg : G.leg, this.bottomMat)
      leg.position.y = wide ? -0.46 : -0.43
      const shoe = new Mesh(G.shoe, fabric(look.shoes, 0.5))
      shoe.scale.set(0.9, 0.55, 1.5)
      shoe.position.set(0, -0.9, 0.035)
      pivot.add(leg, shoe)
      this.hips.add(pivot)
      this.legs.push(pivot)
    }

    if (look.outfit === 'abaya') {
      this.spine.add(this.mesh(G.abaya, this.topMat, 0.78))
    } else {
      this.spine.add(this.mesh(G.torso, this.topMat, 0.74))
      if (look.outfit === 'skirt') this.hips.add(this.mesh(G.skirt, this.bottomMat, 0.8))
    }

    if (look.vest) {
      const vest = this.mesh(G.vest, fabric(look.vest.color, 0.7), 0.78)
      this.spine.add(vest)
      if (look.vest.logo) {
        const logo = new Mesh(G.logo, imageMat(look.vest.logo, { transparent: true }))
        logo.position.set(0.085, 0.33, 0.138)
        logo.rotation.y = 0.42
        this.spine.add(logo)
      }
    }

    // Neck + head. The neck is a turtleneck in the top colour (hijab drapes cover it too).
    const neck = new Mesh(G.neck, this.topMat)
    neck.position.y = 0.52
    this.spine.add(neck)
    this.head.position.y = 0.6
    this.spine.add(this.head)
    const headMesh = new Mesh(G.head, skin)
    headMesh.scale.set(0.92, 1.12, 1)
    headMesh.position.y = 0.04
    this.head.add(headMesh)
    this.face(skin.color.getHexString(), look.head.kind === 'hair' ? look.head.color : '#4a3428')

    const wear =
      look.head.kind === 'hijab' ? buildHijab(look.head.color, look.head.style, look.head.accent) : buildHair(look.head.color, look.head.style)
    // Headwear meshes go straight onto the head / spine bones so they merge into
    // those bones' meshes (2 fewer draw calls per character).
    for (const m of [...wear.cap.children]) {
      m.position.y += 0.04
      this.head.add(m)
    }
    for (const m of [...wear.drape.children]) {
      m.position.y += 0.46
      this.spine.add(m)
    }

    // Arms (sleeves in the top colour, hands in skin)
    this.armL = this.arm(1, this.topMat, skin)
    this.armR = this.arm(-1, this.topMat, skin)

    this.root.add(blobShadow(0.9, 0.9, 0.9), this.hitbox)
    this.recolor = bakeVertexColors(this.root, (m) => m === this.hitbox)
    this.applyPose()
    this.root.traverse((o) => {
      o.matrixAutoUpdate = true
    })
    // Fully built: clothing and body are one merged mesh per bone now.
    this.root.visible = true
  }

  /** Friendly stylised face: big soft eyes with a glint, soft brows, small nose, lips and blush. */
  private face(skinHex: string, browColor: string): void {
    const skin = `#${skinHex}`
    const add = (geo: SphereGeometry | CapsuleGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) => {
      const m = new Mesh(geo, mat)
      m.position.set(x, y, z)
      m.scale.set(sx, sy, sz)
      m.rotation.z = rz
      this.head.add(m)
    }
    const brow = tint(browColor)
    const blush = tint(shade(skin, '#ec7f98', 0.42))
    for (const sx of [-1, 1]) {
      add(G.eye, EYE_MAT, 0.036 * sx, 0.048, 0.094, 1.05, 0.95, 0.6)
      add(G.glint, GLINT_MAT, 0.036 * sx + 0.004, 0.053, 0.1, 1, 1, 0.6)
      add(G.brow, brow, 0.037 * sx, 0.074, 0.095, 1, 1, 0.5, Math.PI / 2 - sx * 0.12)
      add(G.cheek, blush, 0.057 * sx, 0.022, 0.081, 1, 0.66, 0.35)
    }
    add(G.nose, tint(shade(skin, '#8a5a48', 0.12)), 0, 0.03, 0.103, 0.75, 1, 0.6)
    add(G.lips, LIPS_MAT, 0, 0.004, 0.097, 1.1, 0.42, 0.5)
  }

  private mesh(geo: LatheGeometry, mat: MeshStandardMaterial, zScale: number): Mesh {
    const m = new Mesh(geo, mat)
    m.scale.z = zScale
    return m
  }

  private arm(side: number, sleeve: MeshStandardMaterial, skin: MeshStandardMaterial): Arm {
    const shoulder = new Group()
    shoulder.position.set(0.19 * side, 0.42, 0)
    const upper = new Mesh(G.upperArm, sleeve)
    upper.position.y = -0.14
    const elbow = new Group()
    elbow.position.y = -0.29
    const fore = new Mesh(G.foreArm, sleeve)
    fore.position.y = -0.12
    const hand = new Mesh(G.hand, skin)
    hand.scale.set(0.8, 1.1, 0.6)
    hand.position.y = -0.27
    elbow.add(fore, hand)
    shoulder.add(upper, elbow)
    this.spine.add(shoulder)
    return { shoulder, elbow }
  }

  private applyPose(): void {
    const b = this.base
    const set = (k: string, v: number) => (b[k] = v)
    // defaults: relaxed arms
    set('lz', 0.1)
    set('lx', 0)
    set('lez', 0)
    set('lex', -0.15)
    set('rz', -0.1)
    set('rx', 0)
    set('rez', 0)
    set('rex', -0.15)
    set('hipZ', 0)
    set('headZ', 0)
    set('bodyX', 0)
    switch (this.look.pose) {
      case 'handOnHip':
        set('lz', 0.62)
        set('lx', 0.12)
        set('lez', -1.95)
        set('lex', 0)
        set('hipZ', 0.04)
        set('headZ', 0.05)
        break
      case 'model':
        set('rz', -0.62)
        set('rx', 0.12)
        set('rez', 1.95)
        set('rex', 0)
        set('lz', 0.16)
        set('lex', -0.35)
        set('hipZ', -0.06)
        set('headZ', -0.08)
        set('bodyX', 0.03)
        break
      case 'clasped':
        set('lz', 0.05)
        set('lx', -0.28)
        set('lez', -0.55)
        set('lex', -1.05)
        set('rz', -0.05)
        set('rx', -0.28)
        set('rez', 0.55)
        set('rex', -1.05)
        break
      case 'relaxed':
        set('lz', 0.14)
        set('rz', -0.08)
        set('rex', -0.5)
        set('headZ', 0.04)
        break
    }
  }

  /** Attach a prop (e.g. a shopping bag) to the right hand. */
  holdInRightHand(obj: Object3D): void {
    obj.position.set(0, -0.32, 0)
    this.armR.elbow.add(obj)
  }

  /**
   * Single static mesh of the whole character in its rest pose (vertex colours),
   * for distant crowd LOD: one geometry, drawn in one batched call.
   */
  lodGeometry(): BufferGeometry | null {
    const walk = this.walk
    this.walk = 0
    this.update(0, 0)
    this.walk = walk
    this.root.updateMatrixWorld(true)
    const inv = new Matrix4().copy(this.root.matrixWorld).invert()
    // Limbs that swing in the walk cycle: pivot (root space) and signed swing amplitude,
    // matching update(): legs ±0.55 rad, arms ∓0.4 rad about X at the hip / shoulder.
    const limbs: [Object3D, number][] = [
      [this.legs[0], 0.55],
      [this.legs[1], -0.55],
      [this.armL.shoulder, -0.4],
      [this.armR.shoulder, 0.4],
    ]
    const pivots = limbs.map(([o]) => new Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv))
    const geos: BufferGeometry[] = []
    this.root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh || o === this.hitbox) return
      const mat = m.material as MeshStandardMaterial
      if (!mat.vertexColors) return
      const g = m.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(inv, m.matrixWorld))
      let limb = -1
      for (let p: Object3D | null = o; p && p !== this.root && limb < 0; p = p.parent) limb = limbs.findIndex(([l]) => l === p)
      const swing = new Float32Array(g.attributes.position.count * 4)
      if (limb >= 0) {
        const pv = pivots[limb]
        for (let i = 0; i < swing.length; i += 4) {
          swing[i] = pv.x
          swing[i + 1] = pv.y
          swing[i + 2] = pv.z
          swing[i + 3] = limbs[limb][1]
        }
      }
      g.setAttribute('aSwing', new BufferAttribute(swing, 4))
      geos.push(g)
    })
    return geos.length ? mergeGeometries(geos, false) : null
  }

  stepWalk(dt: number): void {
    if (this.walk > 0.01) this.walkPhase += dt * (4 + this.walkRate * 1.6)
  }

  /** Recolour the outfit (e.g. to match the featured product). */
  setOutfitColors(top: string | null, bottom: string | null): void {
    if (top) this.recolor(this.topMat, this.topMat.color.set(top))
    if (bottom) this.recolor(this.bottomMat, this.bottomMat.color.set(bottom))
    if (top || bottom) this.colorVersion++
  }

  wave(): void {
    this.waving = 2.2
  }

  update(dt: number, t: number): void {
    const b = this.base
    const ph = this.phase
    const w = this.walk

    // Breathing + idle sway
    const breathe = Math.sin(t * 1.7 + ph) * 0.008
    this.spine.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe)
    const sway = Math.sin(t * 0.6 + ph) * 0.025 * (1 - w)
    this.body.rotation.z = b.hipZ + sway * 0.5
    this.body.position.x = b.bodyX + sway * 0.06
    this.spine.rotation.z = -sway * 0.6

    // Walk cycle
    this.stepWalk(dt)
    const swing = Math.sin(this.walkPhase) * 0.55 * w
    this.legs[0].rotation.x = swing
    this.legs[1].rotation.x = -swing
    this.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.035 * w

    const armSwing = Math.sin(this.walkPhase) * 0.4 * w
    this.armL.shoulder.rotation.set(b.lx - armSwing, 0, b.lz)
    this.armL.elbow.rotation.set(b.lex - w * 0.25, 0, b.lez)
    this.armR.shoulder.rotation.set(b.rx + armSwing, 0, b.rz)
    this.armR.elbow.rotation.set(b.rex - w * 0.25, 0, b.rez)

    // Greeting wave (right arm)
    if (this.waving > 0) {
      this.waving -= dt
      const k = Math.min(1, this.waving * 2, (2.2 - this.waving) * 3)
      this.armR.shoulder.rotation.z = b.rz + (-2.5 - b.rz) * k
      this.armR.shoulder.rotation.x = b.rx * (1 - k)
      this.armR.elbow.rotation.z = (b.rez + Math.sin(t * 9) * 0.35 - 0.3) * k + b.rez * (1 - k)
      this.armR.elbow.rotation.x = b.rex * (1 - k)
    }

    // Head: look at target, otherwise drift
    let yaw = Math.sin(t * 0.37 + ph * 2) * 0.25
    if (this.lookTarget) {
      const local = this.root.worldToLocal(this.lookTarget.clone())
      yaw = Math.max(-1.0, Math.min(1.0, Math.atan2(local.x, local.z)))
    }
    this.headYaw += (yaw - this.headYaw) * Math.min(1, dt * 3)
    this.head.rotation.set(Math.sin(t * 0.5 + ph) * 0.03, this.headYaw, b.headZ)
  }

  /** Invisible capsule-ish proxy used for interaction raycasts (cheaper than the body meshes). */
  readonly hitbox: Object3D = (() => {
    const m = new Mesh(HITBOX, HIDDEN)
    m.position.y = 0.9
    return m
  })()
}
