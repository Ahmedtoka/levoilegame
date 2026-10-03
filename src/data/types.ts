// Catalogue types — the contract every ProductProvider must produce.

export interface Section {
  id: string
  title: string
  titleAr: string
  productIds: string[]
}

export interface ColorOption {
  name: string
  nameAr: string
  hex: string
}

export interface Product {
  id: string
  /** Shopify product handle — join key for the Storefront API. */
  handle: string
  title: string
  price: number
  compareAtPrice: number | null
  currency: string
  images: string[]
  /** Transparent PNG of images[0]; null when background removal wasn't usable. */
  cutout: string | null
  sizes: string[]
  colors: ColorOption[]
  section: string
  modelOutfit: boolean
  url: string
  /** Shopify variant id per "size/color" key, filled by the Shopify provider. */
  variantIds?: Record<string, string>
}

export interface Catalog {
  sections: Section[]
  products: Product[]
  byId: Map<string, Product>
}

/** Image to show for a product as a free-standing standee: cutout if valid, else the first photo. */
export function displayImage(p: Product): string {
  return p.cutout ?? p.images[0]
}

export function hasCutout(p: Product): p is Product & { cutout: string } {
  return p.cutout !== null
}

export function discountPercent(p: Product): number | null {
  if (!p.compareAtPrice || p.compareAtPrice <= p.price) return null
  return Math.round((1 - p.price / p.compareAtPrice) * 100)
}

/** Collection handle from a product URL like …/collections/<handle>/products/<product>. */
export function collectionHandleFromUrl(url: string): string | null {
  return url.match(/\/collections\/([^/]+)\//)?.[1] ?? null
}

export function buildCatalog(sections: Section[], products: Product[]): Catalog {
  return { sections, products, byId: new Map(products.map((p) => [p.id, p])) }
}
