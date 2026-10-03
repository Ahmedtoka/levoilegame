// Stylized low-poly character built from primitives on a tiny rig of
// Groups (hips, spine, neck, head, arms, legs). Faces +Z. One base body,
// varied by outfit silhouette, colours, hijab/hair style, vest and pose.

import {
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
} from 'three'
import { buildHair, buildHijab, fabric, type HairStyle, type HijabStyle } from './hijab'
import { bakeVertexColors } from './bake'
import type { OutfitStyle } from '../config/sections'
import { blobShadow } from '../world/props'
import { imageMat } from '../world/materials'

export type Pose = 'idle' | 'handOnHip' | 'model' | 'clasped' | 'relaxed'

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
  upperArm: new CapsuleGeometry(0.046, 0.22, 4, 8),
  foreArm: new CapsuleGeometry(0.04, 0.2, 4, 8),
  hand: new SphereGeometry(0.042, 10, 8),
  neck: new CylinderGeometry(0.045, 0.05, 0.12, 10),
  head: new SphereGeometry(0.105, 20, 16),
  eye: new SphereGeometry(0.0115, 8, 6),
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

interface Arm {
  shoulder: Group
  elbow: Group
}

export class Character {
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
  private walkPhase = 0
  private headYaw = 0
  private readonly base: Record<string, number> = {}
  private readonly recolor: (source: Material, color: Color) => void

  constructor(look: Look, seed = Math.random() * 100) {
    this.look = look
    this.phase = seed
    const s = look.height ?? 1
    this.root.scale.setScalar(s)
    this.topMat = new MeshStandardMaterial({ color: look.top, roughness: 0.88 })
    this.bottomMat = new MeshStandardMaterial({ color: look.bottom, roughness: 0.88 })
    const skin = skinMat(look.skin)

    this.root.add(this.body)
    this.hips.position.y = 0.95
    this.spine.position.y = 0.95
    this.body.add(this.hips, this.spine)

    // Legs (always present so the avatar can walk; hidden under long hems).
    for (const side of [1, -1]) {
      const pivot = new Group()
      pivot.position.set(0.085 * side, 0, 0)
      const leg = new Mesh(G.leg, look.outfit === 'pants' ? this.bottomMat : skin)
      leg.position.y = -0.43
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

    // Neck + head
    const neck = new Mesh(G.neck, skin)
    neck.position.y = 0.52
    this.spine.add(neck)
    this.head.position.y = 0.6
    this.spine.add(this.head)
    const headMesh = new Mesh(G.head, skin)
    headMesh.scale.set(0.92, 1.12, 1)
    headMesh.position.y = 0.04
    this.head.add(headMesh)
    for (const sx of [-1, 1]) {
      const eye = new Mesh(G.eye, EYE_MAT)
      eye.position.set(0.036 * sx, 0.05, 0.094)
      eye.scale.set(1, 0.75, 0.6)
      this.head.add(eye)
    }

    const wear =
      look.head.kind === 'hijab' ? buildHijab(look.head.color, look.head.style, look.head.accent) : buildHair(look.head.color, look.head.style)
    wear.cap.position.y = 0.04
    this.head.add(wear.cap)
    wear.drape.position.y = 0.46
    this.spine.add(wear.drape)

    // Arms (sleeves in the top colour, hands in skin)
    this.armL = this.arm(1, this.topMat, skin)
    this.armR = this.arm(-1, this.topMat, skin)

    this.root.add(blobShadow(0.9, 0.9, 0.9), this.hitbox)
    this.recolor = bakeVertexColors(this.root, (m) => m === this.hitbox)
    this.applyPose()
    this.root.traverse((o) => {
      o.matrixAutoUpdate = true
    })
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

  /** Recolour the outfit (e.g. to match the featured product). */
  setOutfitColors(top: string | null, bottom: string | null): void {
    if (top) this.recolor(this.topMat, this.topMat.color.set(top))
    if (bottom) this.recolor(this.bottomMat, this.bottomMat.color.set(bottom))
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
    if (w > 0.01) this.walkPhase += dt * (4 + this.walkRate * 1.6)
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
