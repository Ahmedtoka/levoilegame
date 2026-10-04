# Le Voile — Virtual Store

A walkable 3D virtual store for **Le Voile** (levoilestores.com, an Egyptian modest-fashion brand). Visitors walk a mall, browse sections and models, add to cart, check out at the cashier (mocked) and exit. Today the catalogue is a static JSON snapshot; the data layer is shaped so the **Shopify Storefront API** can replace it without touching the 3D code. User docs: `README.md`. Future work: `ROADMAP.md`.

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
