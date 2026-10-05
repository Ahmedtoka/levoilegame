// Canvas-drawn faces for the avatar head. The head's UVs are a front orthographic
// projection (u: head width, v: head height, 0.5 = head centre; see
// piece_head in scripts/blender/build_avatar.py), so features are drawn in the
// middle of a transparent texture and the material lays them over the skin.

import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

export interface FaceStyle {
  /** Eye shape: round (Zepeto-like), almond, or soft (lower lids). */
  eye: 'round' | 'almond' | 'soft'
  iris: string
  lips: string
  brow: number
  blush: number
}

/** Face presets offered in the avatar editor (index = Look.face). */
export const FACE_STYLES: readonly FaceStyle[] = [
  { eye: 'round', iris: '#3b2618', lips: '#c96f7b', brow: 1, blush: 0.32 },
  { eye: 'almond', iris: '#2a1c14', lips: '#b65f63', brow: 1.15, blush: 0.22 },
  { eye: 'soft', iris: '#4b3221', lips: '#d68a8f', brow: 0.9, blush: 0.36 },
  { eye: 'round', iris: '#5a4030', lips: '#a85462', brow: 1.05, blush: 0.26 },
  { eye: 'almond', iris: '#3d2b1f', lips: '#cf7f85', brow: 0.95, blush: 0.3 },
  { eye: 'soft', iris: '#26201c', lips: '#b9646e', brow: 1.2, blush: 0.2 },
]

const SIZE = 256
const cache = new Map<string, Texture>()

/** Face texture for a preset and brow colour (cached; shared by every character using it). */
export function faceTexture(style: number, browColor: string): Texture {
  const f = FACE_STYLES[((style % FACE_STYLES.length) + FACE_STYLES.length) % FACE_STYLES.length]
  const key = `${style}|${browColor}`
  let tex = cache.get(key)
  if (tex) return tex
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = c.getContext('2d')!
  drawFace(g, f, browColor)
  tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}

/** UV (0..1, v up) -> canvas pixels. */
const X = (u: number) => u * SIZE
const Y = (v: number) => (1 - v) * SIZE

function drawFace(g: CanvasRenderingContext2D, f: FaceStyle, brow: string): void {
  g.clearRect(0, 0, SIZE, SIZE)
  // Blush
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(X(0.5 + s * 0.175), Y(0.375), 0, X(0.5 + s * 0.175), Y(0.375), X(0.07))
    gr.addColorStop(0, `rgba(236,120,140,${f.blush})`)
    gr.addColorStop(1, 'rgba(236,120,140,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, SIZE, SIZE)
  }
  for (const s of [-1, 1]) eye(g, f, 0.5 + s * 0.108, 0.452, s)
  // Brows: soft arcs
  g.strokeStyle = brow
  g.lineCap = 'round'
  g.lineWidth = X(0.013) * f.brow
  for (const s of [-1, 1]) {
    const cx = 0.5 + s * 0.112
    g.beginPath()
    g.moveTo(X(cx - s * 0.05), Y(0.548))
    g.quadraticCurveTo(X(cx + s * 0.005), Y(0.585), X(cx + s * 0.058), Y(0.556))
    g.stroke()
  }
  // Nose: a tiny soft shadow
  g.fillStyle = 'rgba(150,90,70,0.3)'
  g.beginPath()
  g.ellipse(X(0.5), Y(0.382), X(0.011), X(0.007), 0, 0, Math.PI * 2)
  g.fill()
  // Mouth: small smile with a fuller lower lip
  g.fillStyle = f.lips
  g.beginPath()
  g.moveTo(X(0.462), Y(0.33))
  g.quadraticCurveTo(X(0.5), Y(0.342), X(0.538), Y(0.33))
  g.quadraticCurveTo(X(0.5), Y(0.292), X(0.462), Y(0.33))
  g.fill()
  g.strokeStyle = 'rgba(90,40,45,0.55)'
  g.lineWidth = X(0.005)
  g.beginPath()
  g.moveTo(X(0.462), Y(0.33))
  g.quadraticCurveTo(X(0.5), Y(0.322), X(0.538), Y(0.33))
  g.stroke()
}

/** Big Zepeto-style eye: mostly iris, a heavy upper lash line with a flick, two glints. */
function eye(g: CanvasRenderingContext2D, f: FaceStyle, cu: number, cv: number, s: number): void {
  const w = f.eye === 'almond' ? 0.058 : 0.052
  const h = f.eye === 'round' ? 0.068 : f.eye === 'almond' ? 0.052 : 0.058
  g.save()
  // Eye opening (flatter on top for almond/soft).
  g.beginPath()
  g.ellipse(X(cu), Y(cv), X(w), X(h), 0, 0, Math.PI * 2)
  g.fillStyle = '#fbf8f6'
  g.fill()
  g.clip()
  // Iris + pupil, slightly raised, filling most of the opening.
  const ir = h * 0.92
  const iv = cv + h * 0.04
  const gr = g.createRadialGradient(X(cu), Y(iv - ir * 0.2), 0, X(cu), Y(iv), X(ir))
  gr.addColorStop(0, shade(f.iris, 1.35))
  gr.addColorStop(0.55, f.iris)
  gr.addColorStop(1, shade(f.iris, 0.45))
  g.fillStyle = gr
  g.beginPath()
  g.ellipse(X(cu), Y(iv), X(ir * 0.8), X(ir), 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#140d0a'
  g.beginPath()
  g.ellipse(X(cu), Y(iv), X(ir * 0.36), X(ir * 0.44), 0, 0, Math.PI * 2)
  g.fill()
  // Upper-lid shadow
  g.fillStyle = 'rgba(40,20,15,0.25)'
  g.fillRect(X(cu - w), Y(cv + h), X(2 * w), X(h * 0.45))
  g.restore()
  // Highlights
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.ellipse(X(cu + 0.016), Y(iv + 0.02), X(0.012), X(0.014), 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.ellipse(X(cu - 0.014), Y(iv - 0.024), X(0.005), X(0.005), 0, 0, Math.PI * 2)
  g.fill()
  // Heavy upper lash line + outer flick
  g.strokeStyle = '#1b1210'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = X(0.016)
  g.beginPath()
  g.ellipse(X(cu), Y(cv), X(w * 1.02), X(h * 1.02), 0, Math.PI * 1.05, Math.PI * 1.95)
  g.stroke()
  g.lineWidth = X(0.011)
  g.beginPath()
  const ox = cu + s * w * 0.96
  g.moveTo(X(ox), Y(cv + h * 0.3))
  g.quadraticCurveTo(X(ox + s * 0.016), Y(cv + h * 0.55), X(ox + s * 0.026), Y(cv + h * 0.75))
  g.stroke()
  // Soft lower lash
  g.lineWidth = X(0.004)
  g.strokeStyle = 'rgba(60,35,30,0.55)'
  g.beginPath()
  g.ellipse(X(cu), Y(cv), X(w * 0.98), X(h * 0.98), 0, Math.PI * 0.2, Math.PI * 0.8)
  g.stroke()
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k))
  const gg = Math.min(255, Math.round(((n >> 8) & 255) * k))
  const b = Math.min(255, Math.round((n & 255) * k))
  return `rgb(${r},${gg},${b})`
}
