// Full-screen states: loading, intro ("Enter the Mall"), pause, exit, no-WebGL.

import { BRAND } from '../config/brand'
import { t, formatPrice } from '../i18n/i18n'
import { store, watch } from '../state/store'
import type { Catalog } from '../data/types'
import { esc, el, onAction, type GameBridge } from './dom'

function langButton(): string {
  return `<button class="icon-btn text" data-action="lang">${esc(t('language', store.getState().lang))}</button>`
}

export function mountScreens(root: HTMLElement, game: GameBridge): void {
  const loading = el('div', 'screen')
  const intro = el('div', 'screen see-through hidden')
  const paused = el('div', 'veil hidden')
  const exited = el('div', 'screen hidden')
  root.append(loading, intro, paused, exited)

  const toggleLang = () => store.getState().set({ lang: store.getState().lang === 'ar' ? 'en' : 'ar' })
  for (const s of [loading, intro, paused, exited]) {
    onAction(s, {
      lang: toggleLang,
      enter: () => game.enterMall(),
      resume: () => game.resume(),
      menu: () => store.getState().set({ overlay: 'menu', paused: false }),
      restart: () => game.restart(),
    })
  }

  const render = () => {
    const s = store.getState()
    const L = s.lang
    loading.innerHTML = `
      <div class="stack">
        <img class="logo" src="${BRAND.logo}" alt="Le Voile" />
        <div class="progress"><i style="width:${Math.round(s.loadProgress * 100)}%"></i></div>
        <p>${esc(s.loadLabel || t('loading', L))}</p>
      </div>`
    intro.innerHTML = `
      <div class="corner">${langButton()}</div>
      <div class="stack">
        <img class="logo" src="${BRAND.logo}" alt="Le Voile" />
        <h1 class="display display-ar">${esc(t('tagline', L))}</h1>
        <button class="btn lg" data-action="enter">${esc(t('enterMall', L))}</button>
        <div class="kbd-hint">${esc(t(game.isTouch ? 'controlsMobile' : 'controlsDesktop', L))}</div>
      </div>`
    paused.innerHTML = `
      <div class="card narrow paused-card">
        <h2>${esc(t('paused', L))}</h2>
        <p class="kbd-hint">${esc(t(game.isTouch ? 'controlsMobile' : 'controlsDesktop', L))}</p>
        <div class="actions-row">
          <button class="btn" data-action="resume">${esc(t('resume', L))}</button>
          <button class="btn ghost" data-action="menu">${esc(t('teleport', L))} · ${esc(t('settings', L))}</button>
        </div>
      </div>`
    const order = s.lastOrder
    exited.innerHTML = `
      <div class="stack">
        <img class="logo" src="${BRAND.logo}" alt="Le Voile" />
        <h1 class="display display-ar">${esc(t('comeBack', L))}</h1>
        ${order ? `<p>${esc(t('orderNumber', L))}: <b>${esc(order.number)}</b> · ${esc(formatPrice(order.total, L))}</p>` : ''}
        <button class="btn lg" data-action="restart">${esc(t('continueShopping', L))}</button>
        <a class="link" href="${BRAND.site}" target="_blank" rel="noopener">${esc(t('visitSite', L))}</a>
      </div>`
  }

  watch((s) => s.lang, render)
  watch((s) => s.loadProgress, () => {
    const bar = loading.querySelector<HTMLElement>('.progress > i')
    const label = loading.querySelector('p')
    if (bar) bar.style.width = `${Math.round(store.getState().loadProgress * 100)}%`
    if (label) label.textContent = store.getState().loadLabel || t('loading', store.getState().lang)
  })
  watch((s) => s.lastOrder, render)

  watch((s) => s.phase, (phase) => {
    if (phase !== 'loading') {
      loading.classList.add('fade-out')
      setTimeout(() => loading.classList.add('hidden'), 700)
    }
    intro.classList.toggle('hidden', phase !== 'intro')
    exited.classList.toggle('hidden', phase !== 'exited')
  })
  const syncPause = () => {
    const s = store.getState()
    paused.classList.toggle('hidden', !(s.phase === 'playing' && s.paused && !s.overlay))
  }
  watch((s) => s.paused, syncPause)
  watch((s) => s.overlay, syncPause)
}

/** No WebGL: show a 2D catalogue so the visit isn't wasted. */
export function mountFallback(root: HTMLElement, catalog: Catalog | null): void {
  const L = store.getState().lang
  const wrap = el('div', 'fallback')
  const items = catalog?.products ?? []
  wrap.innerHTML = `
    <header>
      <img class="logo" style="width:220px" src="${BRAND.logo}" alt="Le Voile" />
      <p>${esc(t('noWebgl', L))}</p>
      <p><a class="link" href="${BRAND.site}" target="_blank" rel="noopener">levoilestores.com</a></p>
    </header>
    <div class="grid">
      ${items
        .map(
          (p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">
            <img loading="lazy" src="${esc(p.images[0])}" alt="${esc(p.title)}" />
            <div class="meta"><b>${esc(p.title)}</b><br/>${esc(formatPrice(p.price, L))}</div>
          </a>`,
        )
        .join('')}
    </div>`
  root.appendChild(wrap)
}
