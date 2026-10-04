// Le Voile's shop in 122 Mall: the real boutique design (EL_REBAT_Render.blend,
// baked into public/models/mall/store.glb) placed inside its unit.
//
// The boutique is 10.4 × 15.3 m with its glass front at boutique z = +7.5;
// the mall unit is 12 × 14 m. It's scaled to 90% so it fits the depth exactly,
// with the glass front just behind the mall shopfront. The glass door panels
// are dropped so the 2.5 m doorway is open. Its 9 original sections (with the
// real products), window models, cashier counter and fitting rooms come with it.

import {
  Box3,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import { BOUTIQUE } from '../../config/boutique'
import { brandById } from '../../config/mall'
import type { BatchFrame } from '../../engine/batcher'
import { levoileSubsections } from '../../data/mallCatalog'
import type { Product } from '../../data/types'
import { t } from '../../i18n/i18n'
import { store } from '../../state/store'
import { BRAND } from '../../config/brand'
import { CREAM, BRONZE, easelRow, loadCards, lookbookStand, registerCards } from '../displays'
import { imageMat } from '../materials'
import { BOUTIQUE_CREAM, logoTexture } from '../signage'
import { prepareBakedStore } from '../boutique'
import { rewardsCounter, type ShopContext, type ShopHandles } from '../shop'

export const LEVOILE_SCALE = 0.9
/** Shop-local z of the boutique's glass front (just behind the 0.3 m mall shopfront). */
const FRONT_Z = -0.32
const GLASS_Z = 7.5

interface Anchors {
  colliders: { min: number[]; max: number[]; kind: string }[]
}

/** Boutique coordinates → shop-local. */
function local(x: number, z: number): { x: number; z: number } {
  return { x: x * LEVOILE_SCALE, z: FRONT_Z + (z - GLASS_Z) * LEVOILE_SCALE }
}

export function levoileInterior(ctx: ShopContext, f: BatchFrame, handles: ShopHandles, loaders: (() => Promise<unknown>)[]): boolean {
  const S = LEVOILE_SCALE
  const g = new Group()
  g.name = 'levoile-boutique'
  g.position.set(0, 0, FRONT_Z - GLASS_Z * S)
  g.scale.setScalar(S)
  g.updateMatrix()
  handles.interior.add(g)
  /** Boutique frame → world. */
  const toWorldM = f.base.clone().multiply(g.matrix)
  const products = handles.layout.section!.productIds.map((id) => ctx.catalog.byId.get(id)).filter((p): p is Product => !!p)

  // -------------------------------------------------------- the baked model
  loaders.push(async () => {
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
    ])
    const draco = new DRACOLoader().setDecoderPath('/draco/')
    const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(BOUTIQUE.modelUrl)
    draco.dispose()
    prepareBakedStore(gltf.scene, 8)
    // Its glass is one mesh with the door panels; replaced below by the side panels only.
    gltf.scene.traverse((o) => {
      if (o.name.startsWith('store_glass')) o.visible = false
    })
    g.add(gltf.scene)
  })

  // Glass front without the door leaves: the doorway (x ±1.26) stays open.
  const glass = new MeshPhysicalMaterial({ color: '#dfeaec', roughness: 0.04, transparent: true, opacity: 0.14, side: DoubleSide, depthWrite: false })
  for (const sx of [-1, 1]) {
    const pane = new Mesh(new PlaneGeometry(3.72, 3.0), glass)
    pane.position.set(sx * 3.12, 1.5, GLASS_Z)
    pane.renderOrder = 2
    g.add(pane)
  }

  // Collisions from the store anchors (walls, fixtures; not the door leaves).
  fetch(BOUTIQUE.anchorsUrl)
    .then((r) => r.json() as Promise<Anchors>)
    .then((a) => {
      for (const c of a.colliders) {
        if (/Door_Glass/.test(c.kind)) continue
        const box = new Box3(new Vector3(c.min[0], 0, c.min[2]), new Vector3(c.max[0], Math.max(c.max[1], 1.8), c.max[2]))
        ctx.colliders.addBox(box.applyMatrix4(toWorldM), /Wall|Glass_Panel|Fitting_Room|Rear_Display/.test(c.kind))
      }
    })
    .catch((e) => console.warn('Le Voile anchors', e))

  // Fill the gap between the boutique's ceiling and the mall shopfront header,
  // with the Le Voile logo over the doorway.
  const top = 3.15 * S
  f.box(CREAM, 0, (top + 3.9) / 2, -0.33, 6.0, 3.9 - top, 0.04)
  f.box(BRONZE, 0, top + 0.02, -0.31, 6.0, 0.04, 0.03)
  logoTexture(BOUTIQUE_CREAM, 1024, 200, '/brand/logo-trim.png').then((tex) => {
    const sign = new Mesh(new PlaneGeometry(2.6, 0.5), imageMat(tex))
    sign.position.set(0, (top + 3.9) / 2, -0.3)
    handles.interior.parent?.add(sign)
  })

  // ------------------------------------------------- stations (9 sections)
  const subs = levoileSubsections()
  const cards: ReturnType<typeof lookbookStand> = []
  for (const st of BOUTIQUE.stations) {
    const sec = subs.find((s) => s.id === st.section)
    const list = products.filter((p) => p.id.startsWith(`${st.section}-`))
    if (!sec || !list.length) continue
    const sg = new Group()
    sg.position.set(st.x, 0, st.z)
    sg.rotation.y = st.yaw
    sg.updateMatrix()
    g.add(sg)
    const sf = ctx.batcher.frame(toWorldM.clone().multiply(sg.matrix), ctx.colliders)
    cards.push(...(st.kind === 'stand' ? lookbookStand(sf, sg, sec, list) : easelRow(sf, sg, list, st.surface ?? 0.9, st.spacing)))
  }
  registerCards(ctx.interaction, cards)
  loaders.push(async () => loadCards(cards))

  // ------------------------------------------------------ people + counters
  const spotWorld = (x: number, z: number) => new Vector3(x, 0, z).applyMatrix4(toWorldM)
  const yaw = handles.layout.yaw
  products
    .filter((p) => p.modelOutfit)
    .slice(0, BOUTIQUE.modelSpots.length)
    .forEach((p, i) => {
      const sp = BOUTIQUE.modelSpots[i]
      const w = spotWorld(sp.x, sp.z)
      // The first two spots are the window mannequin bases (6 cm plinths).
      handles.modelSpots.push({ x: w.x, z: w.z, yaw: yaw + sp.yaw, product: p, plinth: i < 2 ? 0.06 * S : 0 })
    })
  const greeter = BOUTIQUE.staff[0]
  const gw = spotWorld(greeter.x, greeter.z)
  handles.staffSpot = { x: gw.x, z: gw.z, yaw: yaw + greeter.yaw }

  // Le Voile's own cash desk opens the (mall-wide) checkout.
  if (ctx.onCheckout) {
    const hit = new Mesh(new PlaneGeometry(3.1, 1.0), new MeshBasicMaterial({ visible: false }))
    hit.position.set(-0.3, 0.6, -5.5)
    g.add(hit)
    const open = ctx.onCheckout
    ctx.interaction.add({
      object: hit,
      kind: 'cashier',
      label: () => `${t('checkout', store.getState().lang)} · Le Voile`,
      onInteract: open,
      maxDist: 3,
    })
  }

  // 122 Coins rewards counter just inside the door (left).
  const rc = local(-2.4, 6.2)
  rewardsCounter(ctx, f, handles.interior, 'levoile', brandById.get('levoile')?.color ?? BRAND.magenta, rc.x, rc.z)

  return true
}
