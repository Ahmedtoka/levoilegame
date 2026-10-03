import { formatPrice, t } from '../i18n/i18n'
import { cartTotals, catalog, store, watch } from '../state/store'
import { FREE_SIZE } from '../data/defaults'
import { audio } from '../audio/audio'
import { esc, el, ICONS, onAction, paint, type GameBridge } from './dom'

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
    const { count, total } = cartTotals(s.cart)
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
            <span>${esc(formatPrice(p.price * l.qty, L))}</span>
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
            <div class="sum-row"><span>${esc(t('subtotal', L))}</span><span>${esc(formatPrice(total, L))}</span></div>
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
  watch((s) => s.lang, render)
}
