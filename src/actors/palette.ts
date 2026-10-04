// Look generators: deterministic variety from a seed so the mall looks the
// same on every visit.

import type { Texture } from 'three'
import { BRAND } from '../config/brand'
import type { OutfitStyle } from '../config/sections'
import { rng } from '../engine/textures'
import type { HairStyle, HijabStyle } from './hijab'
import type { Look, Pose } from './character'

const SKINS = ['#f3cfb1', '#e8b994', '#d49c74', '#b77a55', '#8a5a3c', '#f6dccb']
// Distinct fashion colours (no skin-like beiges, which read as bare skin on screen).
const HIJAB_COLORS = ['#d9b8c6', '#3c3a47', '#7f8b9b', '#ece7e2', '#5d4b60', '#b8687f', '#a7b5a0', '#2f3b4e', '#8c3a52', '#26232a']
const ACCENTS = ['#ffffff', '#f3e6ea', '#e8d9c8', '#1f1f24']
const HAIR = ['#2b1d16', '#4a3022', '#6f4a2e', '#1d1a1a', '#8a6142']
const HIJAB_STYLES: HijabStyle[] = ['classic', 'long', 'wrap']
const HAIR_STYLES: HairStyle[] = ['bun', 'ponytail', 'long', 'bob']
const SHOES = ['#2b2528', '#e9e1dc', '#8b6b58', '#c9a9b6']

const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]

/** Showcase model for a product. About four in five wear hijab. Always modestly dressed. */
export function modelLook(seed: number, outfit: OutfitStyle, pose: Pose): Look {
  const r = rng(seed * 7919 + 13)
  const hijabi = outfit === 'abaya' || r() < 0.8
  return {
    skin: pick(r, SKINS),
    top: '#d8c7bf',
    bottom: '#6f6a74',
    outfit,
    shoes: pick(r, SHOES),
    head: hijabi
      ? { kind: 'hijab', color: pick(r, HIJAB_COLORS), style: pick(r, HIJAB_STYLES), accent: r() < 0.5 ? pick(r, ACCENTS) : undefined }
      : { kind: 'hair', color: pick(r, HAIR), style: pick(r, HAIR_STYLES) },
    pose,
    height: 0.97 + r() * 0.07,
  }
}

/** Staff uniform: white top, dark bottoms, magenta vest with the logo. */
export function staffLook(seed: number, logo: Texture | null, pose: Pose = 'clasped'): Look {
  const r = rng(seed * 104729 + 7)
  const hijabi = r() < 0.85
  const outfit: OutfitStyle = r() < 0.5 ? 'pants' : 'skirt'
  return {
    skin: pick(r, SKINS),
    top: '#fbf8f6',
    bottom: pick(r, ['#2f2b33', '#3d4250', '#4a3f45']),
    outfit,
    shoes: '#2b2528',
    head: hijabi
      ? { kind: 'hijab', color: pick(r, ['#2f2b33', '#ece7e2', '#d9b8c6', '#3c3a47', '#5d4b60']), style: pick(r, ['classic', 'wrap'] as const) }
      : { kind: 'hair', color: pick(r, HAIR), style: pick(r, ['bun', 'ponytail'] as const) },
    vest: { color: BRAND.magenta, logo },
    pose,
    height: 0.98 + r() * 0.05,
  }
}

/** The visitor's own third-person avatar. */
export function avatarLook(): Look {
  return {
    skin: '#e8b994',
    top: '#f1e4ea',
    bottom: '#5b5566',
    outfit: 'pants',
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
  const outfit: OutfitStyle = x < 0.38 ? 'abaya' : x < 0.7 ? 'skirt' : 'pants'
  const hijabi = outfit === 'abaya' || r() < 0.85
  const top = pick(r, TOPS)
  return {
    skin: pick(r, SKINS),
    top,
    bottom: outfit === 'abaya' ? top : pick(r, BOTTOMS),
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
  return { ...l, top: '#f3ece4', bottom: '#2b2528', vest: { color: '#2b2528', logo }, head: l.head.kind === 'hijab' ? { ...l.head, color: pick(rng(seed), ['#c8a46e', '#2b2528', '#ece7e2']) } : l.head }
}

export const OUTFIT_PALETTE = TOPS
