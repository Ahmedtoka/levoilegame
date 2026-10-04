// The simulated mall crowd: renders and walks the shoppers that the presence
// source describes (browsing a shop, queueing at the cashier and leaving with
// a 122 Mall bag, playing at the wheel / treasure hunting, sitting with a
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
  DoubleSide,
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
import { customerLook, OUTFIT_PALETTE } from '../actors/palette'
import { blobShadowTexture } from '../engine/textures'
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
  /** Out of the door, waiting to come back in as a new shopper. */
  away: number
  dwell: number
  idx: number
}

const DOOR: Pt = { x: 0, z: -1.2 }
const R = 0.28
const _m = new Matrix4()
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
      const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: DoubleSide })
      const batch = new BatchedMesh(valid.length, verts, idx, mat)
      batch.frustumCulled = false
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
      const inner = this.local(s, 0, -1.6)
      const list: Pose[] = []
      for (let lz = -2.4; lz >= -11.5; lz -= 1.5)
        for (let lx = -4.5; lx <= 4.5; lx += 1.5) {
          const p = this.local(s, lx, lz)
          if (this.blocked(p.x, p.z, 0.45) || !this.clearLine(inner, p, 0.3)) continue
          // Face the nearest wall display (back or side walls), in shop-local terms.
          const toBack = 14 + lz
          const toSide = 6 - Math.abs(lx)
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
    return pts
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
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    _frustum.setFromProjectionMatrix(_pv)
    const maxD = q.characterDistance

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
      let show = !a.away && d < maxD
      if (show && a.zone >= 0 && !this.shops[a.zone].interiorVisible) show = false
      if (show && playerShop >= 0 && a.zone !== playerShop && d > 9) show = false
      // Off-screen shoppers neither render nor take a full-rig slot.
      if (show && !_frustum.intersectsSphere(_sphere.set(_v.set(a.pos.x, 0.9, a.pos.z), 1.1))) show = false
      if (show) vis.push({ a, d })
      else {
        a.c.root.visible = false
        if (a.lod >= 0) this.batch.setVisibleAt(a.lod, false)
      }
    }
    vis.sort((x, y) => x.d - y.d)

    const shadows = this.shadows!
    let si = 0
    let focus: Crowd['focus'] = null
    let focusD = 4.2
    vis.forEach(({ a, d }, rank) => {
      const full = (rank < fullMax && d < fullDist) || !a.lodOk || a.lod < 0
      a.c.root.rotation.y = a.yaw
      if (full) {
        a.c.root.visible = true
        if (a.lod >= 0) this.batch!.setVisibleAt(a.lod, false)
        a.c.walk += ((a.path.length ? 1 : 0) - a.c.walk) * Math.min(1, dt * 6)
        a.c.walkRate = a.m.rushing ? 2.5 : 0.6
        a.c.lookTarget = d < 4 ? _head.set(P.x, 1.6, P.z) : null
        // Distant rigs animate at a third of the rate.
        a.animAcc += dt
        if (d < 8 || this.frame % 3 === a.idx % 3) {
          a.c.update(a.animAcc, time)
          a.animAcc = 0
        }
      } else {
        a.c.root.visible = false
        const bob = a.path.length ? Math.abs(Math.sin(time * 8 + a.idx)) * 0.03 : 0
        _q.setFromAxisAngle(_up, a.yaw)
        _s.setScalar(a.c.root.scale.x)
        _m.compose(_v.set(a.pos.x, bob, a.pos.z), _q, _s)
        this.batch!.setMatrixAt(a.lod, _m)
        this.batch!.setVisibleAt(a.lod, true)
        _m.multiply(_shadowM)
        shadows.setMatrixAt(si++, _m)
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

/** 122 Mall shopping bag: box + handle, one geometry (hangs below the hand). */
function bagGeometry(): BufferGeometry {
  const box = new BoxGeometry(0.26, 0.3, 0.1).translate(0, -0.2, 0)
  const handle = new TorusGeometry(0.06, 0.008, 4, 12, Math.PI).translate(0, -0.05, 0)
  return mergeTwo(box, handle)
}

function mergeTwo(a: BufferGeometry, b: BufferGeometry): BufferGeometry {
  for (const geo of [a, b]) geo.deleteAttribute('uv')
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()])!
}
