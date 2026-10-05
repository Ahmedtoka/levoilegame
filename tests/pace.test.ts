import { describe, expect, it } from 'vitest'
import { Pacer, Semaphore } from '../src/engine/pace'

describe('Pacer', () => {
  it('releases at most perTick waiters per tick, in order', async () => {
    const ticks: (() => void)[] = []
    const p = new Pacer(2, (fn) => ticks.push(fn))
    const done: number[] = []
    const all = [0, 1, 2, 3, 4].map((i) => p.slot().then(() => done.push(i)))
    expect(ticks.length).toBe(1)
    ticks.shift()!()
    await Promise.resolve()
    expect(done).toEqual([0, 1])
    ticks.shift()!()
    await Promise.resolve()
    expect(done).toEqual([0, 1, 2, 3])
    ticks.shift()!()
    await Promise.all(all)
    expect(done).toEqual([0, 1, 2, 3, 4])
    expect(ticks.length).toBe(0)
    expect(p.waiting).toBe(0)
  })
})

describe('Semaphore', () => {
  it('runs at most `limit` jobs at once and all of them eventually', async () => {
    const sem = new Semaphore(2)
    let running = 0
    let peak = 0
    const gates: (() => void)[] = []
    const jobs = [0, 1, 2, 3, 4].map((i) =>
      sem.run(async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise<void>((r) => gates.push(r))
        running--
        return i
      }),
    )
    for (let k = 0; k < 20 && (gates.length || running); k++) {
      await new Promise((r) => setTimeout(r, 0))
      gates.shift()?.()
    }
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4])
    expect(peak).toBe(2)
  })

  it('frees the slot when a job fails', async () => {
    const sem = new Semaphore(1)
    await expect(sem.run(() => Promise.reject(new Error('x')))).rejects.toThrow('x')
    expect(await sem.run(async () => 7)).toBe(7)
  })
})
