// Mobile controls: a floating joystick on the left half, drag-to-look and tap
// on the right half.

import type { Input } from './input'
import { LOOK_SENS, sprintLockArmed, stickVector, touchLookSens } from './controlsMath'
import { haptic } from '../platform/native'

export class TouchControls {
  private readonly input: Input
  private readonly base: HTMLDivElement
  private readonly knob: HTMLDivElement
  private stickId: number | null = null
  private origin = { x: 0, y: 0 }
  private looks = new Map<number, { x: number; y: number; moved: number; t: number }>()
  private readonly radius = 56
  private readonly lock: HTMLDivElement
  private armed = false
  /** Look sensitivity multiplier from the settings. */
  sensitivity = 1

  constructor(canvas: HTMLCanvasElement, input: Input, parent: HTMLElement) {
    this.input = input
    this.base = document.createElement('div')
    this.base.className = 'joystick'
    this.knob = document.createElement('div')
    this.knob.className = 'joystick-knob'
    this.base.appendChild(this.knob)
    this.lock = document.createElement('div')
    this.lock.className = 'sprint-lock'
    this.lock.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 13 6-6 6 6M6 19l6-6 6 6"/></svg>'
    this.base.appendChild(this.lock)
    parent.appendChild(this.base)
    this.rest()

    canvas.addEventListener('pointerdown', (e) => this.down(e), { passive: false })
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false })
    window.addEventListener('pointerup', (e) => this.up(e))
    window.addEventListener('pointercancel', (e) => this.up(e))
  }

  private rest(): void {
    // Home position comes from CSS: bottom-left, clear of the rounded corners and gesture bar.
    this.base.style.left = ''
    this.base.style.top = ''
    this.base.classList.remove('active')
    this.knob.style.transform = 'translate(-50%, -50%)'
  }

  private down(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || !this.input.enabled) return
    e.preventDefault()
    if (e.clientX < window.innerWidth * 0.42 && this.stickId === null) {
      this.stickId = e.pointerId
      this.input.autoRun = false
      this.base.classList.remove('locked')
      this.origin = { x: e.clientX, y: e.clientY }
      this.base.style.left = `${e.clientX}px`
      this.base.style.top = `${e.clientY}px`
      this.base.classList.add('active')
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() })
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.origin.x
      let dy = e.clientY - this.origin.y
      this.setArmed(sprintLockArmed(dx, dy, this.radius))
      const len = Math.hypot(dx, dy)
      if (len > this.radius) {
        dx = (dx / len) * this.radius
        dy = (dy / len) * this.radius
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
      // 8 px dead zone so a resting thumb doesn't drift (and doesn't cancel tap-to-walk).
      const v = stickVector(dx, dy, this.radius)
      this.input.stick.x = v.x
      this.input.stick.y = v.y
      return
    }
    const l = this.looks.get(e.pointerId)
    if (!l) return
    const dx = e.clientX - l.x
    const dy = e.clientY - l.y
    l.x = e.clientX
    l.y = e.clientY
    l.moved += Math.abs(dx) + Math.abs(dy)
    if (this.input.enabled) {
      // Sensitivity scales with screen width; the player multiplies by LOOK_SENS.
      const gain = (touchLookSens(window.innerWidth) * this.sensitivity) / LOOK_SENS
      this.input.lookDX += dx * gain
      this.input.lookDY += dy * gain
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return
    if (e.pointerId === this.stickId) {
      this.stickId = null
      // Released past the lock marker: keep running forward (sprint lock).
      this.input.autoRun = this.armed && this.input.enabled
      this.base.classList.toggle('locked', this.input.autoRun)
      this.setArmed(false)
      this.input.stick.x = 0
      this.input.stick.y = 0
      this.rest()
      return
    }
    const l = this.looks.get(e.pointerId)
    this.looks.delete(e.pointerId)
    if (l && l.moved < 14 && performance.now() - l.t < 300 && this.input.enabled) {
      this.input.tap = { x: e.clientX, y: e.clientY }
    }
  }

  private setArmed(on: boolean): void {
    if (on === this.armed) return
    this.armed = on
    this.base.classList.toggle('armed', on)
    if (on) haptic('light')
  }

  setVisible(v: boolean): void {
    this.base.style.display = v ? '' : 'none'
    if (!v) {
      this.input.autoRun = false
      this.base.classList.remove('locked')
      this.setArmed(false)
    }
  }
}
