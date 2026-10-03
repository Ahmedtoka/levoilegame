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

/** Magenta fascia above a shop entrance: English serif + Arabic. */
export function shopFascia(section: Section, tint: string): CanvasTexture {
  const [c, g] = makeCanvas(1024, 256)
  g.fillStyle = BRAND.magenta
  g.fillRect(0, 0, 1024, 256)
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 3
  g.strokeRect(14, 14, 996, 228)
  g.fillStyle = tint
  g.fillRect(40, 124, 944, 2)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  fitText(g, spaced(section.title), (px) => `600 ${px}px ${BRAND.fontLatin}`, 68, 900)
  g.fillText(spaced(section.title), 512, 78)
  g.direction = 'rtl'
  fitText(g, section.titleAr, (px) => `700 ${px}px ${BRAND.fontUi}`, 58, 900)
  g.fillText(section.titleAr, 512, 182)
  return canvasTexture(c)
}

/** Square double-sided blade sign that sticks out over the boulevard. */
export function bladeSign(section: Section): CanvasTexture {
  const [c, g] = makeCanvas(512, 512)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 512, 512)
  g.strokeStyle = BRAND.magenta
  g.lineWidth = 10
  g.strokeRect(18, 18, 476, 476)
  g.fillStyle = BRAND.magenta
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const words = section.title.replace('|', '·').split(' ')
  const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [section.title.replace('|', '·')]
  lines.forEach((l, i) => {
    fitText(g, l, (px) => `600 ${px}px ${BRAND.fontLatin}`, 70, 420)
    g.fillText(l, 256, 170 + i * 80 - (lines.length - 1) * 30)
  })
  g.fillStyle = BRAND.ink
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
  g.fillStyle = BRAND.magenta
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
    drawArrow(g, 458, y, e.arrow === '←' ? -1 : 1)
    g.fillStyle = 'rgba(0,0,0,0.06)'
    g.fillRect(24, y + rowH / 2 - 1, 464, 1)
  })
  return canvasTexture(c)
}

/** Direction arrow drawn as a path (glyph arrows get mirrored in RTL contexts). */
function drawArrow(g: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1): void {
  g.save()
  g.translate(x, y)
  g.scale(dir, 1)
  g.strokeStyle = BRAND.magenta
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
    g.fillText('Le Voile', w / 2, h / 2)
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
