// The baked Le Voile boutique (store.glb) as the walkable store: loads the
// model, builds collisions from store-anchors.json, and places sections,
// product cards, models, staff, cashier and exit. Falls back to the
// procedural mall when the model is missing (see main.ts).

import {
  Box3,
  Color,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type DirectionalLight,
  type Object3D,
  type Texture,
} from 'three'
import { BOUTIQUE } from '../config/boutique'
import type { MallLayout, ShopLayout } from '../config/layout'
import { sectionStyle } from '../config/sections'
import type { Batcher } from '../engine/batcher'
import { marbleTexture } from '../engine/textures'
import type { Catalog, Product } from '../data/types'
import { t } from '../i18n/i18n'
import { store } from '../state/store'
import { createCharacter } from '../actors/character'
import { staffLook } from '../actors/palette'
import type { Game } from '../game'
import type { ShellHandles } from './mall'
import { imageMat } from './materials'
import { BRONZE, CREAM, easelRow, loadCards, lookbookStand, registerCards } from './displays'
import { addGreeter, addProductModel, buildCashierPerson, placeCharacter, STAFF_NAMES } from './people'
import { BOUTIQUE_CREAM, logoTexture } from './signage'
import { BRAND } from '../config/brand'

interface Anchors {
  colliders: { min: number[]; max: number[]; kind: string }[]
}


/** True when the baked store is deployed (public/models/mall/store-anchors.json). */
export async function boutiqueAvailable(): Promise<boolean> {
  // The mall is the default experience; the single-boutique walkthrough is opt-in (?boutique).
  if (!new URLSearchParams(location.search).has('boutique')) return false
  try {
    const r = await fetch(BOUTIQUE.anchorsUrl, { method: 'GET', cache: 'no-cache' })
    return r.ok && (r.headers.get('content-type') ?? '').includes('json')
  } catch {
    return false
  }
}

/** Layout object for the boutique, shaped like the mall layout the game/UI use. */
export function boutiqueLayout(catalog: Catalog): MallLayout {
  const shops: ShopLayout[] = BOUTIQUE.stations
    .map((st, i) => {
      const section = catalog.sections.find((s) => s.id === st.section)
      if (!section) return null
      const z = st.zone
      return {
        kind: 'shop' as const,
        id: section.id,
        section,
        brand: null,
        wing: null,
        style: sectionStyle(section.id, catalog.sections.indexOf(section)),
        index: i,
        side: st.x < 0 ? ('L' as const) : ('R' as const),
        rect: z,
        entrance: { x: st.x, z: st.z },
        yaw: st.yaw,
        center: { x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2 },
        arrival: st.arrival,
      }
    })
    .filter((s): s is NonNullable<typeof s> => !!s)
  const c = BOUTIQUE.cashier
  const e = BOUTIQUE.exit
  return {
    kind: 'boutique',
    bounds: BOUTIQUE.bounds,
    atrium: BOUTIQUE.entrance,
    wings: [],
    shops,
    zones: [{ id: 'fitting', rect: BOUTIQUE.fitting }],
    spawn: BOUTIQUE.spawn,
    cashier: { x: c.x, z: c.z, zone: c.zone, approach: c.approach, arrival: c.arrival },
    exit: { x: e.x, z: e.z, zone: e.zone, doors: e.doors, arrival: e.arrival },
  }
}

export async function buildBoutique(
  game: Game,
  batcher: Batcher,
  catalog: Catalog,
  vestLogo: Texture | null,
  onProgress: (p: number) => void,
): Promise<ShellHandles> {
  const { engine, colliders } = game
  const scene = engine.scene
  const root = new Group()
  root.name = 'boutique'
  scene.add(root)

  // Warm interior lighting for the live objects (characters, stands, cards).
  scene.background = new Color('#ece5dc')
  scene.fog = new Fog('#ece5dc', 20, 60)
  scene.environmentIntensity = 0.5
  for (const o of scene.children) {
    if ((o as HemisphereLight).isHemisphereLight) {
      const h = o as HemisphereLight
      h.color.set('#fff1e2')
      h.groundColor.set('#a48f7c')
      h.intensity = 0.9
    }
    if ((o as DirectionalLight).isDirectionalLight) {
      const d = o as DirectionalLight
      d.color.set('#ffe6c8')
      d.intensity = 1.1
      d.position.set(-2, 10, 4)
    }
  }

  // ------------------------------------------------------------- the model
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/loaders/DRACOLoader.js'),
  ])
  const draco = new DRACOLoader().setDecoderPath('/draco/')
  const loader = new GLTFLoader().setDRACOLoader(draco)
  const [gltf, anchors] = await Promise.all([
    loader.loadAsync(BOUTIQUE.modelUrl, (e) => e.total && onProgress(e.loaded / e.total)),
    fetch(BOUTIQUE.anchorsUrl).then((r) => r.json() as Promise<Anchors>),
  ])
  draco.dispose()
  prepareBakedStore(gltf.scene, engine.renderer.capabilities.getMaxAnisotropy())
  root.add(gltf.scene)

  // ------------------------------------------------------------ collisions
  for (const c of anchors.colliders) {
    const box = new Box3(new Vector3(c.min[0], 0, c.min[2]), new Vector3(c.max[0], Math.max(c.max[1], 1.8), c.max[2]))
    colliders.addBox(box, /Wall|Glass_Panel|Fitting_Room|Rear_Display/.test(c.kind))
  }
  // Exterior apron in front of the shop: walkable a couple of metres, then a barrier.
  const b = BOUTIQUE.bounds
  colliders.addBox(new Box3(new Vector3(b.x0 - 1, 0, b.z1), new Vector3(b.x1 + 1, 3, b.z1 + 0.5)), true)
  colliders.addBox(new Box3(new Vector3(b.x0 - 1, 0, 7.5), new Vector3(b.x0, 3, b.z1)), true)
  colliders.addBox(new Box3(new Vector3(b.x1, 0, 7.5), new Vector3(b.x1 + 1, 3, b.z1)), true)

  // Exterior floor + façade sign above the glass front.
  const apron = new Mesh(new PlaneGeometry(14, 8), new MeshStandardMaterial({ map: marbleTexture([3.5, 2]), roughness: 0.3 }))
  apron.rotation.x = -Math.PI / 2
  apron.position.set(0, -0.005, 11.5)
  root.add(apron)
  const f = batcher.frame(new Matrix4(), colliders)
  f.box(CREAM, 0, 3.55, 7.58, 10.6, 0.8, 0.16)
  f.box(BRONZE, 0, 3.15, 7.67, 10.6, 0.04, 0.02)
  logoTexture(BOUTIQUE_CREAM, 1024, 160, BRAND.logo).then((tex) => {
    const sign = new Mesh(new PlaneGeometry(4.6, 0.72), imageMat(tex))
    sign.position.set(0, 3.55, 7.67)
    root.add(sign)
  })

  // -------------------------------------------------------------- stations
  const loaders: { x: number; z: number; run: () => void; done: boolean }[] = []
  for (const st of BOUTIQUE.stations) {
    const section = catalog.sections.find((s) => s.id === st.section)
    if (!section) continue
    const products = section.productIds.map((id) => catalog.byId.get(id)).filter((p): p is Product => !!p)
    const g = new Group()
    g.position.set(st.x, 0, st.z)
    g.rotation.y = st.yaw
    root.add(g)
    g.updateMatrix()
    const sf = batcher.frame(g.matrix.clone(), colliders)
    const cards =
      st.kind === 'stand' ? lookbookStand(sf, g, section, products) : easelRow(sf, g, products, st.surface ?? 0.9, st.spacing)
    registerCards(game.interaction, cards)
    loaders.push({ x: st.x, z: st.z, done: false, run: () => loadCards(cards) })
  }

  // -------------------------------------------------------------- people
  const modelProducts = catalog.products.filter((p) => p.modelOutfit)
  modelProducts.slice(0, BOUTIQUE.modelSpots.length).forEach((p, i) => {
    const spot = BOUTIQUE.modelSpots[i]
    const style = sectionStyle(p.section, catalog.sections.findIndex((s) => s.id === p.section))
    // The first two spots are the window mannequin bases (6 cm plinths).
    addProductModel(game, p, style.outfit, spot, i + 1, { plinth: i < 2 ? 0.06 : 0 })
  })
  BOUTIQUE.staff.forEach((s, i) => {
    const c = createCharacter(staffLook(40 + i * 13, vestLogo, 'clasped'), 40 + i)
    placeCharacter(game, c, s.x, s.z, s.yaw)
    addGreeter(game, c, STAFF_NAMES[i % STAFF_NAMES.length])
  })
  const cz = BOUTIQUE.cashier
  buildCashierPerson(game, vestLogo, () => game.openCheckout(), { x: cz.x, z: cz.z, yaw: cz.yaw })

  // Counter (customer side) + doorway interactions.
  const counterHit = new Mesh(new PlaneGeometry(3.1, 1.0), new MeshBasicMaterial({ visible: false }))
  counterHit.position.set(-0.3, 0.6, -5.55)
  root.add(counterHit)
  game.interaction.add({
    object: counterHit,
    kind: 'cashier',
    label: () => `${t('checkout', store.getState().lang)} · ${t('cashier', store.getState().lang)}`,
    onInteract: () => game.openCheckout(),
    maxDist: 3,
  })
  const doorHit = new Mesh(new PlaneGeometry(2.5, 2.8), new MeshBasicMaterial({ visible: false }))
  doorHit.position.set(0, 1.4, 7.5)
  doorHit.rotation.y = Math.PI
  root.add(doorHit)
  game.interaction.add({
    object: doorHit,
    kind: 'exit',
    label: () => t('leaveMall', store.getState().lang),
    onInteract: () => game.tryLeave(),
    maxDist: 2.6,
  })
  const doors = { target: 0, update: () => {} }
  return {
    doors,
    setQuality: () => {},
    update(px, pz) {
      for (const l of loaders) {
        if (!l.done && Math.hypot(px - l.x, pz - l.z) < 9) {
          l.done = true
          l.run()
        }
      }
    },
  }
}

/** Baked store materials: unlit baked textures, live glass and mirror. */
export function prepareBakedStore(scene: Object3D, maxAniso: number): void {
  scene.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    m.matrixAutoUpdate = false
    m.updateMatrix()
    const src = m.material as MeshStandardMaterial
    if (m.name.startsWith('store_glass')) {
      m.material = new MeshPhysicalMaterial({
        color: '#dfeaec',
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.14,
        side: DoubleSide,
        depthWrite: false,
      })
      m.renderOrder = 2
    } else if (m.name.startsWith('store_mirror')) {
      m.material = new MeshStandardMaterial({ color: '#e7ecef', metalness: 1, roughness: 0.03, envMapIntensity: 1.4 })
    } else if (src.map) {
      // Baked Cycles lighting: show as-is (already tone mapped with the scene's AgX look).
      src.map.colorSpace = SRGBColorSpace
      src.map.anisotropy = Math.min(8, maxAniso)
      m.material = new MeshBasicMaterial({ map: src.map, toneMapped: false })
    }
  })
}
