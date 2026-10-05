// Simulated shoppers. Decides what each member does (browse a shop, queue at
// the cashier, play at the wheel, sit with a stylist, hang out with friends)
// and emits purchase events every 25–40 s. The 3D crowd (world/crowd.ts) only
// renders what this says — a Reverb presence channel can replace it 1:1.

import type { Catalog } from '../data/types'
import type { Activity, PresenceEvent, PresenceMember, PresenceSource } from './types'

const NAMES = ['Nour', 'Salma', 'Mariam', 'Farida', 'Habiba', 'Malak', 'Jana', 'Hana', 'Rawan', 'Aya', 'Laila', 'Yara', 'Dina', 'Menna', 'Rana', 'Shahd', 'Reem', 'Nada', 'Sara', 'Toka']
const CITIES: [string, string][] = [
  ['القاهرة', 'Cairo'],
  ['إسكندرية', 'Alexandria'],
  ['الجيزة', 'Giza'],
  ['المنصورة', 'Mansoura'],
  ['طنطا', 'Tanta'],
  ['أسيوط', 'Assiut'],
  ['الإسماعيلية', 'Ismailia'],
  ['بورسعيد', 'Port Said'],
  ['الزقازيق', 'Zagazig'],
  ['المنيا', 'Minya'],
  ['دمياط', 'Damietta'],
  ['الغردقة', 'Hurghada'],
]

export const STUDIO_SEATS = 3
const MAX_BUYERS = 4
const MAX_PLAYERS = 6
export const STAGE_SPOTS = 6

export class MockPresence implements PresenceSource {
  private readonly list: PresenceMember[] = []
  private readonly timers = new Map<string, number>()
  private readonly remote = new Map<string, number>()
  private readonly subs = new Set<(e: PresenceEvent) => void>()
  private readonly catalog: Catalog
  private readonly count: number
  private handle = 0
  private nextPurchase = 0
  private seq = 0
  private r = Math.random

  constructor(catalog: Catalog, count: number) {
    this.catalog = catalog
    this.count = count
    this.populate()
  }

  start(): void {
    if (this.handle) return
    this.handle = window.setInterval(() => this.tick(1), 1000)
  }

  /** Members exist from construction so the crowd can be built during loading. */
  private populate(): void {
    // ~20% of shoppers come in groups of 2–3 friends.
    let i = 0
    while (this.list.length < this.count) {
      const friends = i % 3 === 2 && this.list.length < this.count - 2
      if (friends) {
        const gid = `g${i}`
        const n = this.r() < 0.5 ? 2 : 3
        // Friends either browse a shop together or stand chatting in the atrium / boulevard.
        const sec = this.r() < 0.35 ? this.randomSection() : null
        const spot = Math.floor(this.r() * 1000)
        for (let k = 0; k < n && this.list.length < this.count; k++) {
          const m = this.newMember('friends')
          m.groupId = gid
          m.sectionId = sec
          m.productId = sec ? this.randomProduct(sec) : null
          m.spot = spot
          this.list.push(m)
        }
      } else this.list.push(this.newMember(this.pickActivity()))
      i++
    }
    for (const m of this.list) this.timers.set(m.id, 8 + this.r() * 40)
    for (const p of this.catalog.products) this.remote.set(p.id, Math.floor(this.r() * 4))
    this.nextPurchase = 12 + this.r() * 10
  }

  stop(): void {
    clearInterval(this.handle)
    this.handle = 0
  }

  members(): readonly PresenceMember[] {
    return this.list
  }

  viewersOf(productId: string): number {
    let n = this.remote.get(productId) ?? 0
    for (const m of this.list) if (m.productId === productId && (m.activity === 'browsing' || m.activity === 'friends')) n++
    return n
  }

  subscribe(fn: (e: PresenceEvent) => void): () => void {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }

  rush(sectionId: string, share: number): void {
    for (const m of this.list) {
      if ((m.activity === 'browsing' || m.activity === 'friends') && this.r() < share) {
        m.sectionId = sectionId
        m.productId = this.randomProduct(sectionId)
        m.rushing = true
        m.since = 0
        this.timers.set(m.id, 40 + this.r() * 40)
        this.emit({ type: 'change', member: m })
      }
    }
  }

  // ------------------------------------------------------------------ sim

  private emit(e: PresenceEvent): void {
    for (const fn of this.subs) fn(e)
  }

  private randomSection(): string {
    const s = this.catalog.sections
    return s[Math.floor(this.r() * s.length)].id
  }

  private randomProduct(sectionId: string): string | null {
    const ids = this.catalog.sections.find((s) => s.id === sectionId)?.productIds ?? []
    return ids.length ? ids[Math.floor(this.r() * ids.length)] : null
  }

  private countOf(a: Activity): number {
    return this.list.filter((m) => m.activity === a).length
  }

  private pickActivity(): Activity {
    const x = this.r()
    if (x < 0.1 && this.countOf('styling') < STUDIO_SEATS) return 'styling'
    if (x < 0.2 && this.countOf('playing') < MAX_PLAYERS) return 'playing'
    if (x < 0.3 && this.countOf('buying') < MAX_BUYERS) return 'buying'
    if (x < 0.4 && this.countOf('watching') < STAGE_SPOTS) return 'watching'
    return 'browsing'
  }

  private newMember(activity: Activity): PresenceMember {
    const city = CITIES[Math.floor(this.r() * CITIES.length)]
    const m: PresenceMember = {
      id: `m${++this.seq}`,
      name: NAMES[Math.floor(this.r() * NAMES.length)],
      cityAr: city[0],
      cityEn: city[1],
      activity: 'browsing',
      sectionId: null,
      productId: null,
      groupId: null,
      spot: 0,
      rushing: false,
      since: 0,
      seed: this.seq * 37 + 11,
    }
    this.assign(m, activity)
    return m
  }

  private assign(m: PresenceMember, a: Activity): void {
    m.activity = a
    m.since = 0
    m.rushing = false
    if (a === 'browsing' || a === 'friends') {
      m.sectionId = m.sectionId && this.r() < 0.3 ? m.sectionId : this.randomSection()
      m.productId = this.randomProduct(m.sectionId)
    } else if (a === 'styling') {
      const used = new Set(this.list.filter((x) => x.activity === 'styling' && x !== m).map((x) => x.spot))
      m.spot = [0, 1, 2].find((i) => !used.has(i)) ?? 0
      m.sectionId = null
    } else if (a === 'watching') {
      const used = new Set(this.list.filter((x) => x.activity === 'watching' && x !== m).map((x) => x.spot))
      m.spot = [0, 1, 2, 3, 4, 5].find((i) => !used.has(i)) ?? 0
      m.sectionId = null
    } else if (a === 'playing') {
      m.spot = this.r() < 0.6 ? 0 : 1 // 0 = wheel, 1 = treasure hunt
      m.sectionId = null
    } else if (a === 'buying') {
      m.sectionId = null
    }
    const dur: Record<Activity, [number, number]> = {
      browsing: [25, 55],
      friends: [30, 60],
      styling: [50, 90],
      playing: [25, 50],
      buying: [70, 120], // completed earlier by the purchase scheduler
      leaving: [14, 18],
      watching: [30, 60],
    }
    const [a0, a1] = dur[a]
    this.timers.set(m.id, a0 + this.r() * (a1 - a0))
  }

  private tick(dt: number): void {
    for (const m of [...this.list]) {
      m.since += dt
      let t = (this.timers.get(m.id) ?? 0) - dt
      // Browsers move on to another product now and then.
      if ((m.activity === 'browsing' || m.activity === 'friends') && m.sectionId && this.r() < 0.08 && !m.groupId) {
        m.productId = this.randomProduct(m.sectionId)
        this.emit({ type: 'change', member: m })
      }
      if (t > 0) {
        this.timers.set(m.id, t)
        continue
      }
      if (m.activity === 'leaving') {
        // Out of the door: replaced by a new shopper coming in.
        this.list.splice(this.list.indexOf(m), 1)
        this.timers.delete(m.id)
        this.emit({ type: 'leave', member: m })
        const n = this.newMember('browsing')
        this.list.push(n)
        this.emit({ type: 'join', member: n })
        continue
      }
      if (m.activity === 'buying') {
        this.complete(m, false) // paid quietly; toasts follow the 25–40 s schedule
        continue
      }
      if (m.groupId) {
        // Friends move together: the first one of the group decides.
        const group = this.list.filter((x) => x.groupId === m.groupId)
        if (group[0] === m) {
          const sec = this.r() < 0.4 ? this.randomSection() : null
          const spot = Math.floor(this.r() * 1000)
          for (const g of group) {
            g.sectionId = sec
            g.spot = spot
            g.productId = sec ? this.randomProduct(sec) : null
            g.since = 0
            g.rushing = false
            this.timers.set(g.id, 30 + this.r() * 30)
            this.emit({ type: 'change', member: g })
          }
        } else this.timers.set(m.id, 5)
        continue
      }
      this.assign(m, this.pickActivity())
      this.emit({ type: 'change', member: m })
    }

    // Viewers from outside the 3D mall drift slowly.
    if (this.r() < 0.5) {
      const ids = [...this.remote.keys()]
      const id = ids[Math.floor(this.r() * ids.length)]
      this.remote.set(id, Math.max(0, Math.min(6, (this.remote.get(id) ?? 0) + (this.r() < 0.5 ? -1 : 1))))
    }

    // A purchase every 25–40 s: the longest-waiting buyer, else an online order.
    this.nextPurchase -= dt
    if (this.nextPurchase <= 0) {
      this.nextPurchase = 25 + this.r() * 15
      const buyer = this.list.filter((m) => m.activity === 'buying' && m.since > 10).sort((a, b) => b.since - a.since)[0]
      if (buyer) this.complete(buyer)
      else {
        const p = this.catalog.products[Math.floor(this.r() * this.catalog.products.length)]
        const city = CITIES[Math.floor(this.r() * CITIES.length)]
        this.emit({ type: 'purchase', member: null, productId: p.id, cityAr: city[0], cityEn: city[1] })
      }
    }
  }

  private complete(m: PresenceMember, announce = true): void {
    const productId = m.productId ?? this.catalog.products[Math.floor(this.r() * this.catalog.products.length)].id
    if (announce) this.emit({ type: 'purchase', member: m, productId, cityAr: m.cityAr, cityEn: m.cityEn })
    this.assign(m, 'leaving')
    this.emit({ type: 'change', member: m })
  }
}
