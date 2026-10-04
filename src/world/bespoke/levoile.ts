// Le Voile's shop in 122 Mall: the real boutique design (EL_REBAT_Render.blend,
// baked into public/models/mall/store.glb) at real size inside its anchor unit
// (12 × 16 m; the store is 10.4 × 15.3 m with its glass front at boutique z = +7.5).
//
// Only real products are on show: the baked garments and folded scarves
// (store_soft) are hidden, and the store's own fixtures carry the catalogue:
//  - left wall bays → scarves, inner caps, accessories
//  - right wall bays → dresses, isdal, everyday wear
//  - rear display → sale + new arrivals
//  - hanging rails → product cards (denim, everyday, dresses, isdal, sale, new)
//  - table + gondola → easel cards (new arrivals, accessories)
// Each fixture is one composed texture (one draw call); invisible hit planes
// make every product clickable. The glass door leaves are dropped so the
// doorway is open.

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
import { BRAND } from '../../config/brand'
import type { BatchFrame } from '../../engine/batcher'
import { canvasTexture, loadProductTexture, makeCanvas } from '../../engine/textures'
import { discountPercent, type Product } from '../../data/types'
import { formatPrice } from '../../i18n/i18n'
import { store } from '../../state/store'
import { CREAM, BRONZE, easelRow, loadCards, registerCards, type Card } from '../displays'
import { imageMat } from '../materials'
import { BOUTIQUE_CREAM, drawProductCard, logoTexture } from '../signage'
import { prepareBakedStore } from '../boutique'
import { openProductLabel, rewardsCounter, type ShopContext, type ShopHandles } from '../shop'

/** Shop-local z of the boutique's glass front (just behind the 0.3 m mall shopfront). */
const FRONT_Z = -0.32
const GLASS_Z = 7.5

interface Anchors {
  colliders: { min: number[]; max: number[]; kind: string }[]
}

const HIDDEN = new MeshBasicMaterial({ visible: false })
const PENDING = new MeshBasicMaterial({ color: '#eee6dd', side: DoubleSide })

/** Boutique coordinates → shop-local. */
function local(x: number, z: number): { x: number; z: number } {
  return { x, z: FRONT_Z + (z - GLASS_Z) }
}

export function levoileInterior(ctx: ShopContext, f: BatchFrame, handles: ShopHandles, loaders: (() => Promise<unknown>)[]): boolean {
  const g = new Group()
  g.name = 'levoile-boutique'
  g.position.set(0, 0, FRONT_Z - GLASS_Z)
  g.updateMatrix()
  handles.interior.add(g)
  const toWorldM = f.base.clone().multiply(g.matrix)
  const products = handles.layout.section!.productIds.map((id) => ctx.catalog.byId.get(id)).filter((p): p is Product => !!p)
  const of = (...sections: string[]) => sections.flatMap((s) => products.filter((p) => p.id.startsWith(`${s}-`)))

  // -------------------------------------------------------- the baked model
  // Preloaded in the background shortly after boot (it's the first store off the
  // plaza), so it's there by the time anyone walks in.
  let modelStarted = false
  const loadModel = async () => {
    if (modelStarted) return
    modelStarted = true
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
    ])
    const draco = new DRACOLoader().setDecoderPath('/draco/')
    const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(BOUTIQUE.modelUrl)
    draco.dispose()
    prepareBakedStore(gltf.scene, 8)
    gltf.scene.traverse((o) => {
      // Glass (with the door leaves) is replaced below; baked garments/scarves aren't products.
      if (o.name.startsWith('store_glass') || o.name.startsWith('store_soft')) o.visible = false
    })
    g.add(gltf.scene)
  }
  setTimeout(() => loadModel().catch((e) => console.warn('Le Voile store', e)), 2500)
  loaders.push(loadModel)

  // Glass front without the door leaves: the doorway (x ±1.26) stays open.
  const glass = new MeshPhysicalMaterial({ color: '#dfeaec', roughness: 0.04, transparent: true, opacity: 0.14, side: DoubleSide, depthWrite: false })
  for (const sx of [-1, 1]) {
    const pane = new Mesh(new PlaneGeometry(3.72, 3.0), glass)
    pane.position.set(sx * 3.12, 1.5, GLASS_Z)
    pane.renderOrder = 2
    g.add(pane)
  }

  // Fill between the boutique's ceiling and the mall shopfront header, with the logo.
  const top = 3.15
  f.box(CREAM, 0, (top + 3.9) / 2, -0.33, 6.0, 3.9 - top, 0.04)
  f.box(BRONZE, 0, top + 0.02, -0.31, 6.0, 0.04, 0.03)
  logoTexture(BOUTIQUE_CREAM, 1024, 200, '/brand/logo-trim.png').then((tex) => {
    const sign = new Mesh(new PlaneGeometry(2.6, 0.5), imageMat(tex))
    sign.position.set(0, (top + 3.9) / 2, -0.3)
    handles.interior.parent?.add(sign)
  })

  // ----------------------------------------- products on the store's fixtures
  const register = (p: Product, hit: Mesh) =>
    ctx.interaction.add({
      object: hit,
      kind: 'product',
      label: () => openProductLabel(p),
      onInteract: () => store.getState().openProduct(p.id),
      maxDist: 3.4,
    })

  /** A grid of product cards as one textured plane (centre x, y, z; yaw of its front). */
  const wall = (list: Product[], cols: number, rows: number, x: number, y: number, z: number, yaw: number, cw: number) => {
    const ch = cw * 1.5
    const cells = list.slice(0, cols * rows)
    if (!cells.length) return
    const panel = new Mesh(new PlaneGeometry(cols * cw, rows * ch), PENDING)
    panel.position.set(x, y, z)
    panel.rotation.y = yaw
    g.add(panel)
    cells.forEach((p, i) => {
      const hit = new Mesh(new PlaneGeometry(cw * 0.96, ch * 0.96), HIDDEN)
      hit.position.set((-(cols - 1) / 2 + (i % cols)) * cw, ((rows - 1) / 2 - Math.floor(i / cols)) * ch, 0.01)
      panel.add(hit)
      register(p, hit)
    })
    loaders.push(async () => {
      const W = 256
      const H = 384
      const [c, cg] = makeCanvas(cols * W, rows * H)
      cg.fillStyle = '#f4ede3'
      cg.fillRect(0, 0, c.width, c.height)
      const images = await Promise.all(cells.map((p) => loadProductTexture(p.images[0], 384).then((r) => r.image as HTMLCanvasElement)))
      // Spread the drawing over frames so walking in doesn't hitch.
      await new Promise((r) => setTimeout(r, Math.random() * 400))
      cells.forEach((p, i) => {
        const off = discountPercent(p)
        cg.save()
        cg.translate((i % cols) * W + 6, Math.floor(i / cols) * H + 6)
        cg.scale((W - 12) / 512, (H - 12) / 768)
        drawProductCard(
          cg,
          images[i],
          p.title,
          formatPrice(p.price, 'en'),
          p.compareAtPrice && off ? formatPrice(p.compareAtPrice, 'en') : null,
          off ? `-${off}%` : null,
        )
        cg.restore()
      })
      panel.material = imageMat(canvasTexture(c))
    })
  }

  // Wall bays (fronts face into the store).
  const left = of('scarves', 'inner-caps', 'accessories')
  // In front of the bays' shelf boards (they'd otherwise cut across the cards).
  ;[5.2, 2.6, 0, -2.6, -5.2].forEach((z, i) => wall(left.slice(i * 3, i * 3 + 3), 3, 1, -4.33, 1.55, z, Math.PI / 2, 0.7))
  const right = of('dresses', 'isdal', 'everyday-wear')
  ;[4.8, 2.1, -0.6, -3.3].forEach((z, i) => wall(right.slice(i * 3, i * 3 + 3), 3, 1, 4.36, 1.55, z, -Math.PI / 2, 0.7))
  wall(of('sale', 'new-arrivals').slice(0, 6), 3, 2, -3.47, 1.6, -7.28, 0, 0.78)

  // Hanging rails (from the store anchors: x, z centre, length along z).
  const rails: [number, number, number][] = [
    [-3.49, -4.6, 2.65],
    [-2.21, -4.6, 2.65],
    [-3.68, 2.45, 2.05],
    [-2.4, 2.51, 2.05],
    [2.03, -3.2, 2.13],
    [3.29, -3.0, 2.13],
    [1.75, 0.07, 2.11],
    [3.02, 0.23, 2.11],
    [1.96, 3.44, 2.08],
    [3.24, 3.53, 2.08],
  ]
  const railItems = of('denim', 'everyday-wear', 'dresses', 'isdal', 'sale', 'new-arrivals')
  // Product cards hanging under each rail (product photos often show the model,
  // so cut-outs on hangers would look like people hanging).
  rails.forEach(([x, z, span], i) => {
    const cw = (span - 0.3) / 3
    wall(railItems.slice(i * 3, i * 3 + 3), 3, 1, x, 1.8 - (cw * 1.5) / 2, z, Math.PI / 2, cw)
  })

  // Display boards over the table and gondola tops (the baked tops still show
  // where the folded scarves used to sit).
  const board = new MeshBasicMaterial({ color: '#efe6da' })
  for (const [x0, z0, x1, z1, y] of [
    [-2.63, -1.91, -0.01, -0.19, 1.003],
    [-1.995, 0.525, -0.325, 1.715, 0.883],
  ] as const) {
    const m = new Mesh(new PlaneGeometry(x1 - x0 - 0.06, z1 - z0 - 0.06), board)
    m.rotation.x = -Math.PI / 2
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
    g.add(m)
  }

  // Table + gondola: easel cards from the store's original easel stations.
  const easels: Card[] = []
  for (const st of BOUTIQUE.stations.filter((s) => s.kind === 'easel')) {
    const list = of(st.section)
    if (!list.length) continue
    const sg = new Group()
    sg.position.set(st.x, 0, st.z)
    sg.rotation.y = st.yaw
    sg.updateMatrix()
    g.add(sg)
    const sf = ctx.batcher.frame(toWorldM.clone().multiply(sg.matrix), ctx.colliders)
    easels.push(...easelRow(sf, sg, list, st.surface ?? 0.9, st.spacing))
  }
  registerCards(ctx.interaction, easels)
  loaders.push(async () => loadCards(easels))

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
      handles.modelSpots.push({ x: w.x, z: w.z, yaw: yaw + sp.yaw, product: p, plinth: i < 2 ? 0.06 : 0 })
    })
  const greeter = BOUTIQUE.staff[0]
  const gw = spotWorld(greeter.x, greeter.z)
  handles.staffSpot = { x: gw.x, z: gw.z, yaw: yaw + greeter.yaw }

  // Le Voile's own cash desk opens the (mall-wide) checkout.
  if (ctx.onCheckout) {
    const hit = new Mesh(new PlaneGeometry(3.1, 1.0), HIDDEN)
    hit.position.set(-0.3, 0.6, -5.5)
    g.add(hit)
    ctx.interaction.add({ object: hit, kind: 'cashier', label: () => 'Le Voile · Checkout', onInteract: ctx.onCheckout, maxDist: 3 })
  }

  // 122 Coins rewards counter just inside the door (left).
  const rc = local(-2.4, 6.2)
  rewardsCounter(ctx, f, handles.interior, 'levoile', brandById.get('levoile')?.color ?? BRAND.magenta, rc.x, rc.z)

  return true
}
