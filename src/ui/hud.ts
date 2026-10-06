import { BRAND } from '../config/brand'
import { brandById, WINGS } from '../config/mall'
import { both, formatPrice, t, type Lang } from '../i18n/i18n'
import { cartTotals, catalog, store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { esc, el, ICONS, onAction, type GameBridge } from './dom'

/** Per-mode renames, e.g. the boutique calls its "atrium" the entrance. */
const aliases: Record<string, string> = {}
export function setZoneAliases(map: Record<string, string>): void {
  Object.assign(aliases, map)
}

const NAMED_ZONES = ['boulevard', 'lounge', 'studio', 'cashier', 'atrium', 'entrance', 'fitting', 'store'] as const

export function zoneTitles(zone: string): { en: string; ar: string } {
  const section = catalog().sections.find((s) => s.id === zone)
  if (section) return { en: section.title, ar: section.titleAr }
  const wing = WINGS.find((w) => `wing-${w.id}` === zone)
  if (wing) return { en: wing.nameEn, ar: wing.nameAr }
  if (brandById.get(zone)?.status === 'soon') return both('comingSoon')
  const z = aliases[zone] ?? zone
  const named = NAMED_ZONES.find((n) => n === z)
  return both(named ?? 'atrium')
}

export function zoneLabel(zone: string, lang: Lang): string {
  return zoneTitles(zone)[lang]
}

export function mountHud(root: HTMLElement, game: GameBridge): void {
  const hud = el('div', 'hud hidden')
  root.appendChild(hud)

  const crosshair = el('div', 'crosshair')
  const topbar = el('div', 'topbar')
  const prompt = el('div', 'prompt')
  const banner = el('div', 'zone-banner')
  const toast = el('div', 'toast')
  const bubble = el('div', 'bubble')
  const interactBtn = el('button', 'interact-btn off', ICONS.hand)
  interactBtn.setAttribute('aria-label', 'Interact')
  // Game-style touch buttons (bottom right): run mode and camera.
  const sprintBtn = el('button', 'pad-btn sprint-btn', ICONS.run)
  const viewBtn = el('button', 'pad-btn view-btn', ICONS.eye)
  const fps = el('div', 'fps hidden')
  hud.append(crosshair, topbar, prompt, banner, toast, bubble, fps)
  if (game.isTouch) {
    hud.append(interactBtn, sprintBtn, viewBtn)
    crosshair.classList.add('hidden')
    document.documentElement.classList.add('touch')
  }
  interactBtn.addEventListener('click', () => game.interact())
  sprintBtn.addEventListener('click', () => {
    audio.click()
    store.getState().set({ sprint: !store.getState().sprint })
  })
  viewBtn.addEventListener('click', () => {
    audio.click()
    store.getState().set({ view: store.getState().view === 'first' ? 'third' : 'first' })
  })
  watch((s) => s.sprint, (on) => sprintBtn.classList.toggle('on', on))
  watch((s) => s.view, (v) => {
    viewBtn.innerHTML = `${ICONS.eye}<span>${v === 'first' ? 'FPP' : 'TPP'}</span>`
  })
  const padLabels = () => {
    const L = store.getState().lang
    sprintBtn.setAttribute('aria-label', t('run', L))
    viewBtn.setAttribute('aria-label', t('cameraView', L))
  }
  watch((s) => s.lang, padLabels)

  onAction(topbar, {
    cart: () => {
      audio.click()
      store.getState().set({ overlay: 'cart' })
    },
    menu: () => {
      audio.click()
      store.getState().set({ overlay: 'menu' })
    },
    sound: () => {
      const s = store.getState()
      const on = !(s.music || s.sound)
      s.set({ music: on, sound: on })
    },
    map: () => store.getState().set({ minimap: !store.getState().minimap }),
    lang: () => store.getState().set({ lang: store.getState().lang === 'ar' ? 'en' : 'ar' }),
  })

  const renderTop = () => {
    const s = store.getState()
    const L = s.lang
    const { count, total } = cartTotals(s.cart)
    const muted = !(s.music || s.sound)
    topbar.innerHTML = `
      <div class="brand-chip">
        <img src="${BRAND.logo}" alt="District 122" />
        <span class="zone">${esc(zoneLabel(s.zone, L))}</span>
      </div>
      <div class="actions">
        <button class="icon-btn text" data-action="lang" aria-label="Language"><span class="long">${esc(t('language', L))}</span><span class="short">${L === 'ar' ? 'EN' : 'ع'}</span></button>
        <button class="icon-btn" data-action="sound" aria-label="${esc(t('music', L))}">${muted ? ICONS.mute : ICONS.sound}</button>
        <button class="icon-btn map-btn" data-action="map" aria-label="${esc(t('minimap', L))}">${ICONS.map}</button>
        <button class="icon-btn" data-action="menu" aria-label="${esc(t('teleport', L))}">${ICONS.menu}</button>
        <button class="icon-btn text cart-btn" data-action="cart" aria-label="${esc(t('cart', L))}">
          ${ICONS.bag}${count ? `<span class="total">${esc(formatPrice(total, L))}</span><span class="badge">${count}</span>` : ''}
        </button>
      </div>`
  }

  watch((s) => s.lang, renderTop)
  watch((s) => s.music, renderTop, false)
  watch((s) => s.sound, renderTop, false)
  watch((s) => s.cart, (cart, prev) => {
    renderTop()
    const n = cart.reduce((a, l) => a + l.qty, 0)
    const p = prev.reduce((a, l) => a + l.qty, 0)
    if (n > p) topbar.querySelector('.badge')?.classList.add('bump')
  })

  // Zone chip + banner on zone change
  let bannerTimer = 0
  watch((s) => s.zone, (zone, prev) => {
    renderTop()
    if (zone === prev || zone === 'boulevard' || zone.startsWith('wing-')) return
    const tt = zoneTitles(zone)
    // English UI shows the English name only; the Arabic UI keeps the bilingual pair.
    const ar = store.getState().lang === 'ar' ? `<div class="ar">${esc(tt.ar)}</div>` : ''
    banner.innerHTML = `<div class="en">${esc(tt.en)}</div>${ar}<div class="rule"></div>`
    banner.classList.add('show')
    clearTimeout(bannerTimer)
    bannerTimer = window.setTimeout(() => banner.classList.remove('show'), 2400)
  })

  // Interaction prompt
  watch((s) => s.prompt, (p) => {
    crosshair.classList.toggle('active', !!p)
    interactBtn.classList.toggle('off', !p)
    if (p) {
      const key = game.isTouch ? ICONS.hand.replace('<svg', '<svg width="18" height="18"') : esc(p.key)
      prompt.innerHTML = `<span class="key">${key}</span><span class="label">${esc(p.text)}</span>`
    }
    prompt.classList.toggle('show', !!p)
  })

  let toastTimer = 0
  watch((s) => s.toast, (m) => {
    if (!m) return
    toast.innerHTML = `${ICONS.check}<span>${esc(m.text)}</span>`
    toast.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2000)
  }, false)

  let bubbleTimer = 0
  watch((s) => s.bubble, (m) => {
    if (!m) return
    bubble.textContent = m.text
    bubble.classList.add('show')
    clearTimeout(bubbleTimer)
    bubbleTimer = window.setTimeout(() => bubble.classList.remove('show'), 3200)
  }, false)

  const sync = () => {
    const s = store.getState()
    hud.classList.toggle('hidden', s.phase !== 'playing')
    const busy = !!s.overlay || s.paused
    crosshair.style.opacity = busy ? '0' : '1'
    for (const b of [sprintBtn, viewBtn]) b.classList.toggle('off', busy)
    if (busy) interactBtn.classList.add('off')
    else interactBtn.classList.toggle('off', !s.prompt)
    prompt.style.visibility = busy ? 'hidden' : 'visible'
  }
  watch((s) => s.phase, sync)
  watch((s) => s.overlay, sync)
  watch((s) => s.paused, sync)

  if (new URLSearchParams(location.search).has('fps')) {
    fps.classList.remove('hidden')
    window.addEventListener('lv:fps', (e) => {
      fps.textContent = (e as CustomEvent<string>).detail
    })
  }
}
