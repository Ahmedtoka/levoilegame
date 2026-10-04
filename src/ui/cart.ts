import { formatPrice, t } from '../i18n/i18n'
import { cartTotals, catalog, store, watch } from '../state/store'
import { FREE_SIZE } from '../data/defaults'
import { audio } from '../audio/audio'
import { esc, el, ICONS, onAction, paint, type GameBridge } from './dom'
import { autoDeal, couponLabel, priceCart } from '../social/pricing'
import type { Lang } from '../i18n/i18n'
import type { AppState } from '../state/store'

/** Discount lines, shipping and total (shared with the checkout summary). */
export function pricingRows(s: AppState, L: Lang): string {
  const pc = priceCart(s.cart, s)
  return `<div class="sum-row"><span>${esc(t('subtotal', L))}</span><span>${esc(formatPrice(pc.subtotal, L))}</span></div>
    ${pc.discounts.map((d) => `<div class="sum-row disc"><span>${esc(d.label[L])}</span><span>${d.amount ? '−' + esc(formatPrice(d.amount, L)) : esc(t('free', L))}</span></div>`).join('')}
    <div class="sum-row"><span>${esc(t('shipping', L))}</span><span>${pc.shipping ? esc(formatPrice(pc.shipping, L)) : esc(t('free', L))}</span></div>
    <div class="sum-row grand"><span>${esc(t('total', L))}</span><span>${esc(formatPrice(pc.total, L))}</span></div>`
}

export function mountCart(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil drawer-veil hidden')
  root.appendChild(veil)

  const render = () => {
    const s = store.getState()
    if (s.overlay !== 'cart') {
      veil.classList.add('hidden')
      return
    }
    const L = s.lang
    const { count } = cartTotals(s.cart)
    const lines = s.cart
      .map((l) => {
        const p = catalog().byId.get(l.productId)
        if (!p) return ''
        return `<div class="line">
          <img src="${esc(p.images[0])}" alt="" />
          <div>
            <div class="t">${esc(p.title)}</div>
            <div class="meta">${esc(l.size === FREE_SIZE ? t('freeSize', L) : l.size)} · ${esc(l.color)}</div>
            <div class="qty sm">
              <button data-action="qty" data-key="${esc(l.key)}" data-d="-1" aria-label="-">${ICONS.minus}</button>
              <span>${l.qty}</span>
              <button data-action="qty" data-key="${esc(l.key)}" data-d="1" aria-label="+">${ICONS.plus}</button>
            </div>
          </div>
          <div class="end">
            ${
              autoDeal(p.id, s)
                ? `<span class="deal-price"><s>${esc(formatPrice(p.price * l.qty, L))}</s>${esc(formatPrice(Math.round(p.price * l.qty * (1 - autoDeal(p.id, s)!.percent / 100)), L))}</span>`
                : `<span>${esc(formatPrice(p.price * l.qty, L))}</span>`
            }
            <button class="rm" data-action="rm" data-key="${esc(l.key)}" aria-label="${esc(t('remove', L))}">${ICONS.trash}</button>
          </div>
        </div>`
      })
      .join('')
    paint(veil, `
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(t('cart', L))}">
        <header>
          <h2>${esc(t('cart', L))} ${count ? `<small style="color:var(--muted);font-size:14px">(${count} ${esc(t('items', L))})</small>` : ''}</h2>
          <button class="icon-btn" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        </header>
        <div class="lines">
          ${count ? lines : `<div class="empty">${ICONS.bag}<p>${esc(t('cartEmpty', L))}</p></div>`}
        </div>
        ${
          count
            ? `<footer>
            ${
              s.coupons.length
                ? `<div class="coupons"><span class="lbl">${esc(t('coupons', L))}</span>${s.coupons
                    .map((c) => `<button class="chip ${c.code === s.appliedCoupon ? 'on' : ''}" data-action="coupon" data-code="${esc(c.code)}">${esc(couponLabel(c)[L])}${c.code === s.appliedCoupon ? ' ✓' : ''}</button>`)
                    .join('')}</div>`
                : ''
            }
            ${pricingRows(s, L)}
            <button class="btn block lg flip-rtl" data-action="cashier">${esc(t('goToCashier', L))} ${ICONS.arrow}</button>
          </footer>`
            : ''
        }
      </aside>`)
  }

  onAction(veil, {
    close: () => game.resume(),
    qty: (b) => {
      const key = b.dataset.key!
      const line = store.getState().cart.find((l) => l.key === key)
      if (line) store.getState().setQty(key, line.qty + Number(b.dataset.d))
      audio.click()
    },
    rm: (b) => {
      store.getState().removeLine(b.dataset.key!)
      audio.click()
    },
    coupon: (b) => {
      const s = store.getState()
      s.set({ appliedCoupon: s.appliedCoupon === b.dataset.code ? null : b.dataset.code! })
      audio.click()
    },
    cashier: () => {
      audio.click()
      game.teleport('cashier')
    },
  })
  veil.addEventListener('click', (e) => {
    if (e.target === veil) game.resume()
  })

  watch((s) => s.overlay, render)
  watch((s) => s.cart, render)
  watch((s) => s.appliedCoupon, render)
  watch((s) => s.coupons, render)
  watch((s) => s.flash, render)
  watch((s) => s.groupDeal, render)
  watch((s) => s.lang, render)
}
