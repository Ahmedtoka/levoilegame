// Virtual try-on: what a product does to her character (which garment it is,
// which colour slots it dresses) and the fabric sampled from its photo.
//
// The garment comes from the product's title and section words (English and
// Arabic); the fabric is a patch cut from the middle of the garment in the
// product photo (the cut-out when there is one), tiled on the character by the
// avatar material, so prints and textures carry over, not just a colour.

import { CanvasTexture, LinearMipmapLinearFilter, MirroredRepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import type { Product } from '../../data/types'
import { displayImage, hasCutout } from '../../data/types'
import { loadProductTexture } from '../../engine/textures'
import type { AvatarOutfit } from './pieces'
import type { FabricPart } from './material'

export interface TryOnPlan {
  /** Outfit she switches to (undefined: keep hers). */
  outfit?: AvatarOutfit
  /** Colour slots the product's fabric dresses. */
  parts: FabricPart[]
  /** Where in the photo (fraction of the garment's height) the fabric patch is cut. */
  patchY: number
}

const has = (text: string, words: string[]) => words.some((w) => text.includes(w))

/** How a product is worn, or null when it can't be tried on (bags, shoes, boxes…). */
export function tryOnPlan(p: Pick<Product, 'title' | 'section'>, sectionTitle = ''): TryOnPlan | null {
  const t = `${p.title} ${sectionTitle} ${p.section}`.toLowerCase()
  if (has(t, ['bag', 'shoe', 'flip-flop', 'flip flop', 'slipper', 'sandal', 'sneaker', 'wallet', 'probar', 'protein', 'box', 'perfume', 'شنط', 'حذاء', 'شبشب'])) return null
  if (has(t, ['scarf', 'scarves', 'hijab', 'khimar', 'chiffon', 'shawl', 'inner cap', 'inner-cap', 'طرح', 'حجاب', 'خمار'])) return { parts: ['hijab'], patchY: 0.5 }
  if (has(t, ['abaya', 'isdal', 'kaftan', 'kimono', 'عباي', 'اسدال', 'إسدال'])) return { outfit: 'abaya', parts: ['top', 'bottom'], patchY: 0.45 }
  if (has(t, ['set', 'co-ord', 'coord', 'suit', 'طقم'])) return { outfit: 'pants', parts: ['top', 'bottom'], patchY: 0.35 }
  if (has(t, ['dress', 'jumpsuit', 'فستان', 'فساتين'])) return { outfit: 'dress', parts: ['top', 'bottom'], patchY: 0.4 }
  if (has(t, ['skirt', 'جيب'])) return { outfit: 'skirt', parts: ['bottom'], patchY: 0.5 }
  if (has(t, ['pant', 'trouser', 'jean', 'denim', 'legging', 'culotte', 'بنطلون', 'جينز'])) return { outfit: 'pants', parts: ['bottom'], patchY: 0.5 }
  if (has(t, ['shirt', 'blouse', 'top', 'tunic', 'cardigan', 'jacket', 'coat', 'blazer', 'knit', 'sweater', 'hoodie', 'sweatshirt', 'vest', 'بلوز', 'قميص', 'جاكت', 'كارديجان', 'تريكو']))
    return { parts: ['top'], patchY: 0.4 }
  return null
}

export interface Fabric {
  texture: Texture
  /** Average colour (for distant LODs and plain-colour fallbacks). */
  avg: string
}

const fabricCache = new Map<string, Promise<Fabric | null>>()

/** A tileable patch of the product's fabric, cut from the middle of the garment. */
export function productFabric(p: Product, patchY: number): Promise<Fabric | null> {
  const key = `${p.id}@${patchY}`
  let f = fabricCache.get(key)
  if (!f) {
    f = loadProductTexture(displayImage(p), 512)
      .then(({ image }) => cutPatch(image as HTMLCanvasElement, hasCutout(p), patchY))
      .catch(() => null)
    fabricCache.set(key, f)
  }
  return f
}

function cutPatch(img: HTMLCanvasElement, cutout: boolean, patchY: number): Fabric | null {
  const g = img.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  const W = img.width
  const H = img.height
  // The garment's bounds: opaque pixels of a cut-out, else the middle of the photo.
  let x0 = Math.round(W * 0.25)
  let x1 = Math.round(W * 0.75)
  let y0 = Math.round(H * 0.15)
  let y1 = Math.round(H * 0.9)
  if (cutout) {
    const d = g.getImageData(0, 0, W, H).data
    let minX = W
    let maxX = 0
    let minY = H
    let maxY = 0
    for (let y = 0; y < H; y += 2)
      for (let x = 0; x < W; x += 2)
        if (d[(y * W + x) * 4 + 3] > 200) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
    if (maxX > minX && maxY > minY) [x0, x1, y0, y1] = [minX, maxX, minY, maxY]
  }
  // A square patch centred on the garment's axis, at patchY of its height.
  const side = Math.max(16, Math.round(Math.min(x1 - x0, y1 - y0) * 0.34))
  const cx = Math.round((x0 + x1) / 2)
  const cy = Math.round(y0 + (y1 - y0) * patchY)
  const sx = Math.max(0, Math.min(W - side, cx - side / 2))
  const sy = Math.max(0, Math.min(H - side, cy - side / 2))
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const cg = c.getContext('2d', { willReadFrequently: true })!
  cg.drawImage(img, sx, sy, side, side, 0, 0, 128, 128)
  // Average colour of the opaque pixels.
  const px = cg.getImageData(0, 0, 128, 128).data
  let r = 0
  let gg = 0
  let b = 0
  let n = 0
  for (let i = 0; i < px.length; i += 16)
    if (px[i + 3] > 200) {
      r += px[i]
      gg += px[i + 1]
      b += px[i + 2]
      n++
    }
  if (!n) return null
  const avg = `#${[r, gg, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`
  // Any see-through pixels (patch at an edge) take the average colour.
  cg.globalCompositeOperation = 'destination-over'
  cg.fillStyle = avg
  cg.fillRect(0, 0, 128, 128)
  const texture = new CanvasTexture(c)
  texture.colorSpace = SRGBColorSpace
  // Mirrored tiling hides the seams of a patch that was never made to tile.
  texture.wrapS = texture.wrapT = MirroredRepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  return { texture, avg }
}


/** Her look with the product on: switch outfit if the garment needs it (always modest). */
export function tryOnLook<T extends { outfit: AvatarOutfit; top: string; head: { kind: 'hijab' | 'hair' } }>(base: T, plan: TryOnPlan): T {
  const d = structuredClone(base)
  if (plan.outfit) d.outfit = plan.outfit
  // A top on its own goes over a long skirt (an abaya or dress has no separate top).
  if (!plan.outfit && plan.parts.includes('top') && (d.outfit === 'abaya' || d.outfit === 'dress')) d.outfit = 'skirt'
  // A scarf is worn as a hijab.
  if (plan.parts.includes('hijab') && d.head.kind === 'hair') (d as { head: unknown }).head = { kind: 'hijab', style: 'classic', color: d.top }
  return d
}

/** Put the product's fabric on a character built from tryOnLook(). */
export async function dressTryOn(c: { wearFabric(part: FabricPart, f: Fabric | null): void }, p: Product, plan: TryOnPlan): Promise<boolean> {
  const fab = await productFabric(p, plan.patchY)
  if (!fab) return false
  for (const part of plan.parts) c.wearFabric(part, fab)
  return true
}
