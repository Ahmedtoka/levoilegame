// Discount games: section passport (9 stamps → 15%), treasure hunt (5 logos →
// 20%) and the wheel of fortune (one spin per session). Prizes show at once;
// "خديه" asks for a (mock) login, then the coupon is saved and applied.

import { catalog, store } from '../state/store'
import { audio } from '../audio/audio'
import { t } from '../i18n/i18n'
import type { Coupon, Prize } from './types'

export const TREASURE_COUNT = 5

export const WHEEL_PRIZES: (Prize & { color: string; weight: number })[] = [
  { coupon: { kind: 'percent', percent: 5, source: 'wheel' }, title: { ar: '٥٪', en: '5%' }, color: '#f3d6e6', weight: 26 },
  { coupon: { kind: 'percent', percent: 10, source: 'wheel' }, title: { ar: '١٠٪', en: '10%' }, color: '#9e197e', weight: 18 },
  { coupon: { kind: 'freeShipping', source: 'wheel' }, title: { ar: 'شحن مجاني', en: 'Free shipping' }, color: '#e8d9c8', weight: 18 },
  { coupon: { kind: 'percent', percent: 15, source: 'wheel' }, title: { ar: '١٥٪', en: '15%' }, color: '#6f0f58', weight: 8 },
  { coupon: { kind: 'gift', giftProductId: 'inner-caps-01', source: 'wheel' }, title: { ar: 'بونيه هدية', en: 'Gift inner cap' }, color: '#c8a46e', weight: 12 },
  { coupon: null, title: { ar: 'حظ أوفر', en: 'Better luck' }, color: '#fbeef6', weight: 18 },
]

const SPUN_KEY = 'lv-wheel-spun'

export function wheelAlreadySpun(): boolean {
  if (store.getState().wheelSpun) return true
  try {
    return sessionStorage.getItem(SPUN_KEY) === '1'
  } catch {
    return false
  }
}

/** Picks the (weighted) result and marks the session as spun. */
export function spinWheel(): number {
  const total = WHEEL_PRIZES.reduce((a, p) => a + p.weight, 0)
  let x = Math.random() * total
  let i = 0
  for (; i < WHEEL_PRIZES.length - 1; i++) {
    x -= WHEEL_PRIZES[i].weight
    if (x < 0) break
  }
  store.getState().set({ wheelSpun: true })
  try {
    sessionStorage.setItem(SPUN_KEY, '1')
  } catch {
    /* private mode */
  }
  return i
}

export function offerPrize(prize: Prize, source: Coupon['source']): void {
  store.getState().set({ prize: { ...prize, source }, overlay: 'claim' })
}

/** Section stamp; all sections → 15% prize. */
export function stampPassport(sectionId: string): void {
  const s = store.getState()
  if (s.passport.includes(sectionId) || !catalog().sections.some((x) => x.id === sectionId)) return
  const passport = [...s.passport, sectionId]
  s.set({ passport })
  audio.stamp()
  const total = catalog().sections.length
  if (passport.length >= total) {
    setTimeout(() => offerPrize({ coupon: { kind: 'percent', percent: 15, source: 'passport' }, title: { ar: '١٥٪', en: '15%' } }, 'passport'), 600)
  } else {
    // After the zone banner (2.4 s) so the two don't stack at the top of the screen.
    setTimeout(() => store.getState().showToast(`${t('passportStamp', store.getState().lang)} ${passport.length}/${total}`), 2500)
  }
}

export function collectTreasure(i: number): void {
  const s = store.getState()
  if (s.treasures.includes(i)) return
  const treasures = [...s.treasures, i]
  s.set({ treasures })
  audio.coin()
  if (treasures.length >= TREASURE_COUNT) {
    setTimeout(() => offerPrize({ coupon: { kind: 'percent', percent: 20, source: 'treasure' }, title: { ar: '٢٠٪', en: '20%' } }, 'treasure'), 500)
  } else s.showToast(`${t('treasureFound', s.lang)} ${treasures.length}/${TREASURE_COUNT}`)
}

/** Saves the pending prize as a coupon (caller ensures the user is logged in) and applies it. */
export function savePrize(): Coupon | null {
  const s = store.getState()
  const p = s.prize
  if (!p?.coupon) return null
  const tag = p.source === 'passport' ? 'PASS' : p.source === 'treasure' ? 'HUNT' : 'WHEEL'
  const value = p.coupon.kind === 'percent' ? String(p.coupon.percent) : p.coupon.kind === 'freeShipping' ? 'SHIP' : 'GIFT'
  const code = `${tag}${value}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const coupon: Coupon = { ...p.coupon, code }
  s.set({ coupons: [...s.coupons, coupon], appliedCoupon: code })
  return coupon
}
