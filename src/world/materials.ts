import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Texture,
} from 'three'
import { BRAND } from '../config/brand'

const std = (color: string, roughness = 0.8, metalness = 0, extra: Partial<MeshStandardMaterial> = {}) =>
  Object.assign(new MeshStandardMaterial({ color, roughness, metalness }), extra)

export const MAT = {
  wall: std('#f2ebe8', 0.92),
  wallWarm: std('#f3ebe7', 0.9),
  ceiling: std('#f7f2f0', 0.95, 0, { emissive: new Color('#fbf6f4'), emissiveIntensity: 0.55 }),
  trim: std('#fbf8f7', 0.5),
  brass: std('#c8a46e', 0.32, 0.9),
  chrome: std('#e6e6ea', 0.18, 1),
  black: std('#2b2528', 0.55, 0.1),
  magenta: std(BRAND.magenta, 0.45, 0.05),
  magentaDark: std(BRAND.magentaDark, 0.5),
  blush: std('#f4dfe9', 0.85),
  plinth: std('#fdfbfa', 0.5),
  marbleTop: std('#efe9e7', 0.25),
  wood: std('#d8c2a8', 0.65),
  woodDark: std('#9a7a62', 0.6),
  sofa: std('#ead3dd', 0.95),
  leaf: std('#6f9a72', 0.75, 0, { flatShading: true }),
  leafDark: std('#4f7c5a', 0.75, 0, { flatShading: true }),
  pot: std('#efe7e1', 0.6),
  glass: new MeshStandardMaterial({
    color: '#e7f3f5',
    roughness: 0.05,
    metalness: 0.2,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: DoubleSide,
  }),
  lightPanel: new MeshBasicMaterial({ color: '#fffdf8' }),
  lightWarm: new MeshBasicMaterial({ color: '#fff3dc' }),
  neon: new MeshBasicMaterial({ color: '#ff8fd8' }),
}

const tintCache = new Map<string, MeshStandardMaterial>()
/** Matte material in a shop tint (cached so batching still works). */
export function tintMat(hex: string, shade = 1, roughness = 0.85): MeshStandardMaterial {
  const key = `${hex}|${shade}|${roughness}`
  let m = tintCache.get(key)
  if (!m) {
    m = std(`#${new Color(hex).multiplyScalar(shade).getHexString()}`, roughness)
    tintCache.set(key, m)
  }
  return m
}

/** Unlit image material (signs, product photos) — reads the same under any lighting. */
export function imageMat(map: Texture | null, opts: { transparent?: boolean; color?: string } = {}): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color: opts.color ?? '#ffffff',
    transparent: opts.transparent ?? false,
    alphaTest: opts.transparent ? 0.04 : 0,
    side: DoubleSide,
    toneMapped: false,
  })
}

export function glowMat(map: Texture, color = '#ffffff', opacity = 0.35): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
}
