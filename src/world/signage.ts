// Canvas-drawn bilingual signage. Fonts are loaded in index.html; call
// fontsReady() before building so the first paint uses them.

import type { CanvasTexture } from 'three'
import { BRAND } from '../config/brand'
import { canvasTexture, loadImage, makeCanvas } from '../engine/textures'
import type { Section } from '../data/types'

export async function fontsReady(): Promise<void> {
  if (!document.fonts) return
  const loads = [
    document.fonts.load(`600 64px ${BRAND.fontLatin}`),
    document.fonts.load(`700 64px ${BRAND.fontUi}`),
    document.fonts.load(`400 64px ${BRAND.fontUi}`, 'عربي'),
  ]
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 3500))])
}

function fitText(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, maxW: number): number {
  let px = start
  g.font = font(px)
  while (g.measureText(text).width > maxW && px > 10) {
    px -= 2
    g.font = font(px)
  }
  return px
}

function spaced(text: string): string {
  return text.toUpperCase().split('').join(' ')
}

export interface Monogram {
  initials: string
  color: string
}

/** Brand monogram in a ring (as in the client list). */
function drawMonogram(g: CanvasRenderingContext2D, m: Monogram, x: number, y: number, r: number): void {
  g.save()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = r * 0.12
  g.strokeStyle = m.color
  g.stroke()
  g.fillStyle = m.color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.direction = 'ltr'
  g.font = `800 ${r * (m.initials.length > 2 ? 0.62 : 0.8)}px ${BRAND.fontUi}`
  g.fillText(m.initials, x, y + r * 0.04)
  g.restore()
}

/** Fascia above a shop entrance: English serif + Arabic, with the brand monogram when given. */
export function shopFascia(section: Section, tint: string, brand?: Monogram): CanvasTexture {
  void tint
  if (brand) return brandFascia(section, brand)
  const [c, g] = makeCanvas(1024, 256)
  g.fillStyle = '#f4ede3'
  g.fillRect(0, 0, 1024, 256)
  g.strokeStyle = 'rgba(107,79,53,0.45)'
  g.lineWidth = 3
  g.strokeRect(14, 14, 996, 228)
  g.fillStyle = '#b08a5c'
  g.fillRect(412, 126, 200, 2)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#6b4f35'
  fitText(g, spaced(section.title), (px) => `500 ${px}px ${BRAND.fontLatin}`, 66, 900)
  g.fillText(spaced(section.title), 512, 76)
  g.fillStyle = BRAND.magenta
  g.direction = 'rtl'
  fitText(g, section.titleAr, (px) => `700 ${px}px ${BRAND.fontUi}`, 54, 900)
  g.fillText(section.titleAr, 512, 182)
  return canvasTexture(c)
}

function brandFascia(section: Section, m: Monogram): CanvasTexture {
  const [c, g] = makeCanvas(1024, 256)
  g.fillStyle = '#f7f2ec'
  g.fillRect(0, 0, 1024, 256)
  g.fillStyle = m.color
  g.fillRect(0, 244, 1024, 12)
  g.strokeStyle = 'rgba(107,79,53,0.35)'
  g.lineWidth = 3
  g.strokeRect(14, 14, 996, 222)
  drawMonogram(g, m, 128, 128, 84)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = m.color
  fitText(g, section.title.toUpperCase(), (px) => `700 ${px}px ${BRAND.fontLatin}`, 84, 720)
  g.fillText(section.title.toUpperCase(), 600, 92)
  g.fillStyle = '#5a4a3c'
  g.direction = 'rtl'
  fitText(g, section.titleAr, (px) => `700 ${px}px ${BRAND.fontUi}`, 52, 720)
  g.fillText(section.titleAr, 600, 186)
  return canvasTexture(c)
}

/** Hoarding for an empty unit: "Coming Soon" over 122 Mall stripes. */
export function comingSoonTexture(): CanvasTexture {
  const [c, g] = makeCanvas(1024, 320)
  g.fillStyle = '#efe6d8'
  g.fillRect(0, 0, 1024, 320)
  g.fillStyle = 'rgba(200,164,110,0.25)'
  for (let x = -320; x < 1024; x += 64) {
    g.beginPath()
    g.moveTo(x, 320)
    g.lineTo(x + 32, 320)
    g.lineTo(x + 352, 0)
    g.lineTo(x + 320, 0)
    g.fill()
  }
  g.fillStyle = 'rgba(247,242,236,0.92)'
  g.fillRect(212, 60, 600, 200)
  g.strokeStyle = BRAND.gold
  g.lineWidth = 4
  g.strokeRect(212, 60, 600, 200)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = BRAND.magenta
  g.font = `600 64px ${BRAND.fontLatin}`
  g.fillText('COMING SOON', 512, 122)
  g.direction = 'rtl'
  g.fillStyle = '#5a4a3c'
  g.font = `700 48px ${BRAND.fontUi}`
  g.fillText('قريباً في ١٢٢ مول', 512, 200)
  return canvasTexture(c)
}

/** Square double-sided blade sign that sticks out over the corridor. */
export function bladeSign(section: Section, brand?: Monogram): CanvasTexture {
  if (brand) {
    const [c, g] = makeCanvas(512, 512)
    g.fillStyle = '#f7f2ec'
    g.fillRect(0, 0, 512, 512)
    g.strokeStyle = brand.color
    g.lineWidth = 12
    g.strokeRect(18, 18, 476, 476)
    drawMonogram(g, brand, 256, 200, 120)
    g.fillStyle = '#3a2e26'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    fitText(g, section.title, (px) => `700 ${px}px ${BRAND.fontLatin}`, 60, 430)
    g.fillText(section.title, 256, 390)
    g.direction = 'rtl'
    g.fillStyle = brand.color
    fitText(g, section.titleAr, (px) => `700 ${px}px ${BRAND.fontUi}`, 44, 430)
    g.fillText(section.titleAr, 256, 450)
    return canvasTexture(c)
  }
  const [c, g] = makeCanvas(512, 512)
  g.fillStyle = '#f4ede3'
  g.fillRect(0, 0, 512, 512)
  g.strokeStyle = '#b08a5c'
  g.lineWidth = 10
  g.strokeRect(18, 18, 476, 476)
  g.fillStyle = '#6b4f35'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const words = section.title.replace('|', '·').split(' ')
  const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [section.title.replace('|', '·')]
  lines.forEach((l, i) => {
    fitText(g, l, (px) => `600 ${px}px ${BRAND.fontLatin}`, 70, 420)
    g.fillText(l, 256, 170 + i * 80 - (lines.length - 1) * 30)
  })
  g.fillStyle = BRAND.magenta
  g.direction = 'rtl'
  fitText(g, section.titleAr, (px) => `700 ${px}px ${BRAND.fontUi}`, 60, 420)
  g.fillText(section.titleAr, 256, 360)
  return canvasTexture(c)
}

/** Generic two-line bilingual sign (cashier, exit, lounge…). */
export function labelSign(en: string, ar: string, opts: { bg?: string; fg?: string; w?: number; h?: number; icon?: string } = {}): CanvasTexture {
  const w = opts.w ?? 1024
  const h = opts.h ?? 256
  const [c, g] = makeCanvas(w, h)
  g.fillStyle = opts.bg ?? '#ffffff'
  g.fillRect(0, 0, w, h)
  g.fillStyle = opts.fg ?? BRAND.magenta
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const iconW = opts.icon ? h * 0.7 : 0
  if (opts.icon) {
    g.font = `${h * 0.5}px ${BRAND.fontUi}`
    g.fillText(opts.icon, h * 0.45, h / 2)
  }
  const cx = (w + iconW) / 2
  fitText(g, en, (px) => `600 ${px}px ${BRAND.fontLatin}`, h * 0.34, w - iconW - 60)
  g.fillText(en, cx, h * 0.33)
  g.direction = 'rtl'
  fitText(g, ar, (px) => `700 ${px}px ${BRAND.fontUi}`, h * 0.3, w - iconW - 60)
  g.fillText(ar, cx, h * 0.72)
  return canvasTexture(c)
}

export interface DirectoryEntry {
  title: string
  titleAr: string
  arrow: string
  color: string
}

/** Tall directory totem listing every shop with a direction arrow. */
export function directoryTexture(entries: DirectoryEntry[]): CanvasTexture {
  const [c, g] = makeCanvas(512, 1024)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 512, 1024)
  g.fillStyle = '#8a6a46'
  g.fillRect(0, 0, 512, 150)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `600 44px ${BRAND.fontLatin}`
  g.fillText('Directory', 256, 55)
  g.direction = 'rtl'
  g.font = `700 38px ${BRAND.fontUi}`
  g.fillText('دليل المول', 256, 108)
  g.direction = 'ltr'
  const rowH = Math.min(84, 840 / entries.length)
  entries.forEach((e, i) => {
    const y = 175 + i * rowH + rowH / 2
    g.fillStyle = e.color
    g.fillRect(24, y - rowH / 2 + 6, 10, rowH - 12)
    g.fillStyle = BRAND.ink
    g.textAlign = 'left'
    fitText(g, e.title, (px) => `600 ${px}px ${BRAND.fontLatin}`, Math.min(28, rowH * 0.36), 200)
    g.fillText(e.title, 48, y)
    g.textAlign = 'right'
    g.direction = 'rtl'
    fitText(g, e.titleAr, (px) => `700 ${px}px ${BRAND.fontUi}`, Math.min(28, rowH * 0.36), 160)
    g.fillText(e.titleAr, 424, y)
    g.direction = 'ltr'
    g.textAlign = 'center'
    drawArrow(g, 458, y, e.arrow === '←' ? -1 : e.arrow === '↑' ? 0 : 1)
    g.fillStyle = 'rgba(0,0,0,0.06)'
    g.fillRect(24, y + rowH / 2 - 1, 464, 1)
  })
  return canvasTexture(c)
}

/** Direction arrow drawn as a path (glyph arrows get mirrored in RTL contexts). */
function drawArrow(g: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1 | 0): void {
  g.save()
  g.translate(x, y)
  if (dir === 0) g.rotate(-Math.PI / 2) // straight ahead
  else g.scale(dir, 1)
  g.strokeStyle = '#8a6a46'
  g.lineWidth = 5
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(-16, 0)
  g.lineTo(16, 0)
  g.moveTo(5, -11)
  g.lineTo(16, 0)
  g.lineTo(5, 11)
  g.stroke()
  g.restore()
}

/** Logo on a soft panel (async because the logo is an image). */
export async function logoTexture(bg: string | null, w = 1024, h = 300, logo: string = BRAND.logo): Promise<CanvasTexture> {
  const [c, g] = makeCanvas(w, h)
  if (bg) {
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
  }
  try {
    const img = await loadImage(logo)
    const s = Math.min((w * 0.8) / img.width, (h * 0.62) / img.height)
    g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s)
  } catch {
    g.fillStyle = BRAND.magenta
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `500 ${h * 0.45}px ${BRAND.fontLatin}`
    g.fillText(BRAND.name, w / 2, h / 2)
  }
  return canvasTexture(c)
}

/** Small price tag; shows the old price struck through on sale items. */
export function priceTagTexture(title: string, price: string, oldPrice: string | null, badge: string | null): CanvasTexture {
  const [c, g] = makeCanvas(512, 256)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 512, 256)
  g.fillStyle = BRAND.magenta
  g.fillRect(0, 0, 512, 10)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = BRAND.ink
  fitText(g, title, (px) => `600 ${px}px ${BRAND.fontLatin}`, 40, 470)
  g.fillText(title, 256, 70)
  g.fillStyle = BRAND.magenta
  g.font = `700 64px ${BRAND.fontUi}`
  g.fillText(price, oldPrice ? 190 : 256, 160)
  if (oldPrice) {
    g.fillStyle = '#9a8f96'
    g.font = `400 38px ${BRAND.fontUi}`
    g.fillText(oldPrice, 390, 162)
    const w = g.measureText(oldPrice).width
    g.fillRect(390 - w / 2, 160, w, 3)
  }
  if (badge) {
    g.fillStyle = BRAND.magenta
    g.fillRect(392, 212, 120, 44)
    g.fillStyle = '#ffffff'
    g.font = `700 28px ${BRAND.fontUi}`
    g.fillText(badge, 452, 235)
  }
  return canvasTexture(c)
}

// ---------------------------------------------------------------------------
// Boutique palette (matches the baked store: cream, oak, bronze)

export const BOUTIQUE_INK = '#6b4f35'
export const BOUTIQUE_CREAM = '#f4ede3'

/** Section header for a lookbook stand: cream panel, bronze serif + Arabic. */
export function boutiqueHeader(section: Section): CanvasTexture {
  const [c, g] = makeCanvas(1024, 192)
  g.fillStyle = BOUTIQUE_CREAM
  g.fillRect(0, 0, 1024, 192)
  g.strokeStyle = 'rgba(107,79,53,0.35)'
  g.lineWidth = 3
  g.strokeRect(10, 10, 1004, 172)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = BOUTIQUE_INK
  fitText(g, spaced(section.title), (px) => `500 ${px}px ${BRAND.fontLatin}`, 58, 900)
  g.fillText(spaced(section.title), 512, 66)
  g.fillStyle = BRAND.magenta
  g.direction = 'rtl'
  fitText(g, section.titleAr, (px) => `700 ${px}px ${BRAND.fontUi}`, 46, 900)
  g.fillText(section.titleAr, 512, 140)
  return canvasTexture(c)
}

/**
 * Product card = photo + title + price in one texture (one draw call per card).
 * `image` is the loaded product photo (canvas or img).
 */
export function productCardTexture(
  image: CanvasImageSource & { width: number; height: number },
  title: string,
  price: string,
  oldPrice: string | null,
  badge: string | null,
): CanvasTexture {
  const W = 512
  const PH = 620
  const H = 768
  const [c, g] = makeCanvas(W, H)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  // cover-crop the photo into the top area
  const s = Math.max(W / image.width, PH / image.height)
  const w = image.width * s
  const h = image.height * s
  g.drawImage(image, (W - w) / 2, (PH - h) / 2, w, h)
  if (badge) {
    g.fillStyle = BRAND.magenta
    g.fillRect(18, 18, 110, 46)
    g.fillStyle = '#fff'
    g.font = `700 28px ${BRAND.fontUi}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(badge, 73, 42)
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = BOUTIQUE_INK
  fitText(g, title, (px) => `500 ${px}px ${BRAND.fontLatin}`, 34, W - 40)
  g.fillText(title, W / 2, PH + 42)
  g.fillStyle = BRAND.magenta
  g.font = `700 38px ${BRAND.fontUi}`
  if (oldPrice) {
    g.fillText(price, W / 2 - 70, PH + 104)
    g.fillStyle = '#9a8f96'
    g.font = `400 28px ${BRAND.fontUi}`
    g.fillText(oldPrice, W / 2 + 95, PH + 106)
    const ow = g.measureText(oldPrice).width
    g.fillRect(W / 2 + 95 - ow / 2, PH + 105, ow, 2.5)
  } else {
    g.fillText(price, W / 2, PH + 104)
  }
  return canvasTexture(c)
}
