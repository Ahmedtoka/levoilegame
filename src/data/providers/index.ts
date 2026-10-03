import type { ProductProvider } from './ProductProvider'
import { LocalProvider } from './LocalProvider'
import { ShopifyStorefrontProvider } from './ShopifyStorefrontProvider'

/** Picks the catalogue source from env (VITE_PRODUCT_PROVIDER=local|shopify). */
export function createProductProvider(): ProductProvider {
  const env = import.meta.env
  if (env.VITE_PRODUCT_PROVIDER === 'shopify') {
    return new ShopifyStorefrontProvider({
      domain: env.VITE_SHOPIFY_DOMAIN,
      storefrontToken: env.VITE_SHOPIFY_STOREFRONT_TOKEN,
    })
  }
  return new LocalProvider()
}

export type { ProductProvider } from './ProductProvider'
