// Selfie -> character traits, on the device (MediaPipe Face Landmarker, no upload).
// A photo gives 478 face landmarks; colours are sampled from the photo at the
// cheeks, lips, irises, brows and above the forehead, and a few proportions are
// measured. The result is mapped onto our avatar (look.ts) — a stylised
// likeness, never a reconstruction of the face.

import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { AvatarData } from './look'
import { AVATAR_HAIR_COLORS } from './look'

export interface SelfieTraits {
  skin: string
  /** Colour just above the forehead: hair, or the head covering. */
  aboveForehead: string
  iris: string
  lips: string
  brows: string
  /** Face width (ear to ear) / face height (≈ 0.80 average). */
  widthRatio: number
  /** Jaw width / cheek width (≈ 0.78 average). */
  jawRatio: number
  /** Eye opening height / width (≈ 0.3 average). */
  eyeOpen: number
  /** Brow thickness relative to the eye width (≈ 0.25 average). */
  browThick: number
  /** True when the area above the forehead looks like cloth (flat, saturated or light) rather than hair. */
  covered: boolean
  /** Frames detected around the eyes (edge energy in a ring around each eye vs the cheeks). */
  glasses: boolean
}

let landmarker: Promise<FaceLandmarker> | null = null

/** Loads the model once (~4 MB + wasm, bundled under /mediapipe and /models/face). */
function loadLandmarker(): Promise<FaceLandmarker> {
  landmarker ??= FilesetResolver.forVisionTasks('/mediapipe').then((files) =>
    FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/models/face/face_landmarker.task' },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
    }),
  )
  return landmarker
}

/** Analyse a selfie; null when no face is found. */
export async function analyzeSelfie(image: HTMLImageElement | HTMLCanvasElement): Promise<SelfieTraits | null> {
  const lm = await loadLandmarker()
  let res = lm.detect(image)
  let src: HTMLImageElement | HTMLCanvasElement = image
  if (!res.faceLandmarks[0]) {
    // A full-body photo: the face is small, so retry on the upper part, enlarged.
    const crop = document.createElement('canvas')
    const sh = image.height * 0.45
    crop.width = 900
    crop.height = Math.round((900 * sh) / image.width)
    crop.getContext('2d')!.drawImage(image, 0, 0, image.width, sh, 0, 0, crop.width, crop.height)
    res = lm.detect(crop)
    src = crop
  }
  const pts = res.faceLandmarks[0]
  if (!pts || pts.length < 468) return null
  const canvas = document.createElement('canvas')
  const w = (canvas.width = src.width)
  const h = (canvas.height = src.height)
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0, w, h)
  const px = (p: NormalizedLandmark) => ({ x: p.x * w, y: p.y * h })
  const dist = (a: number, b: number) => Math.hypot(pts[a].x - pts[b].x, (pts[a].y - pts[b].y) * (h / w))

  // Average colour in a disc (image px); skips nothing (the regions are inside the face).
  const sample = (cx: number, cy: number, r: number): [number, number, number] => {
    const x0 = Math.max(0, Math.round(cx - r))
    const y0 = Math.max(0, Math.round(cy - r))
    const x1 = Math.min(w - 1, Math.round(cx + r))
    const y1 = Math.min(h - 1, Math.round(cy + r))
    if (x1 <= x0 || y1 <= y0) return [128, 128, 128]
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data
    let R = 0
    let G = 0
    let B = 0
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      R += d[i]
      G += d[i + 1]
      B += d[i + 2]
      n++
    }
    return [R / n, G / n, B / n]
  }
  const mix = (...cs: [number, number, number][]): [number, number, number] => [
    cs.reduce((a, c) => a + c[0], 0) / cs.length,
    cs.reduce((a, c) => a + c[1], 0) / cs.length,
    cs.reduce((a, c) => a + c[2], 0) / cs.length,
  ]
  const at = (i: number, r: number) => {
    const p = px(pts[i])
    return sample(p.x, p.y, r)
  }
  const faceW = dist(234, 454) * w
  const faceH = dist(10, 152) * w
  const r = Math.max(3, faceW * 0.035)

  // Cheeks (two spots each side, away from shadows), lips (upper + lower), irises, brows.
  const skin = mix(at(50, r * 1.4), at(280, r * 1.4), at(101, r), at(330, r), at(5, r * 0.8))
  const lips = mix(at(13, r * 0.5), at(14, r * 0.5), at(0, r * 0.5), at(17, r * 0.5))
  const iris = mix(at(468, r * 0.35), at(473, r * 0.35))
  const brows = mix(at(105, r * 0.5), at(334, r * 0.5), at(66, r * 0.5), at(296, r * 0.5))
  // Above the forehead: up from the hairline point by a quarter of the face height.
  const top = px(pts[10])
  const chin = px(pts[152])
  const ux = (top.x - chin.x) / Math.max(1, Math.hypot(top.x - chin.x, top.y - chin.y))
  const uy = (top.y - chin.y) / Math.max(1, Math.hypot(top.x - chin.x, top.y - chin.y))
  const above = mix(
    sample(top.x + ux * faceH * 0.22, top.y + uy * faceH * 0.22, r * 1.5),
    sample(top.x + ux * faceH * 0.35, top.y + uy * faceH * 0.35, r * 1.5),
  )
  const sideL = px(pts[127])
  const sideR = px(pts[356])
  const sides = mix(sample(sideL.x + ux * faceH * 0.12 - faceW * 0.1, sideL.y + uy * faceH * 0.12, r * 1.2), sample(sideR.x + ux * faceH * 0.12 + faceW * 0.1, sideR.y + uy * faceH * 0.12, r * 1.2))

  const hex = (c: [number, number, number]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
  const sat = (c: [number, number, number]) => {
    const mx = Math.max(...c)
    const mn = Math.min(...c)
    return mx === 0 ? 0 : (mx - mn) / mx
  }
  const lum = (c: [number, number, number]) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255
  // Hair is dark-to-mid brown; a scarf is usually light, or bright and saturated, or the same
  // colour at the top and the sides. (Dark brown hair is saturated too, so darkness wins.)
  const same = Math.hypot(above[0] - sides[0], above[1] - sides[1], above[2] - sides[2]) < 28
  const l = lum(above)
  const covered = l > 0.55 || (sat(above) > 0.5 && l > 0.3) || (same && l > 0.4)

  // Glasses: strong edges in a ring around each eye (frames) compared with the smooth cheeks.
  const gray = g.getImageData(0, 0, w, h).data
  const lumAt = (xx: number, yy: number) => {
    const i = (yy * w + xx) << 2
    return gray[i] * 0.3 + gray[i + 1] * 0.59 + gray[i + 2] * 0.11
  }
  const edge = (x0: number, y0: number, x1: number, y1: number, skip?: [number, number, number, number]) => {
    let e = 0
    let n = 0
    for (let y = Math.max(1, y0 | 0); y < Math.min(h - 1, y1 | 0); y += 2)
      for (let x = Math.max(1, x0 | 0); x < Math.min(w - 1, x1 | 0); x += 2) {
        if (skip && x > skip[0] && x < skip[2] && y > skip[1] && y < skip[3]) continue
        e += Math.abs(lumAt(x + 1, y) - lumAt(x - 1, y)) + Math.abs(lumAt(x, y + 1) - lumAt(x, y - 1))
        n++
      }
    return n ? e / n : 0
  }
  let ring = 0
  let cheek = 0
  for (const [outer, inner, topI, botI, cheekI] of [
    [33, 133, 159, 145, 50],
    [263, 362, 386, 374, 280],
  ] as const) {
    const a = px(pts[outer])
    const b = px(pts[inner])
    const tp = px(pts[topI])
    const bt = px(pts[botI])
    const ex0 = Math.min(a.x, b.x)
    const ex1 = Math.max(a.x, b.x)
    const ew = ex1 - ex0
    const eh = Math.max(4, bt.y - tp.y)
    const eyeBox: [number, number, number, number] = [ex0 - ew * 0.15, tp.y - eh * 0.6, ex1 + ew * 0.15, bt.y + eh * 0.5]
    ring += edge(ex0 - ew * 0.55, tp.y - eh * 2.6, ex1 + ew * 0.55, bt.y + eh * 2.2, eyeBox)
    const c = px(pts[cheekI])
    cheek += edge(c.x - ew * 0.3, c.y - ew * 0.2, c.x + ew * 0.3, c.y + ew * 0.2)
  }
  const glasses = ring > cheek * 2.6 && ring > 10

  const eyeW = dist(33, 133)
  const eyeH = (dist(159, 145) + dist(386, 374)) / 2
  const browThick = (dist(105, 52) + dist(334, 282)) / 2 / Math.max(1e-4, eyeW)

  return {
    skin: hex(skin),
    aboveForehead: hex(above),
    iris: hex(iris),
    lips: hex(lips),
    brows: hex(brows),
    widthRatio: faceW / Math.max(1, faceH),
    jawRatio: dist(172, 397) / Math.max(1e-4, dist(234, 454)),
    eyeOpen: eyeH / Math.max(1e-4, eyeW),
    browThick,
    covered,
    glasses,
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function nearest(c: string, options: readonly string[]): string {
  const rgb = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
  const a = rgb(c)
  let best = options[0]
  let bd = Infinity
  for (const o of options) {
    const b = rgb(o)
    const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
    if (d < bd) {
      bd = d
      best = o
    }
  }
  return best
}

/** Map the traits onto the avatar: skin, head wear + colour, eyes, lips, brows and the face shape. */
export function applyTraits(t: SelfieTraits, base: AvatarData): AvatarData {
  const head: AvatarData['head'] = t.covered
    ? { kind: 'hijab', style: base.head.kind === 'hijab' ? base.head.style : 'classic', color: t.aboveForehead, accent: base.head.kind === 'hijab' ? base.head.accent : undefined }
    : { kind: 'hair', style: base.head.kind === 'hair' ? base.head.style : 'long', color: nearest(t.aboveForehead, AVATAR_HAIR_COLORS) }
  // Average face (MediaPipe landmarks): width 0.80 of the height, jaw 0.80 of the cheeks, brows 0.25 of the eye width.
  const faceWidth = clamp(1 + (t.widthRatio - 0.8) * 1.6, 0.86, 1.14)
  const jaw = clamp(1 + (t.jawRatio - 0.8) * 1.4, 0.84, 1.14)
  const browThick = clamp(1 + (t.browThick - 0.25) * 4, 0.7, 1.5)
  // Eye preset by how open the eyes are: soft (narrow) / almond / round (wide).
  const face = t.eyeOpen < 0.24 ? 2 : t.eyeOpen < 0.33 ? 1 : 0
  return { ...base, skin: t.skin, head, iris: t.iris, lips: t.lips, brows: t.brows, faceWidth, jaw, browThick, face, glasses: t.glasses ? (base.glasses ?? 'round') : undefined }
}
