import raw from '../products.json'
import { sectionStyle } from '../../config/sections'
import { withVariantDefaults } from '../defaults'
import { buildCatalog, type Catalog, type Product, type Section } from '../types'
import type { ProductProvider } from './ProductProvider'

interface RawProduct extends Omit<Product, 'colors'> {
  colors: unknown[]
}

/** Reads the bundled snapshot in src/data/products.json (assets served from /public). */
export class LocalProvider implements ProductProvider {
  readonly name = 'local'

  async loadCatalog(): Promise<Catalog> {
    const sections = raw.sections as Section[]
    const index = new Map(sections.map((s, i) => [s.id, i]))
    const products = (raw.products as RawProduct[]).map((p) =>
      withVariantDefaults({ ...p, colors: [] }, sectionStyle(p.section, index.get(p.section) ?? 0).sizes),
    )
    return buildCatalog(sections, products)
  }
}
