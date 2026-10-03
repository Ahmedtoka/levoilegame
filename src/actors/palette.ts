// Look generators: deterministic variety from a seed so the mall looks the
// same on every visit.

import type { Texture } from 'three'
import { BRAND } from '../config/brand'
import type { OutfitStyle } from '../config/sections'
import { rng } from '../engine/textures'
import type { HairStyle, HijabStyle } from './hijab'
import type { Look, Pose } from './character'

const SKINS = ['#f3cfb1', '#e8b994', '#d49c74', '#b77a55', '#8a5a3c', '#f6dccb']
const HIJAB_COLORS = ['#d9b8c6', '#3c3a47', '#cbb8a4', '#7f8b9b', '#efe4d6', '#5d4b60', '#b8687f', '#a7b5a0', '#e9cdb8', '#2f3b4e']
const ACCENTS = ['#ffffff', '#f3e6ea', '#e8d9c8', '#1f1f24']
const HAIR = ['#2b1d16', '#4a3022', '#6f4a2e', '#1d1a1a', '#8a6142']
const HIJAB_STYLES: HijabStyle[] = ['classic', 'long', 'wrap']
const HAIR_STYLES: HairStyle[] = ['bun', 'ponytail', 'long', 'bob']
const SHOES = ['#2b2528', '#e9e1dc', '#8b6b58', '#c9a9b6']

const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]

/** Showcase model for a product. About two in three wear hijab. */
export function modelLook(seed: number, outfit: OutfitStyle, pose: Pose): Look {
  const r = rng(seed * 7919 + 13)
  const hijabi = r() < 0.66
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
  const hijabi = r() < 0.7
  const outfit: OutfitStyle = r() < 0.5 ? 'pants' : 'skirt'
  return {
    skin: pick(r, SKINS),
    top: '#fbf8f6',
    bottom: pick(r, ['#2f2b33', '#3d4250', '#4a3f45']),
    outfit,
    shoes: '#2b2528',
    head: hijabi
      ? { kind: 'hijab', color: pick(r, ['#2f2b33', '#efe4d6', '#d9b8c6', '#3c3a47', '#cbb8a4']), style: pick(r, ['classic', 'wrap'] as const) }
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
