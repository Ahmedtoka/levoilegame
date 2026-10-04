// Product displays shared by the mall shops and the boutique: oak "lookbook"
// stands (section header + grid of product cards) and small easel cards for
// tables/gondolas. Card = photo + title + price baked into one texture.

import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, type Material, type Object3D } from 'three'
import { BRAND } from '../config/brand'
import type { BatchFrame } from '../engine/batcher'
import { loadProductTexture } from '../engine/textures'
import { discountPercent, type Product, type Section } from '../data/types'
import { formatPrice } from '../i18n/i18n'
import { store } from '../state/store'
import type { Interaction } from '../interact/interaction'
import { imageMat } from './materials'
import { blobShadow } from './props'
import { BOUTIQUE_CREAM, boutiqueHeader, productCardTexture } from './signage'
import { openProductLabel } from './shop'

export const OAK = new MeshStandardMaterial({ color: '#b98a5c', roughness: 0.55 })
export const OAK_DARK = new MeshStandardMaterial({ color: '#8c6644', roughness: 0.6 })
export const CREAM = new MeshStandardMaterial({ color: BOUTIQUE_CREAM, roughness: 0.8 })
export const BRONZE = new MeshStandardMaterial({ color: '#a8835a', roughness: 0.35, metalness: 0.7 })
const HL = new MeshBasicMaterial({ color: BRAND.magenta, toneMapped: false })
const PLACEHOLDER: Material = new MeshStandardMaterial({ color: '#eee6dd', roughness: 0.9 })
export const CARD_W = 0.42

export interface Card {
  mesh: Mesh
  product: Product
  hl: Object3D
}

function cardMesh(parent: Object3D, p: Product, w = CARD_W): Card {
  const h = w * (768 / 512)
  const mesh = new Mesh(new PlaneGeometry(w, h), PLACEHOLDER)
  const hl = new Mesh(new PlaneGeometry(w + 0.06, h + 0.06), HL)
  hl.position.z = -0.005
  hl.visible = false
  mesh.add(hl)
  parent.add(mesh)
  return { mesh, product: p, hl }
}

/** Oak "lookbook" stand (front faces local +z): header + 3/2 grid of product cards. */
export function lookbookStand(f: BatchFrame, g: Group, section: Section, products: Product[]): Card[] {
  const W = 1.5
  f.block(OAK_DARK, 0, 0, 0, W + 0.1, 0.06, 0.42, { collide: true })
  f.box(OAK, -W / 2, 1.05, 0, 0.05, 2.1, 0.05)
  f.box(OAK, W / 2, 1.05, 0, 0.05, 2.1, 0.05)
  f.box(CREAM, 0, 1.15, -0.03, W, 1.62, 0.02)
  f.box(BRONZE, 0, 2.11, 0, W + 0.06, 0.03, 0.06)
  const header = new Mesh(new PlaneGeometry(W - 0.04, 0.28), imageMat(boutiqueHeader(section)))
  header.position.set(0, 1.94, 0.006)
  g.add(header)
  const cards: Card[] = []
  const rows = [products.slice(0, 3), products.slice(3, 6)]
  rows.forEach((row, r) => {
    const y = r === 0 ? 1.38 : 0.7
    row.forEach((p, i) => {
      const c = cardMesh(g, p)
      c.mesh.position.set((i - (row.length - 1) / 2) * (CARD_W + 0.05), y, 0.004)
      cards.push(c)
    })
  })
  g.add(blobShadow(W + 0.5, 0.9, 0.5))
  return cards
}

/** Row of small easel cards standing on a surface (table / gondola), along local +x. */
export function easelRow(f: BatchFrame, g: Group, products: Product[], surface: number, spacing = 0.33): Card[] {
  const w = 0.28
  const h = w * (768 / 512)
  return products.map((p, i) => {
    const holder = new Group()
    holder.position.set(i * spacing, surface + 0.02 + (h / 2) * Math.cos(0.2), 0)
    holder.rotation.x = -0.2
    g.add(holder)
    f.box(OAK_DARK, i * spacing, surface + 0.01, -0.06, w * 0.6, 0.02, 0.12)
    return cardMesh(holder, p, w)
  })
}

export function registerCards(interaction: Interaction, cards: Card[], maxDist = 3.2): void {
  for (const card of cards) {
    interaction.add({
      object: card.mesh,
      kind: 'product',
      label: () => openProductLabel(card.product),
      onInteract: () => store.getState().openProduct(card.product.id),
      highlight: (on) => (card.hl.visible = on),
      maxDist,
    })
  }
}

/** Loads the card textures (call when the player gets close). */
export function loadCards(cards: Card[]): void {
  for (const { mesh, product } of cards) {
    loadProductTexture(product.images[0], 512)
      .then(({ image }) => {
        const off = discountPercent(product)
        mesh.material = imageMat(
          productCardTexture(
            image as HTMLCanvasElement,
            product.title,
            formatPrice(product.price, 'en'),
            product.compareAtPrice && off ? formatPrice(product.compareAtPrice, 'en') : null,
            off ? `-${off}%` : null,
          ),
        )
      })
      .catch((e) => console.warn(e))
  }
}
