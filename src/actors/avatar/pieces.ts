// What a character is made of: the garment pieces of public/models/avatar/avatar.glb
// (built by scripts/blender/build_avatar.py) picked per look, and the colour
// slot ("part") each piece is painted with.
//
// MODESTY RULE (no exceptions): there is no body mesh at all. A character is
// garment pieces + head (with eyes and brows) + hands, and every look must cover
// neck to ankles and shoulders to wrists (see modestyProblems; enforced in
// piecesFor and by tests).

export type AvatarOutfit = 'abaya' | 'dress' | 'skirt' | 'pants'
export type HijabStyle = 'classic' | 'long'
export type HairStyle = 'long' | 'bun' | 'ponytail' | 'bob'

/** Colour slots of the shared avatar material. */
export const PARTS = ['face', 'skin', 'top', 'bottom', 'trim', 'shoes', 'hijab', 'accent', 'hair', 'vest', 'logo', 'eyes', 'brows'] as const
export type Part = (typeof PARTS)[number]

/** Piece name in the GLB -> colour slot. */
export const PIECE_PART: Record<string, Part> = {
  head: 'face',
  hands: 'skin',
  eyes: 'eyes',
  brows: 'brows',
  upper: 'top',
  upper_abaya: 'top',
  tunic: 'top',
  skirt_flare: 'bottom',
  skirt_straight: 'bottom',
  leggings: 'bottom',
  trousers: 'bottom',
  shoes: 'shoes',
  hijab_classic: 'hijab',
  hijab_long: 'hijab',
  hijab_band: 'accent',
  hair_long: 'hair',
  hair_bun: 'hair',
  hair_ponytail: 'hair',
  hair_bob: 'hair',
  vest: 'vest',
  logo: 'logo',
  belt: 'trim',
  cuffs: 'trim',
  abaya_trim: 'trim',
}

export type HeadWear = { kind: 'hijab'; style: HijabStyle; color: string; accent?: string } | { kind: 'hair'; style: HairStyle; color: string }

/** The garments of a look (colours live in Look, see ../character). */
export interface Garments {
  outfit: AvatarOutfit
  head: HeadWear
  vest?: boolean
  logo?: boolean
}

const OUTFIT_PIECES: Record<AvatarOutfit, string[]> = {
  abaya: ['upper_abaya', 'skirt_flare', 'leggings', 'cuffs', 'abaya_trim'],
  dress: ['upper', 'skirt_flare', 'leggings', 'belt'],
  skirt: ['upper', 'tunic', 'skirt_straight', 'leggings'],
  pants: ['upper', 'tunic', 'trousers'],
}

/** Pieces of a look, in a stable order (the merged-geometry cache key). */
export function piecesFor(g: Garments): string[] {
  const out = ['head', 'eyes', 'brows', 'hands', 'shoes', ...OUTFIT_PIECES[g.outfit]]
  if (g.head.kind === 'hijab') {
    out.push(`hijab_${g.head.style}`)
    if (g.head.accent) out.push('hijab_band')
  } else {
    out.push(`hair_${g.head.style}`)
  }
  if (g.vest) {
    out.push('vest')
    if (g.logo) out.push('logo')
  }
  const bad = modestyProblems(out)
  if (bad.length) throw new Error(`Immodest look rejected: ${bad.join(', ')}`)
  return out
}

/** Empty when the pieces cover everything but the face and hands. */
export function modestyProblems(pieces: readonly string[]): string[] {
  const has = (...names: string[]) => names.some((n) => pieces.includes(n))
  const problems: string[] = []
  // Torso, neck (high collar) and arms to the wrist.
  if (!has('upper', 'upper_abaya')) problems.push('no long-sleeved top')
  // Hips to ankles.
  if (!has('skirt_flare', 'skirt_straight', 'trousers')) problems.push('no long skirt or trousers')
  // Under a skirt the shins are always covered too (a step never shows a gap).
  if (has('skirt_flare', 'skirt_straight') && !has('leggings', 'trousers')) problems.push('no leggings under the skirt')
  if (!has('shoes')) problems.push('no shoes')
  if (!pieces.some((p) => p.startsWith('hijab_') || p.startsWith('hair_'))) problems.push('no hijab or hair')
  for (const p of pieces) if (!(p in PIECE_PART)) problems.push(`unknown piece ${p}`)
  return problems
}
