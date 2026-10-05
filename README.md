# 122 Mall — Virtual Community Mall

A walkable 3D **community mall** with 20 units: 16 client brands, 4 "Coming Soon" units, a Styling Studio and a lounge. Visitors walk the plaza and three wings, browse each brand's shop, play games that earn **122 Coins**, swap coins for brand discounts at each shop's rewards counter, chat with staff, and check out at the plaza cashier (mocked). It started as the Le Voile virtual store; Le Voile is now one tenant and keeps its real catalogue and its real baked boutique. It's frontend-only and builds to a static `dist/`. Data and checkout sit behind interfaces, so Shopify and a Laravel backend can replace the mocks later.

- **Stack:** Vite + TypeScript, Three.js (plain, no React), Zustand (vanilla) for state, and an HTML/CSS HUD over the canvas.
- **Languages:** Arabic (default, RTL) and English, switchable at any time.
- **Assets:** everything 3D is generated in code (mall, props, signage, characters). The décor comes from an optional baked kit (`kit.glb`) and Le Voile's boutique (`store.glb`); the app never blocks on missing assets.
- **Characters:** stylised, friendly cartoon people, all procedural. **Modesty rule (no exceptions):** every character is fully and modestly dressed (abaya / long dress, or long sleeves with a long skirt or wide trousers). Only the face and hands are skin; legs and neck are always covered, and most wear hijab. Clothing is merged into the same mesh as the body, and a character stays hidden until it's fully built, so a body can never render without clothes.
- **Live mall demo:** a simulated crowd, staff chat, group deal, flash sales and discount games, all mocked in the browser behind interfaces that a Laravel + Reverb backend can replace later (see [Live mall demo](#live-mall-demo)).

## Run locally

Requirements: Node.js ≥ 22.12.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # tsc + vite build → dist/
npm run preview  # serve dist/ locally
```

URL flags:

| Flag | Effect |
|---|---|
| `?fps` | FPS / draw-call / quality readout |
| `?nolock` | Drag-to-look instead of pointer lock (embedded previews, iframes) |
| `?debug` | Exposes `window.lv` (game, store, engine, layout, catalog, social) in production builds; always on in dev |
| `?boutique` | Walk the single baked Le Voile boutique (original catalogue) instead of the mall |
| `?nokit` | Procedural props instead of the baked décor kit |
| `?nobespoke` | Generic furnishing for every shop (turns off bespoke interiors such as Le Voile's) |
| `?crowd=N` | Number of simulated shoppers (0–80). Default by quality: High 50, Medium 30, Low 20 |
| `?nodemo` | Turns off every simulation: crowd, purchase toasts, viewer counts, group deal and flash sales. Staff chat and the games stay |
| `?nobloom` | No bloom on High (renders straight to the canvas, like Medium) |

## Controls

| Desktop | Mobile / tablet |
|---|---|
| WASD / ↑↓ move, ←→ turn | Left half: floating joystick (push far to run) |
| Mouse look (click Enter to lock the pointer) | Right half: drag to look |
| Shift run · E or click interact | Tap a product / person / screen, or the ✋ button |
| C cart · M minimap · V camera (1st/3rd person) · T or Tab teleport menu | Top bar buttons |
| Esc releases the mouse / closes a panel | **Tap-to-walk:** tap the floor (touch, or click in `?nolock` mode) and you walk there; a ring marks the target. Any joystick/WASD input cancels it |

- **Look smoothing:** mouse and touch look ease towards the target, so uneven pointer events don't jitter the camera.
- **Product focus:** opening a product eases the camera so the product sits centred behind the sheet (first person only).
- The pure maths lives in `src/player/controlsMath.ts` (unit-tested). Design: `docs/superpowers/specs/2026-10-05-controls-design.md`.

## The mall layout

Config lives in `src/config/layout.ts` (geometry) and `src/config/mall.ts` (brands and slots).

- **Plaza:** 44 × 34 m, entrance at z = 0, with an events stage, an LED wall and live screens, seating, the cashier, the wheel and the group-deal board.
- **Three wings** open off the plaza, each with finished corridors (floor inlays, planters, pendant lights, directory board, wayfinding). Slots, in order:

| Wing | Slots |
|---|---|
| West | Le Voile, Nourhan, Scarfest, BezraVoga, Noha Collection, Rwan Designs, Coming Soon 1, Styling Studio |
| North | AXIS, THE CAUSE WEAR, DND, Jeno, Pistage, Fashion Avenue, Coming Soon 2, Lounge |
| East | HashBag, Slip & Go, Nanosh, ProMax, Coming Soon 3, Coming Soon 4 |

Coming Soon units get a closed hoarding front. The Styling Studio and the lounge are amenity units.

## Add a brand

1. **Brand and slot** in `src/config/mall.ts`: add a `BrandDef` to `BRANDS` (`id`, `name`, `nameAr`, `initials`, `color`, `status`, `display` rack/shelf/gallery/boxes, model `outfit`, placeholder `kinds`) and put its id in a wing's `slots` in `WINGS`. To open a Coming Soon unit, replace its `soon-N` slot with the brand id.
2. **Logo:** set `BrandDef.logo` (e.g. `/brand/<id>.png`); it is used on the shopfront and the blade sign. Without it, a monogram is drawn.
3. **Products:** today every brand except Le Voile gets generated placeholder products (`buildMallCatalog()` in `src/data/mallCatalog.ts`). Real products later come from one data file or Shopify collection per brand (TODO).
4. **Bespoke interior (optional):** register a builder in `ShopContext.bespoke[brandId]` (see `src/world/bespoke/levoile.ts`). It replaces the generic furnishing; `?nobespoke` turns it off. A bespoke unit can be deeper via `BrandDef.depth`.

Products are shown on fixtures in every shop: composed card panels, rails, shelves and easels (`src/world/displays.ts`, `cardPanel`), placed with `Kit.place(..., { hideSoft: true })` so baked garments don't compete with real products.

## 122 Coins

Frontend-only today (`src/social/games.ts`). Redeeming needs the mock login.

| Earn | Coins |
|---|---|
| Passport stamp per shop visited | +10 (all shops: +150 bonus) |
| Treasure logo found (5 hidden in the mall) | +25 each (5/5: +100 bonus) |
| Wheel of fortune (one spin per session) | 20 / 50 / 100 / 200 coins, free shipping, or better luck |

| Spend (at a shop's rewards counter) | Discount |
|---|---|
| 100 coins | 10% |
| 250 coins | 20% |
| 400 coins | 30% |

The result is a brand-scoped coupon: `pricing.ts` applies it only to that brand's cart lines. Coupons are single-use.

## Test on a phone (temporary public URL)

The dev server already listens on your LAN (`server.host = true`). On the same Wi-Fi, open `http://<your-PC-IP>:5173`.

For a public HTTPS URL (needed for some phone browsers), use a Cloudflare quick tunnel. Install `cloudflared` once (on Windows: `winget install --id Cloudflare.cloudflared`), start the dev server, then run:

```bash
cloudflared tunnel --url http://localhost:5173
```

It prints a `https://….trycloudflare.com` link; open it on the phone. The tunnel lives only while the command runs. Vite may reject the unknown host. If it does, run `npm run build && npm run preview -- --host` and tunnel port 4173 instead, or add the tunnel host to `server.allowedHosts` in `vite.config.ts`.

## Deploy to Cloudways (GitHub Action)

`.github/workflows/deploy.yml` runs on every push to `master` (and manually via **Run workflow**): `npm ci` → `npm test` → `npm run build` → rsync `dist/` to the Cloudways app over SSH. Add these in the repo under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `CLOUDWAYS_HOST` | Server public IP |
| `CLOUDWAYS_USER` | SSH username |
| `CLOUDWAYS_SSH_KEY` | Private key whose public half is added in Cloudways → SSH keys |
| `CLOUDWAYS_PATH` | App web root, e.g. `/home/master/applications/<app-id>/public_html` |
| `CLOUDWAYS_PORT` | Optional, default 22 |

Assets use absolute paths (`/products`, `/brand`, `/models`), so serve from the **domain root**, not a sub-folder. The upload uses `--delete` but keeps `.well-known` (SSL).

**Alternative:** Cloudflare Pages / Netlify / Vercel work with the same `dist/` (build `npm run build`, output `dist`, `NODE_VERSION=22`). Direct upload: `npx wrangler pages deploy dist --project-name <name>`.

## Image pipeline

```bash
node scripts/fetch-assets.mjs                    # validate + download images and logo (skips existing)
.venv/Scripts/python scripts/remove-bg.py        # cutouts (skips existing; --force --only <id>)
.venv/Scripts/python scripts/optimize-images.py  # WebP derivatives of photos and cutouts
```

- Python tooling runs in `.venv` (Python 3.12).
- `optimize-images.py` writes `.webp` next to each source. The app loads WebP (`src/data/webImage.ts`), and a Vite plugin in `vite.config.ts` prunes the `.jpg` / `.png` sources from `dist/`, so the build ships only WebP. Failed cutouts get no WebP and fall back to `images[0]`.
- Don't hand-edit image paths in `products.json`; `products.remote.json` is the source for re-fetching.

## Project structure

```
src/
  main.ts                  boot: catalog → engine → world → UI
  game.ts                  loop, controls state, zones, cashier/exit triggers, teleport
  config/                  brand, mall (brands, wings), layout (plaza + wings), sections
  data/                    products.json, mallCatalog (placeholders), types, webImage, providers/
  services/                CheckoutService (mock + Shopify)
  engine/                  renderer, quality tiers, batcher (instancing), colliders, textures
  world/                   mall shell (plaza, corridors), shops, bespoke/, displays, kit, cashier,
                           crowd (simulated shoppers + LOD), liveMall (studio, wheel, treasures, deal boards)
  actors/                  procedural character, hijab/hair, palettes
  social/                  presence, staff chat, deals, identity (mocks), pricing, games (122 Coins)
  player/                  input, touch joystick, controlsMath, movement/camera
  interact/                raycast interaction
  ui/                      HUD, product card, cart, checkout, menu, minimap, screens, social
  audio/                   generative ambient music + UI sounds (Web Audio, no files)
public/
  products/<id>/…          product photos (+ .webp), cutouts
  brand/                   122 and Le Voile logos
  models/mall/             kit.glb, store.glb (optional)
  draco/                   Draco decoder
scripts/                   fetch-assets.mjs, remove-bg.py, optimize-images.py, bake-store.mjs
docs/superpowers/          design specs and notes
```

## Le Voile catalogue

Le Voile's real catalogue is `src/data/products.json` (contract in `CLAUDE.md`). To add a product, add its object, put photos in `public/products/<id>/1.jpg…`, add its id to a section's `productIds`, and run the image pipeline. Set `modelOutfit: true` for a showcase model. Its sections are merged into the single Le Voile shop.

## Switch to Shopify

The 3D world only consumes the normalized `Catalog` (`src/data/types.ts`), so switching is configuration.

1. In Shopify admin, open **Settings → Apps and sales channels → Develop apps**. Create an app with Storefront API access (read products/collections, write carts) and copy the **public Storefront access token**.
2. Create `.env.local`:
   ```
   VITE_PRODUCT_PROVIDER=shopify
   VITE_SHOPIFY_DOMAIN=levoilestores.myshopify.com
   VITE_SHOPIFY_STOREFRONT_TOKEN=xxxxxxxx
   ```
3. Check each section's `collection` handle in `src/config/sections.ts`. They currently come from the product URLs (`dress`, `sale-2`, `praying-isdal-1`, …).
4. The provider (`src/data/providers/ShopifyStorefrontProvider.ts`) fetches products per collection, with real sizes, colors and variant ids. Checkout automatically becomes `ShopifyCheckoutService`: it creates a Cart via the Storefront API and redirects to Shopify's `checkoutUrl`, so cards, wallets and COD follow the store's real payment settings.
5. Remaining TODOs are marked `TODO(shopify)`:
   - color swatch hex from metafields
   - the `modelOutfit` flag from a product tag
   - hosting cutouts (e.g. a metafield)
   - sending buyer identity before redirect

## Store décor (baked from the Le Voile boutique scene)

The mall's furnishings come from the boutique design in `EL_REBAT_Render.blend`: racks with clothes, folding tables, scarf walls, hanging bays, gondola, rear display, the oak checkout counter with the "Le Voile" panel, plants and fitting rooms. Its Cycles lighting is **baked** into texture atlases. In the browser these pieces are unlit (no real-time lights needed), so they look like the render on any device. The mall shell (marble floors, cream walls, bronze trims, dark ceilings) uses the same palette and the scene's own marble and oak textures (`public/textures/`).

| File | What |
|---|---|
| `public/models/mall/kit.glb` + `kit.json` | 22 décor pieces (`rack_1..5`, `table`, `gondola`, `scarfbay_1..5`, `hangbay_1..4`, `reardisplay`, `counter`, `brandpanel`, `plant`, `pendant`, `fitting`). Origin at footprint centre on the floor. |
| `public/models/mall/store.glb` + `store-anchors.json` | The whole boutique as one walkable store (`?boutique`), with fixture positions and colliders. |

Rebuild after editing the .blend file. This needs Blender 4.2 LTS: put the portable build in `tools/`, or set `BLENDER=path\to\blender.exe`.

```bash
node scripts/bake-store.mjs
```

The command runs in stages:

1. **prep:** decimate, tag groups.
2. **bake:** architecture, ceiling, fixtures, soft goods and hardware. Each group is joined into a single object, smart-UV packed, Cycles-baked on the GPU (CUDA), denoised with OpenImageDenoise and saved with the scene's AgX look.
3. **export:** writes `store.glb`.
4. **kit:** cuts the pieces out and writes `kit.glb`.

It takes about 10 minutes on an RTX 4050. Each stage runs in a fresh Blender process and is retried if Blender crashes. Working files go to `tools/bake-work/`, which is not deployed.

Useful variants:

- **Quick look:** `--res 1024 --samples 16`.
- **Resume:** `--from bake:soft` or `--from kit`.

Where things are configured:

- **Furnishing per section** (which pieces go where, by display type): `furnishWithKit` in `src/world/shop.ts`.
- **Kit cut-out boxes:** `kit_pieces()` in `scripts/blender/export_store.py`.
- **Turning the kit off:** without `kit.glb`, or with `?nokit`, shops fall back to the procedural props.

## Characters

All characters (models, staff, stylists, cashier, concierge, crowd, your third-person avatar) come from one procedural rig: `createCharacter(look, seed)` in `src/actors/character.ts`, with looks from `src/actors/palette.ts`.

- **Modesty rule (no exceptions):** abaya / long dress, or long sleeves with a long skirt or wide trousers. Legs always use the bottoms colour, the neck is a turtleneck in the top colour, and only the face and hands are skin. About 80% of models, 85% of staff and 85% of shoppers wear hijab.
- **Never unclothed, not even for one frame:** the root stays hidden while the character is assembled, and clothing, body and headwear are merged per bone into one vertex-coloured mesh (`bake.ts`) before it is shown. Distant crowd LODs are built from those same merged meshes.
- **Face:** cute and stylised: big eyes with a glint, soft brows, a small nose, lips and a light cheek blush.
- Realistic / GLB human bodies are not used.

| Slot | Expected file | Status |
|---|---|---|
| Props (racks, plants…) | `public/models/props/*.glb` | Procedural in code (`src/world/props.ts`) |
| Store / mall décor | `public/models/mall/kit.glb`, `store.glb` | Baked from the Le Voile boutique scene (see above) |

## Live mall demo

Frontend only: every "live" thing is simulated in the browser. The services live in `src/social/` behind interfaces, so a **Laravel + Reverb** backend can replace the `Mock*` classes without touching the 3D or UI code.

| Interface (`src/social/types.ts`) | Mock today | Later (Laravel + Reverb) |
|---|---|---|
| `PresenceSource` | `MockPresence`: shoppers and their activity, viewer counts, purchases every 25–40 s | Presence channel per mall |
| `StaffChatService` | `MockStaffChat`: keyword-based Egyptian replies, product cards, full looks | Private channel per conversation, staff dashboard |
| `DealsService` | `MockDeals`: group deal (starts 7/10), flash sales (first ~45 s after entering, then every 3 min, 2 min long) | Deals API + broadcast events |
| `IdentityService` | `MockIdentity`: phone + OTP, **any 4 digits work** | Sanctum + SMS OTP |

Customers never chat with each other: chat is only between the customer and shop staff.

**What's in the mall:**

- **Crowd (20–50 shoppers):** cartoon and modest, with these states:
  - browsing: walking between shops and stopping at displays;
  - buying: queueing at the cashier, then leaving through the doors with a shopping bag;
  - playing: at the wheel, or treasure hunting;
  - styling: at a Styling Studio mirror, with outfit colours changing every few seconds;
  - friends: groups of 2–3 standing together.
- **"What she's looking at":** get close to a browsing shopper and a card with the product appears above her head. Click it (or press E on her) to open that product.
- **Social proof:** "👀 N بيتفرجوا على ده دلوقتي" on the product card, and purchase toasts every 25–40 s ("واحدة من إسكندرية لسه اشترت …").
- **Staff chat:**
  - E on any sales assistant (one in every shop), the concierge or a stylist, or the persistent "محتاجة مساعدة" button;
  - quick replies: sizes, colours, hijab styling, prices, shipping, suggestions;
  - staff-sent products are added to the cart only after you approve them.
- **Styling Studio:** in the Styling Studio slot (end of the west wing). Three stylists with mirrors; a stylist sends a full look (outfit + hijab + accessory) with "ضيفي اللوك كله للسلة".
- **Games:**
  - **Passport:** a stamp per shop visited, +10 coins each (+150 when complete).
  - **Treasure hunt:** 5 glowing logos hidden around the mall, press E to collect, +25 coins each (+100 for all five).
  - **Wheel of fortune:** on the plaza, one spin per session. Prizes: 20 / 50 / 100 / 200 coins, free shipping, or better luck.
  - **Rewards counter** in every shop: spend coins on that brand's discount (100 / 250 / 400 coins → 10 / 20 / 30%). Needs phone + (mock) OTP login; see [122 Coins](#122-coins).
  - Free shipping from the wheel is a coupon: "خديه" asks for phone + (mock) OTP, then saves it and applies it in the cart and the mock checkout. Coupons are single-use.
- **Group deal:**
  - one product, with live boards on the plaza and in front of its shop, plus a HUD chip;
  - fake shoppers join over time; your join completes it, with confetti and 25% off that product.
- **Flash sale:**
  - Web Audio chime plus a banner;
  - 20% off one section for 2 minutes, with a countdown chip ("روحي هناك" teleports you);
  - about 30% of the crowd hurries to that shop.
- **Pricing** (`src/social/pricing.ts`):
  - per line, the best automatic deal applies (flash sale or unlocked group deal, not stacked);
  - then one applied coupon;
  - shipping is EGP 75 unless a free-shipping coupon is applied.

### 2-minute test scenario

1. Open `http://localhost:5173/?fps` and enter the mall. The plaza has shoppers: friends chatting, people at the wheel, a queue at the cashier. Look at the stage: the LED wall and screens cycle slides.
2. Walk to the **stage screen** and press **E** (or tap it) to open its content. On a phone, **tap the floor** to walk there (a ring marks the target) instead of using the joystick.
3. Press E on the **wheel** → spin → coins are added to your balance (floating "+N"). Free shipping needs "خديه" → any name, `01001234567`, any 4 digits.
4. Click **محتاجة مساعدة** → "اقترحي عليا" → approve the suggested product → it lands in the cart.
5. Enter a wing (West: Le Voile, the real boutique). The 🛂 passport stamps each shop you enter (+10 coins). Open a product on a fixture: the camera eases to centre it.
6. Step close to a shopper standing in a shop: the "بتتفرج على …" card shows above her head; click it.
7. At a shop's **rewards counter**, press E → log in (mock OTP) → redeem 100 coins for 10% off that brand.
8. Open the **group deal** board on the plaza → "انضمي للصفقة"; fake shoppers keep joining until 10/10 (confetti, 25% off). At ~45 s the **flash sale** chime appears → "روحي هناك".
9. Teleport (T) to the **Styling Studio** → E on a stylist → "عايزة لوك لخروجة" → "ضيفي اللوك كله للسلة".
10. Open the cart: flash / group / brand-coupon discounts, shipping and total. Go to the plaza cashier and place the mock order.

To trigger things on demand (dev / `?debug`): `lv.social.deals.nextFlash = 0`, `lv.social.deals.nextJoin = 0`, `lv.social.presence.nextPurchase = 0`.

## Performance notes

- **Quality tiers:** Low / Medium / High, auto-detected from device class and GPU, then stepped down at runtime if FPS stays under 28 (`FpsGovernor`). Manual override is in Settings.
- **Draw calls:** static geometry is instanced (`Batcher`). Each character is merged per bone with vertex colours, with the hijab merged into the head and spine bones (~10 draw calls). Shop interiors and their characters are culled when not visible.
- **Crowd LOD (`src/world/crowd.ts`):**
  - only the nearest on-screen shoppers are full animated rigs (High 8 within 11 m, Medium 6 within 9 m, Low 4 within 7 m), and rigs beyond 8 m animate at a third of the rate;
  - every other visible shopper is a static LOD mesh drawn in **one `BatchedMesh` call**, plus one `InstancedMesh` for all their shadows;
  - shoppers off-screen, inside a culled shop, or (when you're in a shop) outside it are not drawn.
- **Measured** (desktop only, High tier, 1280×760, headed Edge, `?nolock`, fresh page per query; avg draw calls / fps):

| Area | `?nodemo` | `?crowd=50` |
|---|---|---|
| Plaza (stage view) | 166 / 34-50 | 188-229 / 32-46 |
| North wing | 282 / 28-47 | 285 / 34-44 |
| West wing | 195 / 67-76 | 197 / 63-100 |
| Inside a shop (Nourhan) | 168 / 32-36 | 168-190 / 35-51 |

  FPS varies a lot between runs when other windows render (the ranges above are 2-3 runs). Always-visible kit plants are batched (`Kit.placeBatched`), and a screen's fade layer is hidden between slides.
- **Plaza stage and corridor finishing:** the plaza has a stage with an LED wall, live screens and seating (`plaza.ts`). Each wing gets its own finishing in `corridor.ts`: floor inlays, islands with planters, pendant lights, ceiling coves, column screens, storefront frames, brand doormats, a wing portal, a directory board, wayfinding signs, an end-wall collage and wall shade. Screens share feeds (`screens.ts`, `screenSlides.ts`). Contact shadows and additive glows are instanced (`decals.ts`, `glow.ts`), and glows are hidden on Low.
- **Mobile:** product images load as WebP (see Image pipeline) and the Le Voile boutique preload is skipped on touch devices. The numbers above are desktop/High only; phones are not yet measured. Design: `docs/superpowers/specs/2026-10-05-mobile-performance-design.md`.
- **Lighting:** image-based lighting plus two lights, with blob shadows instead of shadow maps. Planar floor reflections are High only: the plaza mirror runs while the plaza floor is in view, a corridor mirror only in the wing you are in. Mirrors render `MIRROR_LAYER` alone (architecture, lights, lightboxes), so a mirror pass is a few dozen draw calls.
- **Bloom (High only):** masked bloom on the light sources through an EffectComposer (`post.ts`, `bloom.ts`), about 14 fullscreen passes. On an integrated GPU (Intel UHD) it costs about 10 ms a frame, which is why High is auto-selected only on dedicated GPUs; if High still drops under 28 fps, the governor steps down to Medium, which removes the composer and the mirrors. `?nobloom` turns it off on High. Bloom also stays off (with a console warning) on any three.js release other than the one it was checked against (`BLOOM_THREE_REVISION`).
- **Textures:** product images load lazily per shop as you approach and are downscaled to 512 px (Low) or 1024 px.
- **No WebGL:** a 2D catalogue fallback with links to the website.
