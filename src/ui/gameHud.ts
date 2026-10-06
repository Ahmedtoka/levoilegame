// Touch "game HUD": a quiet screen while walking (stick, run and camera pads only) plus one
// row of round icons top right. An icon opens its panel underneath; tapping it again, or
// another icon, closes it. The interaction prompt is a small card above the hand button.
// Mounted last, so it can adopt the live chips and the minimap the other modules created.

import { brandById } from '../config/mall'
import { displayImage } from '../data/types'
import { webImage } from '../data/webImage'
import { formatPrice, t } from '../i18n/i18n'
import { cartTotals, catalog, store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { CONCIERGE, openChat } from '../social/session'
import { esc, el, ICONS, onAction, type GameBridge } from './dom'

type Panel = 'coins' | 'map'

export function mountGameHud(root: HTMLElement, game: GameBridge): void {
  const hud = el('div', 'ghud hidden')
  const icons = el('div', 'ghud-icons')
  const coinsPanel = el('div', 'ghud-panel coins hidden')
  const mapPanel = el('div', 'ghud-panel map hidden')
  const card = el('button', 'ghud-card off')
  hud.append(icons, coinsPanel, mapPanel, card)
  root.appendChild(hud)

  // The live chips (passport, treasure, coupons, deals) and the minimap already exist: adopt them.
  const chips = root.querySelector<HTMLElement>('.live-chips')
  if (chips) coinsPanel.appendChild(chips)
  const minimap = root.querySelector<HTMLElement>('.minimap')
  if (minimap) mapPanel.appendChild(minimap)

  let open: Panel | null = null
  const setOpen = (p: Panel | null): void => {
    open = p
    coinsPanel.classList.toggle('hidden', p !== 'coins')
    mapPanel.classList.toggle('hidden', p !== 'map')
    hud.classList.toggle('panel-open', p !== null)
    for (const b of icons.querySelectorAll<HTMLElement>('[data-panel]')) b.classList.toggle('on', b.dataset.panel === p)
    if (p === 'map' && !store.getState().minimap) store.getState().set({ minimap: true })
  }
  const toggle = (p: Panel): void => {
    audio.click()
    setOpen(open === p ? null : p)
  }

  onAction(icons, {
    coins: () => toggle('coins'),
    map: () => toggle('map'),
    cart: () => {
      audio.click()
      store.getState().set({ overlay: 'cart' })
    },
    help: () => {
      audio.click()
      openChat(CONCIERGE)
    },
    menu: () => {
      audio.click()
      store.getState().set({ overlay: 'menu' })
    },
  })

  const renderIcons = (): void => {
    const s = store.getState()
    const L = s.lang
    const { count } = cartTotals(s.cart)
    icons.innerHTML = `
      <button class="ghud-ico coins ${open === 'coins' ? 'on' : ''}" data-action="coins" data-panel="coins" aria-label="122 Coins"><span class="emoji">🪙</span><b data-coins>${s.coins}</b></button>
      <button class="ghud-ico ${open === 'map' ? 'on' : ''}" data-action="map" data-panel="map" aria-label="${esc(t('minimap', L))}">${ICONS.map}</button>
      <button class="ghud-ico" data-action="cart" aria-label="${esc(t('cart', L))}">${ICONS.bag}${count ? `<i class="badge">${count}</i>` : ''}</button>
      <button class="ghud-ico" data-action="help" aria-label="${esc(t('needHelp', L))}">${ICONS.chat}<i class="dot"></i></button>
      <button class="ghud-ico" data-action="menu" aria-label="${esc(t('settings', L))}">${ICONS.menu}</button>`
  }
  watch((s) => s.coins, renderIcons)
  watch((s) => s.cart, renderIcons, false)
  watch((s) => s.lang, renderIcons, false)

  // Interaction card: product photo, brand, title and price; anything else gets the hand icon.
  card.addEventListener('click', () => game.interact())
  watch((s) => s.prompt, (p) => {
    if (!p) {
      card.classList.add('off')
      return
    }
    const L = store.getState().lang
    const product = p.productId ? catalog().byId.get(p.productId) : null
    if (product) {
      const brand = brandById.get(product.section)?.name ?? ''
      card.innerHTML = `<img src="${esc(webImage(displayImage(product), 'small'))}" alt="" /><span class="txt">${brand ? `<small>${esc(brand)}</small>` : ''}<b>${esc(product.title)}</b><em>${esc(formatPrice(product.price, L))}</em></span><span class="go">${ICONS.arrow}</span>`
    } else {
      card.innerHTML = `<span class="ico">${ICONS.hand}</span><span class="txt"><b>${esc(p.text)}</b></span><span class="go">${ICONS.arrow}</span>`
    }
    card.classList.remove('off')
  })

  const sync = (): void => {
    const s = store.getState()
    hud.classList.toggle('hidden', s.phase !== 'playing')
    const busy = !!s.overlay
    hud.classList.toggle('busy', busy)
    if (busy) setOpen(null)
  }
  watch((s) => s.phase, sync)
  watch((s) => s.overlay, sync)
}
