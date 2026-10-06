// Virtual try-on "mirror": her own character wearing the product (outfit from the
// garment type, fabric cut from the product photo), turnable like the avatar
// editor. From here she can add it to the cart, wear it around the mall, or take
// it off. While she wears it, a small chip in the HUD lets her take it off.

import { defaultAvatar } from '../actors/avatar/look'
import { dressTryOn, tryOnLook, tryOnPlan } from '../actors/avatar/tryOn'
import { formatPrice, t } from '../i18n/i18n'
import { catalog, store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { PreviewStage } from './avatarEditor'
import { el, esc, ICONS, onAction, type GameBridge } from './dom'

export function mountTryOnMirror(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'screen avatar-editor tryon hidden')
  const chip = el('div', 'tryon-chip hidden')
  root.append(veil, chip)
  let stage: PreviewStage | null = null

  const back = () => {
    const s = store.getState()
    s.set({ overlay: 'product', productId: s.tryOn?.productId ?? s.productId })
  }

  onAction(veil, {
    cart: () => back(),
    wear: () => {
      audio.click()
      // Third person, so she sees herself wearing it.
      store.getState().set({ overlay: null, view: 'third' })
      game.resume()
    },
    off: () => {
      audio.click()
      const s = store.getState()
      const id = s.tryOn?.productId
      s.set({ tryOn: null, overlay: 'product', productId: id ?? s.productId })
    },
    close: () => back(),
  })
  onAction(chip, {
    off: () => store.getState().set({ tryOn: null }),
  })

  const open = () => {
    const s = store.getState()
    const p = s.tryOn ? catalog().byId.get(s.tryOn.productId) : undefined
    const plan = p ? tryOnPlan(p) : null
    if (!p || !plan) {
      s.set({ overlay: null })
      return
    }
    const L = s.lang
    veil.innerHTML = `
      <div class="ae">
        <div class="ae-stage"><canvas></canvas><span class="ae-hint">${esc(t('dragToTurn', L))}</span></div>
        <div class="ae-panel card">
          <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
          <div class="eyebrow">${esc(t('tryOnTitle', L))}</div>
          <h2>${esc(p.title)}</h2>
          <p class="ae-sub">${esc(formatPrice(p.price, L, p.currency))}</p>
          <div class="ae-body"><p class="tryon-note">${esc(t('tryOnNote', L))}</p></div>
          <div class="ae-actions tryon-actions">
            <button class="btn" data-action="cart">${ICONS.bag}${esc(t('addToCart', L))}</button>
            <button class="btn ghost" data-action="wear">${esc(t('wearInMall', L))}</button>
            <button class="btn ghost" data-action="off">${esc(t('takeOff', L))}</button>
          </div>
        </div>
      </div>`
    veil.classList.remove('hidden')
    stage = new PreviewStage(veil.querySelector('canvas')!)
    const look = tryOnLook(s.avatar ?? defaultAvatar(), plan)
    stage.show(look, (c) => void dressTryOn(c, p, plan))
  }
  const close = () => {
    veil.classList.add('hidden')
    stage?.dispose()
    stage = null
  }

  watch((s) => s.overlay, (o, prev) => {
    if (o === 'tryon' && prev !== 'tryon') open()
    else if (o !== 'tryon' && !veil.classList.contains('hidden')) close()
  })

  // HUD chip while she walks around wearing it.
  const syncChip = () => {
    const s = store.getState()
    const p = s.tryOn ? catalog().byId.get(s.tryOn.productId) : undefined
    const on = !!p && s.phase === 'playing' && !s.overlay
    chip.classList.toggle('hidden', !on)
    if (on && p) chip.innerHTML = `<span>👗 ${esc(t('wearing', s.lang))}: <b>${esc(p.title)}</b></span><button data-action="off" aria-label="${esc(t('takeOff', s.lang))}">${ICONS.close}</button>`
  }
  watch((s) => s.tryOn, syncChip)
  watch((s) => s.overlay, syncChip, false)
  watch((s) => s.phase, syncChip, false)
  watch((s) => s.lang, syncChip, false)
}
