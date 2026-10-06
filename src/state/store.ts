import { createStore } from 'zustand/vanilla'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Lang } from '../i18n/i18n'
import type { Catalog } from '../data/types'
import type { QualityLevel } from '../engine/quality'
import type { ChatMessage, Coupon, FlashSale, GroupDeal, Prize, StaffRef, User } from '../social/types'
import { priceCart } from '../social/pricing'
import { sanitizeAvatar, type AvatarData } from '../actors/avatar/look'

export type Phase = 'loading' | 'intro' | 'playing' | 'exited' | 'error'
export type Overlay = null | 'product' | 'cart' | 'checkout' | 'thankyou' | 'menu' | 'leave' | 'chat' | 'wheel' | 'claim' | 'rewards' | 'avatar' | 'brandCatalog'
export type CameraView = 'first' | 'third'
export type PaymentMethod = 'card' | 'vodafone' | 'instapay' | 'cod'

export interface CartLine {
  key: string
  productId: string
  size: string
  color: string
  qty: number
}

export interface Customer {
  name: string
  phone: string
  city: string
  address: string
  wallet?: string
}

export interface Order {
  number: string
  lines: (CartLine & { title: string; price: number })[]
  total: number
  discount?: number
  shipping?: number
  coupon?: string
  currency: string
  customer: Customer
  method: PaymentMethod
  createdAt: string
}

export interface AppState {
  phase: Phase
  overlay: Overlay
  productId: string | null
  /** Pointer released while playing (desktop) — shows the pause veil. */
  paused: boolean
  loadProgress: number
  loadLabel: string

  lang: Lang
  music: boolean
  sound: boolean
  quality: QualityLevel | 'auto'
  activeQuality: QualityLevel
  view: CameraView
  minimap: boolean
  /** The visitor's own character (avatar editor), saved on the device. */
  avatar: AvatarData | null

  cart: CartLine[]
  lastOrder: Order | null
  zone: string
  prompt: { text: string; key: string } | null
  bubble: { text: string; id: number } | null
  toast: { text: string; id: number } | null

  // ---- live mall (src/social) ----
  /** Logged-in customer (mock phone + OTP). */
  user: User | null
  coupons: Coupon[]
  appliedCoupon: string | null
  /** 122 Coins balance (earned by playing, spent at each shop's rewards counter). */
  coins: number
  /** Brand whose rewards counter is open. */
  rewardsBrand: string | null
  /** Brand whose full catalogue the "All products" overlay shows. */
  catalogBrand: string | null
  /** Section ids stamped in the passport this session. */
  passport: string[]
  /** Treasure-hunt logos found this session. */
  treasures: number[]
  wheelSpun: boolean
  /** Prize waiting to be claimed (claim overlay). */
  prize: (Prize & { source: Coupon['source'] }) | null
  chat: { staff: StaffRef; messages: ChatMessage[]; typing: boolean } | null
  groupDeal: GroupDeal | null
  flash: FlashSale | null

  set:(patch: Partial<AppState>) => void
  openProduct: (id: string) => void
  closeOverlay: () => void
  addToCart: (line: Omit<CartLine, 'key'>) => void
  setQty: (key: string, qty: number) => void
  removeLine: (key: string) => void
  clearCart: () => void
  showToast: (text: string) => void
  showBubble: (text: string) => void
}

let msgId = 0

export const store = createStore<AppState>()(
  persist(
    (set, get) => ({
      phase: 'loading',
      overlay: null,
      productId: null,
      paused: false,
      loadProgress: 0,
      loadLabel: '',

      lang: 'en',
      music: true,
      sound: true,
      quality: 'auto',
      activeQuality: 'medium',
      view: 'first',
      minimap: true,
      avatar: null,

      cart: [],
      lastOrder: null,
      zone: 'atrium',
      prompt: null,
      bubble: null,
      toast: null,

      user: null,
      coupons: [],
      appliedCoupon: null,
      coins: 0,
      rewardsBrand: null,
      catalogBrand: null,
      passport: [],
      treasures: [],
      wheelSpun: false,
      prize: null,
      chat: null,
      groupDeal: null,
      flash: null,

      set: (patch) => set(patch),
      openProduct: (id) => set({ overlay: 'product', productId: id }),
      closeOverlay: () => set({ overlay: null, productId: null }),
      addToCart: (line) => {
        const key = `${line.productId}|${line.size}|${line.color}`
        const cart = get().cart
        const existing = cart.find((l) => l.key === key)
        set({
          cart: existing
            ? cart.map((l) => (l.key === key ? { ...l, qty: Math.min(l.qty + line.qty, 20) } : l))
            : [...cart, { ...line, key }],
        })
      },
      setQty: (key, qty) =>
        set({ cart: get().cart.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(qty, 20)) } : l)) }),
      removeLine: (key) => set({ cart: get().cart.filter((l) => l.key !== key) }),
      clearCart: () => set({ cart: [] }),
      showToast: (text) => set({ toast: { text, id: ++msgId } }),
      showBubble: (text) => set({ bubble: { text, id: ++msgId } }),
    }),
    {
      name: 'levoile-virtual-store',
      // v2: the mall became English-first; land returning visitors in English once.
      version: 2,
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<AppState>
        if (version < 2) s.lang = 'en'
        return s as AppState
      },
      // A saved avatar is validated on load (a stale or hand-edited save falls back safely).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        return { ...current, ...p, avatar: sanitizeAvatar(p.avatar) }
      },
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({
        lang: s.lang,
        music: s.music,
        sound: s.sound,
        quality: s.quality,
        view: s.view,
        minimap: s.minimap,
        avatar: s.avatar,
        cart: s.cart,
        user: s.user,
        coupons: s.coupons,
        appliedCoupon: s.appliedCoupon,
        coins: s.coins,
      }),
    },
  ),
)

/** localStorage can throw (private mode, blocked storage) — fall back to memory. */
function safeStorage(): Storage {
  try {
    const k = '__lv_probe'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      get length() {
        return mem.size
      },
      clear: () => mem.clear(),
      getItem: (k) => mem.get(k) ?? null,
      key: (i) => [...mem.keys()][i] ?? null,
      removeItem: (k) => void mem.delete(k),
      setItem: (k, v) => void mem.set(k, v),
    }
  }
}

/** Catalog is immutable after load; kept outside the reactive store. */
let catalogRef: Catalog | null = null
export function setCatalog(c: Catalog): void {
  catalogRef = c
}
export function catalog(): Catalog {
  if (!catalogRef) throw new Error('Catalog not loaded')
  return catalogRef
}

/** Item count and the payable total (after live-mall discounts and shipping, see social/pricing.ts). */
export function cartTotals(cart: CartLine[]): { count: number; total: number } {
  const count = cart.reduce((a, l) => a + (catalog().byId.has(l.productId) ? l.qty : 0), 0)
  return { count, total: priceCart(cart, store.getState()).total }
}

/** Subscribe to a slice; fires only when the selected value changes (shallow for arrays/objects by identity). */
export function watch<T>(selector: (s: AppState) => T, fn: (value: T, prev: T) => void, immediate = true): () => void {
  let prev = selector(store.getState())
  if (immediate) fn(prev, prev)
  return store.subscribe((s) => {
    const next = selector(s)
    if (!Object.is(next, prev)) {
      const old = prev
      prev = next
      fn(next, old)
    }
  })
}
