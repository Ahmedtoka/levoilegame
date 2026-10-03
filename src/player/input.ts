// Keyboard, mouse (pointer lock with drag-to-look fallback) and touch input.

export type Action = 'interact' | 'cart' | 'map' | 'view' | 'menu' | 'escape'

const ACTION_KEYS: Record<string, Action> = {
  KeyE: 'interact',
  Enter: 'interact',
  KeyC: 'cart',
  KeyM: 'map',
  KeyV: 'view',
  KeyT: 'menu',
  Tab: 'menu',
  Escape: 'escape',
}

export class Input {
  readonly keys = new Set<string>()
  /** Accumulated look delta in pixels, consumed by the player each frame. */
  lookDX = 0
  lookDY = 0
  /** Joystick vector, x = strafe right, y = forward; magnitude 0..1. */
  readonly stick = { x: 0, y: 0 }
  locked = false
  /** Desktop without pointer lock (iframes, embedded previews, ?nolock): drag to look. */
  dragLook = new URLSearchParams(location.search).has('nolock')
  /** Pending tap/click position to interact with (screen px), consumed by Interaction. */
  tap: { x: number; y: number } | null = null
  /** When false (overlay open), movement and look are ignored. */
  enabled = false

  onAction: (a: Action) => void = () => {}
  onLockChange: (locked: boolean) => void = () => {}

  private readonly canvas: HTMLCanvasElement
  private dragging: { x: number; y: number; moved: number; t: number } | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    window.addEventListener('keydown', (e) => this.keydown(e))
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas
      this.onLockChange(this.locked)
    })
    document.addEventListener('pointerlockerror', () => {
      this.dragLook = true
      this.onLockChange(false)
    })
    document.addEventListener('mousemove', (e) => {
      if (this.locked && this.enabled) {
        this.lookDX += e.movementX
        this.lookDY += e.movementY
      }
    })

    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e))
    window.addEventListener('pointermove', (e) => this.pointerMove(e))
    window.addEventListener('pointerup', (e) => this.pointerUp(e))
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private typing(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  }

  private keydown(e: KeyboardEvent): void {
    if (this.typing(e)) {
      if (e.code === 'Escape') this.onAction('escape')
      return
    }
    const action = ACTION_KEYS[e.code]
    if (action) {
      if (e.code === 'Tab') e.preventDefault()
      if (!e.repeat) this.onAction(action)
      return
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    this.keys.add(e.code)
  }

  requestLock(): void {
    if (this.dragLook || !this.canvas.requestPointerLock) {
      this.dragLook = true
      return
    }
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined
      p?.catch?.(() => {
        this.dragLook = true
        this.onLockChange(false)
      })
    } catch {
      this.dragLook = true
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  // Mouse: click interacts when locked; drag looks in fallback mode.
  // Touch is handled by TouchControls; here we only see mouse/pen.
  private pointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') return
    if (this.locked) {
      if (e.button === 0 && this.enabled) this.tap = { x: innerWidth / 2, y: innerHeight / 2 }
      return
    }
    if (this.dragLook && this.enabled) {
      this.dragging = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() }
    }
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.dragging || e.pointerType === 'touch') return
    const dx = e.clientX - this.dragging.x
    const dy = e.clientY - this.dragging.y
    this.dragging.x = e.clientX
    this.dragging.y = e.clientY
    this.dragging.moved += Math.abs(dx) + Math.abs(dy)
    if (this.enabled) {
      this.lookDX += dx * 1.4
      this.lookDY += dy * 1.4
    }
  }

  private pointerUp(e: PointerEvent): void {
    if (!this.dragging || e.pointerType === 'touch') return
    const d = this.dragging
    this.dragging = null
    if (d.moved < 6 && performance.now() - d.t < 350 && this.enabled) this.tap = { x: e.clientX, y: e.clientY }
  }

  /** -1..1 movement axes from keyboard + joystick. */
  axes(): { x: number; y: number; run: boolean } {
    const k = this.keys
    let x = 0
    let y = 0
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1
    if (k.has('KeyD')) x += 1
    if (k.has('KeyA')) x -= 1
    x += this.stick.x
    y += this.stick.y
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.stick.x, this.stick.y) > 0.92
    return { x, y, run }
  }

  /** Keyboard turning (arrow keys / Q-E-less layouts). */
  turn(): number {
    return (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0)
  }

  consumeLook(): [number, number] {
    const d: [number, number] = [this.lookDX, this.lookDY]
    this.lookDX = 0
    this.lookDY = 0
    return d
  }
}
