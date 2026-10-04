// Checkout behind an interface: the mock simulates payment today; the
// Shopify implementation hands the cart to Shopify's hosted checkout.

import type { CartLine, Customer, Order, PaymentMethod } from '../state/store'
import type { Catalog } from '../data/types'
import type { ProductProvider } from '../data/providers'

export interface CheckoutRequest {
  lines: CartLine[]
  customer: Customer
  method: PaymentMethod
  /** Live-mall deals/coupon applied to this cart (social/pricing.ts). */
  pricing?: { discount: number; shipping: number; coupon?: string; giftProductId?: string }
}

export type CheckoutResult =
  | { status: 'success'; order: Order }
  /** Payment continues on an external page (Shopify checkout). */
  | { status: 'redirect'; url: string }
  | { status: 'error'; message: string }

export interface CheckoutService {
  readonly name: string
  placeOrder(req: CheckoutRequest): Promise<CheckoutResult>
}

function orderLines(lines: CartLine[], catalog: Catalog) {
  return lines.map((l) => {
    const p = catalog.byId.get(l.productId)
    return { ...l, title: p?.title ?? l.productId, price: p?.price ?? 0 }
  })
}

/** Simulated processing + success. No payment data leaves the browser. */
export class MockCheckoutService implements CheckoutService {
  readonly name = 'mock'
  private readonly catalog: Catalog

  constructor(catalog: Catalog) {
    this.catalog = catalog
  }

  async placeOrder(req: CheckoutRequest): Promise<CheckoutResult> {
    await new Promise((r) => setTimeout(r, 1600 + Math.random() * 600))
    const lines = orderLines(req.lines, this.catalog)
    const gift = req.pricing?.giftProductId ? this.catalog.byId.get(req.pricing.giftProductId) : null
    if (gift) lines.push({ key: `gift|${gift.id}`, productId: gift.id, size: gift.sizes[0] ?? '', color: '', qty: 1, title: `${gift.title} (gift)`, price: 0 })
    const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0)
    const discount = req.pricing?.discount ?? 0
    const shipping = req.pricing?.shipping ?? 0
    const total = Math.max(0, subtotal - discount + shipping)
    const number = `LV-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.floor(Math.random() * 90 + 10)}`
    return {
      status: 'success',
      order: {
        number,
        lines,
        total,
        discount,
        shipping,
        coupon: req.pricing?.coupon,
        currency: 'EGP',
        customer: req.customer,
        method: req.method,
        createdAt: new Date().toISOString(),
      },
    }
  }
}

/**
 * Creates a Shopify cart via the Storefront API and redirects to its
 * checkoutUrl, where Shopify collects payment (cards, wallets, COD as
 * configured in the store's payment settings).
 */
export class ShopifyCheckoutService implements CheckoutService {
  readonly name = 'shopify'
  private readonly provider: ProductProvider
  private readonly catalog: Catalog

  constructor(provider: ProductProvider, catalog: Catalog) {
    this.provider = provider
    this.catalog = catalog
  }

  async placeOrder(req: CheckoutRequest): Promise<CheckoutResult> {
    if (!this.provider.cart) return { status: 'error', message: 'Provider has no cart API' }
    try {
      const cart = await this.provider.cart.create(
        req.lines.map((l) => {
          const p = this.catalog.byId.get(l.productId)
          return {
            productId: l.productId,
            variantId: p?.variantIds?.[`${l.size}/${l.color}`] ?? p?.variantIds?.['/'],
            size: l.size,
            color: l.color,
            quantity: l.qty,
          }
        }),
      )
      // TODO(shopify): pass buyer identity (phone/address) with cartBuyerIdentityUpdate before redirecting.
      return { status: 'redirect', url: cart.checkoutUrl }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }
}

export function createCheckoutService(provider: ProductProvider, catalog: Catalog): CheckoutService {
  return provider.cart ? new ShopifyCheckoutService(provider, catalog) : new MockCheckoutService(catalog)
}
