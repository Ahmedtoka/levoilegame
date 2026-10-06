// Which slides a screen shows right now, and what pressing E on each does.
// Pure (no DOM) so it's unit-tested; screens.ts draws them.

import type { FlashSale, GroupDeal } from '../social/types'

export type SlideKind = 'flash' | 'deal' | 'brand' | 'games' | 'welcome' | 'reels'
export type SlideAction = { type: 'teleport'; target: string } | { type: 'product'; id: string } | { type: 'wheel' } | { type: 'reels'; source: string } | null

export interface SlideSpec {
  kind: SlideKind
  brandId?: string
  productId?: string
  endsAt?: number
  joined?: number
  target?: number
  percent?: number
  action: SlideAction
}

export interface SlideInput {
  kinds: SlideKind[]
  flash: FlashSale | null
  groupDeal: GroupDeal | null
  brandIds: string[]
  brandIndex: number
  demo: boolean
  now: number
  /** Reel source for a 'reels' slide (shown only when it has reels). */
  reels?: string | null
}

export function buildSlides(i: SlideInput): SlideSpec[] {
  const out: SlideSpec[] = []
  for (const kind of i.kinds) {
    if (kind === 'flash') {
      const f = i.flash
      if (i.demo && f && i.now >= f.startsAt && i.now < f.endsAt)
        out.push({ kind, brandId: f.sectionId, percent: f.percent, endsAt: f.endsAt, action: { type: 'teleport', target: f.sectionId } })
    } else if (kind === 'deal') {
      const d = i.groupDeal
      if (i.demo && d && i.now < d.endsAt)
        out.push({ kind, productId: d.productId, joined: d.joined, target: d.target, percent: d.percent, endsAt: d.endsAt, action: { type: 'product', id: d.productId } })
    } else if (kind === 'brand') {
      if (i.brandIds.length) {
        const brandId = i.brandIds[i.brandIndex % i.brandIds.length]
        out.push({ kind, brandId, action: { type: 'teleport', target: brandId } })
      }
    } else if (kind === 'games') out.push({ kind, action: { type: 'wheel' } })
    else if (kind === 'reels') {
      if (i.reels) out.push({ kind, action: { type: 'reels', source: i.reels } })
    }
    else out.push({ kind, action: null })
  }
  return out
}
