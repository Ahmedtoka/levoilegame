// CC0 PBR texture library for the night mall (ambientCG assets, see
// public/textures/pbr/SOURCES.md and scripts/fetch-textures.mjs).
//
//   pbrMaterial('oak-dark', { color: THEME.oak })      // cached per name + options
//
// Each name ships colour + normal (+ roughness) maps as WebP at 1024 and 512
// (`.s.webp`); the 512 set is used when the quality tier's textureMax is ≤ 512
// (`setPbrQuality`, called by the shell builder). Maps load lazily through the shared
// image semaphore, one Texture per map; a material with its own `repeat` gets a clone
// that shares the upload (same Source). Tinted names (`tint`) divide `color` by the
// map's measured mean albedo, so `color` is the mean colour you will see: THEME tones
// land as written.

import { Color, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three'
import { THEME } from '../world/theme'
import { imageLoads } from './pace'
import { maxAnisotropy } from './textures'

export const PBR_NAMES = ['marble-dark', 'marble-cream', 'oak-dark', 'bronze-brushed', 'plaster-cream', 'velvet-plum', 'carpet-dark', 'concrete-dark', 'leather-tan'] as const
export type PbrName = (typeof PBR_NAMES)[number]
export type PbrMap = 'color' | 'normal' | 'roughness'

export interface PbrOptions {
  /** Texture repeats per UV unit (default 1 × 1; geometry UVs in metres give metre tiles). */
  repeat?: [number, number]
  /** Mean surface colour for tinted names; plain multiplier for the others. */
  color?: string
  roughness?: number
  metalness?: number
  normalScale?: number
  /** Also load the roughness map (off by default: one texture less per material). */
  roughnessMap?: boolean
}

interface PbrDef {
  color: string
  roughness: number
  metalness: number
  normalScale: number
  /** The colour map is a tint base: `color` is divided by this mean linear albedo (measured, see SOURCES.md). */
  tint?: [number, number, number]
}

const DEFS: Record<PbrName, PbrDef> = {
  'marble-dark': { color: '#ffffff', roughness: THEME.roughness.floor, metalness: 0.04, normalScale: 0.35 },
  'marble-cream': { color: '#ffffff', roughness: 0.25, metalness: 0.04, normalScale: 0.35 },
  'oak-dark': { color: THEME.oak, roughness: THEME.roughness.oak, metalness: 0, normalScale: 0.6, tint: [0.198, 0.125, 0.075] },
  'bronze-brushed': { color: THEME.bronze, roughness: THEME.roughness.bronze, metalness: 1, normalScale: 0.5, tint: [0.288, 0.299, 0.314] },
  'plaster-cream': { color: THEME.wall, roughness: THEME.roughness.wall, metalness: 0, normalScale: 0.5, tint: [0.68, 0.656, 0.633] },
  'velvet-plum': { color: THEME.plum, roughness: 0.85, metalness: 0, normalScale: 0.6, tint: [0.491, 0.491, 0.491] },
  'carpet-dark': { color: THEME.wallShadow, roughness: 0.95, metalness: 0, normalScale: 0.7, tint: [0.5, 0.435, 0.293] },
  'concrete-dark': { color: THEME.ceiling, roughness: THEME.roughness.ceiling, metalness: 0, normalScale: 0.4, tint: [0.136, 0.15, 0.155] },
  'leather-tan': { color: '#ffffff', roughness: 0.5, metalness: 0, normalScale: 0.6 },
}

/** Mean linear albedo of a name's colour map (names without a tint base report white). */
export function pbrTint(name: PbrName): [number, number, number] {
  return DEFS[name]?.tint ?? [1, 1, 1]
}

let textureMax = 1024

/** Picks the 512 (`.s.webp`) set when `textureMax` ≤ 512. Call before the shell is built (later calls affect new loads only). */
export function setPbrQuality(q: { textureMax: number; anisotropy?: number }): void {
  textureMax = q.textureMax
}

/** The map size the current quality tier loads (1024 or 512). */
export const pbrSize = (): number => (textureMax <= 512 ? 512 : 1024)

/** `/textures/pbr/<name>/<map>.webp`, or `.s.webp` for the 512 set. */
export function pbrUrl(name: PbrName, map: PbrMap, size: number): string {
  return `/textures/pbr/${name}/${map}${size <= 512 ? '.s' : ''}.webp`
}

// ------------------------------------------------------------------ textures
interface Loaded {
  tex: Texture
  size: number
  /** Clones made before the image arrived: they get `needsUpdate` with it. */
  clones: Texture[]
}

const texCache = new Map<string, Loaded>()
const matCache = new Map<string, MeshStandardMaterial>()

function loadMap(name: PbrName, map: PbrMap): Loaded {
  const size = pbrSize()
  const key = `${name}/${map}@${size}`
  const have = texCache.get(key)
  if (have) return have
  // One stable Texture per map from the start: materials (and repeat clones) hold it
  // while the image arrives through the shared semaphore (boot stays smooth, the bench
  // waits for it). The loader's own wrapper only donates its image.
  const tex = new Texture()
  setup(tex, map)
  const entry: Loaded = { tex, size, clones: [] }
  texCache.set(key, entry)
  const url = pbrUrl(name, map, size)
  void imageLoads.run(
    () =>
      new Promise<void>((resolve) => {
        try {
          new TextureLoader().load(
            url,
            (t) => {
              entry.tex.image = t.image
              entry.tex.needsUpdate = true
              for (const c of entry.clones) c.needsUpdate = true
              entry.clones.length = 0
              resolve()
            },
            undefined,
            () => {
              console.warn(`[pbr] failed to load ${url}`)
              resolve()
            },
          )
        } catch {
          // No DOM (unit tests of the builders): the material keeps its flat colour.
          resolve()
        }
      }),
  )
  return entry
}

function setup(t: Texture, map: PbrMap): void {
  t.colorSpace = map === 'color' ? SRGBColorSpace : NoColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = maxAnisotropy()
}

/** The shared texture, or a clone (same GPU upload) carrying this repeat. */
function withRepeat(l: Loaded, repeat: [number, number] | undefined): Texture {
  if (!repeat || (repeat[0] === 1 && repeat[1] === 1)) return l.tex
  const c = l.tex.clone()
  c.repeat.set(repeat[0], repeat[1])
  if (!l.tex.image) {
    // Not loaded yet: a clone marked for update with no image warns every frame.
    c.version = 0
    l.clones.push(c)
  }
  return c
}

// ----------------------------------------------------------------- materials
/** Cached MeshStandardMaterial with the library's maps; throws on an unknown name. */
/** One library map with a repeat (shared, cached): for materials built outside `pbrMaterial`. */
export function pbrMap(name: PbrName, map: PbrMap, repeat?: [number, number]): Texture {
  return withRepeat(loadMap(name, map), repeat)
}

export function pbrMaterial(name: PbrName, opts: PbrOptions = {}): MeshStandardMaterial {
  const def = DEFS[name]
  if (!def) throw new Error(`unknown PBR texture "${name}"`)
  const key = `${name}@${pbrSize()}|${JSON.stringify(opts)}`
  let m = matCache.get(key)
  if (m) return m
  const color = new Color(opts.color ?? def.color)
  if (def.tint) color.setRGB(color.r / def.tint[0], color.g / def.tint[1], color.b / def.tint[2])
  m = new MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? def.roughness,
    metalness: opts.metalness ?? def.metalness,
    map: withRepeat(loadMap(name, 'color'), opts.repeat),
    normalMap: withRepeat(loadMap(name, 'normal'), opts.repeat),
    roughnessMap: opts.roughnessMap ? withRepeat(loadMap(name, 'roughness'), opts.repeat) : null,
  })
  const ns = opts.normalScale ?? def.normalScale
  m.normalScale.set(ns, ns)
  m.name = `pbr:${name}`
  matCache.set(key, m)
  return m
}

/** Estimated GPU bytes of the library maps requested so far (RGBA + mipmaps; nominal size until loaded). */
export function pbrTextureBytes(): number {
  let sum = 0
  for (const l of texCache.values()) {
    const im = l.tex.image as { width?: number; height?: number } | null | undefined
    const w = im?.width ?? l.size
    const h = im?.height ?? l.size
    sum += w * h * 4 * (4 / 3)
  }
  return Math.round(sum)
}

/** Forgets every cached texture and material (tests, quality re-detection). Doesn't dispose GPU resources. */
export function resetPbrCache(): void {
  texCache.clear()
  matCache.clear()
}
