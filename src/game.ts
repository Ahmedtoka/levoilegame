// Ties engine, world, player, interaction and UI state together and runs the loop.

import { Timer, Vector3 } from 'three'
import type { Engine } from './engine/renderer'
import { FpsGovernor, QUALITY_ORDER, type QualityLevel } from './engine/quality'
import type { CollisionWorld } from './engine/colliders'
import { rectContains, shopArrival, type MallLayout } from './config/layout'
import { Input, type Action } from './player/input'
import { TouchControls } from './player/touch'
import { Player } from './player/player'
import { Interaction } from './interact/interaction'
import { Character } from './actors/character'
import { avatarLook } from './actors/palette'
import { audio } from './audio/audio'
import { store, watch } from './state/store'
import { t } from './i18n/i18n'
import type { GameBridge } from './ui/dom'
import type { ShellHandles } from './world/mall'

export interface Actor {
  character: Character
  /** Called when the player is near (greetings etc.). */
  onNear?: (dist: number) => void
  /** Extra visibility gate (e.g. the shop interior is culled). */
  visibleIf?: () => boolean
}

export class Game implements GameBridge {
  readonly isTouch: boolean
  readonly layout: MallLayout
  readonly engine: Engine
  readonly colliders: CollisionWorld
  readonly input: Input
  readonly player = new Player()
  readonly interaction = new Interaction()
  readonly actors: Actor[] = []
  readonly updaters: ((dt: number, t: number) => void)[] = []
  shell!: ShellHandles

  private readonly timer = new Timer()
  private time = 0
  private frame = 0
  private stepAcc = 0
  private readonly fade: HTMLDivElement
  private readonly governor: FpsGovernor
  private touch: TouchControls | null = null

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

    // Third-person avatar
    const avatar = new Character(avatarLook(), 3)
    avatar.root.visible = false
    engine.scene.add(avatar.root)
    this.player.avatar = avatar

    const { spawn } = layout
    this.player.teleport(spawn.x, spawn.z, spawn.yaw)

    this.input.onAction = (a) => this.onAction(a)
    this.input.onLockChange = () => this.syncControl()
    watch((s) => s.overlay, (o, prev) => {
      if (o && !prev) this.input.releaseLock()
      if (!o && prev && store.getState().phase === 'playing') this.relock()
      this.syncControl()
    })
    watch((s) => s.phase, () => this.syncControl())
    watch((s) => s.view, (v) => (this.player.view = v))
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
    if (target === 'cashier') dest = { x: layout.cashier.x - 2.4, z: layout.cashier.z, yaw: -Math.PI / 2 }
    if (target === 'exit') dest = { x: 0, z: -4.5, yaw: Math.PI }
    const shop = layout.shops.find((s) => s.section?.id === target || (target === 'lounge' && s.kind === 'lounge'))
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
    const c = this.layout.cashier
    // Customer side of the counter: auto-open checkout once per approach.
    const near = x > c.x - 3.2 && x < c.x - 0.4 && Math.abs(z - c.z) < 2.3
    if (near && !this.atCounter && s.cart.length) this.openCheckout()
    this.atCounter = near
    // Doors slide open as you approach; stepping into them leaves.
    const doorZone = Math.abs(x) < 3.2 && z > -3.2
    this.shell.doors.target = doorZone || this.leaving ? 1 : 0
    const atDoor = Math.abs(x) < 2.8 && z > -1.0
    if (atDoor && !this.atDoor) this.tryLeave()
    this.atDoor = atDoor
  }

  playerPose(): { x: number; z: number; yaw: number } {
    return { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw }
  }

  // -------------------------------------------------------------- quality

  applyQuality(level: QualityLevel): void {
    this.engine.setQuality(level)
    this.shell.setQuality(this.engine.quality)
    store.getState().set({ activeQuality: level })
  }

  private autoDowngrade(): boolean {
    if (store.getState().quality !== 'auto') return false
    const i = QUALITY_ORDER.indexOf(this.engine.quality.level)
    if (i <= 0) return false
    this.applyQuality(QUALITY_ORDER[i - 1])
    console.info(`[quality] auto-downgraded to ${QUALITY_ORDER[i - 1]} (${this.governor.fps.toFixed(0)} fps)`)
    return true
  }

  // ----------------------------------------------------------------- loop

  zoneAt(x: number, z: number): string {
    for (const s of this.layout.shops) {
      if (rectContains(s.rect, x, z)) return s.section?.id ?? 'lounge'
    }
    if (rectContains(this.layout.cashier.zone, x, z)) return 'cashier'
    if (rectContains(this.layout.atrium, x, z)) return 'atrium'
    return 'boulevard'
  }

  start(): void {
    this.timer.connect(document)
    const loop = (ts: number) => {
      requestAnimationFrame(loop)
      this.timer.update(ts)
      this.tick()
    }
    requestAnimationFrame(loop)
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

    // Characters: distance-cull, then animate.
    const maxD = this.engine.quality.characterDistance
    const head = _v.set(p.pos.x, 1.6, p.pos.z)
    for (const a of this.actors) {
      const r = a.character.root
      const d = Math.hypot(r.position.x - p.pos.x, r.position.z - p.pos.z)
      r.visible = d < maxD && (a.visibleIf?.() ?? true)
      if (!r.visible) continue
      a.character.lookTarget = d < 5 ? head : null
      a.character.update(dt, t)
      a.onNear?.(d)
    }
    if (p.view === 'third' && p.avatar) p.avatar.update(dt, t)

    // Interaction: crosshair hover + taps.
    if (s.phase === 'playing') {
      this.interaction.update(this.engine.camera, p.pos, this.colliders, active, this.isTouch)
      const tap = this.input.tap
      if (tap) {
        this.input.tap = null
        if (active) this.interaction.tapAt(tap.x, tap.y, this.engine.camera, p.pos, this.colliders)
      }
    }

    // Footsteps
    if (p.speed > 0.8 && active) {
      this.stepAcc += dt * p.speed
      if (this.stepAcc > 1.55) {
        this.stepAcc = 0
        audio.step()
      }
    }

    this.engine.render()
    this.governor.tick(dt)
    if (this.frame % 30 === 0) {
      const info = this.engine.renderer.info.render
      window.dispatchEvent(new CustomEvent('lv:fps', { detail: `${this.governor.fps.toFixed(0)} fps · ${info.calls} calls · ${this.engine.quality.level}` }))
    }
  }
}

const _v = new Vector3()
