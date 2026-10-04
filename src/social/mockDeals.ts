// Group deal (fake shoppers join over time; the visitor's join completes it)
// and flash sales (first ~45 s after entering, then every 3 minutes).
// Laravel: deals table + broadcast events on a public "mall" channel.

import type { Catalog } from '../data/types'
import type { DealsEvent, DealsService, FlashSale, GroupDeal } from './types'

const NAMES = ['Nour', 'Salma', 'Habiba', 'Jana', 'Rawan', 'Aya', 'Yara', 'Menna', 'Shahd', 'Reem', 'Malak', 'Hana']

export const FLASH_FIRST_S = 45
export const FLASH_EVERY_S = 180
export const FLASH_LEN_S = 120
const DEAL_MINUTES = 45

export class MockDeals implements DealsService {
  private readonly catalog: Catalog
  private readonly subs = new Set<(e: DealsEvent) => void>()
  private deal: GroupDeal | null = null
  private sale: FlashSale | null = null
  private handle = 0
  private elapsed = 0
  private nextFlash = FLASH_FIRST_S
  private nextJoin = 20
  private flashIndex = 0

  constructor(catalog: Catalog) {
    this.catalog = catalog
  }

  start(): void {
    if (this.handle) return
    this.deal = this.newDeal()
    this.emit({ type: 'group', deal: this.deal })
    this.handle = window.setInterval(() => this.tick(1), 1000)
  }

  stop(): void {
    clearInterval(this.handle)
    this.handle = 0
  }

  groupDeal(): GroupDeal | null {
    return this.deal
  }

  flash(): FlashSale | null {
    return this.sale
  }

  subscribe(fn: (e: DealsEvent) => void): () => void {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }

  joinGroupDeal(): void {
    const d = this.deal
    if (!d || d.userJoined || d.unlocked) return
    this.update({ ...d, userJoined: true, joined: d.joined + 1, recent: ['You', ...d.recent].slice(0, 3) }, 'You')
  }

  // ------------------------------------------------------------------ sim

  private newDeal(): GroupDeal {
    const showcase = this.catalog.products.filter((p) => p.modelOutfit)
    const p = showcase[0] ?? this.catalog.products[0]
    return { productId: p.id, target: 10, joined: 7, endsAt: Date.now() + DEAL_MINUTES * 60_000, percent: 25, userJoined: false, unlocked: false, recent: ['Nour', 'Salma'] }
  }

  private update(d: GroupDeal, joinedBy?: string): void {
    const done = !d.unlocked && d.userJoined && d.joined >= d.target
    this.deal = done ? { ...d, joined: d.target, unlocked: true } : d
    this.emit({ type: 'group', deal: this.deal, joinedBy })
    if (done) this.emit({ type: 'groupUnlocked', deal: this.deal })
  }

  private tick(dt: number): void {
    this.elapsed += dt
    const d = this.deal
    if (d && !d.unlocked) {
      if (Date.now() > d.endsAt) {
        this.deal = this.newDeal()
        this.emit({ type: 'group', deal: this.deal })
      } else if ((this.nextJoin -= dt) <= 0) {
        this.nextJoin = 35 + Math.random() * 40
        // Fakes fill up to target − 1; the visitor's own join is what completes it.
        const cap = d.userJoined ? d.target : d.target - 1
        if (d.joined < cap) {
          const name = NAMES[Math.floor(Math.random() * NAMES.length)]
          this.update({ ...d, joined: d.joined + 1, recent: [name, ...d.recent].slice(0, 3) }, name)
        }
      }
    }

    if (this.sale && Date.now() >= this.sale.endsAt) {
      const s = this.sale
      this.sale = null
      this.emit({ type: 'flashEnd', sale: s })
    }
    if ((this.nextFlash -= dt) <= 0) {
      this.nextFlash = FLASH_EVERY_S
      const secs = this.catalog.sections.filter((s) => s.id !== 'sale')
      const pref = ['denim', 'dresses', 'scarves', 'everyday-wear', 'isdal', 'accessories', 'new-arrivals', 'inner-caps']
      const order = [...pref.filter((id) => secs.some((s) => s.id === id)), ...secs.map((s) => s.id).filter((id) => !pref.includes(id))]
      const sectionId = order[this.flashIndex++ % order.length]
      const now = Date.now()
      this.sale = { sectionId, percent: 20, startsAt: now, endsAt: now + FLASH_LEN_S * 1000 }
      this.emit({ type: 'flashStart', sale: this.sale })
    }
  }

  private emit(e: DealsEvent): void {
    for (const fn of this.subs) fn(e)
  }
}
