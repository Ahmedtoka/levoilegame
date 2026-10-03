// TODO(shopify): sizes and colors are empty in the local snapshot. These
// placeholders keep the product card usable until ShopifyStorefrontProvider
// supplies real variant options (and variant ids) per product.

import type { ColorOption, Product } from './types'
import type { SizeProfile } from '../config/sections'

export const DEFAULT_APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL']
export const FREE_SIZE = 'Free size'
export const DEFAULT_COLOR: ColorOption = { name: 'As shown', nameAr: 'زي الصورة', hex: '#d9cfc7' }

export function withVariantDefaults(p: Product, profile: SizeProfile): Product {
  return {
    ...p,
    sizes: p.sizes.length ? p.sizes : profile === 'apparel' ? DEFAULT_APPAREL_SIZES : [FREE_SIZE],
    colors: p.colors.length ? p.colors : [DEFAULT_COLOR],
  }
}
