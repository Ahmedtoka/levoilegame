// Checkout (summary + details + payment method), thank-you, and the
// "leave with items in cart?" confirmation.

import { BRAND } from '../config/brand'
import { formatPrice, t, type StringKey } from '../i18n/i18n'
import { cartTotals, catalog, store, watch, type Customer, type PaymentMethod } from '../state/store'
import type { CheckoutService } from '../services/CheckoutService'
import { FREE_SIZE } from '../data/defaults'
import { audio } from '../audio/audio'
import { esc, el, ICONS, onAction, paint, type GameBridge } from './dom'

const METHODS: { id: PaymentMethod; label: StringKey; note: StringKey; badge: string; color: string }[] = [
  { id: 'card', label: 'payCard', note: 'payCardNote', badge: 'VISA · MC', color: '#1a1f71' },
  { id: 'vodafone', label: 'payVodafone', note: 'payWalletNote', badge: 'VF', color: '#e60000' },
  { id: 'instapay', label: 'payInstapay', note: 'payInstapayNote', badge: 'IPN', color: '#4b2c83' },
  { id: 'cod', label: 'payCod', note: 'payCodNote', badge: 'COD', color: '#2f8a5f' },
]

/** Accepts Arabic-Indic digits, spaces and +20 prefixes. */
export function normalizePhone(raw: string): string {
  const western = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d+]/g, '')
  return western.replace(/^(\+?20)/, '0')
}
const validPhone = (raw: string) => /^01[0125]\d{8}$/.test(normalizePhone(raw))

export function mountCheckout(root: HTMLElement, game: GameBridge, service: CheckoutService): void {
  const veil = el('div', 'veil sheet hidden')
  const thanks = el('div', 'veil hidden')
  const leave = el('div', 'veil hidden')
  root.append(veil, thanks, leave)

  const draft: Customer = { name: '', phone: '', city: '', address: '', wallet: '' }
  let method: PaymentMethod = 'cod'
  let errors: Partial<Record<keyof Customer, string>> = {}
  let busy = false
  let failure = ''

  const field = (key: keyof Customer, label: StringKey, type = 'text', area = false) => {
    const L = store.getState().lang
    const err = errors[key]
    const attrs = `id="f-${key}" name="${key}" data-field="${key}" ${type === 'tel' ? 'inputmode="tel" dir="ltr" autocomplete="tel"' : ''} ${key === 'name' ? 'autocomplete="name"' : ''}`
    return `<div class="field ${err ? 'err' : ''}">
      <label for="f-${key}">${esc(t(label, L))}</label>
      ${area ? `<textarea ${attrs} autocomplete="street-address">${esc(draft[key] ?? '')}</textarea>` : `<input type="${type}" ${attrs} value="${esc(draft[key] ?? '')}" />`}
      ${err ? `<span class="msg">${esc(err)}</span>` : ''}
    </div>`
  }

  const render = () => {
    const s = store.getState()
    const L = s.lang
    if (s.overlay !== 'checkout') {
      veil.classList.add('hidden')
    } else {
      const { total, count } = cartTotals(s.cart)
      const lines = s.cart
        .map((l) => {
          const p = catalog().byId.get(l.productId)
          if (!p) return ''
          return `<div class="line"><img src="${esc(p.images[0])}" alt="" /><div><div class="t">${esc(p.title)}</div><div class="meta">${esc(l.size === FREE_SIZE ? t('freeSize', L) : l.size)} · × ${l.qty}</div></div><div class="end"><span>${esc(formatPrice(p.price * l.qty, L))}</span></div></div>`
        })
        .join('')
      const m = METHODS.find((x) => x.id === method)!
      paint(veil, busy
        ? `<div class="card narrow"><div class="processing"><div class="spinner"></div><h2>${esc(t('processing', L))}</h2><span class="demo-flag">${esc(t('demoNotice', L))}</span></div></div>`
        : `<div class="card" role="dialog" aria-modal="true" aria-label="${esc(t('checkout', L))}">
        <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        <div class="checkout">
          <div class="summary">
            <div class="eyebrow">${esc(t('cashier', L))}</div>
            <h2>${esc(t('orderSummary', L))}</h2>
            ${count ? lines : `<div class="empty">${esc(t('cartEmpty', L))}</div>`}
            <div class="sum-row" style="margin-top:16px"><span>${esc(t('subtotal', L))}</span><span>${esc(formatPrice(total, L))}</span></div>
            <span class="demo-flag">${esc(t('demoNotice', L))}</span>
          </div>
          <form novalidate>
            <h2>${esc(t('yourDetails', L))}</h2>
            ${field('name', 'name')}
            <div class="row2">${field('phone', 'phone', 'tel')}${field('city', 'city')}</div>
            ${field('address', 'address', 'text', true)}
            <h3>${esc(t('paymentMethod', L))}</h3>
            <div class="methods" role="radiogroup">
              ${METHODS.map(
                (x) =>
                  `<button type="button" role="radio" aria-checked="${x.id === method}" class="method ${x.id === method ? 'on' : ''}" data-action="method" data-m="${x.id}"><span class="dot"></span>${esc(t(x.label, L))}<span class="logo" style="background:${x.color}">${x.badge}</span></button>`,
              ).join('')}
            </div>
            <p class="method-note">${esc(t(m.note, L))}</p>
            ${method === 'vodafone' ? field('wallet', 'walletNumber', 'tel') : ''}
            ${failure ? `<p class="method-note" style="color:var(--danger)">${esc(failure)}</p>` : ''}
            <button class="btn block lg" style="margin-top:18px" type="submit" ${count ? '' : 'disabled'}>${esc(t('placeOrder', L))} · ${esc(formatPrice(total, L))}</button>
          </form>
        </div>
      </div>`)
    }

    // Thank you
    if (s.overlay === 'thankyou' && s.lastOrder) {
      const o = s.lastOrder
      const m = METHODS.find((x) => x.id === o.method)!
      thanks.innerHTML = `<div class="card narrow"><div class="thanks">
        <div class="tick">${ICONS.check}</div>
        <h2 class="display display-ar">${esc(t('thankYou', L))}</h2>
        <div class="order-no" dir="ltr">${esc(o.number)}</div>
        <p style="color:var(--muted);margin:6px 0 0">${esc(t('orderNumber', L))} · ${esc(formatPrice(o.total, L))} · ${esc(t(m.label, L))}</p>
        <p style="margin:18px 0 22px;line-height:1.8">${esc(t('walkToExit', L))}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn" data-action="done">${esc(t('continueShopping', L))}</button>
          <button class="btn ghost" data-action="exit">${esc(t('leaveMall', L))}</button>
        </div>
      </div></div>`
      thanks.classList.remove('hidden')
    } else thanks.classList.add('hidden')

    // Leave confirmation
    if (s.overlay === 'leave') {
      leave.innerHTML = `<div class="card narrow"><div class="card-body" style="text-align:center">
        <img src="${BRAND.logo}" alt="" style="height:26px;margin-bottom:12px" />
        <p style="line-height:1.8;margin:0 0 20px">${esc(t('leaveWithCart', L))}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn" data-action="cashier">${esc(t('goToCashier', L))}</button>
          <button class="btn ghost" data-action="leave">${esc(t('leaveAnyway', L))}</button>
        </div></div></div>`
      leave.classList.remove('hidden')
    } else leave.classList.add('hidden')
  }

  // Keep typed values across re-renders.
  veil.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement
    const key = input.dataset.field as keyof Customer | undefined
    if (key) {
      draft[key] = input.value
      if (errors[key]) {
        delete errors[key]
        input.closest('.field')?.classList.remove('err')
        input.closest('.field')?.querySelector('.msg')?.remove()
      }
    }
  })

  veil.addEventListener('submit', async (e) => {
    e.preventDefault()
    const L = store.getState().lang
    errors = {}
    if (!draft.name.trim()) errors.name = t('required', L)
    if (!validPhone(draft.phone)) errors.phone = draft.phone ? t('invalidPhone', L) : t('required', L)
    if (!draft.city.trim()) errors.city = t('required', L)
    if (!draft.address.trim()) errors.address = t('required', L)
    if (method === 'vodafone' && draft.wallet && !validPhone(draft.wallet)) errors.wallet = t('invalidPhone', L)
    if (Object.keys(errors).length) {
      render()
      veil.querySelector<HTMLInputElement>('.field.err input, .field.err textarea')?.focus()
      return
    }
    busy = true
    failure = ''
    render()
    const result = await service.placeOrder({
      lines: store.getState().cart,
      customer: { ...draft, phone: normalizePhone(draft.phone), wallet: draft.wallet ? normalizePhone(draft.wallet) : undefined },
      method,
    })
    busy = false
    if (result.status === 'success') {
      audio.success()
      store.getState().set({ lastOrder: result.order, cart: [], overlay: 'thankyou' })
      confetti()
    } else if (result.status === 'redirect') {
      window.location.href = result.url
    } else {
      failure = result.message
      render()
    }
  })

  onAction(veil, {
    close: () => game.resume(),
    method: (b) => {
      method = b.dataset.m as PaymentMethod
      if (method === 'vodafone' && !draft.wallet) draft.wallet = draft.phone
      audio.click()
      render()
    },
  })
  onAction(thanks, {
    done: () => game.resume(),
    exit: () => {
      game.resume()
      game.teleport('exit')
    },
  })
  onAction(leave, {
    cashier: () => game.teleport('cashier'),
    leave: () => {
      store.getState().set({ overlay: null })
      window.dispatchEvent(new Event('lv:leave'))
    },
  })
  veil.addEventListener('click', (e) => {
    if (e.target === veil && !busy) game.resume()
  })

  watch((s) => s.overlay, render)
  watch((s) => s.lang, render)
  watch((s) => s.cart, () => store.getState().overlay === 'checkout' && !busy && render(), false)
}

function confetti(): void {
  const box = el('div', 'confetti')
  const colors = [BRAND.magenta, '#f4b6d9', '#c8a46e', '#ffffff', '#6f0f58']
  for (let i = 0; i < 70; i++) {
    const c = el('i')
    c.style.left = `${Math.random() * 100}%`
    c.style.background = colors[i % colors.length]
    c.style.animationDuration = `${1.8 + Math.random() * 1.6}s`
    c.style.animationDelay = `${Math.random() * 0.5}s`
    c.style.transform = `rotate(${Math.random() * 360}deg)`
    box.appendChild(c)
  }
  document.body.appendChild(box)
  setTimeout(() => box.remove(), 4200)
}
