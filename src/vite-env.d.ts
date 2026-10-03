/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCT_PROVIDER?: 'local' | 'shopify'
  readonly VITE_SHOPIFY_DOMAIN: string
  readonly VITE_SHOPIFY_STOREFRONT_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
