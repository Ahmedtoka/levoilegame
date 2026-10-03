// Showcase models, sales assistants, the concierge and the cashier.

import type { Texture } from 'three'
import type { Game } from '../game'
import { Character, type Pose } from '../actors/character'
import { modelLook, staffLook } from '../actors/palette'
import { createCharacter } from '../actors/glbCharacter'
import { sectionStyle } from '../config/sections'
import { loadProductTexture, regionColor } from '../engine/textures'
import { displayImage } from '../data/types'
import { t, type StringKey } from '../i18n/i18n'
import { store } from '../state/store'
import { audio } from '../audio/audio'
import type { ShopHandles } from './shop'
import { openProductLabel } from './shop'

const GREETINGS: StringKey[] = ['greetings', 'greetings2', 'greetings3']

export async function buildPeople(game: Game, shops: ShopHandles[], logo: Texture | null): Promise<void> {
  const scene = game.engine.scene
  let seed = 1

  const place = (c: Character, x: number, z: number, yaw: number, r = 0.4) => {
    c.root.position.set(x, 0, z)
    c.root.rotation.y = yaw
    scene.add(c.root)
    game.colliders.circles.push({ x, z, r })
  }

  // --- Showcase models -----------------------------------------------------
  for (const shop of shops) {
    const section = shop.layout.section
    if (!section) continue
    const style = sectionStyle(section.id, shop.layout.index)
    shop.modelSpots.forEach((spot, i) => {
      const pose: Pose = i % 2 === 0 ? 'model' : 'handOnHip'
      const c = createCharacter(modelLook(seed++ * 31 + i, style.outfit, pose), seed)
      place(c, spot.x, spot.z, spot.yaw, 0.45)
      c.root.position.y = 0.12 // on the plinth
      game.actors.push({ character: c, visibleIf: () => shop.interiorVisible })
      game.interaction.add({
        object: c.hitbox,
        kind: 'model',
        label: () => openProductLabel(spot.product),
        onInteract: () => store.getState().openProduct(spot.product.id),
        maxDist: 3.6,
      })
      // Dress the model in the product's colours (sampled from the cutout).
      loadProductTexture(displayImage(spot.product), 256)
        .then(({ image }) => {
          const top = regionColor(image, { x0: 0.3, y0: 0.22, x1: 0.7, y1: 0.45 })
          const bottom = regionColor(image, { x0: 0.3, y0: 0.62, x1: 0.7, y1: 0.9 })
          c.setOutfitColors(top ? `#${top.getHexString()}` : null, bottom ? `#${(bottom ?? top)!.getHexString()}` : null)
        })
        .catch(() => {})
    })
  }

  // --- Staff ----------------------------------------------------------------
  const greeter = (c: Character, name: string, visibleIf?: () => boolean) => {
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
      label: () => `${t('talk', store.getState().lang)} · ${name}`,
      onInteract: greet,
      maxDist: 3.4,
    })
  }

  const names = ['Mariam', 'Nour', 'Salma', 'Farida', 'Habiba', 'Malak']
  let staffN = 0
  for (const shop of shops) {
    if (!shop.staffSpot) continue
    const c = createCharacter(staffLook(seed++ * 17, logo, 'clasped'), seed)
    place(c, shop.staffSpot.x, shop.staffSpot.z, shop.staffSpot.yaw)
    greeter(c, names[staffN++ % names.length], () => shop.interiorVisible)
  }

  // Concierge near the entrance (faces the doors).
  const concierge = createCharacter(staffLook(99, logo, 'clasped'), 99)
  place(concierge, 4.2, -6.2, Math.PI * 0.85)
  greeter(concierge, 'Yasmin')
}

/** Cashier stands behind the counter; interaction opens checkout. */
export function buildCashierPerson(game: Game, logo: Texture | null, onCheckout: () => void): Character {
  const { cashier } = game.layout
  const c = createCharacter(staffLook(7, logo, 'relaxed'), 7)
  c.root.position.set(cashier.x + 1.15, 0, cashier.z)
  c.root.rotation.y = -Math.PI / 2
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
