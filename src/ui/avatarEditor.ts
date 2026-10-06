// Avatar editor: the visitor designs her character before entering (and any time
// from the menu). A live 3D preview (its own small renderer, only while open) and
// a panel of choices; the look is saved on the device (store.avatar).

import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  ACESFilmicToneMapping,
} from 'three'
import { Character } from '../actors/character'
import { FACE_STYLES, faceTexture } from '../actors/avatar/face'
import {
  AVATAR_FABRICS,
  AVATAR_HAIR_COLORS,
  AVATAR_HAIRS,
  AVATAR_HIJABS,
  AVATAR_OUTFITS,
  AVATAR_SHOES,
  AVATAR_SKINS,
  AVATAR_TRIMS,
  defaultAvatar,
  randomAvatar,
  type AvatarData,
} from '../actors/avatar/look'
import type { AvatarOutfit, HairStyle, HijabStyle } from '../actors/avatar/pieces'
import { blobShadowTexture } from '../engine/textures'
import { t, type Lang, type StringKey } from '../i18n/i18n'
import { store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { esc, el, ICONS, onAction, type GameBridge } from './dom'

type Tab = 'look' | 'head' | 'outfit'

const OUTFIT_KEY: Record<AvatarOutfit, StringKey> = { abaya: 'outfitAbaya', dress: 'outfitDress', skirt: 'outfitSkirt', pants: 'outfitPants' }
const HIJAB_KEY: Record<HijabStyle, StringKey> = { classic: 'hijabClassic', long: 'hijabLong' }
const HAIR_KEY: Record<HairStyle, StringKey> = { long: 'hairLong', bun: 'hairBun', ponytail: 'hairPonytail', bob: 'hairBob' }
const ACCENTS = ['#ffffff', '#f1ebe4', '#26232a', '#c8a46e']

export function mountAvatarEditor(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'screen avatar-editor hidden')
  root.appendChild(veil)
  let draft: AvatarData = defaultAvatar()
  let tab: Tab = 'look'
  let stage: PreviewStage | null = null

  const set = (patch: Partial<AvatarData>) => {
    draft = { ...draft, ...patch }
    // One-piece outfits are one colour.
    if (draft.outfit === 'abaya' || draft.outfit === 'dress') draft.bottom = draft.top
    audio.click()
    renderPanel()
    stage?.show(draft)
  }

  onAction(veil, {
    tab: (b) => {
      tab = b.dataset.v as Tab
      audio.click()
      renderPanel()
    },
    skin: (b) => set({ skin: b.dataset.v! }),
    face: (b) => set({ face: Number(b.dataset.v) }),
    headKind: (b) =>
      set({
        head:
          b.dataset.v === 'hair'
            ? { kind: 'hair', style: 'long', color: AVATAR_HAIR_COLORS[1] }
            : { kind: 'hijab', style: 'classic', color: '#c99aae', accent: '#ffffff' },
      }),
    hijabStyle: (b) => draft.head.kind === 'hijab' && set({ head: { ...draft.head, style: b.dataset.v as HijabStyle } }),
    hairStyle: (b) => draft.head.kind === 'hair' && set({ head: { ...draft.head, style: b.dataset.v as HairStyle } }),
    headColor: (b) => set({ head: { ...draft.head, color: b.dataset.v! } }),
    accent: (b) => draft.head.kind === 'hijab' && set({ head: { ...draft.head, accent: b.dataset.v || undefined } }),
    outfit: (b) => set({ outfit: b.dataset.v as AvatarOutfit }),
    top: (b) => set({ top: b.dataset.v! }),
    bottom: (b) => set({ bottom: b.dataset.v! }),
    trim: (b) => set({ trim: b.dataset.v! }),
    shoes: (b) => set({ shoes: b.dataset.v! }),
    random: () => set(randomAvatar()),
    close: () => store.getState().set({ overlay: null }),
    save: () => {
      const s = store.getState()
      const first = !s.avatar
      // The first time, switch to third person so she sees her new character.
      s.set({ avatar: draft, overlay: null, ...(first ? { view: 'third' as const } : {}) })
      if (s.phase === 'intro') game.enterMall()
      else game.resume()
    },
  })

  const swatches = (action: string, colors: readonly string[], current: string | undefined, extra = '') =>
    `<div class="swatches">${extra}${colors
      .map((c) => `<button class="sw${c === current ? ' on' : ''}" style="--c:${c}" data-action="${action}" data-v="${c}" aria-label="${c}"></button>`)
      .join('')}</div>`
  const chips = (action: string, options: [string, string][], current: string) =>
    `<div class="chips">${options
      .map(([v, label]) => `<button class="chip${v === current ? ' on' : ''}" data-action="${action}" data-v="${esc(v)}">${esc(label)}</button>`)
      .join('')}</div>`
  const row = (label: string, body: string) => `<div class="ae-row"><h4>${esc(label)}</h4>${body}</div>`

  const faceThumbs = new Map<string, string>()
  const faceThumb = (i: number, skin: string) => {
    const key = `${i}|${skin}`
    let url = faceThumbs.get(key)
    if (!url) {
      const c = document.createElement('canvas')
      c.width = c.height = 96
      const g = c.getContext('2d')!
      g.fillStyle = skin
      g.beginPath()
      g.arc(48, 48, 46, 0, Math.PI * 2)
      g.fill()
      const img = faceTexture(i, '#3a2a22').image as HTMLCanvasElement
      // The features sit in the middle of the head texture.
      g.drawImage(img, img.width * 0.22, img.height * 0.3, img.width * 0.56, img.height * 0.56, 4, 4, 88, 88)
      url = c.toDataURL()
      faceThumbs.set(key, url)
    }
    return url
  }

  const panelHtml = (L: Lang): string => {
    const d = draft
    if (tab === 'look') {
      return (
        row(t('skinTone', L), swatches('skin', AVATAR_SKINS, d.skin)) +
        row(
          t('faceStyle', L),
          `<div class="faces">${FACE_STYLES.map(
            (_, i) => `<button class="face${i === d.face ? ' on' : ''}" data-action="face" data-v="${i}"><img src="${faceThumb(i, d.skin)}" alt="" /></button>`,
          ).join('')}</div>`,
        )
      )
    }
    if (tab === 'head') {
      const h = d.head
      let out = chips('headKind', [['hijab', t('hijab', L)], ['hair', t('hair', L)]], h.kind)
      if (h.kind === 'hijab') {
        out += row('', chips('hijabStyle', AVATAR_HIJABS.map((s) => [s, t(HIJAB_KEY[s], L)]), h.style))
        out += row(t('hijabColor', L), swatches('headColor', AVATAR_FABRICS, h.color))
        out += row(
          t('underScarf', L),
          swatches('accent', ACCENTS, h.accent, `<button class="sw none${h.accent ? '' : ' on'}" data-action="accent" data-v="" aria-label="${esc(t('none', L))}">${ICONS.close}</button>`),
        )
      } else {
        out += row('', chips('hairStyle', AVATAR_HAIRS.map((s) => [s, t(HAIR_KEY[s], L)]), h.style))
        out += row(t('hairColor', L), swatches('headColor', AVATAR_HAIR_COLORS, h.color))
      }
      return out
    }
    const one = d.outfit === 'abaya' || d.outfit === 'dress'
    const topLabel: StringKey = d.outfit === 'abaya' ? 'abayaColor' : d.outfit === 'dress' ? 'dressColor' : 'topColor'
    return (
      chips('outfit', AVATAR_OUTFITS.map((o) => [o, t(OUTFIT_KEY[o], L)]), d.outfit) +
      row(t(topLabel, L), swatches('top', AVATAR_FABRICS, d.top)) +
      (one ? row(t('trimColor', L), swatches('trim', AVATAR_TRIMS, d.trim)) : row(t('bottomColor', L), swatches('bottom', AVATAR_FABRICS, d.bottom))) +
      row(t('shoesColor', L), swatches('shoes', AVATAR_SHOES, d.shoes))
    )
  }

  const renderPanel = () => {
    const s = store.getState()
    const L = s.lang
    const body = veil.querySelector<HTMLElement>('.ae-body')
    const scroll = body?.scrollTop ?? 0
    const tabs: [Tab, StringKey][] = [
      ['look', 'avatarLooks'],
      ['head', 'avatarHead'],
      ['outfit', 'avatarOutfit'],
    ]
    const panel = veil.querySelector<HTMLElement>('.ae-panel')
    if (!panel) return
    panel.innerHTML = `
      ${s.avatar || s.phase === 'playing' ? `<button class="close" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>` : ''}
      <h2>${esc(t('avatarTitle', L))}</h2>
      <p class="ae-sub">${esc(t('avatarSub', L))}</p>
      <div class="ae-tabs">${tabs.map(([k, key]) => `<button class="${k === tab ? 'on' : ''}" data-action="tab" data-v="${k}">${esc(t(key, L))}</button>`).join('')}</div>
      <div class="ae-body">${panelHtml(L)}</div>
      <div class="ae-actions">
        <button class="btn ghost" data-action="random">${esc(t('surpriseMe', L))}</button>
        <button class="btn" data-action="save">${esc(t(s.phase === 'intro' ? 'enterMall' : 'saveLook', L))}</button>
      </div>`
    const nb = veil.querySelector<HTMLElement>('.ae-body')
    if (nb) nb.scrollTop = scroll
  }

  const open = () => {
    const s = store.getState()
    draft = s.avatar ? structuredClone(s.avatar) : defaultAvatar()
    tab = 'look'
    veil.innerHTML = `
      <div class="ae">
        <div class="ae-stage"><canvas></canvas><span class="ae-hint">${esc(t('dragToTurn', s.lang))}</span></div>
        <div class="ae-panel card"></div>
      </div>`
    veil.classList.remove('hidden')
    renderPanel()
    stage = new PreviewStage(veil.querySelector('canvas')!)
    stage.show(draft)
  }
  const close = () => {
    veil.classList.add('hidden')
    stage?.dispose()
    stage = null
  }

  watch((s) => s.overlay, (o, prev) => {
    if (o === 'avatar' && prev !== 'avatar') open()
    else if (o !== 'avatar' && !veil.classList.contains('hidden')) close()
  })
  watch((s) => s.lang, () => {
    if (!veil.classList.contains('hidden')) renderPanel()
  }, false)
}

/** Small dedicated renderer for the character preview (exists only while the editor is open). */
class PreviewStage {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(26, 1, 0.1, 20)
  private char: Character | null = null
  private yaw = 0.35
  private raf = 0
  private last = performance.now()
  private readonly ro: ResizeObserver
  private drag: { x: number; yaw: number } | null = null

  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.scene.add(new HemisphereLight(0xffffff, new Color('#e8d9df'), 1.6))
    const key = new DirectionalLight(0xffffff, 2.2)
    key.position.set(1.5, 3, 3)
    this.scene.add(key)
    const rim = new DirectionalLight(0xf3d7e6, 1.2)
    rim.position.set(-2, 2, -2.5)
    this.scene.add(rim)
    const floor = new Mesh(new PlaneGeometry(1.4, 1.4), new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, opacity: 0.7, depthWrite: false }))
    floor.rotation.x = -Math.PI / 2
    this.scene.add(floor)
    this.camera.position.set(0, 1.0, 4.4)
    this.camera.lookAt(0, 0.86, 0)

    canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    this.loop()
  }

  show(d: AvatarData): void {
    const old = this.char
    const c = new Character({ ...d, pose: 'relaxed' }, 3)
    if (old) {
      old.root.removeFromParent()
      // Geometry is shared (cached per piece set); only the material is per character.
      old.root.traverse((o) => {
        const m = o as Mesh
        if (m.isMesh && m.material && !Array.isArray(m.material) && 'userData' in m.material && (m.material.userData as { palette?: unknown }).palette) m.material.dispose()
      })
    } else {
      c.wave()
    }
    this.scene.add(c.root)
    this.char = c
  }

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, yaw: this.yaw }
    this.canvas.setPointerCapture?.(e.pointerId)
  }
  private onMove = (e: PointerEvent) => {
    if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012
  }
  private onUp = () => {
    this.drag = null
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Keep the whole figure in frame on narrow (portrait) stages.
    this.camera.position.z = w / h < 0.7 ? 5.6 : 4.4
    this.camera.updateProjectionMatrix()
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    const c = this.char
    if (c) {
      c.root.rotation.y = this.yaw
      c.update(dt, now / 1000)
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
