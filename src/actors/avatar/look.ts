// The visitor's own avatar: what she picks in the avatar editor, saved on the
// device (persisted store). Plain data, validated on load so a stale or edited
// save can never produce an invalid (or immodest) character.

import { FACE_STYLES } from './face'
import type { AvatarOutfit, HairStyle, HeadWear, HijabStyle } from './pieces'

export interface AvatarData {
  skin: string
  face: number
  outfit: AvatarOutfit
  top: string
  bottom: string
  trim: string
  shoes: string
  head: HeadWear
  /** Selfie / editor refinements (all optional; defaults are the base character). */
  iris?: string
  lips?: string
  brows?: string
  /** Head width multiplier (0.86–1.14). */
  faceWidth?: number
  /** Lower-face (jaw) width multiplier (0.84–1.14). */
  jaw?: number
  /** Brow thickness multiplier (0.7–1.5). */
  browThick?: number
}

export const AVATAR_IRIS = ['#3b2618', '#5a3a22', '#7a5a3a', '#4a6a4a', '#5a7a9a', '#3a4a6a']
export const AVATAR_LIPS = ['#c96f7b', '#b65f63', '#d68a8f', '#a85462', '#8c3a52', '#c9a09a']

/** Editor choices. */
export const AVATAR_SKINS = ['#f6dccb', '#f3cfb1', '#e8b994', '#d49c74', '#b77a55', '#8a5a3c']
export const AVATAR_OUTFITS: AvatarOutfit[] = ['abaya', 'dress', 'skirt', 'pants']
export const AVATAR_HIJABS: HijabStyle[] = ['classic', 'long']
export const AVATAR_HAIRS: HairStyle[] = ['long', 'bun', 'ponytail', 'bob']
export const AVATAR_FABRICS = [
  '#f1ebe4', '#e8dccf', '#c9b29b', '#b98a6e', '#e6d3b3', '#d9b8c6', '#c99aae', '#b8687f', '#8c3a52', '#5b2b82',
  '#5d4b60', '#7f8b9b', '#2f3b4e', '#3d4250', '#7b8a6a', '#a7b5a0', '#3c3a47', '#2f2b33', '#26232a', '#ffffff',
]
export const AVATAR_HAIR_COLORS = ['#1d1a1a', '#2b1d16', '#4a3022', '#6f4a2e', '#8a6142', '#a8743f']
export const AVATAR_TRIMS = ['#c8a46e', '#f1ebe4', '#2b2528', '#8c3a52', '#5b2b82', '#7f8b9b']
export const AVATAR_SHOES = ['#2b2528', '#e9e1dc', '#8b6b58', '#c9a9b6', '#5b2b82']

export function defaultAvatar(): AvatarData {
  return {
    skin: '#e8b994',
    face: 0,
    outfit: 'skirt',
    top: '#f1ebe4',
    bottom: '#5d4b60',
    trim: '#c8a46e',
    shoes: '#e9e1dc',
    head: { kind: 'hijab', style: 'classic', color: '#c99aae', accent: '#ffffff' },
  }
}

const pick = <T,>(arr: readonly T[], r = Math.random): T => arr[Math.floor(r() * arr.length) % arr.length]

/** "Surprise me": a random, always modest look. */
export function randomAvatar(r = Math.random): AvatarData {
  const outfit = pick(AVATAR_OUTFITS, r)
  const top = pick(AVATAR_FABRICS, r)
  const head: HeadWear =
    r() < 0.8
      ? { kind: 'hijab', style: pick(AVATAR_HIJABS, r), color: pick(AVATAR_FABRICS, r), accent: r() < 0.4 ? pick(['#ffffff', '#f1ebe4', '#26232a'], r) : undefined }
      : { kind: 'hair', style: pick(AVATAR_HAIRS, r), color: pick(AVATAR_HAIR_COLORS, r) }
  return {
    skin: pick(AVATAR_SKINS, r),
    face: Math.floor(r() * FACE_STYLES.length),
    outfit,
    top,
    bottom: outfit === 'abaya' || outfit === 'dress' ? top : pick(AVATAR_FABRICS, r),
    trim: pick(AVATAR_TRIMS, r),
    shoes: pick(AVATAR_SHOES, r),
    head,
  }
}

const HEX = /^#[0-9a-f]{6}$/i
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback)

/** A valid AvatarData from anything (a persisted save); invalid fields fall back to the default. */
export function sanitizeAvatar(raw: unknown): AvatarData | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const d = defaultAvatar()
  const h = (o.head ?? {}) as Record<string, unknown>
  let head: HeadWear
  if (h.kind === 'hair' && AVATAR_HAIRS.includes(h.style as HairStyle)) {
    head = { kind: 'hair', style: h.style as HairStyle, color: color(h.color, AVATAR_HAIR_COLORS[1]) }
  } else {
    const style = AVATAR_HIJABS.includes(h.style as HijabStyle) ? (h.style as HijabStyle) : 'classic'
    head = { kind: 'hijab', style, color: color(h.color, '#c99aae'), accent: typeof h.accent === 'string' && HEX.test(h.accent) ? h.accent : undefined }
  }
  const face = Number.isInteger(o.face) && (o.face as number) >= 0 && (o.face as number) < FACE_STYLES.length ? (o.face as number) : d.face
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined)
  const opt = (v: unknown) => (typeof v === 'string' && HEX.test(v) ? v : undefined)
  return {
    // Any skin tone (a selfie samples it); the swatches are only shortcuts.
    skin: color(o.skin, d.skin),
    face,
    outfit: AVATAR_OUTFITS.includes(o.outfit as AvatarOutfit) ? (o.outfit as AvatarOutfit) : d.outfit,
    top: color(o.top, d.top),
    bottom: color(o.bottom, d.bottom),
    trim: color(o.trim, d.trim),
    shoes: color(o.shoes, d.shoes),
    head,
    iris: opt(o.iris),
    lips: opt(o.lips),
    brows: opt(o.brows),
    faceWidth: num(o.faceWidth, 0.86, 1.14),
    jaw: num(o.jaw, 0.84, 1.14),
    browThick: num(o.browThick, 0.7, 1.5),
  }
}
