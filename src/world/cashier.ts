// Cashier counter in the atrium (customers approach from -x).

import { Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type Object3D } from 'three'
import { BRAND } from '../config/brand'
import type { MallLayout } from '../config/layout'
import type { Batcher } from '../engine/batcher'
import type { CollisionWorld } from '../engine/colliders'
import type { Interaction } from '../interact/interaction'
import { t } from '../i18n/i18n'
import { store } from '../state/store'
import { imageMat, MAT } from './materials'
import { labelSign, logoTexture } from './signage'
import { plant } from './props'

export function buildCashierDesk(
  root: Object3D,
  batcher: Batcher,
  colliders: CollisionWorld,
  interaction: Interaction,
  layout: MallLayout,
  onCheckout: () => void,
): void {
  const { x, z } = layout.cashier
  // Local frame: +z faces the customers (world -x).
  const base = new Matrix4().makeRotationY(-Math.PI / 2).setPosition(x, 0, z)
  const f = batcher.frame(base, colliders)

  // Counter: wood body, magenta front, marble top
  f.block(MAT.woodDark, 0, 0, 0, 4.2, 1.02, 0.9, { collide: true })
  f.block(MAT.magenta, 0, 0.08, 0.46, 4.0, 0.86, 0.04)
  f.block(MAT.marbleTop, 0, 1.02, 0.05, 4.4, 0.06, 1.05)
  f.block(MAT.brass, 0, 0, 0.47, 4.2, 0.08, 0.06)
  // POS terminal + shopping bags
  f.block(MAT.black, -1.2, 1.08, -0.1, 0.42, 0.06, 0.3)
  f.box(MAT.black, -1.2, 1.32, -0.05, 0.44, 0.3, 0.03, { rotY: 0 })
  for (let i = 0; i < 3; i++) {
    f.block(i === 1 ? MAT.magenta : MAT.blush, 0.9 + i * 0.36, 1.08, -0.15, 0.3, 0.38, 0.14)
  }
  // Back shelf with folded items behind the cashier
  f.block(MAT.wall, 0, 0, -2.0, 5.0, 2.4, 0.4, { collide: true })
  for (const y of [1.0, 1.6]) f.block(MAT.brass, 0, y, -1.8, 4.6, 0.03, 0.02)
  plant(f, -2.9, -1.4, 1.1, 44)
  plant(f, 2.9, -1.4, 1.1, 45)

  const group = new Group()
  group.matrixAutoUpdate = false
  group.matrix.copy(base)
  root.add(group)

  const logoMat = (bg: string | null, logo: string = BRAND.logoWhite) =>
    logoTexture(bg, 1024, 256, logo).then((tex) => imageMat(tex, { transparent: !bg }))
  logoMat(null).then((m) => {
    const front = new Mesh(new PlaneGeometry(2.4, 0.6), m)
    front.position.set(0, 0.55, 0.49)
    group.add(front)
  })
  logoMat('#fdf7fa', BRAND.logo).then((m) => {
    const back = new Mesh(new PlaneGeometry(4.6, 1.15), m)
    back.position.set(0, 3.0, -1.78)
    group.add(back)
  })

  // Hanging bilingual sign above the counter
  const sign = new Mesh(new PlaneGeometry(2.6, 0.65), imageMat(labelSign('Cashier', 'الكاشير', { bg: BRAND.magenta, fg: '#ffffff' })))
  sign.position.set(0, 3.5, 0.2)
  group.add(sign)
  f.bar(MAT.brass, new Vector3(-1, 3.83, 0.2), new Vector3(-1, 5.5, 0.2), 0.012)
  f.bar(MAT.brass, new Vector3(1, 3.83, 0.2), new Vector3(1, 5.5, 0.2), 0.012)

  // The counter top itself is interactive too.
  const hit = new Mesh(new PlaneGeometry(4.2, 1.0), new MeshBasicMaterial({ visible: false }))
  hit.position.set(0, 0.6, 0.5)
  group.add(hit)
  interaction.add({
    object: hit,
    kind: 'cashier',
    label: () => `${t('checkout', store.getState().lang)} · ${t('cashier', store.getState().lang)}`,
    onInteract: onCheckout,
    maxDist: 3.2,
  })
}
