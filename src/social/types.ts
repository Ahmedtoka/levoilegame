// Contracts for the "live mall" layer. Everything here is simulated today by
// the Mock* classes; each interface is shaped so a Laravel + Reverb backend
// (presence channels, private staff chat, deal/coupon APIs) can replace the
// mock without touching the 3D or UI code.

import type { Lang } from '../i18n/i18n'

// ------------------------------------------------------------------ presence

/** What another shopper is doing right now (drives the crowd animation). */
export type Activity = 'browsing' | 'buying' | 'playing' | 'styling' | 'friends' | 'leaving'

export interface PresenceMember {
  id: string
  /** First name only, for toasts ("Nour from Alexandria…"). */
  name: string
  cityAr: string
  cityEn: string
  activity: Activity
  /** Section (shop) she is in or heading to. */
  sectionId: string | null
  /** Product she is looking at (browsing). */
  productId: string | null
  /** Friends who shop together share a group id. */
  groupId: string | null
  /** Station / game index for 'styling' and 'playing'. */
  spot: number
  /** Hurrying to a flash sale. */
  rushing: boolean
  /** Seconds since the activity started (for queue order). */
  since: number
  /** Stable look seed. */
  seed: number
}

export type PresenceEvent =
  | { type: 'join'; member: PresenceMember }
  | { type: 'leave'; member: PresenceMember }
  | { type: 'change'; member: PresenceMember }
  | { type: 'purchase'; member: PresenceMember | null; productId: string; cityAr: string; cityEn: string }

/** Other customers in the mall. Laravel: a Reverb presence channel per mall. */
export interface PresenceSource {
  start(): void
  stop(): void
  members(): readonly PresenceMember[]
  /** People looking at this product right now (in the mall and online). */
  viewersOf(productId: string): number
  subscribe(fn: (e: PresenceEvent) => void): () => void
  /** Local hint: a flash sale started in this section (the server would broadcast this). */
  rush(sectionId: string, share: number): void
}

// ---------------------------------------------------------------- staff chat

export type StaffRole = 'staff' | 'stylist' | 'concierge'

export interface StaffRef {
  id: string
  name: string
  role: StaffRole
  /** Section the staff member works in (for suggestions). */
  sectionId?: string
}

export interface ChatMessage {
  id: number
  from: 'me' | 'staff'
  text: string
  /** Product cards attached by the staff member (added to cart only on approval). */
  products?: { id: string; size: string }[]
  /** A complete look (outfit + hijab + accessory) with "add the whole look". */
  look?: boolean
}

export type ChatEvent = { staffId: string; type: 'message'; message: ChatMessage } | { staffId: string; type: 'typing'; typing: boolean }

/** Customer ↔ Le Voile staff only (customers never chat with each other). Laravel: private channel per conversation. */
export interface StaffChatService {
  history(staffId: string): readonly ChatMessage[]
  /** Opens (or resumes) a conversation; the staff member greets on first open. */
  open(staff: StaffRef, lang: Lang): void
  send(staff: StaffRef, text: string, lang: Lang): void
  subscribe(fn: (e: ChatEvent) => void): () => void
}

// --------------------------------------------------------------------- deals

export interface GroupDeal {
  productId: string
  target: number
  joined: number
  /** Epoch ms. */
  endsAt: number
  percent: number
  userJoined: boolean
  unlocked: boolean
  /** Names of the latest people who joined. */
  recent: string[]
}

export interface FlashSale {
  sectionId: string
  percent: number
  startsAt: number
  endsAt: number
}

export type DealsEvent =
  | { type: 'group'; deal: GroupDeal; joinedBy?: string }
  | { type: 'groupUnlocked'; deal: GroupDeal }
  | { type: 'flashStart'; sale: FlashSale }
  | { type: 'flashEnd'; sale: FlashSale }

/** Group deals and flash sales. Laravel: deals API + broadcast events. */
export interface DealsService {
  start(): void
  stop(): void
  groupDeal(): GroupDeal | null
  joinGroupDeal(): void
  flash(): FlashSale | null
  subscribe(fn: (e: DealsEvent) => void): () => void
}

// ------------------------------------------------------------------ identity

export interface User {
  phone: string
  name: string
}

/** Login for claiming prizes. Laravel: Sanctum + SMS OTP. The mock accepts any 4 digits. */
export interface IdentityService {
  current(): User | null
  requestOtp(phone: string): Promise<{ ok: boolean }>
  verify(phone: string, code: string, name: string): Promise<User | null>
  logout(): void
}

// ------------------------------------------------------------ prizes/coupons

export type CouponKind = 'percent' | 'freeShipping' | 'gift'

export interface Coupon {
  code: string
  kind: CouponKind
  /** Percent off the cart (kind 'percent'). */
  percent?: number
  /** Product given for free (kind 'gift'). */
  giftProductId?: string
  source: 'passport' | 'treasure' | 'wheel'
}

export interface Prize {
  /** null = "better luck next time". */
  coupon: Omit<Coupon, 'code'> | null
  /** Short label, e.g. "15%" or "Free shipping". */
  title: { ar: string; en: string }
}
