// Section slider: clicking a section sign in a shop lays that section's products
// out in front of you as a cover-flow you flip through (arrows, swipe, keys or the
// thumbnails). The product in front opens the usual sheet ("Details"), which comes
// back here when closed.

import { webImage } from '../data/webImage'
import { discountPercent, displayImage, hasCutout, type Product } from '../data/types'
import { formatPrice, t } from '../i18n/i18n'
import { catalog, store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { el, esc, ICONS, onAction, type GameBridge } from './dom'

export function mountSectionSlider(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil slider-veil hidden')
  root.appendChild(veil)
  let items: Product[] = []
  let index = 0
  let drag: { x: number; moved: number } | null = null

  const go = (i: number) => {
    if (!items.length) return
    const n = Math.max(0, Math.min(items.length - 1, i))
    if (n === index) return
    index = n
    audio.click()
    const s = store.getState()
    if (s.slider) s.set({ slider: { ...s.slider, index } })
    layout()
  }

  /** Cover-flow: the front card centred, neighbours turned away and dimmed. */
  const layout = () => {
    const L = store.getState().lang
    const dir = L === 'ar' ? -1 : 1
    veil.querySelectorAll<HTMLElement>('.sl-card').forEach((c, i) => {
      const d = i - index
      const a = Math.abs(d)
      // Anchored at the stage centre (inset-inline-start: 50%), so shift back by half a card first.
      c.style.transform = `translateX(${dir * (d * 62 - 50)}%) translateZ(${-a * 140}px) rotateY(${-dir * Math.sign(d) * Math.min(a, 1) * 38}deg) scale(${a ? 0.82 : 1})`
      c.style.opacity = a > 3 ? '0' : a ? String(0.75 - a * 0.15) : '1'
      c.style.zIndex = String(100 - a)
      c.classList.toggle('front', a === 0)
    })
    veil.querySelectorAll<HTMLElement>('.sl-thumb').forEach((b, i) => b.classList.toggle('on', i === index))
    veil.querySelector('.sl-thumb.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    const p = items[index]
    const info = veil.querySelector<HTMLElement>('.sl-info')
    if (p && info) {
      const off = discountPercent(p)
      info.innerHTML = `
        <div class="sl-count">${index + 1} / ${items.length}</div>
        <h3>${esc(p.title)}</h3>
        <div class="sl-price"><b>${esc(formatPrice(p.price, L, p.currency))}</b>${p.compareAtPrice ? ` <s>${esc(formatPrice(p.compareAtPrice, L, p.currency))}</s>` : ''}${off ? ` <span class="pill-off">−${off}%</span>` : ''}</div>`
    }
    const prev = veil.querySelector<HTMLButtonElement>('[data-action=prev]')
    const next = veil.querySelector<HTMLButtonElement>('[data-action=next]')
    if (prev) prev.disabled = index === 0
    if (next) next.disabled = index === items.length - 1
  }

  const render = () => {
    const s = store.getState()
    if (s.overlay !== 'slider' || !s.slider) {
      veil.classList.add('hidden')
      return
    }
    const L = s.lang
    const cat = catalog()
    items = s.slider.productIds.map((id) => cat.byId.get(id)).filter((p): p is Product => !!p)
    index = Math.max(0, Math.min(items.length - 1, s.slider.index))
    const title = L === 'ar' ? s.slider.titleAr || s.slider.title : s.slider.title
    veil.innerHTML = `
      <div class="slider" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sl-head">
          <div><div class="eyebrow">${items.length} ${esc(t('productsCount', L))}</div><h2>${esc(title)}</h2></div>
          <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        </div>
        <div class="sl-stage">
          <button class="sl-nav prev flip-rtl" data-action="prev" aria-label="‹">${ICONS.arrow}</button>
          <div class="sl-track">${items
            .map(
              (p, i) => `<button class="sl-card${hasCutout(p) ? ' cut' : ''}" data-action="pick" data-i="${i}">
                <img src="${esc(webImage(displayImage(p), 'large'))}" alt="${esc(p.title)}" ${Math.abs(i - index) > 3 ? 'loading="lazy"' : ''} draggable="false" />
              </button>`,
            )
            .join('')}</div>
          <button class="sl-nav next flip-rtl" data-action="next" aria-label="›">${ICONS.arrow}</button>
        </div>
        <div class="sl-info"></div>
        <div class="sl-actions">
          <button class="btn" data-action="details">${ICONS.bag}${esc(t('view', L))}</button>
        </div>
        <div class="sl-thumbs">${items
          .map((p, i) => `<button class="sl-thumb" data-action="pick" data-i="${i}"><img src="${esc(webImage(p.images[0] ?? displayImage(p), 'small'))}" alt="" loading="lazy" /></button>`)
          .join('')}</div>
      </div>`
    veil.classList.remove('hidden')
    layout()
  }

  onAction(veil, {
    close: () => game.resume(),
    prev: () => go(index - 1),
    next: () => go(index + 1),
    pick: (b) => {
      const i = Number(b.dataset.i)
      // A tap on the front card opens it; on a neighbour, brings it to the front.
      if (i === index && b.classList.contains('sl-card')) openDetails()
      else go(i)
    },
    details: () => openDetails(),
  })
  const openDetails = () => {
    const p = items[index]
    if (p) store.getState().set({ overlay: 'product', productId: p.id, productFrom: 'slider' })
  }
  veil.addEventListener('click', (e) => {
    if (e.target === veil) game.resume()
  })

  // Swipe / drag to flip.
  veil.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.sl-stage')) drag = { x: e.clientX, moved: 0 }
  })
  window.addEventListener('pointermove', (e) => {
    if (drag) drag.moved = e.clientX - drag.x
  })
  window.addEventListener('pointerup', () => {
    if (!drag) return
    const m = drag.moved
    drag = null
    if (Math.abs(m) > 40) {
      const rtl = store.getState().lang === 'ar'
      go(index + ((m < 0) !== rtl ? 1 : -1))
    }
  })
  veil.addEventListener(
    'click',
    (e) => {
      // A swipe that ends on a card is not a tap.
      if (drag === null && Math.abs(lastMove) > 40) e.stopPropagation()
    },
    true,
  )
  let lastMove = 0
  window.addEventListener('pointerdown', () => (lastMove = 0))
  window.addEventListener('pointermove', (e) => {
    if (e.buttons) lastMove += Math.abs(e.movementX)
  })

  window.addEventListener('keydown', (e) => {
    if (store.getState().overlay !== 'slider') return
    const rtl = store.getState().lang === 'ar'
    if (e.key === 'ArrowRight') go(index + (rtl ? -1 : 1))
    else if (e.key === 'ArrowLeft') go(index + (rtl ? 1 : -1))
    else if (e.key === 'Enter') openDetails()
  })

  watch((s) => s.overlay, render)
  watch((s) => s.lang, render, false)
}
