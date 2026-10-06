# District 122 — Virtual Community Mall

A walkable 3D **community mall** with 20 units: 16 client brands, 4 "Coming Soon" units, plus a Styling Studio and a lounge. Visitors walk the plaza and three wings, browse each brand's shop, play games that earn **122 Coins**, swap coins for brand discounts at each shop's rewards counter, chat with staff, and check out at the plaza cashier (mocked). It started as the Le Voile virtual store; Le Voile is now one tenant and keeps its real catalogue. User docs: `README.md`. Future work: `ROADMAP.md`.

## District 122 structure (branch `122-mall`)

- **Brands and slots:** `src/config/mall.ts`.
  - `BRANDS` holds name, Arabic name, monogram initials and colour, status (open / soon), display, outfit and placeholder product kinds.
  - `BrandDef.tier` is `flagship` (24×16 m) / `standard` (12×16) / `compact` (6×10). `split: true` (Le Voile) makes a flagship of two halves.
  - `WINGS` has `left` / `right` unit lists per wing (west / north / east), ordered from the plaza outwards. `wingOf(id)` finds a brand's wing.
  - `POPUP_BRAND_ID` (null → the plum "122 Pop-up · Book this space" kiosk).
  - The base look of each shop comes from its brand: brand fascia, blade sign with monogram, tint, display.
- **Catalogue:** `src/data/mallCatalog.ts`.
  - `buildMallCatalog()` makes one `Section` per open brand.
  - Le Voile merges its real `products.json` sections into one shop.
  - Other brands use their real catalogue from `src/data/brands/<brandId>.json` (lazy-loaded, sections merged into one shop; `brandSubsections()` keeps the store's own sections). A brand without a file falls back to placeholder products with generated SVG photos.
  - Brand data comes from each brand's public Shopify store: `node scripts/fetch-brands.mjs [--only <id>] [--check]`. It writes sections from `scripts/brand-sections.json` (manual picks + Arabic titles; otherwise the header menu minus promo collections), 5–10 products per section (in stock first) and 2 photos each to `public/products/<brandId>--<collection>-NN/`, plus `<brandId>.remote.json` and `scripts/brand-scrape-report.json`.
  - Then run `.venv/Scripts/python scripts/remove-bg.py --brands`, then `node scripts/fetch-brands.mjs --apply-cutouts` (QA thresholds; manual rejects in `scripts/brand-cutout-reject.json`), then `scripts/optimize-images.py`.
  - `?boutique` still walks the single Le Voile store with the original catalogue.
- **Layout:** `src/config/layout.ts`.
  - A plaza (44 × 34 m, entrance at z = 0) with 3 wings of 60 / 60 / 48 m.
  - Units are packed by frontage in `src/config/layoutMath.ts` (pure, unit-tested: `packWing`, `sideBoundaries`, `depthAt`, `openingsFor`, `frontSolidSpans`, `frontWallSpans`, `allocate`). The shorter wing side ends in a 4 m seating nook (zone `wing-<id>`).
  - `ShopLayout` carries `tier`, `front`, `depth`, `z0`/`z1`, `plazaDir`, `openings` and `popup`. `MALL.shopLen` / `MALL.shopDepth` are deprecated.
  - Each wing has its own frame (origin = mouth on the plaza, local −Z away from it); `toWorld()` converts.
  - `ShopLayout.kind` is `shop | soon | lounge` (`amenity`: `studio` / `lounge`). Zone ids are a brand id, `studio`, `lounge`, `soon-N`, `wing-<id>` or `atrium` (plaza).
- **Shell:** `src/world/mall.ts` builds the plaza and each wing in its local frame. Coming Soon units get a closed hoarding front.
- **122 Coins:** `src/social/games.ts`.
  - Earned from: passport +10 per shop (+150 for all), treasure +25 each (+100 for all), and the wheel (coins or free shipping).
  - `REWARD_TIERS` (100 / 250 / 400 coins → 10 / 20 / 30%) are redeemed at each shop's rewards counter (`rewardsCounter` in `shop.ts`, overlay in `ui/social.ts`). This needs the mock login.
  - The result is a brand-scoped coupon (`Coupon.brandId`) that `pricing.ts` applies only to that brand's lines.
- **Shops:** every shop (Le Voile included) is a campaign boutique (`src/world/boutiqueShop.ts`): lit lightbox walls grouped by section under dark section signs, cut-out standees, greige walls with an oak wainscot and a brand-tinted back wall, wall washes and floor light pools.
  - A section sign opens the **section slider** (`src/ui/sectionSlider.ts`, overlay `slider`): every product of the section as a cover-flow.
  - The portrait **stories screen** (`src/world/storyScreen.ts`) plays the brand's vertical videos from `src/config/brandVideos.ts` (files in `public/videos/<brandId>/`), else a shader-animated reel of its products; tapping it opens all products.
  - **Instagram:** `src/config/brandSocial.ts` holds each brand's handle and reel links (link or embed code). With reels, the stories screen shows a "Watch our reels" card and opens the reels viewer (`src/ui/reelsOverlay.ts`, official embeds, one iframe at a time, loaded only while open). Embeds can't play on the 3D screen itself (cross-origin iframe); MP4s in `brandVideos.ts` can.
- **Try-on** (`src/actors/avatar/tryOn.ts`, `src/ui/tryOnMirror.ts`): "Try it on" in the product sheet dresses her character in the product (outfit from the garment words, fabric patch cut from the product photo, tiled triplanar by the avatar material), shown in a mirror; she can wear it around the mall (`store.tryOn`, not saved).
- **Bespoke shops:** `ShopContext.bespoke[brandId]` replaces the generic furnishing. Le Voile's baked store (`src/world/bespoke/levoile.ts`, racks and hangers) is only used with `?bespoke`.
  - Le Voile is the real baked boutique (`src/world/bespoke/levoile.ts`, `store.glb`) at real size in the plaza-side half of a split flagship; the other half is a lightbox hall, with a cream partition between.
  - Its baked garments and scarves (`store_soft`) are hidden; only real products show: composed card panels on the wall bays, rails and rear display, plus easels.
  - The model preloads about 2.5 s after boot.
  - Brand logos: `BrandDef.logo` (shopfront + blade sign).
- **Plaza/corridor finishing:** `plaza.ts` (stage + LED + seating), `corridor.ts` (per-wing finishing), `screens.ts`/`screenSlides.ts` (live screens, shared feeds), `decals.ts`/`glow.ts` (instanced contact shadows / additive glows, glows hidden on Low).
- **Product display:** brand shops are style-B "campaign boutiques", built by `src/world/boutiqueShop.ts` from the pure plan `src/config/boutiquePlan.ts`.
  - Lightbox walls are grouped by section with plaques (`src/world/lightbox.ts`: one atlas mesh per ≤ 28 products, atlas 2048 / 1536 / 1024 by quality), plus a hero campaign wall.
  - Standees stand on marble plinths and islands show cut-outs (`src/world/showcase.ts`, one alpha-tested mesh each; tall cut-outs become mounted prints on islands).
  - The cream ceiling has a soffit, slot lights and spot cans. Flagships get a fitting room. Each shop has the 122 Coins counter.
  - An "All products" screen opens `src/ui/brandCatalog.ts` (overlay `brandCatalog`, `catalogBrand`).
  - Storefronts follow `shop.openings`: flagship long windows with 4 figures, standard 2 windows, compact glass sidelights.
  - The old kit / rack furnishing (`furnishWithKit` and the rack / shelf / gallery / boxes displays) was removed in this branch. `cardPanel`, `easelRow` and `lookbookStand` remain, used by Le Voile's baked half (`src/world/bespoke/levoile.ts`) and `?boutique` (`src/world/boutique.ts`).
  - Design: `docs/superpowers/specs/2026-10-06-shop-tiers-design.md`. Perf notes: `docs/superpowers/notes/2026-10-06-shop-tiers-perf.md`. Earlier design: `docs/superpowers/specs/2026-10-05-product-display-design.md`.
- **Controls:** `src/player/controlsMath.ts` holds the pure maths (look smoothing, tap-to-walk, product focus, touch tuning), unit-tested. Design: `docs/superpowers/specs/2026-10-05-controls-design.md`.
- **WebP images:** `scripts/optimize-images.py` writes `.webp` next to each product photo/cutout; `src/data/webImage.ts` picks them at runtime (failed cutouts have none); a Vite plugin in `vite.config.ts` prunes the jpg/png sources from `dist/`.
- **Plaza and corridors:** the plaza has an events stage with LED wall and live screens (`plaza.ts`, `screens.ts`); each wing is finished in `corridor.ts`. Notes: `docs/superpowers/notes/`.
- **Branding:** `BRAND` in `src/config/brand.ts`. The `magenta` key holds the 122 plum. Logos are `public/brand/122-logo*.svg`.

## Mobile app (Android, branch `mobile-app`)

- **Capacitor wraps the web build:** `capacitor.config.ts` (`com.district122.mall`, `webDir: dist`), Gradle project in `android/`. `dist/` ships inside the APK, so the app runs offline. No iOS project yet (needs a Mac).
- **Build:** `npm run android:apk` (build → `cap sync android` → `gradlew assembleDebug`). It needs `JAVA_HOME` (Android Studio's `jbr`) and `android/local.properties` with `sdk.dir`. Output: `android/app/build/outputs/apk/debug/app-debug.apk`.
- **Native glue:** `src/platform/native.ts` is the only file that imports Capacitor (haptics, Android back button, splash). Everything is a no-op in a browser.
- **`MainActivity`:** immersive full screen, keep-screen-on, draws under the cutout. The manifest locks `sensorLandscape`.
- **Touch controls:** fixed-home joystick with **sprint lock** (drag up past the rim and release), run and camera buttons (`.pad-btn` in `ui/hud.ts`), look sensitivity and vibration settings. Game pads use physical left/right: they don't mirror in Arabic.
- **Third person is the default on touch** (store v3 migrates touch users once); desktop stays first person.
- **Touch HUD** (`src/ui/gameHud.ts`, `src/styles/game.css`, touch only): one icon row top right (coins, map, cart, help, menu); coins and map open panels under the row that close on a second tap (the live chips and the minimap are re-parented into them); the prompt is a card beside the hand button (`Interactable.productId` → photo, brand, title, price). Toasts, the help pill and the desktop top-bar actions are hidden on touch.
- **Third person:** camera 2.5 m over the shoulder, blocked by every collider (`CollisionWorld.raycastAll`), not only walls.
- **Auto quality on touch:** `touchTier()` picks High on flagship GPUs (`FLAGSHIP_GPU`, 8 cores, 8 GB; measured on a Galaxy S24 Ultra: 59 fps), Medium on 8 cores / 6 GB, else Low.
- **Frame rate:** `fpsCap` setting (30 / 60 / Max, `shouldRender`), plus dynamic resolution on touch with Auto quality (`resolutionStep`, floor 0.7); a tier only drops after the scale bottoms out.
- **Icons / splash:** `npm run app:assets` (`scripts/app-assets.mjs` → `assets/` → `capacitor-assets`).
- **Fonts are bundled** (`@fontsource`), not loaded from Google Fonts.
- `?touch` forces the touch HUD on desktop. Design: `docs/superpowers/specs/2026-10-06-mobile-app-design.md`.

## Stack and key decisions

- **Vite + TypeScript + plain Three.js** (no React/R3F: lighter on phones, and the HUD is simple panels). **Zustand vanilla** store (`src/state/store.ts`) drives the HTML/CSS HUD. It persists cart, language and settings.
- **Everything 3D is procedural:** mall, props, canvas-drawn bilingual signage and characters. The décor kit / boutique GLBs (`public/models/mall/`) are optional, and the app never blocks on them.
- **Layout comes from config** (`src/config/layout.ts` + `src/config/mall.ts`): a plaza at the entrance (z = 0) with three wings, one shop per slot. Shop interiors are built in a local frame (origin = centre of the opening, −Z into the shop).
- **Per-section look** is in `src/config/sections.ts` (`display`: rack/shelf/gallery/boxes, `tint`, model `outfit`, size profile, Shopify `collection`). Unknown sections get defaults.
- **Characters** (`src/actors/`):
  - The base is the Quaternius **Universal Base Characters** female (CC0, `tools/quaternius/UBC`): a sculpted stylised head (eyes, brows, skin normal map), hands with fingers and three hairstyles, on the Quaternius UAL skeleton (CC0, same 65 joints), animated by its clips (`Idle_Loop`, `Walk_Loop`, `Walk_Modest` = damped stride for long skirts, plus talk/sit/dance…). The head is enlarged ×1.15 in the build.
  - `scripts/blender/build_avatar.py` cuts the head + neck, hands, eyes and brows from the base body, derives the garments as **offset shells of the body** (tops, vest, tunic, leggings, trousers, shoes, hijab head shell; smoothed and loosened so they hang modestly) plus lofted skirts, drape and trims, and exports `public/models/avatar/avatar.glb` with the atlases next to it (`skin.png`, `skin_n.png`, `hair.png`, `hair_n.png`, `eyes.png`); then run `node scripts/avatar-postprocess.mjs` (strips baked channels). The body itself is never exported. `--preview DIR` renders the four reference looks. Sources live in `tools/quaternius/` (git-ignored).
  - Runtime (`src/actors/avatar/`): `piecesFor()` picks pieces per look (eyes and brows always), they merge into ONE skinned geometry (cached per piece set) with ONE material; a per-vertex `part` index picks colours from a per-character palette. Face and hands sample the skin atlas tinted by `palette.skin / SKIN_REF`, hair and brows the hair atlas × hair colour, the eyes the iris texture (`material.ts`; atlases load with the kit in `kit.ts`). `face.ts` only draws the editor's face thumbnails now. Poses and the wave are two-bone IK hand targets (`ik.ts`).
  - `createCharacter(look, seed)` in `character.ts` is the only factory (staff, models, cashier, concierge, stylists, crowd, the player). Distant ones use `lodGeometry()` snapshots (BatchedMesh, `lodWalk.ts`).
  - **Avatar editor** (`src/ui/avatarEditor.ts`): opens on the first "Enter the Mall" and from the menu ("My character"); the look is saved on the device (`store.avatar`, validated by `sanitizeAvatar`).
  - **Selfie → character** (`src/actors/avatar/selfie.ts`): "Take a selfie" (`@capacitor/camera`, front camera; file input on the web) → MediaPipe Face Landmarker on the device (`public/mediapipe/` wasm + `public/models/face/face_landmarker.task`, nothing uploaded) → `analyzeSelfie()` samples skin, hair / scarf colour, iris, lips, brows and measures face width, jaw, eye opening and brow thickness → `applyTraits()` fills the look (skin, hijab or hair + colour, `iris`, `lips`, `brows`, `faceWidth`, `jaw`, `browThick`). Face tints use `face_mask.png` (R lips, G cheeks, B lids; exported by the build) and the iris tint; the head shape is `shapeHead()` on a per-character geometry clone (`kit.ts`). The editor also exposes these as swatches and sliders.
  - The old procedural rig and realistic / MakeHuman bodies were removed on purpose: don't bring them back.
- **MODESTY RULE (mandatory, no exceptions):**
  - No character may ever appear without clothes, not even for one frame.
  - Clothing is always modest: abaya / long dress, or long sleeves with a long skirt or wide trousers.
  - There is NO body mesh: a character is garment pieces + head + hands only. Only the face and hands are skin; legs always carry leggings or trousers, the neck a high collar. `piecesFor()` rejects any look that isn't covered neck to ankles and shoulders to wrists (tests in `tests/avatarPieces.test.ts`). Most characters wear hijab (models ~80%, staff/shoppers ~85%).
  - `root.visible` stays false until the character is fully built and merged.
  - Any new look, outfit or LOD must keep this.
- **Interaction:** a raycast against registered interactables (product planes, character hitboxes, counter, doors), with wall occlusion and a distance limit (`src/interact/interaction.ts`).
- **Live mall demo** (`src/social/`, `src/world/crowd.ts`, `src/world/liveMall.ts`, `src/ui/social.ts`), frontend-only:
  - Interfaces in `social/types.ts`: `PresenceSource`, `StaffChatService`, `DealsService`, `IdentityService`. The `Mock*` classes get replaced by Laravel + Reverb later.
  - Customers never chat with each other: chat is staff ↔ customer only.
  - The crowd only renders what presence says. Full rigs are kept for the nearest on-screen few; the rest are one `BatchedMesh` LOD call plus an `InstancedMesh` for shadows.
  - The Styling Studio lives in the `'lounge'` slot.
  - Games (passport / treasure / wheel) and coupon claim (mock OTP, any 4 digits) are in `social/games.ts`.
  - Cart pricing (flash sale / group deal / coupon / shipping) is in `social/pricing.ts`; `cartTotals()` uses it.
  - Flags: `?crowd=N` (default High 50 / Medium 30 / Low 20) and `?nodemo` (no simulation).
  - Dev: `lv.social`.
- **Checkout** is behind `CheckoutService` (`src/services/CheckoutService.ts`). It is the mock today; `ShopifyCheckoutService` creates a Storefront Cart and redirects to `checkoutUrl`.
- **Performance:**
  - Quality tiers come from `engine/quality.ts` (auto-detect plus FPS governor).
  - Static geometry is instanced via `engine/batcher.ts`.
  - Shop interior décor is culled at 19/22 m. Characters are not tied to it: staff, models and shoppers switch to static LODs (one BatchedMesh each for the crowd and for placed actors, `world/actorLod.ts`) beyond the rig distance and stay drawn into the fog; crowd LODs walk in the vertex shader (`actors/lodWalk.ts`).
  - Product textures are lazy-loaded per shop.
  - Blob shadows only. The floor reflector is High-only and shown only while the plaza is in view.
- **Audio** is generated with Web Audio (`src/audio/audio.ts`); there are no audio files.
- **English is the default; Arabic is available** (toggle in the HUD/menu; persisted store v2 migrates old saves to English once). `<html dir>` follows the language; use CSS logical properties. Product titles stay in English. 3D price tags use Latin digits (they're baked into textures once).

## Data contract — `src/data/products.json`

Normalized `Catalog` types live in `src/data/types.ts`. Products are read only through a `ProductProvider` (`src/data/providers/`): `LocalProvider` reads the JSON, and `ShopifyStorefrontProvider` is wired by env (`VITE_PRODUCT_PROVIDER=shopify`). After loading, use `catalog()` from the store.

```ts
interface Section { id: string; title: string; titleAr: string; productIds: string[] }

interface Product {
  id: string                     // "<sectionId>-NN", also the asset folder name
  handle: string                 // Shopify handle (Storefront API join key)
  title: string
  price: number                  // EGP
  compareAtPrice: number | null  // set when on sale → struck-through + % off
  currency: 'EGP'
  images: string[]               // local "/products/<id>/<n>.jpg", n is 1-based
  cutout: string | null          // "/products/<id>/cutout.png"; null = failed QA → use images[0]
  sizes: string[]                // empty in JSON → defaults in src/data/defaults.ts (TODO shopify)
  colors: ColorOption[]          // empty in JSON → one neutral swatch (TODO shopify)
  section: string
  modelOutfit: boolean           // true → showcase model + standee in its shop
  url: string                    // product page on levoilestores.com
}
```

- 9 sections × 5 products = 45 products, 86 images. 8 products have `modelOutfit` (2 each in dresses, everyday-wear, denim and sale).
- Use `displayImage(p)` (cutout ?? images[0]) and `hasCutout(p)`; never read `p.cutout` directly.
- 13 products have `cutout: null` (scarves-01..05, new-arrivals-03..05, inner-caps-01..04, accessories-04): their first photos are fabric close-ups or light caps on light backgrounds that rembg removed. The stale `cutout.png` files are still on disk but unused. Don't re-add them without visual QA.
- `src/data/products.remote.json` is the original snapshot with Shopify CDN URLs and the source for re-fetching. Don't hand-edit image paths in `products.json`.

## Asset pipeline

```bash
node scripts/fetch-assets.mjs              # validate + download images and logo (skips existing)
.venv/Scripts/python scripts/remove-bg.py  # cutouts (skips existing; --force --only <id>)
```

- Python tooling runs in `.venv` (Python 3.12, because onnxruntime has no 3.14 wheels).
- Portable Blender for the boutique scene goes in `tools/` (git-ignored).
- The Draco decoder is copied into `public/draco/`.

## Store décor (decided)

`EL_REBAT_Render.blend` (project root, Blender 4.2, Cycles) is the **Le Voile boutique** design: warm palette (cream, oak, bronze, grey marble), 10 warm area lights, and signage "Le Voile", "NEW", "FITTING" and "THANK YOU".

**Decision (user):** keep the **mall** (plaza, wings, shops, plaza cashier, exit) as the experience, and give it the boutique's décor and quality.

- **Pipeline:** `node scripts/bake-store.mjs` drives `scripts/blender/export_store.py` in stages: prep → bake (arch, ceiling, fixtures, soft, hardware) → export → kit. It uses portable Blender in `tools/` and writes working files to `tools/bake-work/`.
  - Each bake group is joined into ONE object first. Baking many selected objects runs one Cycles pass per object, which is very slow.
  - Transforms are applied after the join. The skewed inherited scale otherwise collapsed the smart_project UVs to zero area.
  - Procedural texture coordinates are saved as `lv_orco`/`lv_objco` attributes so the join doesn't shift the noise patterns.
  - Packing uses CONVEX/AABB (CONCAVE silently fails on 150k faces), followed by a uniform rescale into 0–1.
  - CUDA is used, not OptiX (OptiX JIT-compiles kernels in every process).
  - Cycles mesh sync has an intermittent `attr_create_uv_map` crash, so stages are retried with single-threaded `--safe`.
  - Denoising is OIDN through the compositor; the 8-bit save applies the AgX look.
- **`kit.glb` / `kit.json`:** 22 baked pieces cut by bounding boxes (shared atlases). Use them via `Kit.place()` (`src/world/kit.ts`). The material is unlit `MeshBasicMaterial` (baked).
- **Furnishing:**
  - Shops: brand shops use the campaign boutique (see Product display). `furnishWithKit` and the rack / shelf / gallery / boxes displays were removed; the kit's lookbook stand, `cardPanel` and `easelRow` remain for Le Voile's baked half and `?boutique`.
  - Atrium cashier: the kit counter, brand panel and plants (`src/world/cashier.ts`).
  - Atrium and shop corners use the kit plant.
- **Palette restyle:** cream walls, dark ceilings, bronze trims, the store's marble (`public/textures/marble.jpg`), and cream/bronze signage (`shopFascia`, `bladeSign`, directory).
- **Alternatives:** `?boutique` walks the single baked store (`src/world/boutique.ts`, `src/config/boutique.ts`). `?nokit` uses procedural props.

## Conventions

- Reference public assets by absolute URL paths (`/products/...`, `/models/...`); deploy at the domain root.
- New UI strings go in `src/i18n/i18n.ts` in both `ar` and `en`. Use natural Egyptian Arabic and keep brand terms in English.
- Overlays render through `paint()` (`src/ui/dom.ts`) so re-renders don't replay entrance animations.
- Boot yields must not rely on `requestAnimationFrame` alone, because background tabs throttle it.
- Dev: `window.lv` exposes `{ game, store, engine, layout, catalog, social }`. Useful URL flags are `?fps`, `?nolock`, `?debug`, `?crowd=N`, `?nodemo` and `?nobloom`.
- Don't commit `.venv/`, `node_modules/` or `tools/`.
