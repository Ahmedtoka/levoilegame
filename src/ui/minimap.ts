// North-up minimap drawn from the layout (no extra render pass).

import { BRAND } from '../config/brand'
import type { MallLayout } from '../config/layout'
import { store, watch } from '../state/store'
import { el, type GameBridge } from './dom'

export function mountMinimap(root: HTMLElement, game: GameBridge, getMarker: () => { x: number; z: number } | null): void {
  const wrap = el('div', 'minimap')
  const canvas = el('canvas')
  wrap.appendChild(canvas)
  root.appendChild(wrap)
  const L: MallLayout = game.layout
  const b = L.bounds
  const worldW = b.x1 - b.x0
  const worldH = b.z1 - b.z0
  // Fit the whole mall (plaza + wings) in a small box.
  const scale = Math.min((game.isTouch ? 170 : 240) / worldW, (game.isTouch ? 120 : 170) / worldH)
  const W = Math.round(worldW * scale)
  const H = Math.round(worldH * scale)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  const g = canvas.getContext('2d')!
  g.scale(dpr, dpr)
  const px = (x: number) => (x - b.x0) * scale
  const pz = (z: number) => (z - b.z0) * scale

  // Static layer
  const bg = document.createElement('canvas')
  bg.width = W * dpr
  bg.height = H * dpr
  const s = bg.getContext('2d')!
  s.scale(dpr, dpr)
  s.fillStyle = '#fbf7f9'
  s.fillRect(0, 0, W, H)
  s.fillStyle = '#f1e7ec'
  for (const r of [L.atrium, ...L.wings.map((w) => w.rect)]) s.fillRect(px(r.x0), pz(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale)
  for (const shop of L.shops) {
    const r = shop.rect
    s.fillStyle = shop.kind === 'soon' ? '#e9e2d8' : (shop.style?.tint ?? '#ece4e8')
    s.fillRect(px(r.x0) + 1, pz(r.z0) + 1, (r.x1 - r.x0) * scale - 2, (r.z1 - r.z0) * scale - 2)
    s.fillStyle = shop.kind === 'shop' && shop.brand ? shop.brand.color : 'rgba(42,31,39,.45)'
    s.font = `800 ${Math.min(10, Math.max(7, Math.round(scale * 3.4)))}px Cairo, sans-serif`
    s.textAlign = 'center'
    s.textBaseline = 'middle'
    const label = shop.kind === 'shop' ? (shop.brand?.initials ?? shop.section?.title.slice(0, 2) ?? '') : shop.kind === 'soon' ? '·' : shop.amenity === 'studio' ? '✂' : '☕'
    s.fillText(label, px(shop.center.x), pz(shop.center.z))
  }
  // Cashier + exit
  s.fillStyle = BRAND.magenta
  const c = L.cashier.zone
  s.fillRect(px(c.x0), pz(c.z0), (c.x1 - c.x0) * scale, (c.z1 - c.z0) * scale)
  s.fillStyle = '#fff'
  s.font = `800 ${Math.min(11, Math.max(8, Math.round(scale * 4)))}px Cairo, sans-serif`
  s.fillText('$', px((c.x0 + c.x1) / 2), pz((c.z0 + c.z1) / 2))
  s.fillStyle = BRAND.magenta
  const ex = L.exit.zone
  s.fillRect(px(ex.x0), pz(ex.z0), (ex.x1 - ex.x0) * scale, Math.max(3, (ex.z1 - ex.z0) * scale * 0.3))
  s.strokeStyle = 'rgba(42,31,39,.25)'
  s.lineWidth = 1
  s.strokeRect(0.5, 0.5, W - 1, H - 1)

  let last = 0
  const draw = (now: number) => {
    requestAnimationFrame(draw)
    const st = store.getState()
    if (!st.minimap || st.phase !== 'playing' || now - last < 66) return
    last = now
    g.clearRect(0, 0, W, H)
    g.drawImage(bg, 0, 0, W, H)
    const m = getMarker()
    if (m) {
      const pulse = 4 + Math.sin(now / 200) * 1.5
      g.strokeStyle = BRAND.magenta
      g.lineWidth = 2
      g.beginPath()
      g.arc(px(m.x), pz(m.z), pulse, 0, Math.PI * 2)
      g.stroke()
    }
    const p = game.playerPose()
    g.save()
    g.translate(px(p.x), pz(p.z))
    g.rotate(-p.yaw)
    g.fillStyle = 'rgba(91,43,130,.18)'
    g.beginPath()
    g.moveTo(0, 0)
    g.arc(0, 0, 22, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55)
    g.closePath()
    g.fill()
    g.fillStyle = BRAND.ink
    g.beginPath()
    g.moveTo(0, -6)
    g.lineTo(4.5, 5)
    g.lineTo(0, 2.5)
    g.lineTo(-4.5, 5)
    g.closePath()
    g.fill()
    g.restore()
  }
  requestAnimationFrame(draw)

  watch((s) => s.minimap, (on) => wrap.classList.toggle('off', !on))
  watch((s) => s.phase, (p) => wrap.classList.toggle('hidden', p !== 'playing'))
}
