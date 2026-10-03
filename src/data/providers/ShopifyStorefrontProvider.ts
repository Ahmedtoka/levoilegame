// Stub for the Shopify Storefront API (GraphQL). Fill in the TODOs and switch
// providers with VITE_PRODUCT_PROVIDER=shopify (see README → "Shopify").
//
// Mapping: each section in products.json maps to a Shopify collection
// (SectionStyle.collection in src/config/sections.ts, originally taken from
// the product URLs …/collections/<handle>/products/<handle>).

import { sectionStyle } from '../../config/sections'
import { buildCatalog, type Catalog, type ColorOption, type Product, type Section } from '../types'
import type { CartLineInput, ProductProvider, RemoteCart, RemoteCartApi } from './ProductProvider'
import localSnapshot from '../products.json'

export interface ShopifyConfig {
  /** e.g. "levoilestores.myshopify.com" */
  domain: string
  /** Public Storefront access token (safe to ship to the browser). */
  storefrontToken: string
  apiVersion?: string
  /** Products per collection to fetch. */
  perSection?: number
}

const PRODUCTS_BY_COLLECTION = /* GraphQL */ `
  query CollectionProducts($handle: String!, $first: Int!) {
    collection(handle: $handle) {
      handle
      title
      products(first: $first) {
        nodes {
          id
          handle
          title
          onlineStoreUrl
          featuredImage { url }
          images(first: 6) { nodes { url } }
          options { name values }
          priceRange { minVariantPrice { amount currencyCode } }
          compareAtPriceRange { maxVariantPrice { amount } }
          variants(first: 50) {
            nodes { id availableForSale selectedOptions { name value } }
          }
        }
      }
    }
  }
`

const CART_FIELDS = /* GraphQL */ `
  fragment CartFields on Cart {
    id
    checkoutUrl
    cost { totalAmount { amount currencyCode } }
    lines(first: 100) { nodes { id quantity merchandise { ... on ProductVariant { id } } } }
  }
`

const CART_CREATE = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) { cart { ...CartFields } userErrors { message } }
  }
`
const CART_LINES_ADD = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { message } }
  }
`
const CART_LINES_UPDATE = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ...CartFields } userErrors { message } }
  }
`
const CART_LINES_REMOVE = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ...CartFields } userErrors { message } }
  }
`

export class ShopifyStorefrontProvider implements ProductProvider {
  readonly name = 'shopify'
  readonly cart: RemoteCartApi
  private readonly cfg: Required<ShopifyConfig>

  constructor(cfg: ShopifyConfig) {
    this.cfg = { apiVersion: '2025-07', perSection: 12, ...cfg }
    this.cart = {
      create: (lines) => this.cartMutation(CART_CREATE, 'cartCreate', { lines: toShopifyLines(lines) }),
      addLines: (cartId, lines) =>
        this.cartMutation(CART_LINES_ADD, 'cartLinesAdd', { cartId, lines: toShopifyLines(lines) }),
      updateLines: (cartId, lines) =>
        this.cartMutation(CART_LINES_UPDATE, 'cartLinesUpdate', {
          cartId,
          lines: lines.map((l) => ({ id: l.lineId, quantity: l.quantity })),
        }),
      removeLines: (cartId, lineIds) => this.cartMutation(CART_LINES_REMOVE, 'cartLinesRemove', { cartId, lineIds }),
    }
  }

  async loadCatalog(): Promise<Catalog> {
    // Keep section order and Arabic titles from the local config; products come from Shopify.
    const sections: Section[] = []
    const products: Product[] = []
    for (const [i, local] of (localSnapshot.sections as Section[]).entries()) {
      const handle = sectionStyle(local.id, i).collection ?? local.id
      const data = await this.query<ShopifyCollectionResponse>(PRODUCTS_BY_COLLECTION, {
        handle,
        first: this.cfg.perSection,
      })
      const nodes = data.collection?.products.nodes ?? []
      const mapped = nodes.map((n, j) => mapProduct(n, local.id, j))
      products.push(...mapped)
      sections.push({ ...local, productIds: mapped.map((p) => p.id) })
    }
    return buildCatalog(sections, products)
  }

  private async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://${this.cfg.domain}/api/${this.cfg.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': this.cfg.storefrontToken,
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) throw new Error(`Shopify ${res.status}`)
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
    return json.data as T
  }

  private async cartMutation(mutation: string, root: string, variables: Record<string, unknown>): Promise<RemoteCart> {
    const data = await this.query<Record<string, { cart: ShopifyCart; userErrors: { message: string }[] }>>(
      mutation,
      variables,
    )
    const payload = data[root]
    if (payload.userErrors.length) throw new Error(payload.userErrors.map((e) => e.message).join('; '))
    return {
      id: payload.cart.id,
      checkoutUrl: payload.cart.checkoutUrl,
      totalAmount: Number(payload.cart.cost.totalAmount.amount),
      currency: payload.cart.cost.totalAmount.currencyCode,
    }
  }
}

function toShopifyLines(lines: CartLineInput[]) {
  return lines.map((l) => {
    if (!l.variantId) throw new Error(`No Shopify variant for ${l.productId} ${l.size}/${l.color}`)
    return { merchandiseId: l.variantId, quantity: l.quantity }
  })
}

interface ShopifyProductNode {
  id: string
  handle: string
  title: string
  onlineStoreUrl: string | null
  featuredImage: { url: string } | null
  images: { nodes: { url: string }[] }
  options: { name: string; values: string[] }[]
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } }
  compareAtPriceRange: { maxVariantPrice: { amount: string } }
  variants: { nodes: { id: string; availableForSale: boolean; selectedOptions: { name: string; value: string }[] }[] }
}
interface ShopifyCollectionResponse {
  collection: { handle: string; title: string; products: { nodes: ShopifyProductNode[] } } | null
}
interface ShopifyCart {
  id: string
  checkoutUrl: string
  cost: { totalAmount: { amount: string; currencyCode: string } }
}

function mapProduct(n: ShopifyProductNode, sectionId: string, index: number): Product {
  const opt = (re: RegExp) => n.options.find((o) => re.test(o.name))?.values ?? []
  const sizes = opt(/size|مقاس/i)
  const colors: ColorOption[] = opt(/colou?r|لون/i).map((name) => ({ name, nameAr: name, hex: '#d9cfc7' })) // TODO: swatch hex from metafields
  const variantIds: Record<string, string> = {}
  for (const v of n.variants.nodes) {
    const size = v.selectedOptions.find((o) => /size|مقاس/i.test(o.name))?.value ?? ''
    const color = v.selectedOptions.find((o) => /colou?r|لون/i.test(o.name))?.value ?? ''
    variantIds[`${size}/${color}`] = v.id
  }
  const compareAt = Number(n.compareAtPriceRange.maxVariantPrice.amount)
  const price = Number(n.priceRange.minVariantPrice.amount)
  return {
    id: `${sectionId}-${String(index + 1).padStart(2, '0')}`,
    handle: n.handle,
    title: n.title,
    price,
    compareAtPrice: compareAt > price ? compareAt : null,
    currency: n.priceRange.minVariantPrice.currencyCode,
    images: n.images.nodes.map((i) => `${i.url}&width=1024`),
    cutout: null, // TODO: serve pre-made cutouts (e.g. a product metafield) — the standee falls back to images[0]
    sizes,
    colors,
    section: sectionId,
    modelOutfit: false, // TODO: drive from a product tag/metafield, e.g. "virtual-store:model"
    url: n.onlineStoreUrl ?? '',
    variantIds,
  }
}
