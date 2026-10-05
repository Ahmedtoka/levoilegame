// Finishing materials and geometry for the plaza and wing corridors:
// warm gypsum ceilings, oak-veneer wainscot, marble-clad pilasters and the
// large-format marble floor (one 2048 atlas with per-tile variation).
//
// Boxes and floor planes get UVs in world units (`uvBox`, `tiledPlane`), so
// one material + one texture serves every size without per-mesh clones.

import { BoxGeometry, BufferAttribute, Color, MeshStandardMaterial, PlaneGeometry, type BufferGeometry, type Texture } from 'three'
import { canvasTexture, makeCanvas, rng, storeTexture } from '../engine/textures'

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
 * 4 × 4 large-format marble tiles in one 2048 texture: every tile is a
 * different crop / rotation of the store marble with a small tint shift, and
 * a fine grout joint. Repeating 4 × 4 tiles hides the texture's period.
 */
export function floorAtlas(): Texture {
  if (atlas) return atlas
  if (typeof document === 'undefined') return (atlas = storeTexture('/textures/marble.jpg', [1, 1]))
  const N = 2048
  const ts = N / ATLAS_TILES
  const [c, g] = makeCanvas(N, N)
  g.fillStyle = '#cfcac4'
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
        const sw = 380 + r() * 220
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
        // Per-tile variation: a slight warm/cool cast and ±brightness.
        const warm = r() < 0.5
        g.fillStyle = warm ? `rgba(255,236,214,${0.05 + r() * 0.08})` : `rgba(226,230,236,${0.04 + r() * 0.06})`
        g.fillRect(x0, y0, ts, ts)
        const lift = r() - 0.45
        g.fillStyle = lift > 0 ? `rgba(255,252,247,${lift * 0.22})` : `rgba(60,50,45,${-lift * 0.1})`
        g.fillRect(x0, y0, ts, ts)
        // Grout: 2 px dark joint on the top and left edge + 1 px bevel highlight
        // (the next tile supplies the other side, so the atlas tiles seamlessly).
        g.fillStyle = 'rgba(92,82,74,0.55)'
        g.fillRect(x0, y0, ts, 2)
        g.fillRect(x0, y0, 2, ts)
        g.fillStyle = 'rgba(255,255,255,0.35)'
        g.fillRect(x0 + 2, y0 + 2, ts - 2, 1)
        g.fillRect(x0 + 2, y0 + 2, 1, ts - 2)
      }
    tex.needsUpdate = true
  }
  img.src = '/textures/marble.jpg'
  return tex
}

/** Period (m) of the floor atlas when one tile is `tile` metres. */
export const atlasPeriod = (tile = TILE) => tile * ATLAS_TILES

let corridorMat: MeshStandardMaterial | null = null
/** Corridor floor: the marble atlas tinted per vertex (light field, darker wall band) — one draw per wing. */
export function corridorFloorMat(): MeshStandardMaterial {
  return (corridorMat ??= new MeshStandardMaterial({ map: floorAtlas(), vertexColors: true, roughness: 0.2, metalness: 0.04 }))
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
/** Warm off-white matte gypsum (plaza + corridor ceilings). The emissive lift
 * keeps the underside from reading grey: the hemisphere light barely reaches it. */
export const GYPSUM = new MeshStandardMaterial({
  color: '#efe9e1',
  roughness: 0.95,
  emissive: new Color('#a89a8a'),
  emissiveIntensity: 1,
})

// ---------------------------------------------------------------- walls
let oak: MeshStandardMaterial | null = null
/** Oak veneer (wainscot): the store's oak grain warmed to a honey tone. */
export function oakVeneerMat(): MeshStandardMaterial {
  if (oak) return oak
  const map = typeof document === 'undefined' ? null : storeTexture('/textures/oak-grain.jpg', [1, 1])
  return (oak = new MeshStandardMaterial({ map, color: '#c79a6c', roughness: 0.55 }))
}

let cladding: MeshStandardMaterial | null = null
/** Polished marble cladding for the pilasters. */
export function marbleCladMat(): MeshStandardMaterial {
  if (cladding) return cladding
  const map = typeof document === 'undefined' ? null : storeTexture('/textures/marble.jpg', [1, 1])
  return (cladding = new MeshStandardMaterial({ map, color: '#ffffff', roughness: 0.22, metalness: 0.05, emissive: new Color('#7a736b'), emissiveIntensity: 0.8 }))
}
