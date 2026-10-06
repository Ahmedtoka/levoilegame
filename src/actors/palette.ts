// Look generators: deterministic variety from a seed so the mall looks the
// same on every visit.

import type { Texture } from 'three'
import { BRAND } from '../config/brand'
import type { OutfitStyle } from '../config/sections'
import { rng } from '../engine/textures'
import { FACE_STYLES } from './avatar/face'
import type { AvatarOutfit, HairStyle, HijabStyle } from './avatar/pieces'
import type { Look, Pose } from './character'

export const SKINS = ['#f6dccb', '#f3cfb1', '#e8b994', '#d49c74', '#b77a55', '#8a5a3c']
// Distinct fashion colours (no skin-like beiges, which read as bare skin on screen).
export const HIJAB_COLORS = ['#d9b8c6', '#3c3a47', '#7f8b9b', '#ece7e2', '#5d4b60', '#b8687f', '#a7b5a0', '#2f3b4e', '#8c3a52', '#26232a']
const ACCENTS = ['#ffffff', '#f3e6ea', '#e8d9c8', '#1f1f24']
export const HAIR = ['#2b1d16', '#4a3022', '#6f4a2e', '#1d1a1a', '#8a6142']
export const HIJAB_STYLES: HijabStyle[] = ['classic', 'long']
export const HAIR_STYLES: HairStyle[] = ['long', 'bun', 'ponytail', 'bob']
export const SHOES = ['#2b2528', '#e9e1dc', '#8b6b58', '#c9a9b6']
const TRIMS = ['#c8a46e', '#f1ebe4', '#2b2528', '#8c3a52']

const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]
const face = (r: () => number) => Math.floor(r() * FACE_STYLES.length)

/** Showcase model for a product. About four in five wear hijab. Always modestly dressed. */
export function modelLook(seed: number, outfit: OutfitStyle, pose: Pose): Look {
  const r = rng(seed * 7919 + 13)
  const hijabi = outfit === 'abaya' || r() < 0.8
  // Long-skirt products alternate between a dress and a skirt with a tunic.
  const o: AvatarOutfit = outfit === 'skirt' && r() < 0.5 ? 'dress' : outfit
  return {
    skin: pick(r, SKINS),
    face: face(r),
    top: '#d8c7bf',
    bottom: '#6f6a74',
    trim: pick(r, TRIMS),
    outfit: o,
    shoes: pick(r, SHOES),
    head: hijabi
      ? { kind: 'hijab', color: pick(r, HIJAB_COLORS), style: pick(r, HIJAB_STYLES), accent: r() < 0.5 ? pick(r, ACCENTS) : undefined }
      : { kind: 'hair', color: pick(r, HAIR), style: pick(r, HAIR_STYLES) },
    pose,
    height: 0.97 + r() * 0.07,
  }
}

/** Relative luminance (0..1) of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/** Vest colours lighter than this get darkened so the white logo and text stay readable. */
const VEST_MAX_LUMINANCE = 0.7
const VEST_DARK_LUMINANCE = 0.3

/**
 * The vest colour of a shop's staff: the brand colour (darkened to a mid tone when it is
 * very light), or the mall plum for the concierge, cashier and anyone without a brand.
 */
export function staffVestColor(brandColor?: string | null): string {
  if (!brandColor || !/^#[0-9a-f]{6}$/i.test(brandColor)) return BRAND.magenta
  const L = luminance(brandColor)
  if (L <= VEST_MAX_LUMINANCE) return brandColor
  // Scale in linear light so the hue stays, then re-encode to sRGB.
  const k = VEST_DARK_LUMINANCE / L
  const n = parseInt(brandColor.slice(1), 16)
  const ch = (c: number) => {
    const s = c / 255
    const lin = (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * k
    const out = lin <= 0.0031308 ? lin * 12.92 : 1.055 * lin ** (1 / 2.4) - 0.055
    return Math.round(Math.max(0, Math.min(1, out)) * 255)
  }
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(ch((n >> 16) & 255))}${hex(ch((n >> 8) & 255))}${hex(ch(n & 255))}`
}

/**
 * Staff uniform: white top, dark bottoms, a waistcoat with the logo. The waistcoat is in
 * the shop's brand colour (`brandColor`, see `staffVestColor`); without one it is the mall plum.
 */
export function staffLook(seed: number, logo: Texture | null, pose: Pose = 'clasped', brandColor?: string | null): Look {
  const r = rng(seed * 104729 + 7)
  const hijabi = r() < 0.85
  const outfit: AvatarOutfit = r() < 0.5 ? 'pants' : 'skirt'
  return {
    skin: pick(r, SKINS),
    face: face(r),
    top: '#fbf8f6',
    bottom: pick(r, ['#2f2b33', '#3d4250', '#4a3f45']),
    trim: '#2b2528',
    outfit,
    shoes: '#2b2528',
    head: hijabi
      ? { kind: 'hijab', color: pick(r, ['#2f2b33', '#ece7e2', '#d9b8c6', '#3c3a47', '#5d4b60']), style: 'classic' }
      : { kind: 'hair', color: pick(r, HAIR), style: pick(r, ['bun', 'ponytail'] as const) },
    vest: { color: staffVestColor(brandColor), logo },
    pose,
    height: 0.98 + r() * 0.05,
  }
}

/** Default look of the visitor's own avatar (until she designs hers). */
export function avatarLook(): Look {
  return {
    skin: '#e8b994',
    face: 0,
    top: '#f1e4ea',
    bottom: '#5b5566',
    trim: '#c8a46e',
    outfit: 'skirt',
    shoes: '#e9e1dc',
    head: { kind: 'hijab', color: '#c99aae', style: 'classic', accent: '#ffffff' },
    pose: 'relaxed',
  }
}

const TOPS = ['#e8dccf', '#c9b29b', '#7b8a6a', '#2f3b4e', '#8c3a52', '#d9b8c6', '#f1ebe4', '#5d4b60', '#a7b5a0', '#b98a6e', '#3c3a47', '#e6d3b3']
const BOTTOMS = ['#2f2b33', '#3d4250', '#6f6a74', '#e8dccf', '#4a3f45', '#7f8b9b', '#c9b29b', '#26232a']

/** A shopper in the mall crowd. Always modest; about 85% wear hijab. */
export function customerLook(seed: number): Look {
  const r = rng(seed * 2654435 + 97)
  const x = r()
  const outfit: AvatarOutfit = x < 0.32 ? 'abaya' : x < 0.5 ? 'dress' : x < 0.75 ? 'skirt' : 'pants'
  const hijabi = outfit === 'abaya' || r() < 0.85
  const top = pick(r, TOPS)
  return {
    skin: pick(r, SKINS),
    face: face(r),
    top,
    bottom: outfit === 'abaya' || outfit === 'dress' ? top : pick(r, BOTTOMS),
    trim: pick(r, TRIMS),
    outfit,
    shoes: pick(r, SHOES),
    head: hijabi
      ? { kind: 'hijab', color: pick(r, HIJAB_COLORS), style: pick(r, HIJAB_STYLES), accent: r() < 0.3 ? pick(r, ACCENTS) : undefined }
      : { kind: 'hair', color: pick(r, HAIR), style: pick(r, HAIR_STYLES) },
    pose: r() < 0.5 ? 'relaxed' : 'idle',
    height: 0.95 + r() * 0.08,
  }
}

/** Studio stylist: dark blazer-style vest with the logo. */
export function stylistLook(seed: number, logo: Texture | null): Look {
  const l = staffLook(seed, logo, 'clasped')
  return {
    ...l,
    top: '#f3ece4',
    bottom: '#2b2528',
    vest: { color: '#2b2528', logo },
    head: l.head.kind === 'hijab' ? { ...l.head, color: pick(rng(seed), ['#c8a46e', '#2b2528', '#ece7e2']) } : l.head,
  }
}

export const OUTFIT_PALETTE = TOPS
