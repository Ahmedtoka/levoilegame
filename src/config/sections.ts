// Per-section presentation. Everything here is optional: a section that is
// added to products.json without an entry here gets a generated tint and the
// default display ("rack"). See README → "Add a section".

import { Color } from 'three'
import { brandById } from './mall'

/** How products are presented inside the shop. */
export type DisplayKind = 'rack' | 'shelf' | 'gallery' | 'boxes'
/** Silhouette of the stylized models' outfit in this section. */
export type OutfitStyle = 'abaya' | 'skirt' | 'pants'
/** Fallback sizes until the Shopify provider supplies real variants. */
export type SizeProfile = 'apparel' | 'free'

export interface SectionStyle {
  display: DisplayKind
  tint: string
  outfit: OutfitStyle
  sizes: SizeProfile
  /** Shopify collection handle this section maps to. */
  collection?: string
}

const OVERRIDES: Record<string, Partial<SectionStyle>> = {
  'new-arrivals': { display: 'gallery', tint: '#f3dbe9', sizes: 'free', collection: 'new-arrivals' },
  dresses: { display: 'rack', tint: '#eedcf0', outfit: 'abaya', collection: 'dress' },
  'everyday-wear': { display: 'rack', tint: '#f5e9df', outfit: 'pants', collection: 'everyday-wear' },
  denim: { display: 'rack', tint: '#dfe6f2', outfit: 'pants', collection: 'denim' },
  sale: { display: 'rack', tint: '#f8d9e2', outfit: 'skirt', collection: 'sale-2' },
  scarves: { display: 'shelf', tint: '#f1e2ea', sizes: 'free', collection: 'printed-cotton' },
  'inner-caps': { display: 'shelf', tint: '#ede4dc', sizes: 'free', collection: 'inner-caps' },
  isdal: { display: 'rack', tint: '#e6e0f0', outfit: 'abaya', sizes: 'free', collection: 'praying-isdal-1' },
  accessories: { display: 'boxes', tint: '#efe6d8', sizes: 'free', collection: 'accessories' },
}

/** Pastel tint derived from the brand hue for sections without an override. */
function generatedTint(index: number): string {
  const brand = new Color('#5b2b82')
  const hsl = { h: 0, s: 0, l: 0 }
  brand.getHSL(hsl)
  const c = new Color().setHSL((hsl.h + ((index * 0.137) % 0.3) - 0.15 + 1) % 1, 0.45, 0.9)
  return `#${c.getHexString()}`
}

/** Pastel version of a brand colour for floors, walls and the minimap. */
export function brandTint(hex: string): string {
  return `#${new Color(hex).lerp(new Color('#fbf6f2'), 0.82).getHexString()}`
}

export function sectionStyle(id: string, index: number): SectionStyle {
  // District 122: tenant brands carry their own style.
  const brand = brandById.get(id)
  if (brand) {
    const free = brand.kinds.length > 0 && !brand.kinds.some((k) => ['dress', 'abaya', 'blouse', 'pants', 'cardigan'].includes(k))
    return { display: brand.display, tint: brandTint(brand.color), outfit: brand.outfit, sizes: free ? 'free' : 'apparel' }
  }
  return {
    display: 'rack',
    tint: generatedTint(index),
    outfit: 'skirt',
    sizes: 'apparel',
    ...OVERRIDES[id],
  }
}
