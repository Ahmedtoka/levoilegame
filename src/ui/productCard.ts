import { discountPercent, type Product } from '../data/types'
import { formatPrice, t } from '../i18n/i18n'
import { catalog, store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { FREE_SIZE } from '../data/defaults'
import { esc, el, ICONS, onAction, paint, type GameBridge } from './dom'

export function mountProductCard(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil sheet hidden')
  root.appendChild(veil)
  let product: Product | null = null
  let imgIndex = 0
  let size = ''
  let color = ''
  let qty = 1
  let adding = false

  const reset = (p: Product) => {
    product = p
    imgIndex = 0
    size = p.sizes.length === 1 ? p.sizes[0] : ''
    color = p.colors[0]?.name ?? ''
    qty = 1
    adding = false
  }

  const render = () => {
    const s = store.getState()
    if (s.overlay !== 'product' || !s.productId) {
      veil.classList.add('hidden')
      product = null
      return
    }
    const p = catalog().byId.get(s.productId)
    if (!p) return
    if (product?.id !== p.id) reset(p)
    const L = s.lang
    const section = catalog().sections.find((x) => x.id === p.section)
    const off = discountPercent(p)
    const needSize = p.sizes.length > 1 && !size
    paint(veil, `
      <div class="card" role="dialog" aria-modal="true" aria-label="${esc(p.title)}">
        <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        <div class="product">
          <div class="gallery">
            <img class="main" src="${esc(p.images[imgIndex])}" alt="${esc(p.title)}" />
            ${off ? `<span class="sale-flag">-${off}%</span>` : ''}
            ${
              p.images.length > 1
                ? `<div class="thumbs">${p.images
                    .map((src, i) => `<button class="${i === imgIndex ? 'on' : ''}" data-action="img" data-i="${i}" aria-label="Image ${i + 1}"><img src="${esc(src)}" alt="" /></button>`)
                    .join('')}</div>`
                : ''
            }
          </div>
          <div class="info">
            <div class="eyebrow">${esc(section ? (L === 'ar' ? section.titleAr : section.title) : '')}</div>
            <h2 class="display">${esc(p.title)}</h2>
            <div class="price-row">
              <span class="price">${esc(formatPrice(p.price, L, p.currency))}</span>
              ${p.compareAtPrice && off ? `<span class="price-old">${esc(formatPrice(p.compareAtPrice, L, p.currency))}</span><span class="pill-off">${esc(t('sale', L))} ${off}%</span>` : ''}
            </div>
            <h3>${esc(t('size', L))}</h3>
            <div class="chips">${p.sizes
              .map((sz) => `<button class="chip ${sz === size ? 'on' : ''}" data-action="size" data-v="${esc(sz)}">${esc(sz === FREE_SIZE ? t('freeSize', L) : sz)}</button>`)
              .join('')}</div>
            <h3>${esc(t('color', L))}</h3>
            <div class="chips">${p.colors
              .map(
                (c) =>
                  `<button class="chip swatch ${c.name === color ? 'on' : ''}" data-action="color" data-v="${esc(c.name)}"><i style="background:${esc(c.hex)}"></i>${esc(L === 'ar' ? c.nameAr : c.name)}</button>`,
              )
              .join('')}</div>
            <h3>${esc(t('quantity', L))}</h3>
            <div class="qty">
              <button data-action="qty" data-d="-1" aria-label="-">${ICONS.minus}</button>
              <span>${qty}</span>
              <button data-action="qty" data-d="1" aria-label="+">${ICONS.plus}</button>
            </div>
            <div class="add-row">
              <button class="btn lg" data-action="add" ${adding ? 'disabled' : ''}>
                ${adding ? ICONS.check + esc(t('added', L)) : ICONS.bag + esc(t('addToCart', L))}
              </button>
            </div>
            ${needSize ? `<div class="todo-note" data-hint>${esc(t('size', L))}: ${esc(t('required', L))}</div>` : ''}
            <div style="margin-top:14px"><a class="link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(t('viewOnSite', L))} ↗</a></div>
          </div>
        </div>
      </div>`)
  }

  onAction(veil, {
    close: () => game.resume(),
    img: (b) => {
      imgIndex = Number(b.dataset.i)
      render()
    },
    size: (b) => {
      size = b.dataset.v!
      audio.click()
      render()
    },
    color: (b) => {
      color = b.dataset.v!
      audio.click()
      render()
    },
    qty: (b) => {
      qty = Math.max(1, Math.min(20, qty + Number(b.dataset.d)))
      render()
    },
    add: (b) => {
      if (!product || adding) return
      if (product.sizes.length > 1 && !size) {
        veil.querySelector('.chips')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 })
        return
      }
      const s = store.getState()
      s.addToCart({ productId: product.id, size: size || product.sizes[0], color: color || product.colors[0]?.name || '', qty })
      audio.addToCart()
      flyToCart(veil.querySelector<HTMLImageElement>('.gallery .main'), b)
      s.showToast(`${t('added', s.lang)} · ${product.title}`)
      adding = true
      render()
      setTimeout(() => {
        if (store.getState().overlay === 'product') game.resume()
      }, 900)
    },
  })
  veil.addEventListener('click', (e) => {
    if (e.target === veil) game.resume()
  })

  watch((s) => s.overlay, render)
  watch((s) => s.productId, render)
  watch((s) => s.lang, render)
}

/** Thumbnail flies from the product image to the cart button. */
function flyToCart(img: HTMLImageElement | null, from: HTMLElement): void {
  const target = document.querySelector('.cart-btn')
  if (!img || !target) return
  const a = (img.getBoundingClientRect().width ? img : from).getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const ghost = img.cloneNode() as HTMLImageElement
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${a.left + a.width / 2 - 60}px`,
    top: `${a.top + a.height / 2 - 72}px`,
    width: '120px',
    height: '144px',
    objectFit: 'cover',
    borderRadius: '16px',
    zIndex: '50',
    pointerEvents: 'none',
    boxShadow: '0 20px 40px -10px rgba(70,20,55,.5)',
  })
  document.body.appendChild(ghost)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  ghost
    .animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 80}px) scale(.6)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0.3 },
      ],
      { duration: 750, easing: 'cubic-bezier(.4,.0,.2,1)' },
    )
    .finished.then(() => ghost.remove())
}
