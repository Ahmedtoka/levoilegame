// Live-mall UI: staff chat drawer, wheel of fortune, prize claim (mock
// phone + OTP), HUD chips (passport, treasure hunt, group deal, flash sale),
// the "need help" button, purchase toasts and the "what she's looking at" card.

import { Vector3, type Camera } from 'three'
import { formatPrice, t, type Lang, type StringKey } from '../i18n/i18n'
import { catalog, store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { displayImage } from '../data/types'
import { social, demoEnabled } from '../social'
import { CONCIERGE, openChat, sendChat, type PurchaseToast } from '../social/session'
import { flashActive } from '../social/pricing'
import { savePrize, spinWheel, TREASURE_COUNT, WHEEL_PRIZES, wheelAlreadySpun } from '../social/games'
import type { FlashSale } from '../social/types'
import { normalizePhone } from './checkout'
import { FREE_SIZE } from '../data/defaults'
import { confetti } from './fx'
import { esc, el, ICONS, onAction, paint, type GameBridge } from './dom'

const QUICK: { key: StringKey; text: { ar: string; en: string } }[] = [
  { key: 'qSize', text: { ar: 'إيه المقاس المناسب ليا؟', en: 'Which size fits me?' } },
  { key: 'qColor', text: { ar: 'إيه الألوان المتاحة؟', en: 'Which colours do you have?' } },
  { key: 'qHijab', text: { ar: 'إزاي ألف الطرحة مع اللبس ده؟', en: 'How should I style my hijab with this?' } },
  { key: 'qPrice', text: { ar: 'فيه عروض أو خصومات دلوقتي؟', en: 'Any deals right now?' } },
  { key: 'qShipping', text: { ar: 'الشحن بياخد قد إيه؟', en: 'How long does shipping take?' } },
  { key: 'qSuggest', text: { ar: 'اقترحي عليا حاجة', en: 'Suggest something for me' } },
]
const STYLIST_QUICK: { key: StringKey; text: { ar: string; en: string } }[] = [
  { key: 'qLook', text: { ar: 'عايزة لوك لخروجة', en: 'I need a look for an outing' } },
  { key: 'qHijab', text: { ar: 'إزاي ألف الطرحة مع اللوك؟', en: 'How do I style the hijab with it?' } },
  { key: 'qSize', text: { ar: 'إيه المقاس المناسب ليا؟', en: 'Which size fits me?' } },
]

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const sectionTitle = (id: string, L: Lang) => {
  const s = catalog().sections.find((x) => x.id === id)
  return s ? (L === 'ar' ? s.titleAr : s.title) : id
}

function addProduct(id: string, size: string): boolean {
  const p = catalog().byId.get(id)
  if (!p) return false
  store.getState().addToCart({ productId: p.id, size: p.sizes.includes(size) ? size : p.sizes[0] ?? '', color: p.colors[0]?.name ?? '', qty: 1 })
  return true
}

export function mountSocial(root: HTMLElement, game: GameBridge): void {
  mountHudChips(root, game)
  mountChat(root, game)
  mountWheel(root, game)
  mountClaim(root, game)
}

// ---------------------------------------------------------------- HUD chips

function mountHudChips(root: HTMLElement, game: GameBridge): void {
  const wrap = el('div', 'live hidden')
  const chips = el('div', 'live-chips')
  const help = el('button', 'help-btn')
  const banner = el('div', 'flash-banner')
  const toasts = el('div', 'buy-toasts')
  wrap.append(chips, help, banner, toasts)
  root.appendChild(wrap)

  help.addEventListener('click', () => openChat(CONCIERGE))

  const render = () => {
    const s = store.getState()
    const L = s.lang
    const total = catalog().sections.length
    const d = s.groupDeal
    const f = flashActive(s.flash) ? s.flash : null
    const dealP = d && catalog().byId.get(d.productId)
    help.innerHTML = `<span class="dot"></span>💬 ${esc(t('needHelp', L))}`
    chips.innerHTML = `
      <button class="live-chip" data-action="passport" title="${esc(t('passport', L))}">
        <span class="ico">🛂</span><span>${s.passport.length}/${total}</span>
        <span class="dots">${catalog().sections.map((x) => `<i class="${s.passport.includes(x.id) ? 'on' : ''}"></i>`).join('')}</span>
      </button>
      <button class="live-chip" data-action="treasure" title="${esc(t('hiddenLogosHint', L))}"><span class="ico">✨</span><span>${s.treasures.length}/${TREASURE_COUNT}</span></button>
      ${s.coupons.length ? `<button class="live-chip" data-action="cart" title="${esc(t('coupons', L))}"><span class="ico">🎟️</span><span>${s.coupons.length}</span></button>` : ''}
      ${d && dealP ? `<button class="live-chip deal ${d.unlocked ? 'won' : ''}" data-action="deal"><span class="ico">👥</span><span>${d.unlocked ? '−25% ✓' : `${d.joined}/${d.target}`}</span><span class="timer" data-deal-timer>${d.unlocked ? '' : mmss(d.endsAt - Date.now())}</span></button>` : ''}
      ${f ? `<button class="live-chip flash" data-action="flash"><span class="ico">⚡</span><span>−${f.percent}% ${esc(sectionTitle(f.sectionId, L))}</span><span class="timer" data-flash-timer>${mmss(f.endsAt - Date.now())}</span></button>` : ''}`
  }

  onAction(chips, {
    passport: () => store.getState().showToast(`${t('passport', store.getState().lang)}: ${store.getState().passport.length}/${catalog().sections.length} → 15%`),
    treasure: () => store.getState().showToast(t('hiddenLogosHint', store.getState().lang)),
    cart: () => store.getState().set({ overlay: 'cart' }),
    deal: () => {
      const d = store.getState().groupDeal
      if (d) store.getState().openProduct(d.productId)
    },
    flash: () => {
      const f = store.getState().flash
      if (f) game.teleport(f.sectionId)
    },
  })

  for (const sel of [(s: ReturnType<typeof store.getState>) => s.passport, (s: ReturnType<typeof store.getState>) => s.treasures, (s: ReturnType<typeof store.getState>) => s.coupons, (s: ReturnType<typeof store.getState>) => s.groupDeal, (s: ReturnType<typeof store.getState>) => s.flash, (s: ReturnType<typeof store.getState>) => s.lang])
    watch(sel as (s: ReturnType<typeof store.getState>) => unknown, render, false)
  render()

  // Timers tick without re-rendering the chips.
  setInterval(() => {
    const s = store.getState()
    const dt = chips.querySelector('[data-deal-timer]')
    if (dt && s.groupDeal && !s.groupDeal.unlocked) dt.textContent = mmss(s.groupDeal.endsAt - Date.now())
    const ft = chips.querySelector('[data-flash-timer]')
    if (ft && s.flash) {
      if (!flashActive(s.flash)) s.set({ flash: null })
      else ft.textContent = mmss(s.flash.endsAt - Date.now())
    }
  }, 1000)

  const sync = () => {
    const s = store.getState()
    wrap.classList.toggle('hidden', s.phase !== 'playing')
    wrap.classList.toggle('busy', !!s.overlay)
  }
  watch((s) => s.phase, sync)
  watch((s) => s.overlay, sync)

  // Flash sale banner
  let bannerT = 0
  window.addEventListener('lv:flash', (e) => {
    const f = (e as CustomEvent<FlashSale>).detail
    const L = store.getState().lang
    banner.innerHTML = `<div class="bolt">⚡</div><div><div class="t">${esc(t('flashSale', L))}!</div><div class="s">${esc(t('flashBanner', L))} ${f.percent}% ${esc(t('flashOn', L))} ${esc(sectionTitle(f.sectionId, L))}</div></div><button class="btn sm" data-go="${esc(f.sectionId)}">${esc(t('goThere', L))}</button>`
    banner.classList.add('show')
    clearTimeout(bannerT)
    bannerT = window.setTimeout(() => banner.classList.remove('show'), 7000)
  })
  banner.addEventListener('click', (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')
    if (go) {
      banner.classList.remove('show')
      game.teleport(go.dataset.go!)
    }
  })

  // Purchase + deal-join toasts
  const pushToast = (html: string) => {
    const tEl = el('div', 'buy-toast', html)
    toasts.appendChild(tEl)
    while (toasts.children.length > 2) toasts.firstElementChild?.remove()
    setTimeout(() => tEl.classList.add('out'), 5200)
    setTimeout(() => tEl.remove(), 5800)
  }
  window.addEventListener('lv:purchase', (e) => {
    const ev = (e as CustomEvent<PurchaseToast>).detail
    const p = catalog().byId.get(ev.productId)
    if (!p || store.getState().phase !== 'playing') return
    const L = store.getState().lang
    const city = L === 'ar' ? ev.cityAr : ev.cityEn
    pushToast(`<img src="${esc(p.images[0])}" alt="" /><div><div class="who">🛍️ ${esc(t('someoneFrom', L))} ${esc(city)} ${esc(t('justBought', L))}</div><div class="what">${esc(p.title)}</div></div>`)
  })
  window.addEventListener('lv:dealjoin', (e) => {
    const name = (e as CustomEvent<string>).detail
    const L = store.getState().lang
    if (store.getState().phase === 'playing') pushToast(`<div class="ico">👥</div><div><div class="who">${esc(name)} ${esc(t('dealJoinedBy', L))}</div></div>`)
  })
  window.addEventListener('lv:celebrate', () => {
    confetti()
    store.getState().showToast(t('dealUnlocked', store.getState().lang))
  })
}

// ----------------------------------------------------- "what she's looking at"

/** Small card above the nearest browsing shopper's head; click opens the product. */
export function mountLookCard(root: HTMLElement, game: GameBridge & { engine: { camera: Camera } }, focus: () => { pos: Vector3; productId: string } | null): (dt: number) => void {
  const card = el('button', 'look-card hidden')
  root.appendChild(card)
  let shown = ''
  card.addEventListener('click', () => {
    if (shown) store.getState().openProduct(shown)
  })
  const v = new Vector3()
  return () => {
    const s = store.getState()
    const f = s.phase === 'playing' && !s.overlay ? focus() : null
    if (!f) {
      card.classList.add('hidden')
      return
    }
    v.copy(f.pos).project(game.engine.camera)
    if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) {
      card.classList.add('hidden')
      return
    }
    if (shown !== f.productId || card.classList.contains('hidden')) {
      const p = catalog().byId.get(f.productId)
      if (!p) return
      shown = p.id
      card.innerHTML = `<img src="${esc(displayImage(p))}" alt="" /><span><small>${esc(t('lookingAt', s.lang))}</small>${esc(p.title)}</span>`
    }
    card.classList.remove('hidden')
    card.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px)`
  }
}

// --------------------------------------------------------------------- chat

function mountChat(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil drawer-veil hidden')
  root.appendChild(veil)
  let draft = ''

  const render = () => {
    const s = store.getState()
    if (s.overlay !== 'chat' || !s.chat) {
      veil.classList.add('hidden')
      return
    }
    const L = s.lang
    const { staff, messages, typing } = s.chat
    const role = staff.role === 'stylist' ? 'stylistRole' : staff.role === 'concierge' ? 'conciergeRole' : 'staffRole'
    const sec = staff.sectionId ? ` · ${sectionTitle(staff.sectionId, L)}` : ''
    const quick = staff.role === 'stylist' ? STYLIST_QUICK : QUICK
    const bubbles = messages
      .map((m) => {
        const cards = (m.products ?? [])
          .map((x) => {
            const p = catalog().byId.get(x.id)
            if (!p) return ''
            return `<div class="chat-product">
              <img src="${esc(displayImage(p))}" alt="" />
              <div><div class="t">${esc(p.title)}</div><div class="pr">${esc(formatPrice(p.price, L))}${x.size ? ` · ${esc(x.size === FREE_SIZE ? t('freeSize', L) : x.size)}` : ''}</div>
              <div class="row"><button class="link" data-action="view" data-id="${esc(p.id)}">${esc(t('view', L))}</button>
              ${m.look ? '' : `<button class="btn sm" data-action="approve" data-id="${esc(p.id)}" data-size="${esc(x.size)}">${esc(t('approveAdd', L))}</button>`}</div></div>
            </div>`
          })
          .join('')
        const look = m.look && m.products?.length ? `<button class="btn block" data-action="look" data-msg="${m.id}">${ICONS.bag}${esc(t('addWholeLook', L))}</button>` : ''
        return `<div class="msg ${m.from}"><div class="b">${esc(m.text)}</div>${cards ? `<div class="cards">${cards}${look}</div>` : ''}</div>`
      })
      .join('')
    paint(veil, `
      <aside class="drawer chat" role="dialog" aria-modal="true" aria-label="${esc(staff.name)}">
        <header>
          <div class="who"><span class="avatar">${esc(staff.name[0])}</span><div><h2>${esc(staff.name)}</h2><small>${esc(t(role, L))}${esc(sec)} · <i class="online"></i></small></div></div>
          <button class="icon-btn" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        </header>
        <div class="msgs">${bubbles}${typing ? `<div class="msg staff"><div class="b typing"><i></i><i></i><i></i></div></div>` : ''}</div>
        <div class="quick">${quick.map((q, i) => `<button class="chip" data-action="quick" data-i="${i}">${esc(t(q.key, L))}</button>`).join('')}</div>
        <form class="compose">
          <input name="m" autocomplete="off" placeholder="${esc(t('chatPlaceholder', L))}" value="${esc(draft)}" maxlength="400" />
          <button class="btn" type="submit">${esc(t('send', L))}</button>
        </form>
        <p class="note">${esc(t('chatOnlyStaff', L))}</p>
      </aside>`)
    const list = veil.querySelector('.msgs')
    if (list) list.scrollTop = list.scrollHeight
  }

  veil.addEventListener('input', (e) => {
    draft = (e.target as HTMLInputElement).value
  })
  veil.addEventListener('submit', (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    sendChat(draft)
    draft = ''
    render()
    veil.querySelector<HTMLInputElement>('.compose input')?.focus()
  })
  onAction(veil, {
    close: () => game.resume(),
    quick: (b) => {
      const s = store.getState()
      const list = s.chat?.staff.role === 'stylist' ? STYLIST_QUICK : QUICK
      sendChat(list[Number(b.dataset.i)].text[s.lang])
    },
    view: (b) => store.getState().openProduct(b.dataset.id!),
    approve: (b) => {
      if (addProduct(b.dataset.id!, b.dataset.size ?? '')) {
        audio.addToCart()
        const p = catalog().byId.get(b.dataset.id!)
        store.getState().showToast(`${t('added', store.getState().lang)} · ${p?.title ?? ''}`)
        b.outerHTML = `<span class="ok">${ICONS.check}${esc(t('added', store.getState().lang))}</span>`
      }
    },
    look: (b) => {
      const s = store.getState()
      const m = s.chat?.messages.find((x) => x.id === Number(b.dataset.msg))
      if (!m?.products) return
      m.products.forEach((x) => addProduct(x.id, x.size))
      audio.addToCart()
      s.showToast(t('lookAdded', s.lang))
      b.outerHTML = `<span class="ok">${ICONS.check}${esc(t('lookAdded', s.lang))}</span>`
    },
  })
  veil.addEventListener('click', (e) => {
    if (e.target === veil) game.resume()
  })
  watch((s) => s.overlay, (o, prev) => {
    render()
    if (o === 'chat' && prev !== 'chat') setTimeout(() => veil.querySelector<HTMLInputElement>('.compose input')?.focus(), 60)
  })
  watch((s) => s.chat, render)
  watch((s) => s.lang, render)
}

// -------------------------------------------------------------------- wheel

function mountWheel(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil hidden')
  root.appendChild(veil)
  let spinning = false
  let angle = 0
  let result: number | null = null

  const n = WHEEL_PRIZES.length
  const seg = 360 / n
  const slices = WHEEL_PRIZES.map((p, i) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180
    const r = 140
    const path = `M150,150 L${150 + r * Math.cos(a0)},${150 + r * Math.sin(a0)} A${r},${r} 0 0 1 ${150 + r * Math.cos(a1)},${150 + r * Math.sin(a1)} Z`
    const mid = (i + 0.5) * seg
    const dark = ['#9e197e', '#6f0f58'].includes(p.color)
    return `<path d="${path}" fill="${p.color}" stroke="#fff" stroke-width="2"/><text transform="rotate(${mid} 150 150) translate(150 52)" text-anchor="middle" fill="${dark ? '#fff' : '#5a2a4a'}" font-size="14" font-weight="700">${esc(p.title.ar)}</text>`
  }).join('')

  const render = () => {
    const s = store.getState()
    if (s.overlay !== 'wheel') {
      veil.classList.add('hidden')
      return
    }
    const L = s.lang
    const used = wheelAlreadySpun() && result === null && !spinning
    const prize = result !== null ? WHEEL_PRIZES[result] : null
    paint(veil, `
      <div class="card narrow wheel-card" role="dialog" aria-modal="true">
        <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        <div class="card-body">
          <div class="eyebrow">${esc(t('wheelOnce', L))}</div>
          <h2>${esc(t('wheel', L))}</h2>
          <div class="wheel-wrap">
            <svg viewBox="0 0 300 300" class="wheel-svg" style="transform:rotate(${angle}deg)">${slices}<circle cx="150" cy="150" r="26" fill="#fbf8f6" stroke="#b08a55" stroke-width="4"/><text x="150" y="156" text-anchor="middle" font-size="16" fill="#9e197e" font-family="Playfair Display, serif">LV</text></svg>
            <div class="wheel-pointer"></div>
          </div>
          ${
            prize
              ? prize.coupon
                ? `<p class="wheel-result">${esc(t('youWon', L))} <b>${esc(prize.title[L])}</b> 🎉</p><button class="btn block lg" data-action="claim">${esc(t('takeIt', L))}</button>`
                : `<p class="wheel-result">${esc(t('betterLuck', L))}</p>`
              : used
                ? `<p class="wheel-result">${esc(t('wheelUsed', L))}</p>`
                : `<button class="btn block lg" data-action="spin" ${spinning ? 'disabled' : ''}>${esc(t('spin', L))}</button>`
          }
        </div>
      </div>`)
  }

  onAction(veil, {
    close: () => !spinning && game.resume(),
    spin: () => {
      if (spinning || wheelAlreadySpun()) return
      spinning = true
      const i = spinWheel()
      // Land the middle of slice i under the pointer (top).
      angle = angle - (angle % 360) + 360 * 6 + (360 - (i + 0.5) * seg)
      audio.click()
      render()
      setTimeout(() => {
        spinning = false
        result = i
        const p = WHEEL_PRIZES[i]
        if (p.coupon) audio.celebrate()
        render()
      }, 4300)
    },
    claim: () => {
      if (result === null) return
      const p = WHEEL_PRIZES[result]
      store.getState().set({ prize: { coupon: p.coupon, title: p.title, source: 'wheel' }, overlay: 'claim' })
    },
  })
  watch((s) => s.overlay, render)
  watch((s) => s.lang, render)
}

// -------------------------------------------------------------------- claim

function mountClaim(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil hidden')
  root.appendChild(veil)
  let step: 'offer' | 'phone' | 'otp' | 'done' = 'offer'
  let phone = ''
  let name = ''
  let code = ''
  let error = ''
  let busy = false

  const render = () => {
    const s = store.getState()
    if (s.overlay !== 'claim' || !s.prize) {
      veil.classList.add('hidden')
      return
    }
    const L = s.lang
    const p = s.prize
    const head = p.source === 'passport' ? 'prizePassport' : p.source === 'treasure' ? 'prizeTreasure' : 'prizeWheel'
    let body = ''
    if (step === 'offer')
      body = `<p class="prize-big">${esc(p.title[L])}</p><p>${esc(t('youWon', L))} ${esc(p.title[L])} 🎁</p>
        <div class="row-btns"><button class="btn lg" data-action="take">${esc(t('takeIt', L))}</button><button class="btn ghost" data-action="later">${esc(t('later', L))}</button></div>`
    else if (step === 'phone')
      body = `<p>${esc(t('loginToClaim', L))}</p>
        <form data-form="phone" novalidate>
          <div class="field"><label for="c-name">${esc(t('yourName', L))}</label><input id="c-name" data-f="name" value="${esc(name)}" autocomplete="name" /></div>
          <div class="field ${error ? 'err' : ''}"><label for="c-phone">${esc(t('phone', L))}</label><input id="c-phone" data-f="phone" value="${esc(phone)}" inputmode="tel" dir="ltr" autocomplete="tel" placeholder="01xxxxxxxxx" />${error ? `<span class="msg">${esc(error)}</span>` : ''}</div>
          <button class="btn block lg" type="submit" ${busy ? 'disabled' : ''}>${esc(t('sendCode', L))}</button>
        </form>`
    else if (step === 'otp')
      body = `<p>${esc(t('enterCode', L))}</p><p class="muted" dir="ltr">${esc(phone)}</p>
        <form data-form="otp" novalidate>
          <div class="field ${error ? 'err' : ''}"><input class="otp" data-f="code" value="${esc(code)}" inputmode="numeric" maxlength="4" dir="ltr" autocomplete="one-time-code" placeholder="• • • •" />${error ? `<span class="msg">${esc(error)}</span>` : ''}</div>
          <button class="btn block lg" type="submit" ${busy ? 'disabled' : ''}>${esc(t('verify', L))}</button>
        </form>`
    else {
      const c = s.coupons[s.coupons.length - 1]
      body = `<div class="thanks" style="padding:0"><div class="tick">${ICONS.check}</div></div><p>${esc(t('couponSaved', L))}</p><div class="order-no" dir="ltr">${esc(c?.code ?? '')}</div>
        <div class="row-btns"><button class="btn" data-action="cart">${esc(t('cart', L))}</button><button class="btn ghost" data-action="later">${esc(t('continueShopping', L))}</button></div>`
    }
    paint(veil, `<div class="card narrow claim-card" role="dialog" aria-modal="true">
      <button class="close" data-action="later" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
      <div class="card-body"><div class="eyebrow">${esc(t(head, L))}</div>${body}</div></div>`)
    veil.querySelector<HTMLInputElement>('input[data-f="code"], input[data-f="phone"]')?.focus()
  }

  const finish = () => {
    savePrize()
    audio.success()
    confetti()
    step = 'done'
    render()
  }

  veil.addEventListener('input', (e) => {
    const i = e.target as HTMLInputElement
    if (i.dataset.f === 'phone') phone = i.value
    if (i.dataset.f === 'name') name = i.value
    if (i.dataset.f === 'code') code = i.value.replace(/\D/g, '').slice(0, 4)
  })
  veil.addEventListener('submit', async (e) => {
    e.preventDefault()
    const L = store.getState().lang
    const id = social().identity
    error = ''
    busy = true
    if (step === 'phone') {
      const norm = normalizePhone(phone)
      const r = await id.requestOtp(norm)
      busy = false
      if (!r.ok) error = t('invalidPhone', L)
      else {
        phone = norm
        step = 'otp'
      }
      render()
    } else if (step === 'otp') {
      const user = await id.verify(phone, code, name || 'Le Voile')
      busy = false
      if (!user) {
        error = t('wrongCode', L)
        render()
      } else finish()
    }
  })
  onAction(veil, {
    take: () => {
      if (social().identity.current()) finish()
      else {
        step = 'phone'
        render()
      }
    },
    later: () => {
      store.getState().set({ prize: null })
      game.resume()
    },
    cart: () => store.getState().set({ prize: null, overlay: 'cart' }),
  })
  watch((s) => s.overlay, (o, prev) => {
    if (o === 'claim' && prev !== 'claim') {
      step = 'offer'
      code = ''
      error = ''
      busy = false
    }
    render()
  })
  watch((s) => s.lang, render)
}

export { demoEnabled }
