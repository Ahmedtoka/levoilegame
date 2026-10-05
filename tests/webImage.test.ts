import { describe, expect, it } from 'vitest'
import { originalImage, webImage } from '../src/data/webImage'

describe('webImage', () => {
  it('maps product jpg/png to webp variants', () => {
    expect(webImage('/products/dresses-01/1.jpg')).toBe('/products/dresses-01/1.webp')
    expect(webImage('/products/dresses-01/2.jpg', 'small')).toBe('/products/dresses-01/2.s.webp')
    expect(webImage('/products/dresses-01/cutout.png', 'large')).toBe('/products/dresses-01/cutout.webp')
    expect(webImage('/products/dresses-01/cutout.png', 'small')).toBe('/products/dresses-01/cutout.s.webp')
  })
  it('passes other urls through', () => {
    const svg = 'data:image/svg+xml;utf8,<svg/>'
    expect(webImage(svg)).toBe(svg)
    expect(webImage('https://cdn.shopify.com/x/1.jpg')).toBe('https://cdn.shopify.com/x/1.jpg')
    expect(webImage('/brand/122-logo.svg')).toBe('/brand/122-logo.svg')
  })
  it('maps back to the original', () => {
    expect(originalImage('/products/a-01/1.webp')).toBe('/products/a-01/1.jpg')
    expect(originalImage('/products/a-01/1.s.webp')).toBe('/products/a-01/1.jpg')
    expect(originalImage('/products/a-01/cutout.s.webp')).toBe('/products/a-01/cutout.png')
    expect(originalImage('/products/a-01/1.jpg')).toBeNull()
  })
})
