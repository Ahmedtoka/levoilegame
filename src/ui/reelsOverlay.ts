// A brand's Instagram reels in a phone-shaped viewer, opened from the shop's
// stories screen: the official Instagram embed of one reel at a time (arrows,
// swipe or keys between them), "Follow on Instagram" and "All products".
// The iframe loads only while the viewer is open (nothing reaches Instagram before).

import { brandById } from '../config/mall'
import { brandReels, brandSocial, instagramProfile, reelSourceName } from '../config/brandSocial'
import { t } from '../i18n/i18n'
import { store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { el, esc, ICONS, onAction, type GameBridge } from './dom'

const IG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>'

export function mountReelsOverlay(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil reels-veil hidden')
  root.appendChild(veil)
  let reels: string[] = []
  let index = 0
  let x0: number | null = null

  const go = (i: number) => {
    const n = Math.max(0, Math.min(reels.length - 1, i))
    if (n === index) return
    index = n
    audio.click()
    show()
  }

  /** Swap the iframe (one reel loaded at a time) and the dots. */
  const show = () => {
    const frame = veil.querySelector<HTMLIFrameElement>('iframe')
    if (frame && reels[index]) frame.src = reels[index]
    veil.querySelectorAll<HTMLElement>('.rl-dot').forEach((d, i) => d.classList.toggle('on', i === index))
    const prev = veil.querySelector<HTMLButtonElement>('[data-action=prev]')
    const next = veil.querySelector<HTMLButtonElement>('[data-action=next]')
    if (prev) prev.disabled = index === 0
    if (next) next.disabled = index >= reels.length - 1
  }

  const render = () => {
    const s = store.getState()
    const id = s.reelsBrand
    if (s.overlay !== 'reels' || !id) {
      if (!veil.classList.contains('hidden')) {
        veil.classList.add('hidden')
        veil.innerHTML = '' // unload the iframe (stops the video)
      }
      return
    }
    const L = s.lang
    const brand = brandById.get(id)
    const src = reelSourceName(id, brand)
    reels = brandReels(id)
    index = Math.min(index, Math.max(0, reels.length - 1))
    const handle = brandSocial(id).instagram
    const name = L === 'ar' ? src.nameAr : src.name
    veil.innerHTML = `
      <div class="reels" role="dialog" aria-modal="true" aria-label="${esc(name)} · Instagram">
        <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        <div class="rl-head">${IG}<div><b>${esc(name)}</b>${handle ? `<small>@${esc(handle)}</small>` : ''}</div></div>
        <div class="rl-phone">
          ${reels.length ? `<iframe title="${esc(name)} reel" src="${esc(reels[index])}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>` : `<p class="rl-empty">${esc(t('noReels', L))}</p>`}
          ${reels.length > 1 ? `<button class="rl-nav prev" data-action="prev" aria-label="‹">${ICONS.arrow}</button><button class="rl-nav next" data-action="next" aria-label="›">${ICONS.arrow}</button>` : ''}
        </div>
        ${reels.length > 1 ? `<div class="rl-dots">${reels.map(() => `<i class="rl-dot"></i>`).join('')}</div>` : ''}
        <div class="rl-actions">
          ${handle ? `<a class="btn ig" href="${esc(instagramProfile(handle))}" target="_blank" rel="noopener">${IG}${esc(t('followIg', L))}</a>` : ''}
          ${brand ? `<button class="btn ghost light" data-action="all">${esc(t('browseAll', L))}</button>` : ''}
        </div>
      </div>`
    veil.classList.remove('hidden')
    show()
  }

  onAction(veil, {
    close: () => game.resume(),
    prev: () => go(index - 1),
    next: () => go(index + 1),
    all: () => {
      const b = store.getState().reelsBrand
      store.getState().set({ overlay: 'brandCatalog', catalogBrand: b })
    },
  })
  veil.addEventListener('click', (e) => {
    if (e.target === veil) game.resume()
  })
  // Swipe on the frame's edges (the iframe itself takes its own touches).
  veil.addEventListener('pointerdown', (e) => (x0 = e.clientX))
  veil.addEventListener('pointerup', (e) => {
    if (x0 === null) return
    const d = e.clientX - x0
    x0 = null
    if (Math.abs(d) > 50) go(index + ((d < 0) !== (store.getState().lang === 'ar') ? 1 : -1))
  })
  window.addEventListener('keydown', (e) => {
    if (store.getState().overlay !== 'reels') return
    const rtl = store.getState().lang === 'ar'
    if (e.key === 'ArrowRight') go(index + (rtl ? -1 : 1))
    else if (e.key === 'ArrowLeft') go(index + (rtl ? 1 : -1))
  })

  watch((s) => s.overlay, (o, prev) => {
    if (o === 'reels' && prev !== 'reels') index = 0
    render()
  })
  watch((s) => s.lang, render, false)
}
