// Games and 122 Coins. Playing earns coins (one mall currency); each shop's
// rewards counter exchanges coins for that brand's discount.
//  - Section passport: +10 per shop visited, +150 for all of them.
//  - Treasure hunt: +25 per hidden logo, +100 for all five.
//  - Wheel of fortune (one spin per session): coins or free shipping.
// Coins show at once (guests too); redeeming them, or claiming a coupon,
// needs the (mock) phone + OTP login.

import { catalog, store } from '../state/store'
import { audio } from '../audio/audio'
import { t } from '../i18n/i18n'
import { brandById } from '../config/mall'
import type { Coupon, Prize } from './types'

export const TREASURE_COUNT = 5
export const COINS = { stamp: 10, passportBonus: 150, treasure: 25, treasureBonus: 100 } as const

/** Coins → brand discount, the same ladder at every shop for now. */
export const REWARD_TIERS = [
  { coins: 100, percent: 10 },
  { coins: 250, percent: 20 },
  { coins: 400, percent: 30 },
] as const

export const WHEEL_PRIZES: (Prize & { color: string; weight: number })[] = [
  { coupon: null, coins: 20, title: { ar: '٢٠ كوين', en: '20 coins' }, color: '#efe6f6', weight: 28 },
  { coupon: null, coins: 50, title: { ar: '٥٠ كوين', en: '50 coins' }, color: '#5b2b82', weight: 22 },
  { coupon: { kind: 'freeShipping', source: 'wheel' }, title: { ar: 'شحن مجاني', en: 'Free shipping' }, color: '#e8d9c8', weight: 14 },
  { coupon: null, coins: 100, title: { ar: '١٠٠ كوين', en: '100 coins' }, color: '#3e1c5c', weight: 12 },
  { coupon: null, coins: 200, title: { ar: '٢٠٠ كوين', en: '200 coins' }, color: '#c8a46e', weight: 6 },
  { coupon: null, title: { ar: 'حظ أوفر', en: 'Better luck' }, color: '#fbf6f2', weight: 18 },
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

/** Picks the (weighted) result, pays out coins, and marks the session as spun. */
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
  const coins = WHEEL_PRIZES[i].coins
  if (coins) setTimeout(() => addCoins(coins, WHEEL_PRIZES[i].title[store.getState().lang]), 4300)
  return i
}

/** Adds 122 Coins and shows the floating "+N" (ui/social listens to lv:coins). */
export function addCoins(n: number, reason: string): void {
  if (n <= 0) return
  store.getState().set({ coins: store.getState().coins + n })
  audio.coin()
  window.dispatchEvent(new CustomEvent('lv:coins', { detail: { n, reason } }))
}

export function offerPrize(prize: Prize, source: Coupon['source']): void {
  store.getState().set({ prize: { ...prize, source }, overlay: 'claim' })
}

/** A stamp (and coins) for every shop visited; all of them → bonus. */
export function stampPassport(sectionId: string): void {
  const s = store.getState()
  if (s.passport.includes(sectionId) || !catalog().sections.some((x) => x.id === sectionId)) return
  const passport = [...s.passport, sectionId]
  s.set({ passport })
  audio.stamp()
  const total = catalog().sections.length
  const L = s.lang
  // After the zone banner (2.4 s) so the two don't stack at the top of the screen.
  setTimeout(() => {
    addCoins(COINS.stamp, `${t('passportStamp', L)} ${passport.length}/${total}`)
    if (passport.length >= total) addCoins(COINS.passportBonus, t('prizePassport', L))
  }, 2500)
}

export function collectTreasure(i: number): void {
  const s = store.getState()
  if (s.treasures.includes(i)) return
  const treasures = [...s.treasures, i]
  s.set({ treasures })
  addCoins(COINS.treasure, `${t('treasureFound', s.lang)} ${treasures.length}/${TREASURE_COUNT}`)
  if (treasures.length >= TREASURE_COUNT) setTimeout(() => addCoins(COINS.treasureBonus, t('prizeTreasure', s.lang)), 900)
}

/** Saves the pending prize as a coupon (caller ensures the user is logged in) and applies it. */
export function savePrize(): Coupon | null {
  const s = store.getState()
  const p = s.prize
  if (!p?.coupon) return null
  const tag = p.source === 'passport' ? 'PASS' : p.source === 'treasure' ? 'HUNT' : 'WHEEL'
  const value = p.coupon.kind === 'percent' ? String(p.coupon.percent) : p.coupon.kind === 'freeShipping' ? 'SHIP' : 'GIFT'
  return saveCoupon({ ...p.coupon }, `${tag}${value}`)
}

function saveCoupon(c: Omit<Coupon, 'code'>, tag: string): Coupon {
  const s = store.getState()
  const coupon: Coupon = { ...c, code: `${tag}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` }
  s.set({ coupons: [...s.coupons, coupon], appliedCoupon: coupon.code })
  return coupon
}

/** Spends coins on a brand discount (caller ensures login). Returns the coupon or null if short. */
export function redeemReward(brandId: string, tier: number): Coupon | null {
  const s = store.getState()
  const r = REWARD_TIERS[tier]
  if (!r || s.coins < r.coins) return null
  s.set({ coins: s.coins - r.coins })
  const initials = brandById.get(brandId)?.initials ?? 'BR'
  return saveCoupon({ kind: 'percent', percent: r.percent, brandId, source: 'rewards' }, `${initials}${r.percent}`)
}
