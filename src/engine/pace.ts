// Spreads bursty main-thread/GPU work over frames.
//
// When the player nears a wing, a dozen shops start loading at once and their
// photos arrive together; drawing them all into canvases (and the panels built
// from them) in the same frame stalled it for 100–300 ms. Work that awaits
// `slot()` runs at most `perTick` jobs per frame instead.

export class Pacer {
  private readonly queue: (() => void)[] = []
  private scheduled = false
  private readonly perTick: number
  private readonly schedule: (fn: () => void) => void

  constructor(perTick: number, schedule: (fn: () => void) => void = nextFrame) {
    this.perTick = perTick
    this.schedule = schedule
  }

  /** Resolves in a later tick, at most `perTick` callers per tick, first come first served. */
  slot(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve)
      this.kick()
    })
  }

  get waiting(): number {
    return this.queue.length
  }

  private kick(): void {
    if (this.scheduled || !this.queue.length) return
    this.scheduled = true
    this.schedule(() => this.pump())
  }

  private pump(): void {
    this.scheduled = false
    for (let i = 0; i < this.perTick && this.queue.length; i++) this.queue.shift()!()
    this.kick()
  }
}

/**
 * At most `limit` holders at a time; the rest wait in order. Image decodes run on
 * the renderer's worker threads: decoding a whole wing's photos at once
 * saturated the CPU cores and starved the compositor (100–450 ms frames with an
 * idle main thread).
 */
export class Semaphore {
  private active = 0
  private readonly waiters: (() => void)[] = []
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  /** No job running and nobody waiting (the bench waits for this before sampling). */
  get idle(): boolean {
    return this.active === 0 && this.waiters.length === 0
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.waiters.push(r))
    else this.active++
    try {
      return await job()
    } finally {
      const next = this.waiters.shift()
      // Hand the slot straight to the next waiter (active stays the same).
      if (next) next()
      else this.active--
    }
  }
}

/** Next animation frame, or 100 ms later in a background tab (rAF is throttled there). */
function nextFrame(fn: () => void): void {
  let done = false
  const run = () => {
    if (done) return
    done = true
    fn()
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  setTimeout(run, 100)
}

/** Shared pacer for product photos and the canvases composed from them. */
export const imagePacer = new Pacer(2)

/** Concurrent product-photo loads (fetch + decode + resize). */
export const imageLoads = new Semaphore(2)
