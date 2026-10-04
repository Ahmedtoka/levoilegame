import { BRAND } from '../config/brand'
import { el } from './dom'

/** Brand-coloured confetti burst (order placed, prize won, group deal unlocked). */
export function confetti(): void {
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
