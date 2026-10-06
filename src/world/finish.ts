// Finishing materials and geometry for the plaza and wing corridors (night mall):
// charcoal ceilings, dark-oak wainscot, cream-marble pilasters and the large-format
// dark marble floor (one 2048 atlas with per-tile variation, cut from the CC0
// `marble-dark` library map). Wall and joinery surfaces come from `engine/pbr.ts`.
//
// Boxes and floor planes get UVs in world units (`uvBox`, `tiledPlane`), so
// one material + one texture serves every size without per-mesh clones.

import { BoxGeometry, BufferAttribute, Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, type BufferGeometry, type Texture } from 'three'
import { pbrMap, pbrMaterial, pbrSize, pbrUrl } from '../engine/pbr'
import { canvasTexture, makeCanvas, rng, storeTexture } from '../engine/textures'
import { THEME } from './theme'

/** World size of one floor tile (large format) and of the 4 × 4 atlas. */
export const TILE = 1.2
const ATLAS_TILES = 4

const geoCache = new Map<string, BufferGeometry>()

/**
 * Box of the given size whose UVs repeat every `tile` metres on every face
 * (a unit box stretched by the batcher would smear the texture).
 */
export function uvBox(sx: number, sy: number, sz: number, tile: number): BufferGeometry {
  const key = `box|${sx}|${sy}|${sz}|${tile}`
  let g = geoCache.get(key)
  if (g) return g
  g = new BoxGeometry(sx, sy, sz)
  const uv = g.getAttribute('uv')
  // BoxGeometry face order: +x, −x, +y, −y, +z, −z (4 vertices each).
  const span: [number, number][] = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]]
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * span[f][0]) / tile, (uv.getY(k) * span[f][1]) / tile)
    }
  uv.needsUpdate = true
  geoCache.set(key, g)
  return g
}

/**
 * Horizontal floor plane (already rotated flat, centred on its origin) whose
 * texture repeats every `period` metres. `ox`/`oz` shift the grid so that tile
 * joints line up with a wall or the plaza axis.
 */
export function tiledPlane(w: number, d: number, period: number, ox = 0, oz = 0): PlaneGeometry {
  const g = new PlaneGeometry(w, d).rotateX(-Math.PI / 2)
  const pos = g.getAttribute('position')
  const uv = g.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + ox) / period, (-pos.getZ(i) + oz) / period)
  uv.needsUpdate = true
  return g
}

// ------------------------------------------------------------------ floor
let atlas: Texture | null = null

/**
 * 4 × 4 large-format cream marble tiles in one texture (2048, or `size` on the first call,
 * e.g. 1024 on Low): every tile is a different crop / rotation of the `marble-cream` map
 * (light polished stone, soft grey veins) with a small tint shift, and a grey grout joint. Repeating 4 × 4 tiles hides the texture's period. Until the map arrives the
 * atlas is flat `THEME.floor`.
 */
export function floorAtlas(size = 2048): Texture {
  if (atlas) return atlas
  const src = pbrUrl('marble-cream', 'color', size <= 1024 ? 512 : pbrSize())
  if (typeof document === 'undefined') return (atlas = storeTexture(src, [1, 1]))
  const N = size
  const ts = N / ATLAS_TILES
  // Grout and bevel widths in px (2 and 1 at 2048), so joints keep their width in metres.
  const gw = Math.max(1, Math.round((2 * N) / 2048))
  const bw = Math.max(1, Math.round(N / 2048))
  const [c, g] = makeCanvas(N, N)
  g.fillStyle = THEME.floor
  g.fillRect(0, 0, N, N)
  const tex = canvasTexture(c, [1, 1])
  atlas = tex
  const img = new Image()
  img.onload = () => {
    const r = rng(23)
    for (let j = 0; j < ATLAS_TILES; j++)
      for (let i = 0; i < ATLAS_TILES; i++) {
        const x0 = i * ts
        const y0 = j * ts
        // Crop 37–60 % of the map per tile: veins stay large-format, no two tiles alike.
        const sw = img.width * (0.37 + r() * 0.23)
        const sx = r() * (img.width - sw)
        const sy = r() * (img.height - sw)
        g.save()
        g.beginPath()
        g.rect(x0, y0, ts, ts)
        g.clip()
        g.translate(x0 + ts / 2, y0 + ts / 2)
        g.rotate(Math.floor(r() * 4) * (Math.PI / 2))
        if (r() < 0.5) g.scale(-1, 1)
        g.drawImage(img, sx, sy, sw, sw, -ts / 2, -ts / 2, ts, ts)
        g.restore()
        // Per-tile variation: a slight warm/cool cast and ±brightness (subtle: the stone is light).
        const warm = r() < 0.5
        g.fillStyle = warm ? `rgba(230,190,150,${0.04 + r() * 0.06})` : `rgba(190,200,225,${0.03 + r() * 0.05})`
        g.fillRect(x0, y0, ts, ts)
        const lift = r() - 0.5
        g.fillStyle = lift > 0 ? `rgba(255,252,246,${lift * 0.16})` : `rgba(60,50,40,${-lift * 0.08})`
        g.fillRect(x0, y0, ts, ts)
        // Grout: dark joint on the top and left edge + a faint bevel highlight
        // (the next tile supplies the other side, so the atlas tiles seamlessly).
        g.fillStyle = 'rgba(70,60,52,0.55)'
        g.fillRect(x0, y0, ts, gw)
        g.fillRect(x0, y0, gw, ts)
        g.fillStyle = 'rgba(255,255,255,0.35)'
        g.fillRect(x0 + gw, y0 + gw, ts - gw, bw)
        g.fillRect(x0 + gw, y0 + gw, bw, ts - gw)
      }
    tex.needsUpdate = true
  }
  img.src = src
  return tex
}

/** Period (m) of the floor atlas when one tile is `tile` metres. */
export const atlasPeriod = (tile = TILE) => tile * ATLAS_TILES

/**
 * Corridor floor: the marble atlas tinted per vertex (light field, darker wall band), one draw
 * per wing. A new material per call (same program and atlas): each wing's see-through state
 * follows its own mirror.
 */
export function corridorFloorMat(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ map: floorAtlas(), vertexColors: true, roughness: THEME.roughness.floor, metalness: 0.04, normalMap: floorNormal() })
  m.normalScale.set(FLOOR_NORMAL, FLOOR_NORMAL)
  return m
}

/** Strength of the stone's normal map on the floors (polished: just the vein relief). */
export const FLOOR_NORMAL = 0.3

/** The `marble-cream` normal map repeated once per atlas tile (the colour crops differ per tile; the
 * relief is too faint for the mismatch to read). Shared by the plaza and corridor floors. */
export function floorNormal(): Texture {
  return pbrMap('marble-cream', 'normal', [ATLAS_TILES, ATLAS_TILES])
}

/** `tiledPlane` with a constant vertex colour (sRGB hex), for merging differently tinted floor parts. */
export function tintedPlane(g: BufferGeometry, hex: string): BufferGeometry {
  const c = new Color(hex)
  const n = g.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new BufferAttribute(arr, 3))
  return g
}

// ------------------------------------------------------------- ceilings
/** Warm cream gypsum ceiling (plaza + corridor slabs, beams), self-lit a little so it stays
 * light under the dim night rig. */
export const GYPSUM = new MeshStandardMaterial({
  color: THEME.ceiling,
  roughness: THEME.roughness.ceiling,
  metalness: 0,
  emissive: new Color(THEME.ceilingGlow),
  emissiveIntensity: 1,
})

// ---------------------------------------------------------------- walls
/** Dark oak (wainscot, joinery): the CC0 oak map tinted to `THEME.oak`. */
export function oakVeneerMat(): MeshStandardMaterial {
  return pbrMaterial('oak-dark', { color: THEME.oak })
}

/** Cream marble cladding for the pilasters (CC0 `marble-cream`). */
export function marbleCladMat(): MeshStandardMaterial {
  return pbrMaterial('marble-cream')
}

// ------------------------------------------------------------------ glass
let glass: MeshPhysicalMaterial | null = null

/** Faint diagonal reflection streaks (alpha), so the panes read as glass. */
function glassSheen(): Texture {
  const [c, g] = makeCanvas(256, 256)
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillRect(0, 0, 256, 256)
  for (const [x, w, a] of [[40, 46, 1], [104, 14, 0.85], [176, 30, 0.8]] as const) {
    const grad = g.createLinearGradient(x, 0, x + w, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.save()
    g.translate(128, 128)
    g.rotate(-0.5)
    g.translate(-128, -128)
    g.fillStyle = grad
    g.fillRect(x, -200, w, 656)
    g.restore()
  }
  return canvasTexture(c)
}

/** The one shared shop-window glass (transparent physical, no transmission pass). */
export function windowGlass(): MeshPhysicalMaterial {
  if (glass) return glass
  glass = new MeshPhysicalMaterial({
    color: '#eaf3f2',
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: DoubleSide,
    envMapIntensity: 1.8,
  })
  if (typeof document !== 'undefined') glass.map = glassSheen()
  return glass
}
