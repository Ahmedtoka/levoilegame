// Avatar editor, Bitmoji-style: the character big on the stage, a strip of category icons
// (skin, hijab & hair, eyes, brows, lips, face shape, glasses, outfits) and one row/grid of
// big options per category, plus "Take a selfie" on top. Complete outfits come from
// OUTFIT_PRESETS. The look is saved on the device (store.avatar). A live preview uses its
// own small renderer (only while the editor is open).

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
import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera'
import { Character } from '../actors/character'
import { analyzeSelfie, applyTraits } from '../actors/avatar/selfie'
import {
  AVATAR_FABRICS,
  AVATAR_GLASSES,
  AVATAR_GLASSES_COLORS,
  AVATAR_HAIR_COLORS,
  AVATAR_HAIRS,
  AVATAR_HIJABS,
  AVATAR_IRIS,
  AVATAR_LIPS,
  AVATAR_SKINS,
  defaultAvatar,
  OUTFIT_PRESETS,
  outfitPresetOf,
  randomAvatar,
  type AvatarData,
  type OutfitPreset,
} from '../actors/avatar/look'
import type { GlassesStyle, HairStyle, HijabStyle } from '../actors/avatar/pieces'
import { blobShadowTexture } from '../engine/textures'
import { t, type Lang, type StringKey } from '../i18n/i18n'
import { store, watch } from '../state/store'
import { audio } from '../audio/audio'
import { esc, el, ICONS, onAction, type GameBridge } from './dom'

type Tab = 'skin' | 'hair' | 'eyes' | 'brows' | 'lips' | 'face' | 'glasses' | 'outfit'

const TABS: [Tab, StringKey, string][] = [
  ['skin', 'tabSkin', '🎨'],
  ['hair', 'tabHair', '🧕'],
  ['eyes', 'tabEyes', '👁️'],
  ['brows', 'tabBrows', '〰️'],
  ['lips', 'tabLips', '👄'],
  ['face', 'tabFace', '🙂'],
  ['glasses', 'tabGlasses', '👓'],
  ['outfit', 'tabOutfit', '👗'],
]
const HIJAB_KEY: Record<HijabStyle, StringKey> = { classic: 'hijabClassic', long: 'hijabLong' }
const HAIR_KEY: Record<HairStyle, StringKey> = { long: 'hairLong', bun: 'hairBun', ponytail: 'hairPonytail', bob: 'hairBob' }
const GLASSES_KEY: Record<GlassesStyle, StringKey> = { round: 'glassesRound', square: 'glassesSquare' }
const ACCENTS = ['#ffffff', '#f1ebe4', '#26232a', '#c8a46e']

/** Outfit card: a flat silhouette in the preset's colours (no renderer needed for thumbnails). */
function outfitSvg(p: OutfitPreset, skin: string): string {
  const head = `<circle cx="50" cy="16" r="9" fill="${skin}"/>`
  const sleeves = (c: string) => `<path d="M30 34 L18 70 L28 72 L36 48 Z M70 34 L82 70 L72 72 L64 48 Z" fill="${c}"/>`
  let body = ''
  if (p.outfit === 'abaya') {
    body = `<path d="M36 28 L64 28 L80 118 L20 118 Z" fill="${p.top}"/><rect x="48" y="30" width="4" height="86" fill="${p.trim}"/>${sleeves(p.top)}`
  } else if (p.outfit === 'dress') {
    body = `<path d="M38 28 L62 28 L66 62 L34 62 Z" fill="${p.top}"/><path d="M34 62 L66 62 L80 118 L20 118 Z" fill="${p.top}"/><rect x="33" y="60" width="34" height="4" rx="2" fill="${p.trim}"/>${sleeves(p.top)}`
  } else if (p.outfit === 'skirt') {
    body = `<path d="M34 62 L66 62 L76 118 L24 118 Z" fill="${p.bottom}"/><path d="M38 28 L62 28 L68 70 L32 70 Z" fill="${p.top}"/>${sleeves(p.top)}`
  } else {
    body = `<path d="M36 62 L49 62 L47 118 L30 118 Z M51 62 L64 62 L70 118 L53 118 Z" fill="${p.bottom}"/><path d="M38 28 L62 28 L68 70 L32 70 Z" fill="${p.top}"/>${sleeves(p.top)}`
  }
  const shoes = `<rect x="30" y="116" width="16" height="5" rx="2" fill="${p.shoes}"/><rect x="54" y="116" width="16" height="5" rx="2" fill="${p.shoes}"/>`
  return `<svg viewBox="0 0 100 124" xmlns="http://www.w3.org/2000/svg">${head}${body}${shoes}</svg>`
}

export function mountAvatarEditor(root: HTMLElement, game: GameBridge): void {
  const veil = el('div', 'screen avatar-editor hidden')
  root.appendChild(veil)
  let draft: AvatarData = defaultAvatar()
  let tab: Tab = 'skin'
  let stage: PreviewStage | null = null
  let selfieState: 'idle' | 'busy' | 'done' | 'none' = 'idle'

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
    headKind: (b) =>
      set({
        head:
          b.dataset.v === 'hair'
            ? { kind: 'hair', style: 'long', color: draft.head.kind === 'hair' ? draft.head.color : AVATAR_HAIR_COLORS[1] }
            : { kind: 'hijab', style: 'classic', color: draft.head.kind === 'hijab' ? draft.head.color : '#c99aae', accent: '#ffffff' },
      }),
    hijabStyle: (b) => draft.head.kind === 'hijab' && set({ head: { ...draft.head, style: b.dataset.v as HijabStyle } }),
    hairStyle: (b) => draft.head.kind === 'hair' && set({ head: { ...draft.head, style: b.dataset.v as HairStyle } }),
    headColor: (b) => set({ head: { ...draft.head, color: b.dataset.v! } }),
    accent: (b) => draft.head.kind === 'hijab' && set({ head: { ...draft.head, accent: b.dataset.v || undefined } }),
    iris: (b) => set({ iris: b.dataset.v! }),
    lips: (b) => set({ lips: b.dataset.v! }),
    brows: (b) => set({ brows: b.dataset.v! }),
    glasses: (b) => set({ glasses: (b.dataset.v || undefined) as GlassesStyle | undefined }),
    glassesColor: (b) => set({ glassesColor: b.dataset.v! }),
    preset: (b) => {
      const p = OUTFIT_PRESETS.find((x) => x.id === b.dataset.v)
      if (p) set({ outfit: p.outfit, top: p.top, bottom: p.bottom, trim: p.trim, shoes: p.shoes })
    },
    random: () => set(randomAvatar()),
    selfie: () => void takeSelfie(),
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

  // Sliders (face width, jaw, brows) update the draft live.
  veil.addEventListener('input', (e) => {
    const r = e.target as HTMLInputElement
    if (!r.dataset.range) return
    draft = { ...draft, [r.dataset.range]: Number(r.value) }
    stage?.show(draft)
  })

  /** Photo -> traits -> draft. Analysis runs on the device (MediaPipe); nothing is uploaded. */
  const takeSelfie = async () => {
    if (selfieState === 'busy') return
    selfieState = 'busy'
    renderPanel()
    try {
      const photo = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Camera, direction: CameraDirection.Front, quality: 85, width: 900, correctOrientation: true })
      if (!photo.dataUrl) throw new Error('cancelled')
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('bad image'))
        img.src = photo.dataUrl!
      })
      const traits = await analyzeSelfie(img)
      if (!traits) {
        selfieState = 'none'
        renderPanel()
        return
      }
      selfieState = 'done'
      tab = 'hair'
      set(applyTraits(traits, draft))
    } catch (err) {
      // Cancelled or no camera: back to the idle button.
      console.info('[selfie]', err)
      selfieState = 'idle'
      renderPanel()
    }
  }

  const swatches = (action: string, colors: readonly string[], current: string | undefined, extra = '', big = true) =>
    `<div class="swatches${big ? ' big' : ''}">${extra}${colors
      .map((c) => `<button class="sw${c === current ? ' on' : ''}" style="--c:${c}" data-action="${action}" data-v="${c}" aria-label="${c}"></button>`)
      .join('')}</div>`
  const chips = (action: string, options: [string, string][], current: string) =>
    `<div class="chips">${options
      .map(([v, label]) => `<button class="chip${v === current ? ' on' : ''}" data-action="${action}" data-v="${esc(v)}">${esc(label)}</button>`)
      .join('')}</div>`
  const row = (label: string, body: string) => `<div class="ae-row">${label ? `<h4>${esc(label)}</h4>` : ''}${body}</div>`
  const slider = (key: 'faceWidth' | 'jaw' | 'browThick', lo: number, hi: number) =>
    `<input type="range" data-range="${key}" min="${lo}" max="${hi}" step="0.01" value="${draft[key] ?? 1}" />`

  const panelHtml = (L: Lang): string => {
    const d = draft
    switch (tab) {
      case 'skin':
        return row('', swatches('skin', AVATAR_SKINS, d.skin))
      case 'hair': {
        const h = d.head
        let out = chips('headKind', [['hijab', t('hijab', L)], ['hair', t('hair', L)]], h.kind)
        if (h.kind === 'hijab') {
          out += row('', chips('hijabStyle', AVATAR_HIJABS.map((s) => [s, t(HIJAB_KEY[s], L)]), h.style))
          out += row(t('hijabColor', L), swatches('headColor', AVATAR_FABRICS, h.color, '', false))
          out += row(t('underScarf', L), swatches('accent', ACCENTS, h.accent, `<button class="sw none${h.accent ? '' : ' on'}" data-action="accent" data-v="" aria-label="${esc(t('none', L))}">${ICONS.close}</button>`, false))
        } else {
          out += row('', chips('hairStyle', AVATAR_HAIRS.map((s) => [s, t(HAIR_KEY[s], L)]), h.style))
          out += row(t('hairColor', L), swatches('headColor', AVATAR_HAIR_COLORS, h.color))
        }
        return out
      }
      case 'eyes':
        return row(t('eyeColor', L), swatches('iris', AVATAR_IRIS, d.iris))
      case 'brows':
        return row(t('browColor', L), swatches('brows', AVATAR_HAIR_COLORS, d.brows)) + row(t('browThick', L), slider('browThick', 0.7, 1.5))
      case 'lips':
        return row('', swatches('lips', AVATAR_LIPS, d.lips))
      case 'face':
        return row(t('faceWidth', L), slider('faceWidth', 0.86, 1.14)) + row(t('jawWidth', L), slider('jaw', 0.84, 1.14))
      case 'glasses':
        return (
          row('', chips('glasses', [['', t('none', L)], ...AVATAR_GLASSES.map((g) => [g, t(GLASSES_KEY[g], L)] as [string, string])], d.glasses ?? '')) +
          (d.glasses ? row(t('glassesColor', L), swatches('glassesColor', AVATAR_GLASSES_COLORS, d.glassesColor ?? AVATAR_GLASSES_COLORS[0])) : '')
        )
      case 'outfit': {
        const cur = outfitPresetOf(d)?.id
        return `<div class="outfits">${OUTFIT_PRESETS.map(
          (p) => `<button class="outfit${p.id === cur ? ' on' : ''}" data-action="preset" data-v="${p.id}" aria-label="${p.id}">${outfitSvg(p, d.skin)}</button>`,
        ).join('')}</div>`
      }
    }
  }

  const renderPanel = () => {
    const s = store.getState()
    const L = s.lang
    const panel = veil.querySelector<HTMLElement>('.ae-panel')
    if (!panel) return
    const selfie =
      selfieState === 'busy'
        ? `<div class="ae-selfie busy"><span class="spin"></span>${esc(t('analysing', L))}</div>`
        : `<button class="ae-selfie" data-action="selfie">${ICONS.camera}<span><b>${esc(t('takeSelfie', L))}</b><small>${esc(selfieState === 'none' ? t('noFaceFound', L) : selfieState === 'done' ? t('selfieDone', L) : t('selfieHint', L))}</small></span></button>`
    panel.innerHTML = `
      <div class="ae-head">
        <h2>${esc(t('avatarTitle', L))}</h2>
        <div class="ae-head-actions">
          <button class="icon-btn" data-action="random" aria-label="${esc(t('surpriseMe', L))}">🎲</button>
          ${s.avatar || s.phase === 'playing' ? `<button class="icon-btn" data-action="close" aria-label="${esc(t('close', L))}">${ICONS.close}</button>` : ''}
        </div>
      </div>
      ${selfie}
      <div class="ae-tabs">${TABS.map(([k, key, ico]) => `<button class="${k === tab ? 'on' : ''}" data-action="tab" data-v="${k}" title="${esc(t(key, L))}"><span class="ico">${ico}</span><span class="lbl">${esc(t(key, L))}</span></button>`).join('')}</div>
      <div class="ae-body">${panelHtml(L)}</div>
      <div class="ae-actions">
        <button class="btn block" data-action="save">${esc(t(s.phase === 'intro' ? 'enterMall' : 'done', L))}</button>
      </div>`
  }

  const open = () => {
    const s = store.getState()
    draft = s.avatar ? structuredClone(s.avatar) : defaultAvatar()
    tab = 'skin'
    selfieState = 'idle'
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

/** Small dedicated renderer for a character preview (exists only while its overlay is open). */
export class PreviewStage {
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

  /** Show a character with this look; `dress` can put more on it (try-on fabrics). */
  show(d: AvatarData, dress?: (c: Character) => void): void {
    const old = this.char
    const c = new Character({ ...d, pose: 'relaxed' }, 3)
    dress?.(c)
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
