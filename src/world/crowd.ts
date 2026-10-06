// The simulated mall crowd: renders and walks the shoppers that the presence
// source describes (browsing a shop, queueing at the cashier and leaving with
// a District 122 bag, playing at the wheel / treasure hunting, sitting with a
// stylist, friends standing together).
//
// Performance (50 shoppers would be ~600 draw calls as full rigs):
//  - only the K nearest shoppers are full animated rigs (~12 calls each);
//  - everyone else visible is a static LOD mesh in ONE BatchedMesh draw call,
//    plus one InstancedMesh for all their blob shadows;
//  - far rigs animate at a reduced rate; shoppers inside a culled shop interior,
//    or outside the shop the player is in, are not drawn at all.

import {
  BatchedMesh,
  BoxGeometry,
  Frustum,
  Sphere,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
  type Box3,
  type BufferGeometry,
  type Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BRAND } from '../config/brand'
import { rectContains, toWorld, type Wing } from '../config/layout'
import type { Game } from '../game'
import { Character } from '../actors/character'
import { encodeWalk, lodWalkMaterial } from '../actors/lodWalk'
import { customerLook, OUTFIT_PALETTE } from '../actors/palette'
import { blobShadowTexture } from '../engine/textures'
import { pickNearest, withinGate } from '../engine/hysteresis'
import { t } from '../i18n/i18n'
import { catalog, store } from '../state/store'
import type { PresenceMember, PresenceSource } from '../social/types'
import type { ShopHandles } from './shop'

type Pt = { x: number; z: number }
type Pose = Pt & { yaw: number }

export interface CrowdPlaces {
  /** Wheel of fortune centre (players stand around it). */
  wheel: Pt
  /** Customer pose at each styling-studio mirror. */
  studio: Pose[]
  /** Standing spots facing the stage screen. */
  stage: Pose[]
}

interface Agent {
  m: PresenceMember
  c: Character
  lod: number
  lodOk: boolean
  pos: Vector3
  yaw: number
  path: Pt[]
  face: number
  planKey: string
  zone: number
  stuck: number
  lastD: number
  animAcc: number
  bag: Object3D | null
  recolorT: number
  /** Drawn last frame (as a rig or an LOD instance) / as a full rig. */
  shown: boolean
  full: boolean
  /** Out of the door, waiting to come back in as a new shopper. */
  away: number
  dwell: number
  idx: number
}

const DOOR: Pt = { x: 0, z: -1.2 }
const R = 0.28
const _m = new Matrix4()
const _m2 = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _up = new Vector3(0, 1, 0)
const _shadowM = new Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.012, 0)

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export class Crowd {
  readonly agents: Agent[] = []
  /** Nearest browsing shopper in front of the player (drives the "what she's looking at" card). */
  focus: { pos: Vector3; productId: string } | null = null
  /** Called when a shopper arrives at the wheel (spins it). */
  onWheelPlay: (() => void) | null = null

  private readonly game: Game
  private readonly shops: ShopHandles[]
  private readonly presence: PresenceSource
  private readonly places: CrowdPlaces
  private readonly solid: Box3[]
  private readonly browse: Pose[][] = []
  private readonly hangouts: Pt[] = []
  private batch: BatchedMesh | null = null
  private shadows: InstancedMesh | null = null
  private frame = 0
  private queueT = 0
  private readonly queue: Agent[] = []
  private readonly bagGeo: BufferGeometry

  constructor(game: Game, shops: ShopHandles[], presence: PresenceSource, places: CrowdPlaces) {
    this.game = game
    this.shops = shops
    this.presence = presence
    this.places = places
    this.solid = game.colliders.boxes.filter((b) => b.max.y > 0.15 && b.min.y < 1.9)
    this.bagGeo = bagGeometry()
    this.buildSpots()
  }

  /** Builds every shopper (call once presence has started). */
  build(): void {
    const members = this.presence.members()
    const geos: (BufferGeometry | null)[] = []
    members.forEach((m, i) => {
      const c = new Character(customerLook(m.seed), m.seed)
      c.root.visible = false
      this.game.engine.scene.add(c.root)
      const a: Agent = {
        m,
        c,
        lod: -1,
        lodOk: true,
        pos: c.root.position,
        yaw: 0,
        path: [],
        face: 0,
        planKey: '',
        zone: -1,
        stuck: 0,
        lastD: 0,
        animAcc: 0,
        bag: null,
        recolorT: 3,
        shown: false,
        full: false,
        away: 0,
        dwell: 0,
        idx: i,
      }
      this.agents.push(a)
      geos.push(c.lodGeometry())
      this.registerInteraction(a)
    })

    // One batched draw call for every distant shopper.
    const valid = geos.filter((g): g is BufferGeometry => !!g)
    const verts = valid.reduce((n, g) => n + g.attributes.position.count, 0)
    const idx = valid.reduce((n, g) => n + (g.index?.count ?? 0), 0)
    if (valid.length) {
      const batch = new BatchedMesh(valid.length, verts, idx, lodWalkMaterial())
      // Visibility and the frustum test are done per shopper below; the instance
      // matrices also carry the walk phase (not affine), so three must not cull/sort.
      batch.frustumCulled = false
      batch.perObjectFrustumCulled = false
      batch.sortObjects = false
      geos.forEach((g, i) => {
        if (!g) return
        const gid = batch.addGeometry(g)
        const iid = batch.addInstance(gid)
        batch.setVisibleAt(iid, false)
        this.agents[i].lod = iid
      })
      this.game.engine.scene.add(batch)
      this.batch = batch
    }
    const shadowGeo = new PlaneGeometry(0.9, 0.9)
    const shadowMat = new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, opacity: 0.9, depthWrite: false })
    const shadows = new InstancedMesh(shadowGeo, shadowMat, this.agents.length)
    shadows.renderOrder = 1
    shadows.frustumCulled = false
    shadows.count = 0
    this.game.engine.scene.add(shadows)
    this.shadows = shadows

    // Start everyone already in place so the mall looks alive at once.
    for (const a of this.agents) {
      this.plan(a, true)
    }

    this.presence.subscribe((e) => {
      if (e.type === 'leave') {
        const a = this.agents.find((x) => x.m.id === e.member.id)
        if (a) a.m = { ...a.m, activity: 'leaving' }
      } else if (e.type === 'join') {
        // Recycle the agent of someone who left: she comes back in as a new shopper.
        const a = this.agents.find((x) => !this.presence.members().includes(x.m))
        if (a) a.m = e.member
      }
    })
  }

  // ------------------------------------------------------------- places

  private local(s: ShopHandles, x: number, z: number): Pt {
    const { yaw, entrance } = s.layout
    return { x: entrance.x + x * Math.cos(yaw) + z * Math.sin(yaw), z: entrance.z - x * Math.sin(yaw) + z * Math.cos(yaw) }
  }

  private blocked(x: number, z: number, r: number): boolean {
    for (const b of this.solid) if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true
    for (const c of this.game.colliders.circles) if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true
    return false
  }

  private clearLine(a: Pt, b: Pt, r: number): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.ceil(d / 0.3)
    for (let i = 1; i <= n; i++) {
      const k = i / n
      if (this.blocked(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, r)) return false
    }
    return true
  }

  private buildSpots(): void {
    for (const s of this.shops) {
      const { front, depth, openings } = s.layout
      const list: Pose[] = []
      const hx = front / 2 - 1.5
      for (let lz = -2.4; lz >= -(depth - 2.5); lz -= 1.5)
        for (let lx = -hx; lx <= hx + 1e-6; lx += 1.5) {
          const p = this.local(s, lx, lz)
          // Walk in through the nearest opening.
          const door = openings.length ? openings.reduce((a, o) => (Math.abs(o.cx - lx) < Math.abs(a.cx - lx) ? o : a)) : null
          const inner = this.local(s, door?.cx ?? 0, -1.6)
          if (this.blocked(p.x, p.z, 0.45) || !this.clearLine(inner, p, 0.3)) continue
          const toBack = depth + lz
          const toSide = front / 2 - Math.abs(lx)
          const localYaw = toSide < toBack ? (lx < 0 ? -Math.PI / 2 : Math.PI / 2) : Math.PI
          list.push({ ...p, yaw: s.layout.yaw + localYaw })
        }
      this.browse.push(list)
    }
    const L = this.game.layout
    for (let z = -4; z >= -L.atrium.z1 + L.atrium.z0 + 3; z -= 2.5)
      for (let x = L.atrium.x0 + 4; x <= L.atrium.x1 - 4; x += 3) {
        if (Math.abs(x) < 3.5 && z > -6) continue
        if (rectContains(L.cashier.zone, x, z)) continue
        if (!this.blocked(x, z, 0.9)) this.hangouts.push({ x, z })
      }
    // Along every wing corridor.
    for (const w of L.wings)
      for (let d = 6; d < w.len - 3; d += 6)
        for (const lx of [-3, 3]) {
          const p = toWorld(w.origin, w.yaw, lx, -d)
          if (!this.blocked(p.x, p.z, 0.9)) this.hangouts.push(p)
        }
  }

  private shopIndexAt(x: number, z: number): number {
    return this.shops.findIndex((s) => rectContains(s.layout.rect, x, z))
  }

  // -------------------------------------------------------------- planning

  private target(a: Agent): { to: Pose; key: string } | null {
    const m = a.m
    const L = this.game.layout
    switch (m.activity) {
      case 'leaving':
        return { to: { ...DOOR, yaw: 0 }, key: 'leave' }
      case 'buying': {
        const k = Math.max(0, this.queue.indexOf(a))
        const ax = L.cashier.arrival.x + 0.6
        const az = L.cashier.arrival.z - 1.4
        return { to: { x: ax - k * 0.85, z: az, yaw: Math.PI / 2 }, key: `buy${k}` }
      }
      case 'styling': {
        const p = this.places.studio[m.spot % Math.max(1, this.places.studio.length)]
        return p ? { to: p, key: `sty${m.spot}` } : null
      }
      case 'watching': {
        const p = this.places.stage[m.spot % Math.max(1, this.places.stage.length)]
        return p ? { to: p, key: `watch${m.spot}` } : null
      }
      case 'playing': {
        if (m.spot === 0) {
          const ang = hash(m.id) * Math.PI * 2
          const w = this.places.wheel
          const to = { x: w.x + Math.cos(ang) * 1.5, z: w.z + Math.sin(ang) * 1.5 }
          return { to: { ...to, yaw: Math.atan2(w.x - to.x, w.z - to.z) }, key: 'wheel' }
        }
        // Treasure hunter: wander between hangouts.
        const i = Math.floor(hash(m.id + a.dwell.toFixed(0)) * this.hangouts.length)
        const h = this.hangouts[i] ?? DOOR
        return { to: { ...h, yaw: hash(m.id) * 6.28 }, key: `hunt${i}` }
      }
      case 'browsing':
      case 'friends': {
        if (m.groupId && !m.sectionId) {
          // Friends chatting in the atrium / boulevard, in a small circle.
          const centre = this.hangouts[m.spot % Math.max(1, this.hangouts.length)] ?? DOOR
          const mates = this.agents.filter((x) => x.m.groupId === m.groupId)
          const k = mates.indexOf(a)
          const ang = (k / Math.max(2, mates.length)) * Math.PI * 2 + 0.6
          const to = { x: centre.x + Math.cos(ang) * 0.55, z: centre.z + Math.sin(ang) * 0.55 }
          return { to: { ...to, yaw: Math.atan2(centre.x - to.x, centre.z - to.z) }, key: `hang${m.spot}` }
        }
        const si = this.shops.findIndex((s) => s.layout.section?.id === m.sectionId)
        const spots = this.browse[si] ?? []
        if (si < 0 || !spots.length) return null
        if (m.groupId) {
          const centre = spots[Math.floor(hash(m.groupId + m.sectionId) * spots.length)]
          const mates = this.agents.filter((x) => x.m.groupId === m.groupId)
          const k = mates.indexOf(a)
          const ang = (k / Math.max(2, mates.length)) * Math.PI * 2 + 0.6
          const to = { x: centre.x + Math.cos(ang) * 0.55, z: centre.z + Math.sin(ang) * 0.55 }
          return { to: { ...to, yaw: Math.atan2(centre.x - to.x, centre.z - to.z) }, key: `fr${m.sectionId}` }
        }
        const pick = Math.floor(hash(m.id + (m.productId ?? '')) * spots.length)
        return { to: spots[pick], key: `br${m.sectionId}${pick}` }
      }
    }
  }

  private wingAt(x: number, z: number): Wing | null {
    return this.game.layout.wings.find((w) => rectContains(w.rect, x, z)) ?? null
  }

  /** Wing of a point: its corridor, or the wing of the shop it's in. */
  private wingOf(p: Pt): Wing | null {
    const si = this.shopIndexAt(p.x, p.z)
    const id = si >= 0 ? this.shops[si].layout.wing : null
    return id ? (this.game.layout.wings.find((w) => w.id === id) ?? null) : this.wingAt(p.x, p.z)
  }

  /** Waypoints: out of the shop → along the wing → across the plaza → into the other wing → into the shop. */
  private route(from: Pt, to: Pt): Pt[] {
    const pts: Pt[] = []
    const fs = this.shopIndexAt(from.x, from.z)
    const ts = this.shopIndexAt(to.x, to.z)
    if (fs >= 0 && fs !== ts) pts.push(this.local(this.shops[fs], 0, -1.6), this.local(this.shops[fs], 0, 1.8))
    const fw = this.wingOf(from)
    const tw = this.wingOf(to)
    if (fw !== tw) {
      if (fw) pts.push(toWorld(fw.origin, fw.yaw, 0, -1.5), toWorld(fw.origin, fw.yaw, 0, 2))
      if (tw) pts.push(toWorld(tw.origin, tw.yaw, 0, 2), toWorld(tw.origin, tw.yaw, 0, -1.5))
    }
    if (ts >= 0 && ts !== fs) pts.push(this.local(this.shops[ts], 0, 1.8), this.local(this.shops[ts], 0, -1.6))
    pts.push(to)
    // Detour around the plaza stage for any blocked plaza-to-plaza leg.
    const at = this.game.layout.atrium
    const inPlaza = (p: Pt) => p.x > at.x0 && p.x < at.x1 && p.z > at.z0 && p.z < at.z1
    const out: Pt[] = []
    let prev = from
    for (const p of pts) {
      if (inPlaza(prev) && inPlaza(p) && !this.clearLine(prev, p, 0.3)) {
        const s = p.x < 0 ? -1 : 1
        const d1 = { x: s * 7.5, z: -17 }
        const d2 = { x: s * 7.5, z: -26 }
        out.push(...(prev.z >= p.z ? [d1, d2] : [d2, d1]))
      }
      out.push(p)
      prev = p
    }
    return out
  }

  private plan(a: Agent, teleport = false): void {
    const tg = this.target(a)
    if (!tg) return
    a.planKey = tg.key
    a.face = tg.to.yaw
    if (teleport) {
      a.pos.set(tg.to.x, 0, tg.to.z)
      a.yaw = tg.to.yaw
      a.path = []
    } else a.path = this.route({ x: a.pos.x, z: a.pos.z }, tg.to)
    a.stuck = 0
    a.lastD = Infinity
  }

  // ---------------------------------------------------------- interaction

  private registerInteraction(a: Agent): void {
    this.game.interaction.add({
      object: a.c.hitbox,
      kind: 'customer',
      enabled: () => !!this.viewing(a) && a.c.root.visible,
      label: () => {
        const p = catalog().byId.get(this.viewing(a) ?? '')
        return `${t('seeWhatShesViewing', store.getState().lang)} · ${p?.title ?? ''}`
      },
      onInteract: () => {
        const id = this.viewing(a)
        if (id) store.getState().openProduct(id)
      },
      maxDist: 3.6,
    })
  }

  /** Product a shopper is looking at, once she stands at her spot. */
  private viewing(a: Agent): string | null {
    const m = a.m
    if ((m.activity !== 'browsing' && m.activity !== 'friends') || a.path.length || !m.productId) return null
    return m.productId
  }

  // ---------------------------------------------------------------- update

  update(dt: number, time: number): void {
    if (!this.batch) return
    this.frame++
    const g = this.game
    const P = g.player.pos
    const q = g.engine.quality
    const tier = q.level
    const fullMax = tier === 'high' ? 8 : tier === 'medium' ? 6 : 4
    const fullDist = tier === 'high' ? 11 : tier === 'medium' ? 9 : 7
    const cam = g.engine.camera
    // The camera was moved this frame but its matrices update only at render: refresh them,
    // or shoppers at the screen edge appear a frame late when turning.
    cam.updateMatrixWorld()
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    _frustum.setFromProjectionMatrix(_pv)
    // Static LOD instances are one draw call for everyone, so they stay drawn far into
    // the fog instead of popping out at the full-rig distance (characterDistance).
    const maxD = Math.max(q.crowdLodDistance, q.characterDistance)

    // Cashier queue order: longest wait first.
    if ((this.queueT -= dt) <= 0) {
      this.queueT = 1
      this.queue.length = 0
      this.queue.push(...this.agents.filter((a) => a.m.activity === 'buying' && !a.away).sort((x, y) => y.m.since - x.m.since))
    }

    const playerShop = this.shopIndexAt(P.x, P.z)
    const vis: { a: Agent; d: number }[] = []
    for (const a of this.agents) {
      this.simulate(a, dt)
      a.zone = this.shopIndexAt(a.pos.x, a.pos.z)
      const d = Math.hypot(a.pos.x - P.x, a.pos.z - P.z)
      let show = !a.away && withinGate(a.shown, d, maxD, 4)
      // Shoppers in a shop stay drawn (as LODs) while its opening can be seen, independent
      // of the interior-detail culling; not from inside another shop (that shop's seenFrom).
      if (show && a.zone >= 0 && !this.shops[a.zone].seenFrom) show = false
      // Inside a shop you only see that shop's shoppers (plus the mall through its door).
      if (show && playerShop >= 0 && a.zone >= 0 && a.zone !== playerShop) show = false
      // Off-screen shoppers neither render nor take a full-rig slot.
      if (show && !_frustum.intersectsSphere(_sphere.set(_v.set(a.pos.x, 0.95, a.pos.z), 1.35))) show = false
      a.shown = show
      if (show) vis.push({ a, d })
      else {
        a.full = false
        a.c.root.visible = false
        if (a.lod >= 0) this.batch.setVisibleAt(a.lod, false)
      }
    }
    // Nearest few get full rigs; the ones that have one keep it until clearly further than a newcomer.
    const fullPick = pickNearest(
      vis.map((v) => v.d),
      vis.map((v) => v.a.full),
      fullMax,
      fullDist,
      1.5,
    )

    const shadows = this.shadows!
    let si = 0
    let focus: Crowd['focus'] = null
    let focusD = 4.2
    vis.forEach(({ a, d }, i) => {
      const full = fullPick[i] || !a.lodOk || a.lod < 0
      a.c.root.rotation.y = a.yaw
      if (full) {
        const fresh = !a.full
        a.full = true
        a.c.root.visible = true
        if (a.lod >= 0) this.batch!.setVisibleAt(a.lod, false)
        // The walk blend and phase are kept up while drawn as an LOD too, so a rig
        // taking over continues the same stride.
        this.blendWalk(a, dt)
        a.c.lookTarget = d < 4 ? _head.set(P.x, 1.6, P.z) : null
        // Every drawn rig animates every frame: the skinned characters are cheap, and a
        // third-rate update read as stutter. Rigs past 14 m update every other frame.
        a.animAcc += dt
        if (fresh || d < 14 || this.frame % 2 === a.idx % 2) {
          a.c.update(fresh ? dt : a.animAcc, time)
          a.animAcc = 0
        }
      } else {
        a.full = false
        a.c.root.visible = false
        // The LOD walks in the vertex shader (same stride, bob and swing as the rig).
        this.blendWalk(a, dt)
        a.c.stepWalk(dt)
        _q.setFromAxisAngle(_up, a.yaw)
        _s.setScalar(a.c.root.scale.x)
        _m.compose(_v.set(a.pos.x, 0, a.pos.z), _q, _s)
        _m2.copy(_m).multiply(_shadowM)
        shadows.setMatrixAt(si++, _m2)
        this.batch!.setMatrixAt(a.lod, encodeWalk(_m, a.c.walkPhase, a.c.walk))
        this.batch!.setVisibleAt(a.lod, true)
      }
      const vp = this.viewing(a)
      if (vp && d < focusD) {
        focusD = d
        focus = { pos: new Vector3(a.pos.x, 2.15 * a.c.root.scale.y, a.pos.z), productId: vp }
      }
    })
    shadows.count = si
    shadows.instanceMatrix.needsUpdate = true
    this.focus = focus
  }

  /** Eases the walk blend towards walking / standing (rig and LOD alike). */
  private blendWalk(a: Agent, dt: number): void {
    const walking = a.path.length ? 1 : 0
    a.c.walk += (walking - a.c.walk) * Math.min(1, dt * 6)
    // Ground speed (matches simulate()), so the walk clip keeps pace with no foot sliding.
    a.c.walkRate = (a.m.rushing ? 2.6 : 1.15) * (0.9 + (a.idx % 5) * 0.05)
  }

  private simulate(a: Agent, dt: number): void {
    if (a.away > 0) {
      a.away -= dt
      if (a.away <= 0) {
        // Comes in through the doors as a new shopper.
        a.pos.set(DOOR.x + (Math.random() - 0.5), 0, DOOR.z - 0.5)
        a.yaw = Math.PI
        this.dropBag(a)
        a.planKey = ''
      }
      return
    }
    const m = a.m
    if (m.activity === 'leaving' && !a.bag) this.giveBag(a)
    const tg = this.target(a)
    if (tg && tg.key !== a.planKey) {
      if (m.activity === 'playing' && m.spot === 1 && a.path.length === 0) a.dwell += 1
      this.plan(a)
    }

    if (a.path.length) {
      const p = a.path[0]
      const dx = p.x - a.pos.x
      const dz = p.z - a.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.22) {
        a.path.shift()
        if (!a.path.length) this.arrived(a)
      } else {
        const speed = (m.rushing ? 2.6 : 1.15) * (0.9 + (a.idx % 5) * 0.05)
        const step = Math.min(d, speed * dt)
        a.pos.x += (dx / d) * step
        a.pos.z += (dz / d) * step
        if (a.path.length > 1 || d > 0.6) this.game.colliders.resolveCircle(a.pos, R)
        this.turn(a, Math.atan2(dx, dz), dt * 7)
        // Stuck behind something: skip the waypoint (or give up on it).
        if (d < a.lastD - 0.02) {
          a.lastD = d
          a.stuck = 0
        } else if ((a.stuck += dt) > 1.6) {
          a.path.shift()
          a.stuck = 0
          a.lastD = Infinity
          if (!a.path.length) this.arrived(a)
        }
      }
      // Keep a little distance from the player.
      const P = this.game.player.pos
      const px = a.pos.x - P.x
      const pz = a.pos.z - P.z
      const pd = Math.hypot(px, pz)
      if (pd < 0.6 && pd > 1e-3) {
        a.pos.x += (px / pd) * (0.6 - pd)
        a.pos.z += (pz / pd) * (0.6 - pd)
      }
    } else {
      this.turn(a, a.face, dt * 3)
      if (m.activity === 'leaving' && Math.hypot(a.pos.x - DOOR.x, a.pos.z - DOOR.z) < 0.5) {
        a.away = 3 + Math.random() * 4
        a.planKey = ''
      }
      if (m.activity === 'styling' && (a.recolorT -= dt) <= 0) {
        // The stylist tries another outfit colour every few seconds.
        a.recolorT = 3.5 + Math.random() * 2.5
        a.lodOk = false
        const top = OUTFIT_PALETTE[Math.floor(Math.random() * OUTFIT_PALETTE.length)]
        a.c.setOutfitColors(top, a.c.look.outfit === 'abaya' ? top : OUTFIT_PALETTE[Math.floor(Math.random() * OUTFIT_PALETTE.length)])
      }
    }
    if (m.activity !== 'styling' && !a.lodOk) {
      a.c.setOutfitColors(a.c.look.top, a.c.look.bottom)
      a.lodOk = true
    }
  }

  private arrived(a: Agent): void {
    if (a.m.activity === 'playing' && a.m.spot === 0) this.onWheelPlay?.()
    if (a.m.activity === 'playing' && a.m.spot === 1) a.dwell += 1
  }

  private turn(a: Agent, to: number, k: number): void {
    let d = to - a.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    a.yaw += d * Math.min(1, k)
  }

  private giveBag(a: Agent): void {
    const bag = new Mesh(this.bagGeo, BAG_MAT)
    a.c.holdInRightHand(bag)
    a.bag = bag
  }

  private dropBag(a: Agent): void {
    a.bag?.removeFromParent()
    a.bag = null
  }

  /** Counts for the HUD/perf report. */
  stats(): { full: number; lod: number } {
    let full = 0
    for (const a of this.agents) if (a.c.root.visible) full++
    return { full, lod: this.shadows?.count ?? 0 }
  }
}

const _v = new Vector3()
const _head = new Vector3()
const _pv = new Matrix4()
const _frustum = new Frustum()
const _sphere = new Sphere()
const BAG_MAT = new MeshStandardMaterial({ color: BRAND.magenta, roughness: 0.6 })

/** District 122 shopping bag: box + handle, one geometry (hangs below the hand). */
function bagGeometry(): BufferGeometry {
  const box = new BoxGeometry(0.26, 0.3, 0.1).translate(0, -0.2, 0)
  const handle = new TorusGeometry(0.06, 0.008, 4, 12, Math.PI).translate(0, -0.05, 0)
  return mergeTwo(box, handle)
}

function mergeTwo(a: BufferGeometry, b: BufferGeometry): BufferGeometry {
  for (const geo of [a, b]) geo.deleteAttribute('uv')
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()])!
}
