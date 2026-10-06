// Ties engine, world, player, interaction and UI state together and runs the loop.

import { Mesh, MeshBasicMaterial, Raycaster, RingGeometry, Timer, Vector2, Vector3 } from 'three'
import type { Engine } from './engine/renderer'
import { FpsGovernor, QUALITY_ORDER, RES_SCALE_MIN, resolutionStep, type QualityLevel } from './engine/quality'
import { TextureWarmer } from './engine/textureWarmer'
import { withinGate } from './engine/hysteresis'
import type { CollisionWorld } from './engine/colliders'
import { rectContains, shopArrival, shopZone, type MallLayout } from './config/layout'
import { Input, type Action } from './player/input'
import { TouchControls } from './player/touch'
import { Player } from './player/player'
import { floorPoint, shouldRender } from './player/controlsMath'
import { onBackButton, setHaptics } from './platform/native'
import { Interaction } from './interact/interaction'
import { Character, type Persona } from './actors/character'
import { avatarLook } from './actors/palette'
import { audio } from './audio/audio'
import { store, watch } from './state/store'
import { t } from './i18n/i18n'
import type { GameBridge } from './ui/dom'
import type { ShellHandles } from './world/mall'
import { ActorLods } from './world/actorLod'

export interface Actor {
  character: Persona
  /** Called when the player is near (greetings etc.). */
  onNear?: (dist: number) => void
  /** Extra gate for the full rig (e.g. the shop interior is culled). */
  visibleIf?: () => boolean
  /** Extra gate for the far static LOD (e.g. the player is inside another shop). */
  lodIf?: () => boolean
}

/** Placed characters (staff, models) switch from their static LOD to the full rig here. */
const ACTOR_RIG_DISTANCE: Record<QualityLevel, number> = { low: 10, medium: 14, high: 18 }

export class Game implements GameBridge {
  readonly isTouch: boolean
  readonly layout: MallLayout
  readonly engine: Engine
  readonly colliders: CollisionWorld
  readonly input: Input
  readonly player = new Player()
  readonly interaction = new Interaction()
  readonly actors: Actor[] = []
  /** Static LODs of every placed character (one draw call), built once they all exist. */
  private actorLods: ActorLods | null = null
  readonly updaters: ((dt: number, t: number) => void)[] = []
  shell!: ShellHandles

  private readonly timer = new Timer()
  private time = 0
  private frame = 0
  private stepAcc = 0
  private readonly fade: HTMLDivElement
  private readonly governor: FpsGovernor
  private readonly warmer: TextureWarmer
  private touch: TouchControls | null = null
  /** Tap-to-walk target marker: a plum ring on the floor that fades on arrival. */
  private readonly marker: Mesh<RingGeometry, MeshBasicMaterial>
  private markerFade = 0
  private readonly tapRay = new Raycaster()

  constructor(engine: Engine, layout: MallLayout, colliders: CollisionWorld, uiRoot: HTMLElement, isTouch: boolean) {
    this.engine = engine
    this.layout = layout
    this.colliders = colliders
    this.isTouch = isTouch
    this.input = new Input(engine.renderer.domElement)
    if (isTouch) {
      this.touch = new TouchControls(engine.renderer.domElement, this.input, uiRoot)
      this.touch.setVisible(false)
    }
    this.fade = document.createElement('div')
    Object.assign(this.fade.style, {
      position: 'fixed',
      inset: '0',
      background: '#fbf6f8',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity .22s ease',
      zIndex: '5',
    })
    document.body.appendChild(this.fade)

    this.governor = new FpsGovernor(() => this.autoDowngrade())
    this.governor.onWindow = (fps) => this.tuneResolution(fps)
    this.warmer = new TextureWarmer(engine.renderer, engine.scene)

    // Third-person avatar
    const avatar = new Character(avatarLook(), 3)
    avatar.root.visible = false
    engine.scene.add(avatar.root)
    this.player.avatar = avatar

    const { spawn } = layout
    this.player.teleport(spawn.x, spawn.z, spawn.yaw)

    this.marker = new Mesh(
      new RingGeometry(0.2, 0.28, 40),
      new MeshBasicMaterial({ color: 0x5b2b82, transparent: true, opacity: 0, depthWrite: false }),
    )
    this.marker.rotation.x = -Math.PI / 2
    this.marker.renderOrder = 2
    this.marker.visible = false
    engine.scene.add(this.marker)
    this.player.onWalkEnd = () => (this.markerFade = 1)
    // Opening a product eases the view to centre it behind the sheet.
    this.interaction.onActivate = (_it, point) => {
      if (store.getState().overlay === 'product') this.player.focusOn(point)
    }

    this.input.onAction = (a) => this.onAction(a)
    this.input.onLockChange = () => this.syncControl()
    watch((s) => s.overlay, (o, prev) => {
      if (o && !prev) this.input.releaseLock()
      if (!o && prev && store.getState().phase === 'playing') this.relock()
      this.syncControl()
    })
    watch((s) => s.phase, () => this.syncControl())
    watch((s) => s.view, (v) => (this.player.view = v))
    watch((s) => s.sprint, (on) => (this.input.sprint = on))
    watch((s) => s.sensitivity, (v) => this.touch && (this.touch.sensitivity = v))
    watch((s) => s.haptics, (on) => setHaptics(on))
    // Android back: close the open overlay, else open the menu, else leave the app.
    onBackButton(() => {
      const s = store.getState()
      if (s.phase !== 'playing') return false
      if (s.overlay === 'menu') return false
      if (s.overlay) this.resume()
      else s.set({ overlay: 'menu' })
      return true
    })
    watch((s) => s.music, (m) => audio.setMusic(m))
    watch((s) => s.sound, (m) => audio.setSfx(m))
    watch((s) => s.lang, () => this.interaction.refresh())
    watch((s) => s.quality, (q) => {
      if (q !== 'auto') this.applyQuality(q)
    }, false)
    document.addEventListener('visibilitychange', () => audio.suspend(document.hidden))
    window.addEventListener('lv:leave', () => this.leave())
    watch((s) => s.phase, (ph) => {
      if (ph === 'exited') this.input.releaseLock()
    }, false)
  }

  // ------------------------------------------------------------ control

  private syncControl(): void {
    const s = store.getState()
    const playing = s.phase === 'playing'
    const needsLock = playing && !this.isTouch && !this.input.dragLook
    const paused = playing && !s.overlay && needsLock && !this.input.locked
    if (paused !== s.paused) s.set({ paused })
    this.input.enabled = playing && !s.overlay && !paused
    this.touch?.setVisible(playing && !s.overlay)
    if (!this.input.enabled) this.input.keys.clear()
  }

  private relock(): void {
    if (this.isTouch || this.input.dragLook) return
    this.input.requestLock()
    // Lock requests can fail (e.g. right after Esc) — fall back to the pause veil.
    setTimeout(() => this.syncControl(), 350)
  }

  private onAction(a: Action): void {
    const s = store.getState()
    if (s.phase !== 'playing') return
    switch (a) {
      case 'escape':
        if (s.overlay) this.resume()
        break
      case 'interact':
        if (!s.overlay) this.interact()
        break
      case 'cart':
        s.set({ overlay: s.overlay === 'cart' ? null : s.overlay ? s.overlay : 'cart' })
        audio.click()
        break
      case 'menu':
        s.set({ overlay: s.overlay === 'menu' ? null : s.overlay ? s.overlay : 'menu' })
        audio.click()
        break
      case 'map':
        s.set({ minimap: !s.minimap })
        break
      case 'view':
        s.set({ view: s.view === 'first' ? 'third' : 'first' })
        break
    }
  }

  // ---------------------------------------------------------- GameBridge

  enterMall(): void {
    audio.unlock()
    audio.setMusic(store.getState().music)
    audio.setSfx(store.getState().sound)
    store.getState().set({ phase: 'playing', overlay: null })
    this.relock()
  }

  resume(): void {
    const s = store.getState()
    if (s.overlay) s.set({ overlay: null, productId: null })
    else this.relock()
    this.syncControl()
  }

  interact(): void {
    if (store.getState().overlay) return
    this.interaction.trigger()
  }

  teleport(target: string): void {
    const { layout } = this
    let dest = { x: layout.spawn.x, z: layout.spawn.z, yaw: layout.spawn.yaw }
    if (target === 'cashier') dest = { ...layout.cashier.arrival }
    if (target === 'exit') dest = { ...layout.exit.arrival }
    const shop = layout.shops.find((s) => shopZone(s) === target)
    if (shop) dest = shopArrival(shop)
    this.fade.style.opacity = '1'
    setTimeout(() => {
      this.player.teleport(dest.x, dest.z, dest.yaw)
      this.fade.style.opacity = '0'
    }, 230)
    store.getState().set({ overlay: null, productId: null })
  }

  restart(): void {
    const { spawn } = this.layout
    this.player.teleport(spawn.x, spawn.z - 1.5, spawn.yaw)
    this.shell.doors.target = 0
    this.leaving = false
    store.getState().set({ phase: 'playing', overlay: null, lastOrder: null })
    this.relock()
  }

  // ------------------------------------------------------- cashier / exit

  private atCounter = false
  private atDoor = false
  private leaving = false

  openCheckout(): void {
    const s = store.getState()
    if (!s.cart.length) {
      s.showBubble(t('cashierEmpty', s.lang))
      audio.greet()
      return
    }
    audio.click()
    s.set({ overlay: 'checkout' })
  }

  /** Walking into the doors (or pressing E on them). */
  tryLeave(): void {
    const s = store.getState()
    if (s.cart.length && !s.lastOrder) {
      s.set({ overlay: 'leave' })
      return
    }
    this.leave()
  }

  leave(): void {
    if (this.leaving) return
    this.leaving = true
    this.shell.doors.target = 1
    audio.door()
    this.input.releaseLock()
    setTimeout(() => {
      this.fade.style.opacity = '1'
      setTimeout(() => {
        store.getState().set({ phase: 'exited', overlay: null })
        this.fade.style.opacity = '0'
      }, 450)
    }, 650)
  }

  private checkTriggers(): void {
    const s = store.getState()
    if (s.phase !== 'playing' || s.overlay) return
    const { x, z } = this.player.pos
    const { cashier, exit } = this.layout
    // Customer side of the counter: auto-open checkout once per approach.
    const near = rectContains(cashier.approach, x, z)
    if (near && !this.atCounter && s.cart.length) this.openCheckout()
    this.atCounter = near
    // Doors open as you approach; stepping into the exit zone leaves.
    this.shell.doors.target = rectContains(exit.doors, x, z) || this.leaving ? 1 : 0
    const atDoor = rectContains(exit.zone, x, z)
    if (atDoor && !this.atDoor) this.tryLeave()
    this.atDoor = atDoor
  }

  playerPose(): { x: number; z: number; yaw: number } {
    return { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw }
  }

  // -------------------------------------------------------------- quality

  /** Call once every placed character exists (end of the mall build). */
  buildActorLods(): void {
    if (this.actorLods || !this.actors.length) return
    this.actorLods = new ActorLods(this.engine.scene, this.actors.map((a) => a.character))
  }

  applyQuality(level: QualityLevel): void {
    this.engine.setQuality(level)
    this.shell.setQuality(this.engine.quality)
    store.getState().set({ activeQuality: level })
  }

  private resStreak = 0

  /** Dynamic resolution on phones (auto quality): trade pixels for frame rate before dropping a tier. */
  private tuneResolution(fps: number): void {
    const s = store.getState()
    if (!this.isTouch || s.quality !== 'auto' || s.phase !== 'playing' || document.hidden) return
    const r = resolutionStep(this.engine.resolutionScale, fps, s.fpsCap || 60, this.resStreak)
    this.resStreak = r.streak
    this.engine.setResolutionScale(r.scale)
  }

  private autoDowngrade(): boolean {
    if (store.getState().quality !== 'auto') return false
    // Phones shed resolution first; a tier only drops once that has bottomed out.
    if (this.isTouch && this.engine.resolutionScale > RES_SCALE_MIN) return false
    const i = QUALITY_ORDER.indexOf(this.engine.quality.level)
    if (i <= 0) return false
    this.applyQuality(QUALITY_ORDER[i - 1])
    console.info(`[quality] auto-downgraded to ${QUALITY_ORDER[i - 1]} (${this.governor.fps.toFixed(0)} fps)`)
    return true
  }

  // ----------------------------------------------------------------- loop

  zoneAt(x: number, z: number): string {
    for (const s of this.layout.shops) {
      if (rectContains(s.rect, x, z)) return shopZone(s)
    }
    for (const w of this.layout.wings) if (rectContains(w.rect, x, z)) return `wing-${w.id}`
    for (const zn of this.layout.zones ?? []) if (rectContains(zn.rect, x, z)) return zn.id
    if (rectContains(this.layout.cashier.zone, x, z)) return 'cashier'
    if (rectContains(this.layout.atrium, x, z)) return 'atrium'
    return 'boulevard'
  }

  start(): void {
    this.timer.connect(document)
    let last = -1e9
    const loop = (ts: number) => {
      requestAnimationFrame(loop)
      if (!shouldRender(ts, last, store.getState().fpsCap)) return
      last = ts
      this.timer.update(ts)
      this.tick()
    }
    requestAnimationFrame(loop)
  }

  /** Walk to the floor point under a screen position, if it's in reach and not behind a wall. */
  tapWalk(x: number, y: number): boolean {
    this.tapRay.setFromCamera(_ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.engine.camera)
    const { origin, direction } = this.tapRay.ray
    const hit = floorPoint(origin, direction)
    if (!hit) return false
    if (this.colliders.raycast(origin, direction, hit.dist) < hit.dist - 0.05) return false
    this.player.walkTo(hit.x, hit.z)
    this.marker.position.set(hit.x, 0.05, hit.z)
    this.marker.visible = true
    this.marker.material.opacity = 0.9
    this.markerFade = 0
    return true
  }

  private updateMarker(dt: number, t: number): void {
    const m = this.marker
    if (!m.visible) return
    if (this.player.walk) {
      m.scale.setScalar(1 + Math.sin(t * 6) * 0.08)
      return
    }
    // Walk over: fade out (and grow slightly).
    this.markerFade = Math.max(0, this.markerFade - dt / 0.45)
    m.material.opacity = 0.9 * this.markerFade
    m.scale.setScalar(1 + (1 - this.markerFade) * 0.5)
    if (this.markerFade <= 0) m.visible = false
  }

  private tick(): void {
    const dt = Math.min(this.timer.getDelta(), 1 / 20)
    this.time += dt
    this.frame++
    const t = this.time
    const s = store.getState()
    const active = this.input.enabled
    const p = this.player

    p.update(dt, this.input, this.colliders, active)
    p.applyCamera(this.engine.camera, this.colliders, dt)

    if (this.frame % 8 === 0 && s.phase === 'playing') {
      const zone = this.zoneAt(p.pos.x, p.pos.z)
      if (zone !== s.zone) s.set({ zone })
    }

    this.checkTriggers()
    this.shell.update(p.pos.x, p.pos.z)
    this.shell.doors.update(dt)
    for (const fn of this.updaters) fn(dt, t)

    // Characters: full rigs near; beyond that a static LOD (one draw call for all of
    // them) that stays drawn far out and does not depend on the interior culling.
    const q = this.engine.quality
    const maxD = q.characterDistance
    const lodD = Math.max(q.crowdLodDistance, maxD)
    const rigD = ACTOR_RIG_DISTANCE[q.level]
    const head = _v.set(p.pos.x, 1.6, p.pos.z)
    const lods = this.actorLods
    lods?.begin()
    for (const a of this.actors) {
      const c = a.character
      const r = c.root
      const d = Math.hypot(r.position.x - p.pos.x, r.position.z - p.pos.z)
      const hasLod = !!lods && lods.has(c)
      const rig = withinGate(r.visible, d, hasLod ? rigD : maxD, 2) && (a.visibleIf?.() ?? true)
      if (hasLod) lods!.show(c, !rig && withinGate(lods!.shown(c), d, lodD, 4) && (a.lodIf?.() ?? true))
      r.visible = rig
      if (!rig) continue
      c.lookTarget = d < 5 ? head : null
      c.update(dt, t)
      a.onNear?.(d)
    }
    lods?.end()
    if (p.view === 'third' && p.avatar) p.avatar.update(dt, t)

    // Interaction: crosshair hover + taps.
    if (s.phase === 'playing') {
      this.interaction.update(this.engine.camera, p.pos, this.colliders, active, this.isTouch)
      const tap = this.input.tap
      if (tap) {
        this.input.tap = null
        if (active && !this.interaction.tapAt(tap.x, tap.y, this.engine.camera, p.pos, this.colliders)) {
          // Nothing to interact with: tap-to-walk (touch, or click in drag-look mode).
          if (this.isTouch || !this.input.locked) this.tapWalk(tap.x, tap.y)
        }
      }
    }
    this.updateMarker(dt, t)

    // Footsteps
    if (p.speed > 0.8 && active) {
      this.stepAcc += dt * p.speed
      if (this.stepAcc > 1.55) {
        this.stepAcc = 0
        audio.step()
      }
    }

    this.warmer.update(performance.now())
    this.engine.render()
    this.governor.tick(dt)
    if (this.frame % 30 === 0) {
      const c = this.engine.frameCalls()
      const calls = c.post ? `${c.total} calls (${c.post} post)` : `${c.total} calls`
      window.dispatchEvent(new CustomEvent('lv:fps', { detail: `${this.governor.fps.toFixed(0)} fps · ${calls} · ${this.engine.quality.level}` }))
    }
  }
}

const _v = new Vector3()
const _ndc = new Vector2()
