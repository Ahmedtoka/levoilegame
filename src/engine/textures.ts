import {
  CanvasTexture,
  Color,
  LinearMipmapLinearFilter,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type WebGLRenderer,
} from 'three'
import { webImage, type ImageSize } from '../data/webImage'
import { imageLoads, imagePacer } from './pace'

let maxAniso = 4
export function setMaxAnisotropy(renderer: WebGLRenderer, cap: number): void {
  maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), cap)
}

/**
 * `readable`: a CPU-backed canvas (willReadFrequently). Use it for canvases whose
 * pixels are read back (getImageData) or that only hold a decoded photo: reading a
 * GPU-backed canvas waits for the GPU and stalled frames by 20–550 ms.
 */
/**
 * 2D canvas for texture content. CPU-backed by default (willReadFrequently): these
 * canvases are drawn once and then uploaded, and uploading a GPU-backed canvas makes
 * Chrome read it back first — measured at ~240 ms for one 576×1024 standee on the
 * first shop visit. Pass `cpu = false` for canvases that are redrawn every frame.
 */
export function makeCanvas(w: number, h: number, cpu = true): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d', cpu ? { willReadFrequently: true } : undefined)!]
}

export function canvasTexture(c: HTMLCanvasElement, repeat?: [number, number]): CanvasTexture {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = maxAniso
  t.minFilter = LinearMipmapLinearFilter
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

/** Deterministic PRNG so procedural textures look the same every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** The boutique's grey marble (public/textures/marble.jpg), tiled. */
export function storeTexture(url: string, repeat: [number, number], tint?: string): Texture {
  const t = new TextureLoader().load(url)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = maxAniso
  void tint
  return t
}

/** Large polished-stone tiles with soft veins. */
export function marbleTexture(repeat: [number, number]): CanvasTexture {
  const [c, g] = makeCanvas(1024, 1024)
  const r = rng(7)
  g.fillStyle = '#f4f0ee'
  g.fillRect(0, 0, 1024, 1024)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${200 + r() * 40},${190 + r() * 40},${195 + r() * 40},${0.05 + r() * 0.05})`
    g.beginPath()
    g.arc(r() * 1024, r() * 1024, 8 + r() * 40, 0, Math.PI * 2)
    g.fill()
  }
  g.lineCap = 'round'
  for (let v = 0; v < 14; v++) {
    let x = r() * 1024
    let y = r() * 1024
    g.strokeStyle = `rgba(150,135,145,${0.08 + r() * 0.12})`
    g.lineWidth = 0.8 + r() * 2.2
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 40; s++) {
      x += (r() - 0.3) * 40
      y += (r() - 0.5) * 40
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // tile joints
  g.strokeStyle = 'rgba(160,150,155,0.35)'
  g.lineWidth = 2
  g.strokeRect(1, 1, 1022, 1022)
  g.beginPath()
  g.moveTo(512, 0)
  g.lineTo(512, 1024)
  g.moveTo(0, 512)
  g.lineTo(1024, 512)
  g.stroke()
  return canvasTexture(c, repeat)
}

/** Light oak planks tinted towards the shop colour. */
export function woodTexture(tint: string, repeat: [number, number], seed = 3): CanvasTexture {
  const [c, g] = makeCanvas(512, 512)
  const r = rng(seed)
  const base = new Color('#e9ddd0').lerp(new Color(tint), 0.35)
  g.fillStyle = `#${base.getHexString()}`
  g.fillRect(0, 0, 512, 512)
  const plank = 64
  for (let x = 0; x < 512; x += plank) {
    const shade = 0.92 + r() * 0.12
    const col = base.clone().multiplyScalar(shade)
    g.fillStyle = `#${col.getHexString()}`
    g.fillRect(x, 0, plank - 2, 512)
    for (let k = 0; k < 18; k++) {
      g.strokeStyle = `rgba(120,90,70,${0.03 + r() * 0.05})`
      g.lineWidth = 1
      g.beginPath()
      const gx = x + r() * plank
      g.moveTo(gx, 0)
      g.bezierCurveTo(gx + r() * 8 - 4, 170, gx + r() * 8 - 4, 340, gx + r() * 6 - 3, 512)
      g.stroke()
    }
    const cut = r() * 512
    g.fillStyle = 'rgba(90,70,60,0.18)'
    g.fillRect(x, cut, plank - 2, 2)
  }
  return canvasTexture(c, repeat)
}

/** Soft radial blob used as a cheap contact shadow under characters and props. */
let blobTex: CanvasTexture | null = null
export function blobShadowTexture(): CanvasTexture {
  if (blobTex) return blobTex
  const [c, g] = makeCanvas(128, 128)
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grad.addColorStop(0, 'rgba(40,20,35,0.55)')
  grad.addColorStop(0.5, 'rgba(40,20,35,0.22)')
  grad.addColorStop(1, 'rgba(40,20,35,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  blobTex = canvasTexture(c)
  return blobTex
}

/** Vertical gradient for light shafts / glows. */
export function gradientTexture(stops: [number, string][], w = 4, h = 256): CanvasTexture {
  const [c, g] = makeCanvas(w, h)
  const grad = g.createLinearGradient(0, 0, 0, h)
  for (const [o, col] of stops) grad.addColorStop(o, col)
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  return canvasTexture(c)
}

// ---------------------------------------------------------------------------
// Product images: loaded lazily, downscaled to the quality's max size.

interface LoadedImage {
  texture: Texture
  image: HTMLCanvasElement | HTMLImageElement
  aspect: number
  /**
   * A small CPU-side copy (longest side ≤ 128 px) for reading pixels. `image` is a
   * GPU-backed canvas: reading it back (getImageData, or drawing it into a CPU
   * canvas) waits for the GPU and stalled frames by 20–550 ms.
   */
  thumb: HTMLCanvasElement
}

const imageCache = new Map<string, Promise<LoadedImage>>()

function loadRaw(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    // Decode off the main thread before anyone draws it (drawImage would decode synchronously).
    img.onload = () => img.decode().then(() => resolve(img), () => resolve(img))
    img.onerror = () => reject(new Error(`Failed to load ${url}`))
    img.src = url
  })
}

/** Loads the web-sized WebP of a product image; if it fails, retries the original URL once. */
export function loadImage(url: string, size: ImageSize = 'large'): Promise<HTMLImageElement> {
  const web = webImage(url, size)
  return web === url ? loadRaw(url) : loadRaw(web).catch(() => loadRaw(url))
}

export function loadProductTexture(url: string, maxSize: number): Promise<LoadedImage> {
  const key = `${url}@${maxSize}`
  let p = imageCache.get(key)
  if (!p) {
    p = imageLoads
      .run(async () => {
        const img = await loadImage(url, maxSize <= 512 ? 'small' : 'large')
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.round(img.naturalWidth * scale)
        const h = Math.round(img.naturalHeight * scale)
        // Decode + resize off the main thread (createImageBitmap) so the canvases below
        // only need 1:1 copies; drawing the <img> itself could decode it synchronously.
        const k = Math.min(1, 128 / Math.max(w, h))
        const tw = Math.max(1, Math.round(w * k))
        const th = Math.max(1, Math.round(h * k))
        const [src, small] = await Promise.all([bitmap(img, w, h), bitmap(img, tw, th)])
        return { img, w, h, tw, th, src, small }
      })
      .then(async ({ img, w, h, tw, th, src, small }) => {
        await imagePacer.slot()
        const [c, g] = makeCanvas(w, h)
        g.imageSmoothingQuality = 'high'
        g.drawImage(src, 0, 0, w, h)
        const [thumb, tg] = makeCanvas(tw, th, true)
        tg.drawImage(small, 0, 0, tw, th)
        for (const b of [src, small]) if (b !== img) (b as ImageBitmap).close()
        return { texture: canvasTexture(c), image: c, aspect: w / h, thumb }
      })
    imageCache.set(key, p)
  }
  return p
}

/** The image decoded (and resized) off the main thread; falls back to the image itself. */
async function bitmap(img: HTMLImageElement, w: number, h: number): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap !== 'function') return img
  try {
    return await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
  } catch {
    return img
  }
}

/**
 * Shrinks the ImageBitmap textures under `root` (e.g. a glTF's baked atlases) to at
 * most `max` px, off the main thread. Uploading one 4096² atlas blocked the main
 * thread for ~100 ms on an integrated GPU; a 2048² one is a quarter of that (and of the memory).
 */
export async function capBitmapTextures(root: Object3D, max: number): Promise<void> {
  const seen = new Set<Texture>()
  root.traverse((o) => {
    const mat = (o as Mesh).material as Material | Material[] | undefined
    if (!mat) return
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const t = (m as MeshBasicMaterial).map
      if (t) seen.add(t)
    }
  })
  await Promise.all(
    [...seen].map(async (t) => {
      const im = t.image as ImageBitmap | null
      if (typeof ImageBitmap === 'undefined' || !(im instanceof ImageBitmap) || Math.max(im.width, im.height) <= max) return
      const k = max / Math.max(im.width, im.height)
      try {
        const small = await createImageBitmap(im, {
          resizeWidth: Math.round(im.width * k),
          resizeHeight: Math.round(im.height * k),
          resizeQuality: 'high',
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        })
        t.image = small
        t.needsUpdate = true
        im.close()
      } catch {
        /* keep the full-size atlas */
      }
    }),
  )
}

/**
 * Average colour of opaque, non-background pixels inside a region of an image
 * (fractions of width/height). Used to dress models like the featured product.
 */
export function regionColor(
  img: HTMLCanvasElement | HTMLImageElement,
  region: { x0: number; y0: number; x1: number; y1: number },
): Color | null {
  const [c, g] = makeCanvas(48, 48, true)
  g.drawImage(img, 0, 0, 48, 48)
  const { data } = g.getImageData(0, 0, 48, 48)
  let r = 0
  let gg = 0
  let b = 0
  let n = 0
  for (let y = Math.floor(region.y0 * 48); y < region.y1 * 48; y++) {
    for (let x = Math.floor(region.x0 * 48); x < region.x1 * 48; x++) {
      const i = (y * 48 + x) * 4
      if (data[i + 3] < 200) continue
      const R = data[i]
      const G = data[i + 1]
      const B = data[i + 2]
      // skip studio background and skin-ish tones
      if (R > 232 && G > 232 && B > 232) continue
      const isSkin = R > 150 && G > 95 && B > 70 && R > G && G > B && R - B > 40 && R - B < 110 && Math.abs(R - G) < 70
      if (isSkin) continue
      r += R
      gg += G
      b += B
      n++
    }
  }
  void c
  if (n < 12) return null
  return new Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, SRGBColorSpace)
}
