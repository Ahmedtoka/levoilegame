// Glue between the live-mall services and the app state: chat threads,
// deal/flash updates, purchase toasts and passport stamps.

import { audio } from '../audio/audio'
import { store, watch } from '../state/store'
import { social } from './index'
import { flashActive } from './pricing'
import { stampPassport } from './games'
import type { PresenceEvent, StaffRef } from './types'

/** Default contact for the HUD "need help" button. */
export const CONCIERGE: StaffRef = { id: 'concierge', name: 'Yasmin', role: 'concierge' }

export function openChat(staff: StaffRef): void {
  const s = store.getState()
  const svc = social().chat
  svc.open(staff, s.lang)
  store.getState().set({ chat: { staff, messages: [...svc.history(staff.id)], typing: false }, overlay: 'chat' })
  audio.click()
}

export function sendChat(text: string): void {
  const s = store.getState()
  if (!s.chat) return
  social().chat.send(s.chat.staff, text, s.lang)
}

export type PurchaseToast = Extract<PresenceEvent, { type: 'purchase' }>

/** Starts the services' event wiring. Simulations begin when the visitor enters the mall. */
export function startSession(): void {
  const { chat, deals, presence } = social()

  chat.subscribe((e) => {
    const s = store.getState()
    if (!s.chat || s.chat.staff.id !== e.staffId) return
    if (e.type === 'typing') s.set({ chat: { ...s.chat, typing: e.typing } })
    else {
      s.set({ chat: { ...s.chat, messages: [...chat.history(e.staffId)] } })
      if (e.message.from === 'staff') audio.message()
    }
  })

  deals?.subscribe((e) => {
    const s = store.getState()
    if (e.type === 'group') {
      s.set({ groupDeal: e.deal })
      if (e.joinedBy && e.joinedBy !== 'You') window.dispatchEvent(new CustomEvent('lv:dealjoin', { detail: e.joinedBy }))
    } else if (e.type === 'groupUnlocked') {
      audio.celebrate()
      window.dispatchEvent(new CustomEvent('lv:celebrate'))
    } else if (e.type === 'flashStart') {
      s.set({ flash: e.sale })
      audio.chime()
      presence?.rush(e.sale.sectionId, 0.3)
      window.dispatchEvent(new CustomEvent('lv:flash', { detail: e.sale }))
    } else if (e.type === 'flashEnd') {
      if (!flashActive(store.getState().flash)) s.set({ flash: null })
    }
  })

  presence?.subscribe((e) => {
    if (e.type === 'purchase') window.dispatchEvent(new CustomEvent<PurchaseToast>('lv:purchase', { detail: e }))
  })

  // Passport: a stamp for every section shop you walk into.
  watch((s) => s.zone, (zone) => {
    if (store.getState().phase === 'playing') stampPassport(zone)
  }, false)

  // Simulations start on entering (the first flash sale ~45 s later).
  let started = false
  watch((s) => s.phase, (ph) => {
    if (ph !== 'playing' || started) return
    started = true
    presence?.start()
    deals?.start()
  })
}
