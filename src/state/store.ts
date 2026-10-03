import { createStore } from 'zustand/vanilla'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Lang } from '../i18n/i18n'
import type { Catalog } from '../data/types'
import type { QualityLevel } from '../engine/quality'

export type Phase = 'loading' | 'intro' | 'playing' | 'exited' | 'error'
export type Overlay = null | 'product' | 'cart' | 'checkout' | 'thankyou' | 'menu' | 'leave'
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

  cart: CartLine[]
  lastOrder: Order | null
  zone: string
  prompt: { text: string; key: string } | null
  bubble: { text: string; id: number } | null
  toast: { text: string; id: number } | null

  set: (patch: Partial<AppState>) => void
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

      lang: 'ar',
      music: true,
      sound: true,
      quality: 'auto',
      activeQuality: 'medium',
      view: 'first',
      minimap: true,

      cart: [],
      lastOrder: null,
      zone: 'atrium',
      prompt: null,
      bubble: null,
      toast: null,

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
      version: 1,
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({
        lang: s.lang,
        music: s.music,
        sound: s.sound,
        quality: s.quality,
        view: s.view,
        minimap: s.minimap,
        cart: s.cart,
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

export function cartTotals(cart: CartLine[]): { count: number; total: number } {
  const c = catalog()
  let count = 0
  let total = 0
  for (const l of cart) {
    const p = c.byId.get(l.productId)
    if (!p) continue
    count += l.qty
    total += p.price * l.qty
  }
  return { count, total }
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
