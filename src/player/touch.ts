// Mobile controls: a floating joystick on the left half, drag-to-look and tap
// on the right half.

import type { Input } from './input'

export class TouchControls {
  private readonly input: Input
  private readonly base: HTMLDivElement
  private readonly knob: HTMLDivElement
  private stickId: number | null = null
  private origin = { x: 0, y: 0 }
  private looks = new Map<number, { x: number; y: number; moved: number; t: number }>()
  private readonly radius = 56

  constructor(canvas: HTMLCanvasElement, input: Input, parent: HTMLElement) {
    this.input = input
    this.base = document.createElement('div')
    this.base.className = 'joystick'
    this.knob = document.createElement('div')
    this.knob.className = 'joystick-knob'
    this.base.appendChild(this.knob)
    parent.appendChild(this.base)
    this.rest()

    canvas.addEventListener('pointerdown', (e) => this.down(e), { passive: false })
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false })
    window.addEventListener('pointerup', (e) => this.up(e))
    window.addEventListener('pointercancel', (e) => this.up(e))
  }

  private rest(): void {
    this.base.style.left = '84px'
    this.base.style.top = `${window.innerHeight - 120}px`
    this.base.classList.remove('active')
    this.knob.style.transform = 'translate(-50%, -50%)'
  }

  private down(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || !this.input.enabled) return
    e.preventDefault()
    if (e.clientX < window.innerWidth * 0.42 && this.stickId === null) {
      this.stickId = e.pointerId
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
      const len = Math.hypot(dx, dy)
      if (len > this.radius) {
        dx = (dx / len) * this.radius
        dy = (dy / len) * this.radius
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
      this.input.stick.x = dx / this.radius
      this.input.stick.y = -dy / this.radius
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
      this.input.lookDX += dx * 2.2
      this.input.lookDY += dy * 2.2
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return
    if (e.pointerId === this.stickId) {
      this.stickId = null
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

  setVisible(v: boolean): void {
    this.base.style.display = v ? '' : 'none'
  }
}
