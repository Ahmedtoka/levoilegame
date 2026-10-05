export type ImageSize = 'small' | 'large'

/**
 * Maps a product image URL to its web-sized WebP derivative (see scripts/optimize-images.py):
 * `/products/x/1.jpg` -> `1.webp` (large, 1024 px) or `1.s.webp` (small, 512 px); `cutout.png` likewise.
 * Anything that is not a `/products/` jpg/png (data: placeholders, CDN urls, .webp) passes through.
 */
export function webImage(url: string, size: ImageSize = 'large'): string {
  const m = /^(\/products\/.+?)\.(?:jpe?g|png)$/i.exec(url)
  if (!m) return url
  return `${m[1]}${size === 'small' ? '.s' : ''}.webp`
}

/** Reverse of webImage: the original source file to retry when a WebP fails (jpg, or png for cutouts). */
export function originalImage(url: string): string | null {
  const m = /^(\/products\/.+?)(?:\.s)?\.webp$/.exec(url)
  if (!m) return null
  return /\/cutout$/.test(m[1]) ? `${m[1]}.png` : `${m[1]}.jpg`
}

/** Document-wide safety net: a /products WebP <img> that fails to load retries once with its original. */
export function installImageFallback(): void {
  document.addEventListener(
    'error',
    (e) => {
      const el = e.target
      if (!(el instanceof HTMLImageElement) || el.dataset.fb) return
      const orig = originalImage(new URL(el.currentSrc || el.src, location.href).pathname)
      if (!orig) return
      el.dataset.fb = '1'
      el.src = orig
    },
    true,
  )
}
