// 122 Mall: the tenant brands and where each one sits. Plaza + 3 wings
// (west, north, east); each wing has shops on both sides. Brand identity
// (monogram colour, display, outfit) drives the shop's look until every
// brand gets its own bespoke décor.

import type { DisplayKind, OutfitStyle } from './sections'

export const MALL_NAME = '122 Mall'
export const MALL_NAME_AR = '١٢٢ مول'

export type ProductKind = 'dress' | 'abaya' | 'blouse' | 'pants' | 'cardigan' | 'scarf' | 'bag' | 'shoes' | 'box'

export interface BrandDef {
  id: string
  name: string
  nameAr: string
  /** Two-letter monogram, as in the client list. */
  initials: string
  /** Monogram / accent colour. */
  color: string
  status: 'open' | 'soon'
  display: DisplayKind
  outfit: OutfitStyle
  /** What the placeholder catalogue sells. */
  kinds: ProductKind[]
  /** Brand with a real catalogue (src/data/products.json). */
  realCatalog?: boolean
  site?: string
}

const APPAREL: ProductKind[] = ['dress', 'abaya', 'blouse', 'pants', 'cardigan', 'dress']
const MODEST: ProductKind[] = ['abaya', 'dress', 'abaya', 'cardigan', 'dress', 'blouse']
const CASUAL: ProductKind[] = ['blouse', 'pants', 'cardigan', 'dress', 'pants', 'blouse']

export const BRANDS: BrandDef[] = [
  { id: 'axis', name: 'AXIS', nameAr: 'أكسيس', initials: 'AX', color: '#6b2fbf', status: 'open', display: 'gallery', outfit: 'pants', kinds: CASUAL },
  { id: 'the-cause-wear', name: 'THE CAUSE WEAR', nameAr: 'ذا كوز وير', initials: 'CU', color: '#2e8b3a', status: 'open', display: 'rack', outfit: 'pants', kinds: CASUAL },
  { id: 'dnd', name: 'DND', nameAr: 'دي إن دي', initials: 'DN', color: '#2a2a2a', status: 'open', display: 'rack', outfit: 'skirt', kinds: APPAREL },
  { id: 'nourhan', name: 'Nourhan', nameAr: 'نورهان', initials: 'NO', color: '#0f8a7a', status: 'open', display: 'rack', outfit: 'abaya', kinds: MODEST },
  { id: 'pistage', name: 'Pistage', nameAr: 'بيستاج', initials: 'PI', color: '#b9925f', status: 'open', display: 'gallery', outfit: 'skirt', kinds: APPAREL },
  { id: 'slip-and-go', name: 'Slip & Go', nameAr: 'سليب آند جو', initials: 'SP', color: '#c4581a', status: 'open', display: 'boxes', outfit: 'pants', kinds: ['shoes', 'shoes', 'bag', 'shoes', 'shoes', 'bag'] },
  { id: 'bezravoga', name: 'BezraVoga', nameAr: 'بزرافوجا', initials: 'BZ', color: '#4fa59a', status: 'open', display: 'rack', outfit: 'abaya', kinds: MODEST },
  { id: 'nanosh', name: 'Nanosh', nameAr: 'نانوش', initials: 'NA', color: '#d6303a', status: 'open', display: 'rack', outfit: 'skirt', kinds: APPAREL },
  { id: 'scarfest', name: 'Scarfest', nameAr: 'سكارفست', initials: 'SR', color: '#1d1d1f', status: 'open', display: 'shelf', outfit: 'abaya', kinds: ['scarf', 'scarf', 'scarf', 'scarf', 'scarf', 'scarf'] },
  { id: 'jeno', name: 'Jeno', nameAr: 'جينو', initials: 'JE', color: '#f07a4a', status: 'open', display: 'gallery', outfit: 'pants', kinds: CASUAL },
  { id: 'hashbag', name: 'HashBag', nameAr: 'هاش باج', initials: 'HS', color: '#a21caf', status: 'open', display: 'boxes', outfit: 'skirt', kinds: ['bag', 'bag', 'bag', 'bag', 'bag', 'bag'] },
  { id: 'rwan-designs', name: 'Rwan Designs', nameAr: 'روان ديزاينز', initials: 'RW', color: '#e07b1a', status: 'open', display: 'rack', outfit: 'abaya', kinds: MODEST },
  { id: 'fashion-avenue', name: 'Fashion Avenue', nameAr: 'فاشون أفينيو', initials: 'FA', color: '#1f6fb2', status: 'open', display: 'gallery', outfit: 'skirt', kinds: APPAREL },
  { id: 'levoile', name: 'Le Voile', nameAr: 'لوفوال', initials: 'LV', color: '#9e197e', status: 'open', display: 'rack', outfit: 'abaya', kinds: MODEST, realCatalog: true, site: 'https://levoilestores.com' },
  { id: 'noha-collection', name: 'Noha Collection', nameAr: 'نهى كولكشن', initials: 'NO', color: '#c0213a', status: 'open', display: 'rack', outfit: 'abaya', kinds: MODEST },
  { id: 'promax', name: 'ProMax', nameAr: 'بروماكس', initials: 'PR', color: '#157a8a', status: 'open', display: 'boxes', outfit: 'pants', kinds: ['box', 'box', 'bag', 'box', 'box', 'bag'] },
  ...[1, 2, 3, 4].map(
    (n): BrandDef => ({
      id: `soon-${n}`,
      name: 'Coming Soon',
      nameAr: 'قريباً',
      initials: '122',
      color: '#b8a48c',
      status: 'soon',
      display: 'rack',
      outfit: 'skirt',
      kinds: [],
    }),
  ),
]

export const brandById = new Map(BRANDS.map((b) => [b.id, b]))

export type WingId = 'west' | 'north' | 'east'

export interface WingDef {
  id: WingId
  nameEn: string
  nameAr: string
  /** Slots in order from the plaza outwards, alternating left/right. 'studio' / 'lounge' are mall amenities. */
  slots: string[]
}

// 22 slots: 16 brands + 4 Coming Soon + Styling Studio + lounge.
export const WINGS: WingDef[] = [
  {
    id: 'west',
    nameEn: 'West Wing',
    nameAr: 'الجناح الغربي',
    slots: ['levoile', 'nourhan', 'scarfest', 'bezravoga', 'noha-collection', 'rwan-designs', 'soon-1', 'studio'],
  },
  {
    id: 'north',
    nameEn: 'North Wing',
    nameAr: 'الجناح الشمالي',
    slots: ['axis', 'the-cause-wear', 'dnd', 'jeno', 'pistage', 'fashion-avenue', 'soon-2', 'lounge'],
  },
  {
    id: 'east',
    nameEn: 'East Wing',
    nameAr: 'الجناح الشرقي',
    slots: ['hashbag', 'slip-and-go', 'nanosh', 'promax', 'soon-3', 'soon-4'],
  },
]
