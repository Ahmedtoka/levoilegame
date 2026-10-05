# 122 Mall — Virtual Community Mall

A walkable 3D **community mall** with 20 units: 16 client brands, 4 "Coming Soon" units, plus a Styling Studio and a lounge. Visitors walk the plaza and three wings, browse each brand's shop, play games that earn **122 Coins**, swap coins for brand discounts at each shop's rewards counter, chat with staff, and check out at the plaza cashier (mocked). It started as the Le Voile virtual store; Le Voile is now one tenant and keeps its real catalogue. User docs: `README.md`. Future work: `ROADMAP.md`.

## 122 Mall structure (branch `122-mall`)

- **Brands and slots:** `src/config/mall.ts`.
  - `BRANDS` holds name, Arabic name, monogram initials and colour, status (open / soon), display, outfit and placeholder product kinds.
  - `WINGS` holds the slot order per wing (west / north / east).
  - The base look of each shop comes from its brand: brand fascia, blade sign with monogram, tint, display.
  - Bespoke décor per shop is the next phase.
- **Catalogue:** `src/data/mallCatalog.ts`.
  - `buildMallCatalog()` makes one `Section` per open brand.
  - Le Voile merges its real `products.json` sections into one shop.
  - Other brands get placeholder products with generated SVG photos. TODO: one real data file per brand.
  - `?boutique` still walks the single Le Voile store with the original catalogue.
- **Layout:** `src/config/layout.ts`.
  - A plaza (44 × 34 m, entrance at z = 0) with 3 wings.
  - Each wing has its own frame (origin = mouth on the plaza, local −Z away from it); `toWorld()` converts.
  - `ShopLayout.kind` is `shop | soon | lounge` (`amenity`: `studio` / `lounge`). Zone ids are a brand id, `studio`, `lounge`, `soon-N`, `wing-<id>` or `atrium` (plaza).
- **Shell:** `src/world/mall.ts` builds the plaza and each wing in its local frame. Coming Soon units get a closed hoarding front.
- **122 Coins:** `src/social/games.ts`.
  - Earned from: passport +10 per shop (+150 for all), treasure +25 each (+100 for all), and the wheel (coins or free shipping).
  - `REWARD_TIERS` (100 / 250 / 400 coins → 10 / 20 / 30%) are redeemed at each shop's rewards counter (`rewardsCounter` in `shop.ts`, overlay in `ui/social.ts`). This needs the mock login.
  - The result is a brand-scoped coupon (`Coupon.brandId`) that `pricing.ts` applies only to that brand's lines.
- **Bespoke shops:** `ShopContext.bespoke[brandId]` replaces the generic furnishing (`?nobespoke` turns it off).
  - Le Voile is the real baked boutique (`src/world/bespoke/levoile.ts`, `store.glb`) at real size in a 16 m-deep anchor unit (`BrandDef.depth`).
  - Its baked garments and scarves (`store_soft`) are hidden; only real products show: composed card panels on the wall bays, rails and rear display, plus easels.
  - The model preloads about 2.5 s after boot.
  - Brand logos: `BrandDef.logo` (shopfront + blade sign).
- **Plaza/corridor finishing:** `plaza.ts` (stage + LED + seating), `corridor.ts` (per-wing finishing), `screens.ts`/`screenSlides.ts` (live screens, shared feeds), `decals.ts`/`glow.ts` (instanced contact shadows / additive glows, glows hidden on Low).
- **Branding:** `BRAND` in `src/config/brand.ts`. The `magenta` key holds the 122 plum. Logos are `public/brand/122-logo*.svg`.

## Stack and key decisions

- **Vite + TypeScript + plain Three.js** (no React/R3F: lighter on phones, and the HUD is simple panels). **Zustand vanilla** store (`src/state/store.ts`) drives the HTML/CSS HUD. It persists cart, language and settings.
- **Everything 3D is procedural:** mall, props, canvas-drawn bilingual signage and characters. The décor kit / boutique GLBs (`public/models/mall/`) are optional, and the app never blocks on them.
- **Layout comes from config** (`src/config/layout.ts`): an atrium at the entrance (z = 0, the mall extends to −z), then a boulevard with shops alternating L/R. One shop per section; an odd count leaves a lounge. Shop interiors are built in a local frame (origin = centre of the opening, −Z into the shop).
- **Per-section look** is in `src/config/sections.ts` (`display`: rack/shelf/gallery/boxes, `tint`, model `outfit`, size profile, Shopify `collection`). Unknown sections get defaults.
- **Characters** (`src/actors/`): every character comes from `createCharacter(look, seed)`, one procedural cartoon rig (Groups: hips, spine, head, arms, legs). Hijab / hair meshes are added straight onto the head and spine bones. Meshes are merged per bone with vertex colours (`bake.ts`, ~10 draw calls each). Outfit colours are sampled from the product cutout. Models only for products with `modelOutfit: true`; every shop has a sales assistant (magenta vest + logo); there's also a concierge, a cashier and 3 stylists. Realistic / GLB human bodies were removed on purpose: don't bring them back.
- **MODESTY RULE (mandatory, no exceptions):**
  - No character may ever appear without clothes, not even for one frame.
  - Clothing is always modest: abaya / long dress, or long sleeves with a long skirt or wide trousers.
  - Only the face and hands are skin: legs use `bottomMat` for every outfit, the neck uses the top colour. Most characters wear hijab (models ~80%, staff/shoppers ~85%).
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
  - Shop interiors and their characters are culled when not visible.
  - Product textures are lazy-loaded per shop.
  - Blob shadows only. The floor reflector is High-only and shown only while the atrium is in view.
- **Audio** is generated with Web Audio (`src/audio/audio.ts`); there are no audio files.
- **Arabic is the default.** `<html dir>` follows the language; use CSS logical properties. Product titles stay in English. 3D price tags use Latin digits (they're baked into textures once).

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

**Decision (user):** keep the **mall** (atrium, boulevard, 9 section shops, atrium cashier, exit) as the experience, and give it the boutique's décor and quality.

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
  - Shops: `furnishWithKit` in `src/world/shop.ts`, by `SectionStyle.display`. Every shop gets a lookbook stand with its products (`src/world/displays.ts`).
  - Atrium cashier: the kit counter, brand panel and plants (`src/world/cashier.ts`).
  - Atrium and shop corners use the kit plant.
- **Palette restyle:** cream walls, dark ceilings, bronze trims, the store's marble (`public/textures/marble.jpg`), and cream/bronze signage (`shopFascia`, `bladeSign`, directory).
- **Alternatives:** `?boutique` walks the single baked store (`src/world/boutique.ts`, `src/config/boutique.ts`). `?nokit` uses procedural props.

## Conventions

- Reference public assets by absolute URL paths (`/products/...`, `/models/...`); deploy at the domain root.
- New UI strings go in `src/i18n/i18n.ts` in both `ar` and `en`. Use natural Egyptian Arabic and keep brand terms in English.
- Overlays render through `paint()` (`src/ui/dom.ts`) so re-renders don't replay entrance animations.
- Boot yields must not rely on `requestAnimationFrame` alone, because background tabs throttle it.
- Dev: `window.lv` exposes `{ game, store, engine, layout, catalog, social }`. Useful URL flags are `?fps`, `?nolock`, `?debug`, `?crowd=N` and `?nodemo`.
- Don't commit `.venv/`, `node_modules/` or `tools/`.
