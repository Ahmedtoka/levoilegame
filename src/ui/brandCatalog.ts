// "All products" overlay, opened from a shop's screen: the brand's sections as
// tabs and a grid of its products; a product opens the usual product sheet.

import { brandById } from '../config/mall'
import { brandSubsections } from '../data/mallCatalog'
import { webImage } from '../data/webImage'
import type { Product } from '../data/types'
import { formatPrice, t } from '../i18n/i18n'
import { catalog, store, watch } from '../state/store'
import { el, esc, ICONS, onAction, paint, type GameBridge } from './dom'

export function mountBrandCatalog(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil hidden')
  root.appendChild(veil)
  let tab = 0

  const render = () => {
    const s = store.getState()
    const brand = s.catalogBrand ? brandById.get(s.catalogBrand) : null
    if (s.overlay !== 'brandCatalog' || !brand) {
      veil.classList.add('hidden')
      return
    }
    const L = s.lang
    const cat = catalog()
    const subs = brandSubsections(brand.id)
    const sections = subs.length ? subs : cat.sections.filter((x) => x.id === brand.id)
    const total = new Set(sections.flatMap((x) => x.productIds)).size
    // A section plaque opens straight on its tab.
    if (s.catalogSection) {
      const i = sections.findIndex((x) => x.id === s.catalogSection)
      if (i >= 0) tab = i
      s.set({ catalogSection: null })
    }
    tab = Math.min(tab, Math.max(0, sections.length - 1))
    const sec = sections[tab]
    const items = (sec?.productIds ?? []).map((id) => cat.byId.get(id)).filter((p): p is Product => !!p)
    const name = L === 'ar' ? brand.nameAr : brand.name
    paint(
      veil,
      `<div class="card wide brand-catalog" role="dialog" aria-modal="true" aria-label="${esc(t('allProducts', L))} · ${esc(name)}">
        <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        <div class="card-body">
          <div class="eyebrow">${esc(t('allProducts', L))} · ${total} ${esc(t('productsCount', L))}</div>
          <h2>${esc(name)}</h2>
          ${
            sections.length > 1
              ? `<div class="bc-tabs" role="tablist">${sections
                  .map((x, i) => `<button role="tab" class="bc-tab ${i === tab ? 'on' : ''}" aria-selected="${i === tab}" data-action="tab" data-i="${i}">${esc(L === 'ar' ? x.titleAr || x.title : x.title)}</button>`)
                  .join('')}</div>`
              : ''
          }
          <div class="bc-grid">${items
            .map(
              (p) => `<button class="bc-item" data-action="open" data-id="${esc(p.id)}">
                <img src="${esc(webImage(p.images[0], 'small'))}" alt="" loading="lazy" />
                <span class="bc-title">${esc(p.title)}</span>
                <span class="bc-price">${esc(formatPrice(p.price, L))}${p.compareAtPrice ? ` <s>${esc(formatPrice(p.compareAtPrice, L))}</s>` : ''}</span>
              </button>`,
            )
            .join('')}</div>
        </div>
      </div>`,
    )
  }

  onAction(veil, {
    close: () => game.resume(),
    tab: (b) => {
      tab = Number(b.dataset.i) || 0
      render()
    },
    open: (b) => store.getState().set({ overlay: 'product', productId: b.dataset.id!, productFrom: 'brandCatalog' }),
  })
  veil.addEventListener('click', (e) => {
    if (e.target === veil) game.resume()
  })
  watch((s) => s.overlay, (o, prev) => {
    if (o === 'brandCatalog' && prev !== 'brandCatalog' && prev !== 'product') tab = 0
    render()
  })
  watch((s) => s.lang, render)
}
