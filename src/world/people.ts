// Showcase models, sales assistants, the concierge and the cashier.

import type { Texture } from 'three'
import type { Game } from '../game'
import type { Persona as Character, Pose } from '../actors/character'
import { modelLook, staffLook } from '../actors/palette'
import { createCharacter } from '../actors/character'
import { sectionStyle, type OutfitStyle } from '../config/sections'
import type { Pose as Spot } from '../config/layout'
import { loadProductTexture, regionColor } from '../engine/textures'
import { displayImage, type Product } from '../data/types'
import { t, type StringKey } from '../i18n/i18n'
import { store } from '../state/store'
import { audio } from '../audio/audio'
import type { ShopHandles } from './shop'
import { openProductLabel } from './shop'
import type { StaffRef } from '../social/types'
import { CONCIERGE, openChat } from '../social/session'

const GREETINGS: StringKey[] = ['greetings', 'greetings2', 'greetings3']
export const STAFF_NAMES = ['Mariam', 'Nour', 'Salma', 'Farida', 'Habiba', 'Malak', 'Yasmin']

export function placeCharacter(game: Game, c: Character, x: number, z: number, yaw: number, r = 0.4): void {
  c.root.position.set(x, 0, z)
  c.root.rotation.y = yaw
  game.engine.scene.add(c.root)
  game.colliders.circles.push({ x, z, r })
}

/** Showcase model for a product: dressed in the product's colours, opens its card. */
export function addProductModel(
  game: Game,
  product: Product,
  outfit: OutfitStyle,
  spot: Spot,
  seed: number,
  opts: { plinth?: number; visibleIf?: () => boolean } = {},
): Character {
  const pose: Pose = seed % 2 === 0 ? 'model' : 'handOnHip'
  const c = createCharacter(modelLook(seed * 31 + 7, outfit, pose), seed)
  placeCharacter(game, c, spot.x, spot.z, spot.yaw, 0.45)
  c.root.position.y = opts.plinth ?? 0
  game.actors.push({ character: c, visibleIf: opts.visibleIf })
  game.interaction.add({
    object: c.hitbox,
    kind: 'model',
    label: () => openProductLabel(product),
    onInteract: () => store.getState().openProduct(product.id),
    maxDist: 3.6,
  })
  loadProductTexture(displayImage(product), 256)
    .then(({ image }) => {
      const top = regionColor(image, { x0: 0.3, y0: 0.22, x1: 0.7, y1: 0.45 })
      const bottom = regionColor(image, { x0: 0.3, y0: 0.62, x1: 0.7, y1: 0.9 }) ?? top
      c.setOutfitColors(top ? `#${top.getHexString()}` : null, bottom ? `#${bottom.getHexString()}` : null)
    })
    .catch(() => {})
  return c
}

/** Staff member who waves and greets the visitor when close; E opens a chat with her. */
export function addGreeter(game: Game, c: Character, name: string, visibleIf?: () => boolean, staff?: StaffRef): void {
  let last = -1e9
  let n = 0
  const greet = () => {
    c.wave()
    audio.greet()
    store.getState().showBubble(t(GREETINGS[n++ % GREETINGS.length], store.getState().lang))
    last = performance.now()
  }
  game.actors.push({
    character: c,
    visibleIf,
    onNear: (d) => {
      if (d < 3.2 && performance.now() - last > 30000 && store.getState().phase === 'playing' && !store.getState().overlay) greet()
    },
  })
  game.interaction.add({
    object: c.hitbox,
    kind: 'staff',
    label: () => `${t(staff ? 'chatWith' : 'talk', store.getState().lang)} · ${name}`,
    onInteract: () => {
      c.wave()
      if (staff) openChat(staff)
      else greet()
    },
    maxDist: 3.4,
  })
}

/** Procedural mall: models per shop, an assistant in shops without models, a concierge. */
export async function buildPeople(game: Game, shops: ShopHandles[], logo: Texture | null): Promise<void> {
  let seed = 1
  for (const shop of shops) {
    const section = shop.layout.section
    if (!section) continue
    const style = sectionStyle(section.id, shop.layout.index)
    shop.modelSpots.forEach((spot) => {
      addProductModel(game, spot.product, style.outfit, spot, seed++, { plinth: spot.plinth ?? 0.12, visibleIf: () => shop.interiorVisible })
    })
  }
  let staffN = 0
  for (const shop of shops) {
    if (!shop.staffSpot) continue
    const c = createCharacter(staffLook(seed++ * 17, logo, 'clasped'), seed)
    placeCharacter(game, c, shop.staffSpot.x, shop.staffSpot.z, shop.staffSpot.yaw)
    const name = STAFF_NAMES[staffN++ % STAFF_NAMES.length]
    addGreeter(game, c, name, () => shop.interiorVisible, { id: `staff-${shop.layout.section?.id}`, name, role: 'staff', sectionId: shop.layout.section?.id })
  }
  const concierge = createCharacter(staffLook(99, logo, 'clasped'), 99)
  placeCharacter(game, concierge, 4.2, -6.2, Math.PI * 0.85)
  addGreeter(game, concierge, CONCIERGE.name, undefined, CONCIERGE)
}

/** Cashier behind the counter; interaction opens checkout. */
export function buildCashierPerson(game: Game, logo: Texture | null, onCheckout: () => void, pose?: Spot): Character {
  const { cashier } = game.layout
  const p = pose ?? { x: cashier.x + 1.15, z: cashier.z, yaw: -Math.PI / 2 }
  const c = createCharacter(staffLook(7, logo, 'relaxed'), 7)
  c.root.position.set(p.x, 0, p.z)
  c.root.rotation.y = p.yaw
  game.engine.scene.add(c.root)
  game.actors.push({ character: c })
  game.interaction.add({
    object: c.hitbox,
    kind: 'cashier',
    label: () => `${t('checkout', store.getState().lang)} · ${t('cashier', store.getState().lang)}`,
    onInteract: onCheckout,
    maxDist: 4,
  })
  return c
}
