// Cart pricing with the live-mall discounts: automatic deals per line (flash
// sale on a section, unlocked group deal on a product — the best one wins, they
// don't stack), then one applied coupon (percent / free shipping / gift).
// Used by the cart, the checkout summary and the mock checkout.
// TODO(shopify): send the coupon as a discount code (cartDiscountCodesUpdate).

import type { CartLine } from '../state/store'
import { catalog } from '../state/store'
import type { Product } from '../data/types'
import type { Coupon, FlashSale, GroupDeal } from './types'

export const SHIPPING_FEE = 75

type Label = { ar: string; en: string }

interface PricingState {
  flash: FlashSale | null
  groupDeal: GroupDeal | null
  coupons: Coupon[]
  appliedCoupon: string | null
}

export interface PricedCart {
  subtotal: number
  discounts: { label: Label; amount: number }[]
  discount: number
  shipping: number
  total: number
  coupon: Coupon | null
  gift: Product | null
}

export function flashActive(f: FlashSale | null, now = Date.now()): f is FlashSale {
  return !!f && now >= f.startsAt && now < f.endsAt
}

/** Automatic deal on a product right now (flash sale or unlocked group deal). */
export function autoDeal(productId: string, s: Pick<PricingState, 'flash' | 'groupDeal'>): { percent: number; label: Label } | null {
  const p = catalog().byId.get(productId)
  if (!p) return null
  let best: { percent: number; label: Label } | null = null
  if (flashActive(s.flash) && s.flash.sectionId === p.section) {
    const sec = catalog().sections.find((x) => x.id === p.section)
    best = { percent: s.flash.percent, label: { ar: `فلاش سيل ${sec?.titleAr ?? ''}`, en: `Flash sale ${sec?.title ?? ''}` } }
  }
  const g = s.groupDeal
  if (g?.unlocked && g.productId === productId && (!best || g.percent > best.percent)) {
    best = { percent: g.percent, label: { ar: 'صفقة جماعية', en: 'Group deal' } }
  }
  return best
}

export function couponLabel(c: Coupon): Label {
  if (c.kind === 'percent') return { ar: `خصم ${c.percent}%`, en: `${c.percent}% off` }
  if (c.kind === 'freeShipping') return { ar: 'شحن مجاني', en: 'Free shipping' }
  const p = c.giftProductId ? catalog().byId.get(c.giftProductId) : null
  return { ar: `هدية: ${p?.title ?? 'Inner cap'}`, en: `Gift: ${p?.title ?? 'Inner cap'}` }
}

export function priceCart(cart: CartLine[], s: PricingState): PricedCart {
  const c = catalog()
  let subtotal = 0
  const discounts: PricedCart['discounts'] = []
  const byLabel = new Map<string, { label: Label; amount: number }>()
  for (const l of cart) {
    const p = c.byId.get(l.productId)
    if (!p) continue
    const line = p.price * l.qty
    subtotal += line
    const deal = autoDeal(p.id, s)
    if (deal) {
      const amount = Math.round((line * deal.percent) / 100)
      const k = deal.label.en
      const cur = byLabel.get(k) ?? { label: { ar: `${deal.label.ar} −${deal.percent}%`, en: `${deal.label.en} −${deal.percent}%` }, amount: 0 }
      cur.amount += amount
      byLabel.set(k, cur)
    }
  }
  discounts.push(...byLabel.values())
  const afterDeals = subtotal - discounts.reduce((a, d) => a + d.amount, 0)

  const coupon = s.coupons.find((x) => x.code === s.appliedCoupon) ?? null
  let shipping = cart.length ? SHIPPING_FEE : 0
  let gift: Product | null = null
  if (coupon && cart.length) {
    if (coupon.kind === 'percent' && coupon.percent) {
      discounts.push({ label: couponLabel(coupon), amount: Math.round((afterDeals * coupon.percent) / 100) })
    } else if (coupon.kind === 'freeShipping') {
      discounts.push({ label: couponLabel(coupon), amount: shipping })
      shipping = 0
    } else if (coupon.kind === 'gift' && coupon.giftProductId) {
      gift = c.byId.get(coupon.giftProductId) ?? null
      if (gift) discounts.push({ label: couponLabel(coupon), amount: 0 })
    }
  }
  const discount = discounts.reduce((a, d) => a + d.amount, 0) - (coupon?.kind === 'freeShipping' && cart.length ? SHIPPING_FEE : 0)
  const total = Math.max(0, subtotal - discount + shipping)
  return { subtotal, discounts, discount, shipping, total, coupon, gift }
}
