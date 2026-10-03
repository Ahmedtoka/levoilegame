import './styles/app.css'
import { buildLayout } from './config/layout'
import { createProductProvider } from './data/providers'
import { Engine } from './engine/renderer'
import { detectQuality, isTouchDevice, webglAvailable } from './engine/quality'
import { CollisionWorld } from './engine/colliders'
import { Batcher } from './engine/batcher'
import { Game } from './game'
import { setCatalog, store, watch } from './state/store'
import { mountFallback, mountScreens } from './ui/screens'
import { mountHud } from './ui/hud'
import { buildShell } from './world/mall'
import { buildShop, type ShopHandles } from './world/shop'
import { mountMinimap } from './ui/minimap'
import { mountMenu } from './ui/menu'
import { fontsReady } from './world/signage'
import type { Catalog } from './data/types'
import { buildCashierDesk } from './world/cashier'
import { buildCashierPerson, buildPeople } from './world/people'
import { preloadCharacterAsset } from './actors/glbCharacter'
import { createCheckoutService } from './services/CheckoutService'
import { mountProductCard } from './ui/productCard'
import { mountCart } from './ui/cart'
import { mountCheckout } from './ui/checkout'
import { loadImage } from './engine/textures'
import { canvasTexture, makeCanvas } from './engine/textures'
import { BRAND } from './config/brand'
import { t } from './i18n/i18n'
import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'

const uiRoot = document.getElementById('ui')!
const appRoot = document.getElementById('app')!

// Language drives document direction.
watch((s) => s.lang, (lang) => {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
})

const progress = (p: number, label = '') => {
  if (import.meta.env.DEV) console.debug('[boot]', p, Math.round(performance.now()))
  store.getState().set({ loadProgress: p, loadLabel: label })
}
// Yield so the progress bar can paint; rAF is throttled in background tabs, so race a timeout.
const frame = () => new Promise((r) => {
  requestAnimationFrame(() => r(null))
  setTimeout(() => r(null), 60)
})

async function boot(): Promise<void> {
  let catalog: Catalog | null = null
  const provider = createProductProvider()
  try {
    catalog = await provider.loadCatalog()
    setCatalog(catalog)
  } catch (err) {
    console.error('Catalog failed to load', err)
  }

  if (!webglAvailable() || !catalog) {
    store.getState().set({ phase: 'error' })
    mountFallback(uiRoot, catalog)
    return
  }

  const isTouch = isTouchDevice()
  const pref = store.getState().quality
  const level = pref === 'auto' ? detectQuality() : pref
  store.getState().set({ activeQuality: level })

  const layout = buildLayout(catalog.sections)
  let engine: Engine
  try {
    engine = new Engine(appRoot, level)
  } catch (err) {
    console.error('WebGL init failed', err)
    store.getState().set({ phase: 'error' })
    mountFallback(uiRoot, catalog)
    return
  }
  const colliders = new CollisionWorld()
  const game = new Game(engine, layout, colliders, uiRoot, isTouch)
  mountScreens(uiRoot, game)
  mountHud(uiRoot, game)
  mountMenu(uiRoot, game)
  mountProductCard(uiRoot, game)
  mountCart(uiRoot, game)
  mountCheckout(uiRoot, game, createCheckoutService(provider, catalog))
  mountMinimap(uiRoot, game, () => {
    const s = store.getState()
    if (s.lastOrder) return layout.exit
    if (s.cart.length) return layout.cashier
    return null
  })
  progress(0.1)

  await fontsReady()
  progress(0.25)
  await frame()

  const batcher = new Batcher()
  game.shell = await buildShell(engine.scene, batcher, colliders, layout, engine.quality)
  progress(0.45)
  await frame()

  const shops: ShopHandles[] = []
  for (const shop of layout.shops) {
    shops.push(
      buildShop(
        {
          root: engine.scene,
          batcher,
          colliders,
          interaction: game.interaction,
          catalog,
          textureMax: () => engine.quality.textureMax,
        },
        shop,
      ),
    )
    progress(0.45 + (0.35 * shops.length) / layout.shops.length)
    await frame()
  }
  game.updaters.push(() => {
    const { x, z } = game.player.pos
    const insideShop = shops.some((s) => x >= s.layout.rect.x0 && x <= s.layout.rect.x1 && z >= s.layout.rect.z0 && z <= s.layout.rect.z1)
    for (const s of shops) s.update(x, z, insideShop)
  })

  // Cashier desk + exit doors interaction
  buildCashierDesk(engine.scene, batcher, colliders, game.interaction, layout, () => game.openCheckout())
  const doorHit = new Mesh(new PlaneGeometry(6, 3.2), new MeshBasicMaterial({ visible: false }))
  doorHit.position.set(0, 1.6, -0.3)
  engine.scene.add(doorHit)
  game.interaction.add({
    object: doorHit,
    kind: 'exit',
    label: () => t('leaveMall', store.getState().lang),
    onInteract: () => game.tryLeave(),
    maxDist: 3,
  })

  batcher.build(engine.scene)
  progress(0.85)
  await frame()

  // People: models, staff, concierge, cashier
  await preloadCharacterAsset()
  const vestLogo = await whiteLogoTexture()
  await buildPeople(game, shops, vestLogo)
  buildCashierPerson(game, vestLogo, () => game.openCheckout())
  progress(0.92)
  await frame()

  // Pre-compile shaders so the first seconds don't hitch.
  game.player.applyCamera(engine.camera, colliders, 0)
  engine.renderer.compile(engine.scene, engine.camera)
  progress(1)
  game.start()
  await new Promise((r) => setTimeout(r, 250))
  store.getState().set({ phase: 'intro' })

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, { lv: { game, store, engine, layout, catalog } })
  }
}

/** White logo on transparent background for the staff vests. */
async function whiteLogoTexture() {
  try {
    const img = await loadImage(BRAND.logoWhite)
    const [c, g] = makeCanvas(512, 128)
    const s = Math.min(480 / img.width, 110 / img.height)
    g.drawImage(img, (512 - img.width * s) / 2, (128 - img.height * s) / 2, img.width * s, img.height * s)
    return canvasTexture(c)
  } catch {
    return null
  }
}

boot().catch((err) => {
  console.error(err)
  store.getState().set({ phase: 'error' })
})
