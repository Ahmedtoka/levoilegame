// Teleport-to-section menu + settings.

import { BRAND } from '../config/brand'
import { t } from '../i18n/i18n'
import { catalog, store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { esc, el, ICONS, onAction, paint, type GameBridge } from './dom'
import { SENSITIVITY_STEPS } from '../player/controlsMath'

export function mountMenu(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'veil sheet hidden')
  root.appendChild(veil)

  onAction(veil, {
    close: () => game.resume(),
    avatar: () => {
      audio.click()
      store.getState().set({ overlay: 'avatar' })
    },
    go: (b) => {
      audio.click()
      game.teleport(b.dataset.target!)
    },
    set: (b) => {
      const key = b.dataset.key as 'quality' | 'music' | 'sound' | 'view' | 'minimap' | 'lang' | 'sensitivity' | 'fpsCap' | 'haptics'
      const raw = b.dataset.value!
      const numeric = key === 'sensitivity' || key === 'fpsCap'
      const value = numeric ? Number(raw) : raw === 'true' ? true : raw === 'false' ? false : raw
      store.getState().set({ [key]: value } as never)
      audio.click()
    },
  })
  veil.addEventListener('click', (e) => {
    if (e.target === veil) game.resume()
  })

  const seg = (key: string, current: unknown, options: [unknown, string][]) =>
    `<div class="seg">${options
      .map(([v, label]) => `<button class="${v === current ? 'on' : ''}" data-action="set" data-key="${key}" data-value="${esc(String(v))}">${esc(label)}</button>`)
      .join('')}</div>`

  const render = () => {
    const s = store.getState()
    if (s.overlay !== 'menu') {
      veil.classList.add('hidden')
      return
    }
    const L = s.lang
    const shops = game.layout.shops
    const go = (target: string, title: string, sub: string, color: string) =>
      `<button class="go" data-action="go" data-target="${esc(target)}"><i style="background:${color}"></i><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></button>`
    const sectionButtons = catalog()
      .sections.map((sec) => {
        const shop = shops.find((x) => x.section?.id === sec.id)
        return go(sec.id, L === 'ar' ? sec.titleAr : sec.title, L === 'ar' ? sec.title : sec.titleAr, shop?.style?.tint ?? '#eee')
      })
      .join('')
    const onOff: [unknown, string][] = [
      [true, t('on', L)],
      [false, t('off', L)],
    ]
    paint(veil, `
      <div class="card">
        <button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>
        <div class="card-body">
          <h2>${esc(t('teleport', L))}</h2>
          <div class="menu-grid" style="margin-top:14px">
            ${go('atrium', t('atrium', L), t('directory', L), '#f1e7ec')}
            ${go('cashier', t('cashier', L), t('checkout', L), BRAND.magenta)}
            ${sectionButtons}
            ${game.layout.shops.some((x) => x.amenity === 'studio') ? go('studio', t('studioTitle', L), t('stylistRole', L), '#e8d9c8') : ''}
          </div>
          <button class="btn ghost block" style="margin-top:16px" data-action="avatar">${ICONS.camera}${esc(t('myCharacter', L))}</button>
          <h3>${esc(t('settings', L))}</h3>
          <div class="settings">
            <div class="setting"><span>${esc(t('quality', L))}</span>${seg('quality', s.quality, [
              ['auto', `${t('qAuto', L)}${s.quality === 'auto' ? ` (${t(s.activeQuality === 'low' ? 'qLow' : s.activeQuality === 'medium' ? 'qMedium' : 'qHigh', L)})` : ''}`],
              ['low', t('qLow', L)],
              ['medium', t('qMedium', L)],
              ['high', t('qHigh', L)],
            ])}</div>
            <div class="setting"><span>${esc(t('cameraView', L))}</span>${seg('view', s.view, [
              ['first', t('firstPerson', L)],
              ['third', t('thirdPerson', L)],
            ])}</div>
            <div class="setting"><span>${esc(t('frameRate', L))}</span>${seg('fpsCap', s.fpsCap, [
              [30, '30'],
              [60, '60'],
              [0, t('fpsMax', L)],
            ])}</div>
            ${game.isTouch ? `<div class="setting"><span>${esc(t('sensitivity', L))}</span>${seg('sensitivity', s.sensitivity, SENSITIVITY_STEPS.map((v, i) => [v, t((['sensLow', 'sensMedium', 'sensHigh', 'sensMax'] as const)[i], L)]))}</div>
            <div class="setting"><span>${esc(t('haptics', L))}</span>${seg('haptics', s.haptics, onOff)}</div>` : ''}
            <div class="setting"><span>${esc(t('music', L))}</span>${seg('music', s.music, onOff)}</div>
            <div class="setting"><span>${esc(t('sound', L))}</span>${seg('sound', s.sound, onOff)}</div>
            <div class="setting"><span>${esc(t('minimap', L))}</span>${seg('minimap', s.minimap, onOff)}</div>
            <div class="setting"><span>Language · اللغة</span>${seg('lang', L, [
              ['ar', 'العربية'],
              ['en', 'English'],
            ])}</div>
          </div>
          <p class="help">${esc(t(game.isTouch ? 'controlsMobile' : 'controlsDesktop', L))}${game.isTouch ? '' : ' · V ' + esc(t('cameraView', L)) + ' · T ' + esc(t('teleport', L))}</p>
        </div>
      </div>`)
  }

  for (const sel of [(s: ReturnType<typeof store.getState>) => s.overlay, (s: ReturnType<typeof store.getState>) => s.lang] as const) {
    watch(sel as (s: ReturnType<typeof store.getState>) => unknown, render)
  }
  watch((s) => s.quality, render, false)
  watch((s) => s.activeQuality, render, false)
  watch((s) => s.view, render, false)
  watch((s) => s.music, render, false)
  watch((s) => s.sound, render, false)
  watch((s) => s.minimap, render, false)
  watch((s) => s.sensitivity, render, false)
  watch((s) => s.fpsCap, render, false)
  watch((s) => s.haptics, render, false)
}
