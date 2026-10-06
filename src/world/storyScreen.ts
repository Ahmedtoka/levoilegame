// Vertical "stories" screen in every shop (9:16). With the brand's own vertical
// videos (BRAND_VIDEOS) it plays them in turn; without, it plays a reel made of
// the shop's products: one atlas of cells (brand card, product photos, "all
// products" card) that the shader slowly zooms and pans (Ken Burns), cross-fades
// and marks with story-style progress bars, so it moves like a video at no CPU
// cost. Videos only play while the screen is being drawn.

import { MeshBasicMaterial, SRGBColorSpace, VideoTexture, type Mesh, type Texture } from 'three'
import { BRAND } from '../config/brand'
import { brandVideos } from '../config/brandVideos'
import type { BrandDef } from '../config/mall'
import type { Product } from '../data/types'
import { canvasTexture, loadProductTexture, makeCanvas } from '../engine/textures'
import { imagePacer } from '../engine/pace'

const CELL_SECONDS = 4.5
const time = { value: 0 }

/** Reel material over an atlas of `n` cells laid out `cols` × `rows`. */
function reelMaterial(atlas: Texture, n: number, cols: number, rows: number): MeshBasicMaterial {
  const mat = new MeshBasicMaterial({ map: atlas, toneMapped: false })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lvTime = time
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>
uniform float lvTime;
const float N = ${n.toFixed(1)};
const vec2 GRID = vec2(${cols.toFixed(1)}, ${rows.toFixed(1)});
vec4 lvCell(float i, vec2 uv, float t) {
  // Ken Burns: zoom in over the cell's time on screen, drifting a different way per cell.
  float z = 1.0 + 0.12 * t;
  vec2 drift = vec2(sin(i * 2.3), cos(i * 1.7)) * 0.04 * t;
  vec2 q = clamp((uv - 0.5) / z + 0.5 + drift, 0.002, 0.998);
  vec2 cell = vec2(mod(i, GRID.x), floor(i / GRID.x));
  // Canvas rows run top-down; texture v runs bottom-up (flipY).
  vec2 a = vec2((cell.x + q.x) / GRID.x, 1.0 - (cell.y + 1.0 - q.y) / GRID.y);
  return texture2D(map, a);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `float lvT = lvTime / ${CELL_SECONDS.toFixed(1)};
float lvK = floor(lvT);
float lvF = fract(lvT);
float lvI0 = mod(lvK, N);
float lvI1 = mod(lvK + 1.0, N);
vec4 lvA = lvCell(lvI0, vMapUv, lvF);
vec4 lvB = lvCell(lvI1, vMapUv, lvF - 1.0);
vec4 sampledDiffuseColor = mix(lvA, lvB, smoothstep(0.86, 1.0, lvF));
// Story progress bars along the top.
if (vMapUv.y > 0.968 && vMapUv.y < 0.976) {
  float seg = floor(vMapUv.x * N);
  float inSeg = fract(vMapUv.x * N);
  if (inSeg > 0.06 && inSeg < 0.94) {
    float fill = seg < lvI0 ? 1.0 : seg > lvI0 ? 0.0 : step(inSeg, lvF);
    sampledDiffuseColor.rgb = mix(vec3(0.55), vec3(1.0), fill);
  }
}
diffuseColor *= sampledDiffuseColor;`,
      )
  }
  mat.customProgramCacheKey = () => `lv-reel-${n}-${cols}x${rows}`
  return mat
}

/** Cover-crop an image into a cell. */
function drawCover(g: CanvasRenderingContext2D, im: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / im.width, h / im.height)
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  g.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s)
  g.restore()
}

function brandCard(g: CanvasRenderingContext2D, brand: BrandDef, x: number, y: number, w: number, h: number): void {
  const grad = g.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, '#2d2329')
  grad.addColorStop(1, brand.color)
  g.fillStyle = grad
  g.fillRect(x, y, w, h)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#f4ede3'
  g.font = `600 ${Math.round(w * 0.1)}px ${BRAND.fontLatin}`
  g.fillText(brand.name.toUpperCase(), x + w / 2, y + h * 0.44)
  g.fillStyle = '#e8c27a'
  g.font = `500 ${Math.round(w * 0.05)}px ${BRAND.fontLatin}`
  g.fillText('NEW SEASON', x + w / 2, y + h * 0.52)
  g.direction = 'rtl'
  g.font = `700 ${Math.round(w * 0.065)}px ${BRAND.fontUi}`
  g.fillText(brand.nameAr, x + w / 2, y + h * 0.59)
  g.direction = 'ltr'
}

function catalogCard(g: CanvasRenderingContext2D, count: number, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#1f1a17'
  g.fillRect(x, y, w, h)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#f4ede3'
  g.font = `600 ${Math.round(w * 0.075)}px ${BRAND.fontLatin}`
  g.fillText(`ALL ${count} PRODUCTS`, x + w / 2, y + h * 0.42)
  g.direction = 'rtl'
  g.font = `700 ${Math.round(w * 0.065)}px ${BRAND.fontUi}`
  g.fillText('كل المنتجات', x + w / 2, y + h * 0.49)
  g.direction = 'ltr'
  g.fillStyle = BRAND.magenta
  g.fillRect(x + w * 0.19, y + h * 0.58, w * 0.62, h * 0.09)
  g.fillStyle = '#fff'
  g.font = `700 ${Math.round(w * 0.05)}px ${BRAND.fontUi}`
  g.fillText('TAP TO BROWSE', x + w / 2, y + h * 0.625)
}

/** Fill `plane` with the brand's videos, or the product reel. Returns the loader to queue. */
export function storyScreen(plane: Mesh, brand: BrandDef, products: Product[], textureMax: number, onMaterial: (m: MeshBasicMaterial) => void): () => Promise<void> {
  // Shared clock for every reel; also marks the screen as seen (videos pause when not).
  let seenAt = 0
  plane.onBeforeRender = () => {
    time.value = performance.now() / 1000
    seenAt = performance.now()
  }
  return async () => {
    const videos = brandVideos(brand.id)
    if (videos.length) {
      const v = document.createElement('video')
      Object.assign(v, { muted: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' })
      let k = 0
      v.src = videos[0]
      v.addEventListener('ended', () => {
        k = (k + 1) % videos.length
        v.src = videos[k]
        void v.play().catch(() => {})
      })
      v.loop = videos.length === 1
      const tex = new VideoTexture(v)
      tex.colorSpace = SRGBColorSpace
      const mat = new MeshBasicMaterial({ map: tex, toneMapped: false })
      onMaterial(mat)
      // Play only while drawn (checked twice a second).
      setInterval(() => {
        const on = performance.now() - seenAt < 600
        if (on && v.paused) void v.play().catch(() => {})
        else if (!on && !v.paused) v.pause()
      }, 500)
      return
    }
    const cw = textureMax >= 1024 ? 512 : 256
    const ch = Math.round((cw * 16) / 9)
    const photos = products.slice(0, 5)
    const n = photos.length + 2
    const cols = 4
    const rows = Math.ceil(n / cols)
    const [c, g] = makeCanvas(cw * cols, ch * rows)
    brandCard(g, brand, 0, 0, cw, ch)
    for (let i = 0; i < photos.length; i++) {
      await imagePacer.slot()
      const img = await loadProductTexture(photos[i].images[0], cw * 2)
        .then((r) => r.image as HTMLCanvasElement)
        .catch(() => null)
      const cell = i + 1
      if (img) drawCover(g, img, (cell % cols) * cw, Math.floor(cell / cols) * ch, cw, ch)
    }
    const last = n - 1
    catalogCard(g, products.length, (last % cols) * cw, Math.floor(last / cols) * ch, cw, ch)
    onMaterial(reelMaterial(canvasTexture(c), n, cols, rows))
  }
}
