import '@fontsource/cairo/400.css'
import '@fontsource/cairo/600.css'
import '@fontsource/cairo/700.css'
import '@fontsource/cairo/800.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/600.css'
import './styles/app.css'
import './styles/game.css'
import './styles/live.css'
import { Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three'
import { buildLayout, type MallLayout } from './config/layout'
import { BRAND } from './config/brand'
import { createProductProvider } from './data/providers'
import type { Catalog } from './data/types'
import { installImageFallback } from './data/webImage'
import { Engine } from './engine/renderer'
import { detectQuality, isTouchDevice, webglAvailable } from './engine/quality'
import { CollisionWorld } from './engine/colliders'
import { Batcher } from './engine/batcher'
import { canvasTexture, loadImage, makeCanvas } from './engine/textures'
import { Game } from './game'
import { hideSplash, watchKeyboard } from './platform/native'
import { analyzeSelfie, applyTraits } from './actors/avatar/selfie'
import { t } from './i18n/i18n'
import { setCatalog, store, watch } from './state/store'
import { createCheckoutService } from './services/CheckoutService'
import { mountFallback, mountScreens } from './ui/screens'
import { mountHud, setZoneAliases } from './ui/hud'
import { mountMinimap } from './ui/minimap'
import { mountGameHud } from './ui/gameHud'
import { mountMenu } from './ui/menu'
import { mountAvatarEditor } from './ui/avatarEditor'
import './styles/avatar.css'
import { mountProductCard } from './ui/productCard'
import { mountCart } from './ui/cart'
import { mountCheckout } from './ui/checkout'
import { fontsReady } from './world/signage'
import { buildShell } from './world/mall'
import { buildShop, type ShopHandles } from './world/shop'
import { buildCashierDesk } from './world/cashier'
import { buildCashierPerson, buildPeople } from './world/people'
import { boutiqueAvailable, boutiqueLayout, buildBoutique } from './world/boutique'
import { Kit } from './world/kit'
import { buildMallCatalog, loadBrandCatalogs } from './data/mallCatalog'
import { levoileInterior } from './world/bespoke/levoile'
import { createSocial, crowdSize, social } from './social'
import { startSession } from './social/session'
import { mountLookCard, mountSocial } from './ui/social'
import { mountBrandCatalog } from './ui/brandCatalog'
import { mountSectionSlider } from './ui/sectionSlider'
import { mountTryOnMirror } from './ui/tryOnMirror'
import { mountReelsOverlay } from './ui/reelsOverlay'
import './styles/slider.css'
import './styles/reels.css'
import { buildLiveMall } from './world/liveMall'
import { loadAvatarKit } from './actors/avatar/kit'
import { buildPlaza } from './world/plaza'
import { buildDecals } from './world/decals'
import { buildCorridor } from './world/corridor'
import { updateBanners } from './world/banners'
import { buildGlows } from './world/glow'
import { buildHalos } from './world/halo'
import { buildAOStrips } from './world/aoStrips'
import type { ScreenFeed, ScreenActions } from './world/screens'
import { benchFail, benchParams, benchRedirect, runBench } from './bench/run'

const uiRoot = document.getElementById('ui')!
const appRoot = document.getElementById('app')!

// Language drives document direction.
watch((s) => s.lang, (lang) => {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
})

const progress = (p: number, label = '') => {
  if (import.meta.env.DEV) console.debug('[boot]', p.toFixed(2), Math.round(performance.now()))
  store.getState().set({ loadProgress: p, loadLabel: label })
}
// Yield so the progress bar can paint; rAF is throttled in background tabs, so race a timeout.
const frame = () =>
  new Promise((r) => {
    requestAnimationFrame(() => r(null))
    setTimeout(() => r(null), 60)
  })

async function boot(): Promise<void> {
  // ?bench=<spot>&q=<tier>: automated measurement (scripts/bench.mjs). The tier is forced
  // here, before the engine exists, and "auto" is off so the governor never steps it down.
  const bench = benchParams()
  if (bench?.q) store.getState().set({ quality: bench.q })
  installImageFallback()
  // Characters are built from this model; fetched alongside the catalogue.
  const avatarKit = loadAvatarKit()
  let catalog: Catalog | null = null
  let levoileCatalog: Catalog | null = null
  const provider = createProductProvider()
  try {
    levoileCatalog = await provider.loadCatalog()
    // District 122: one shop per brand (?boutique keeps the single Le Voile store).
    catalog = new URLSearchParams(location.search).has('boutique')
      ? levoileCatalog
      : buildMallCatalog(levoileCatalog, await loadBrandCatalogs())
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

  // The baked boutique is the store when deployed; otherwise the procedural mall.
  const useBoutique = await boutiqueAvailable()
  const layout: MallLayout = useBoutique ? boutiqueLayout(catalog) : buildLayout(catalog.sections)

  let engine: Engine
  try {
    engine = new Engine(appRoot, level)
  } catch (err) {
    console.error('WebGL init failed', err)
    store.getState().set({ phase: 'error' })
    mountFallback(uiRoot, catalog)
    return
  }
  // Live mall (simulated shoppers, staff chat, deals, games) — see src/social.
  createSocial(catalog, crowdSize(level))
  startSession()

  await avatarKit
  const colliders = new CollisionWorld()
  const game = new Game(engine, layout, colliders, uiRoot, isTouch)
  mountScreens(uiRoot, game)
  mountHud(uiRoot, game)
  mountMenu(uiRoot, game)
  mountProductCard(uiRoot, game)
  mountCart(uiRoot, game)
  mountCheckout(uiRoot, game, createCheckoutService(provider, catalog))
  mountSocial(uiRoot, game)
  mountBrandCatalog(uiRoot, game)
  mountSectionSlider(uiRoot, game)
  mountTryOnMirror(uiRoot, game)
  mountReelsOverlay(uiRoot, game)
  mountAvatarEditor(uiRoot, game)
  mountMinimap(uiRoot, game, () => {
    const s = store.getState()
    if (s.lastOrder) return layout.exit
    if (s.cart.length) return layout.cashier
    return null
  })
  // Touch: the quiet game HUD adopts the chips and the minimap, so it mounts after them.
  if (isTouch) mountGameHud(uiRoot, game)
  watchKeyboard()
  progress(0.08)

  await fontsReady()
  progress(0.15)
  await frame()

  const vestLogo = await whiteLogoTexture()
  const batcher = new Batcher()

  if (useBoutique) {
    setZoneAliases({ atrium: 'entrance', boulevard: 'store' })
    game.shell = await buildBoutique(game, batcher, catalog, vestLogo, (p) => progress(0.15 + p * 0.7))
  } else {
    await buildMall(game, batcher, catalog, vestLogo)
  }

  batcher.build(engine.scene)
  progress(0.92)
  await frame()

  // Pre-compile shaders so the first seconds don't hitch.
  game.player.applyCamera(engine.camera, colliders, 0)
  engine.renderer.compile(engine.scene, engine.camera)
  // Textures too: uploading them here keeps the first minutes of play smooth.
  progress(0.96)
  await frame()
  game.warmTextures()
  progress(1)
  game.start()
  await new Promise((r) => setTimeout(r, 250))
  store.getState().set({ phase: 'intro' })
  hideSplash()
  if (bench) void runBench(game, bench)

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, { lv: { game, store, engine, layout, catalog, social: social(), selfie: { analyzeSelfie, applyTraits } } })
  }
}

/** Procedural mall (fallback when the boutique model isn't deployed, or ?mall). */
async function buildMall(game: Game, batcher: Batcher, catalog: Catalog, vestLogo: Texture | null): Promise<void> {
  const { engine, layout } = game
  const colliders = game.colliders
  const kit = await Kit.load(engine.renderer, (p) => progress(0.15 + p * 0.15))
  game.shell = await buildShell(engine.scene, batcher, colliders, layout, engine.quality, kit)
  progress(0.3)
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
          bakedTextureMax: () => engine.quality.bakedTextureMax,
          kit,
          onCheckout: () => game.openCheckout(),
          // Every shop (Le Voile included) is a campaign boutique: chic lit walls and
          // product cut-out standees, no racks. ?bespoke brings back Le Voile's baked
          // store (racks, hangers, its own fixtures; store.glb loads only then).
          bespoke: new URLSearchParams(location.search).has('bespoke') ? { levoile: levoileInterior } : {},
        },
        shop,
      ),
    )
    progress(0.3 + (0.45 * shops.length) / layout.shops.length)
    await frame()
  }
  game.updaters.push(() => {
    const { x, z } = game.player.pos
    const insideShop = shops.some((s) => x >= s.layout.rect.x0 && x <= s.layout.rect.x1 && z >= s.layout.rect.z0 && z <= s.layout.rect.z1)
    for (const s of shops) s.update(x, z, insideShop)
  })

  buildCashierDesk(engine.scene, batcher, colliders, game.interaction, layout, () => game.openCheckout(), kit)
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
  await buildPeople(game, shops, vestLogo)
  buildCashierPerson(game, vestLogo, () => game.openCheckout())
  progress(0.8, '')
  await frame()
  const actions: ScreenActions = {
    teleport: (id) => game.teleport(id),
    openProduct: (id) => store.getState().openProduct(id),
    openWheel: () => store.getState().set({ overlay: 'wheel' }),
    openReels: (source) => store.getState().set({ overlay: 'reels', reelsBrand: source }),
  }
  const feeds: ScreenFeed[] = []
  feeds.push(...buildPlaza({ root: engine.scene, batcher, colliders, interaction: game.interaction, kit, actions }).feeds)
  for (const w of layout.wings)
    feeds.push(...buildCorridor({ root: engine.scene, batcher, colliders, interaction: game.interaction, kit, actions }, w, layout.shops.filter((s) => s.wing === w.id)).feeds)
  const live = buildLiveMall(game, shops, vestLogo)
  game.updaters.push(mountLookCard(document.getElementById('ui')!, game, () => live.crowd?.focus ?? null))
  Object.assign(game, { live })
  game.buildActorLods()
  buildDecals(engine.scene)
  buildAOStrips(engine.scene)
  buildGlows(engine.scene, engine.quality.fancyDecor)
  // Sprite halos from every area (world/halo.ts): one instanced call, on every tier.
  buildHalos(engine.scene)
  game.updaters.push((dt) => {
    for (const fd of feeds) fd.update(dt, engine.camera)
    updateBanners(dt, engine.camera)
  })
  progress(0.85)
}

/** White logo on transparent background for the staff vests. */
async function whiteLogoTexture(): Promise<Texture | null> {
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

// ?bench reloads once with nodemo + nolock (both are read at module load).
if (!benchRedirect())
  boot().catch((err) => {
    console.error(err)
    store.getState().set({ phase: 'error' })
    const bench = benchParams()
    if (bench) benchFail(bench, err)
  })
