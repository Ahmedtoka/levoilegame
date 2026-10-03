import type { Catalog } from '../types'

export interface CartLineInput {
  productId: string
  /** Shopify variant id when known; local carts leave it undefined. */
  variantId?: string
  size: string
  color: string
  quantity: number
}

export interface RemoteCart {
  id: string
  checkoutUrl: string
  totalAmount: number
  currency: string
}

/** Server-side cart operations (Shopify Storefront Cart API). Local mode has none. */
export interface RemoteCartApi {
  create(lines: CartLineInput[]): Promise<RemoteCart>
  addLines(cartId: string, lines: CartLineInput[]): Promise<RemoteCart>
  updateLines(cartId: string, lines: { lineId: string; quantity: number }[]): Promise<RemoteCart>
  removeLines(cartId: string, lineIds: string[]): Promise<RemoteCart>
}

/**
 * Source of sections and products. The 3D world only ever sees the normalized
 * Catalog, so swapping LocalProvider for ShopifyStorefrontProvider needs no
 * changes outside src/data/providers.
 */
export interface ProductProvider {
  readonly name: string
  loadCatalog(): Promise<Catalog>
  readonly cart?: RemoteCartApi
}
