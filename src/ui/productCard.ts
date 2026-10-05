import { webImage } from '../data/webImage'
import { discountPercent, type Product } from '../data/types'
import { formatPrice, t } from '../i18n/i18n'
import { catalog, store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { FREE_SIZE } from '../data/defaults'
import { esc, el, ICONS, onAction, paint, type GameBridge } from './dom'
import { autoDeal } from '../social/pricing'
import { hasSocial, social } from '../social'
import type { AppState } from '../state/store'

const viewers = (id: string) => (hasSocial() ? (social().presence?.viewersOf(id) ?? 0) : 0)

/** Social proof + live deals for a product (viewers, flash/group-deal price, join button). */
function liveBlock(p: { id: string; price: number; currency: string }, s: AppState): string {
  const L = s.lang
  const n = viewers(p.id)
  const deal = autoDeal(p.id, s)
  const g = s.groupDeal && s.groupDeal.productId === p.id ? s.groupDeal : null
  const left = g ? Math.max(0, Math.floor((g.endsAt - Date.now()) / 1000)) : 0
  return `
    <div class="viewers ${n >= 2 ? '' : 'hidden'}" data-viewers>👀 <b>${n}</b> ${esc(t('viewersNow', L))}</div>
    ${deal ? `<div class="live-price"><span class="pill-off">${esc(deal.label[L])} −${deal.percent}%</span><b>${esc(formatPrice(Math.round(p.price * (1 - deal.percent / 100)), L, p.currency))}</b></div>` : ''}
    ${
      g
        ? `<div class="group-deal ${g.unlocked ? 'won' : ''}">
        <div class="gd-head">👥 ${esc(t('groupDeal', L))} · −${g.percent}%</div>
        <div class="gd-bar"><i style="width:${(100 * Math.min(g.joined, g.target)) / g.target}%"></i></div>
        <div class="gd-meta">${g.joined}/${g.target} ${esc(t('joined', L))}${g.unlocked ? '' : ` · ${esc(t('left', L))} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</div>
        ${g.unlocked ? `<div class="gd-ok">${esc(t('dealUnlocked', L))}</div>` : g.userJoined ? `<div class="gd-ok">${esc(t('youJoined', L))}</div>` : `<button class="btn sm" data-action="join">${esc(t('joinDeal', L))}</button>`}
      </div>`
        : ''
    }`
}

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
            <img class="main" src="${esc(webImage(p.images[imgIndex]))}" alt="${esc(p.title)}" />
            ${off ? `<span class="sale-flag">-${off}%</span>` : ''}
            ${
              p.images.length > 1
                ? `<div class="thumbs">${p.images
                    .map((src, i) => `<button class="${i === imgIndex ? 'on' : ''}" data-action="img" data-i="${i}" aria-label="Image ${i + 1}"><img src="${esc(webImage(src, 'small'))}" alt="" /></button>`)
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
            ${liveBlock(p, s)}
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
    join: () => {
      social().deals?.joinGroupDeal()
      audio.addToCart()
    },
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
  watch((s) => s.groupDeal, () => store.getState().overlay === 'product' && render(), false)
  watch((s) => s.flash, () => store.getState().overlay === 'product' && render(), false)
  // Live viewer count without re-rendering the card.
  setInterval(() => {
    const s = store.getState()
    const v = veil.querySelector<HTMLElement>('[data-viewers]')
    if (s.overlay !== 'product' || !s.productId || !v) return
    const n = viewers(s.productId)
    v.classList.toggle('hidden', n < 2)
    v.querySelector('b')!.textContent = String(n)
  }, 3000)
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
