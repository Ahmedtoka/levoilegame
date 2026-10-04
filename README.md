# Le Voile — Virtual Store

A walkable 3D fashion mall for **Le Voile** (levoilestores.com). Visitors walk through the shops, look at styled models and products, add to cart, pay at the cashier (mocked for now) and leave through the doors. It's frontend-only and builds to a static `dist/`. The data and checkout sit behind interfaces, so Shopify can replace them later.

- **Stack:** Vite + TypeScript, Three.js (plain, no React), Zustand (vanilla) for state, and an HTML/CSS HUD over the canvas.
- **Languages:** Arabic (default, RTL) and English, switchable at any time.
- **Assets:** everything 3D is generated in code (mall, props, signage, characters). The store décor comes from an optional baked kit (`kit.glb`), and the app never blocks on missing assets.
- **Characters:** stylised, friendly cartoon people, all procedural. **Modesty rule (no exceptions):** every character is fully and modestly dressed (abaya / long dress, or long sleeves with a long skirt or wide trousers). Only the face and hands are skin; legs and neck are always covered, and most wear hijab. Clothing is merged into the same mesh as the body, and a character stays hidden until it's fully built, so a body can never render without clothes.
- **Live mall demo:** a simulated crowd, staff chat, group deal, flash sales and discount games. Everything is mocked in the browser behind interfaces that a Laravel + Reverb backend can replace later (see [Live mall demo](#live-mall-demo)).

## Run locally

Requirements: Node.js ≥ 20.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. Useful URL flags:

| Flag | Effect |
|---|---|
| `?fps` | FPS / draw-call / quality readout |
| `?nolock` | Drag-to-look instead of pointer lock (embedded previews, iframes) |
| `?debug` | Exposes `window.lv` (game, store, engine) in production builds; always on in dev |
| `?boutique` | Walk the single baked Le Voile boutique instead of the mall |
| `?nokit` | Mall with procedural props instead of the baked décor kit |
| `?crowd=N` | Number of simulated shoppers (0–80). Default by quality: High 50, Medium 30, Low 20 |
| `?nodemo` | Turns off every simulation: crowd, purchase toasts, viewer counts, group deal and flash sales. Staff chat and the games stay |

Production build and local preview:

```bash
npm run build
```

```bash
npm run preview
```

## Controls

| Desktop | Mobile / tablet |
|---|---|
| WASD / ↑↓ move, ←→ turn | Left half: floating joystick (push far to run) |
| Mouse look (click Enter to lock the pointer) | Right half: drag to look |
| Shift run · E or click interact | Tap a product / person, or the ✋ button |
| C cart · M minimap · V camera (1st/3rd person) · T or Tab teleport menu | Top bar buttons |
| Esc releases the mouse / closes a panel | |

## Test on a phone (temporary public URL)

The dev server already listens on your LAN (`server.host = true`). On the same Wi-Fi, open `http://<your-PC-IP>:5173`.

For a public HTTPS URL (needed for some phone browsers), use a Cloudflare quick tunnel. Install `cloudflared` once (on Windows: `winget install --id Cloudflare.cloudflared`), start the dev server, then run:

```bash
cloudflared tunnel --url http://localhost:5173
```

It prints a `https://….trycloudflare.com` link; open it on the phone. The tunnel lives only while the command runs. Vite may reject the unknown host. If it does, run `npm run build && npm run preview -- --host` and tunnel port 4173 instead, or add the tunnel host to `server.allowedHosts` in `vite.config.ts`.

## Deploy to Cloudflare Pages

1. Push the project to GitHub (or GitLab).
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Use framework preset **None**, build command `npm run build`, output directory `dist`, and set the environment variable `NODE_VERSION=20` (or newer).
4. Deploy. Each push redeploys.

The same `dist/` works as-is on Netlify or Vercel (build `npm run build`, publish `dist`). Assets use absolute paths (`/products`, `/brand`, `/models`), so deploy at a domain root, not a sub-folder.

Direct upload without Git:

```bash
npx wrangler pages deploy dist --project-name levoile-virtual-store
```

## Project structure

```
src/
  main.ts                  boot: catalog → engine → world → UI
  game.ts                  loop, controls state, zones, cashier/exit triggers, teleport
  config/                  brand, layout (procedural mall), sections (per-section style)
  data/                    products.json, types, defaults (sizes/colors TODO), providers/
  services/                CheckoutService (mock + Shopify)
  engine/                  renderer, quality tiers, batcher (instancing), colliders, textures
  world/                   mall shell, shops, cashier desk, people, props, signage, materials,
                           crowd (simulated shoppers + LOD), liveMall (studio, wheel, treasures, deal boards)
  actors/                  procedural character, hijab/hair, palettes
  social/                  live-mall services: presence, staff chat, deals, identity (mocks), pricing, games
  player/                  input (keyboard/mouse), touch joystick, player movement/camera
  interact/                raycast interaction
  ui/                      HUD, product card, cart, checkout, menu, minimap, screens, social (chat, wheel, claim, live HUD)
  audio/                   generative ambient music + UI sounds (Web Audio, no files)
public/
  products/<id>/1.jpg …    product photos; cutout.png (valid cutouts only)
  brand/                   logo.png, logo-trim.png, logo-white.png
  models/{props,mall}/     optional GLBs: décor kit, baked boutique
  draco/                   Draco decoder for compressed GLBs
scripts/                   fetch-assets.mjs, remove-bg.py (asset pipeline)
```

## Add a section or product

Everything comes from `src/data/products.json`.

**Add a product:** add an object to `products` (see the contract in `CLAUDE.md`), put its photos in `public/products/<id>/1.jpg, 2.jpg…`, and add its id to the section's `productIds`. `cutout` is optional (`null` falls back to `images[0]`). Set `modelOutfit: true` to give it a showcase model and standee.

**Add a section:** add an entry to `sections` (with `id`, `title`, `titleAr` and `productIds`). The layout generates a new shop on the boulevard automatically (shops alternate left/right), and it appears on the directory, minimap and teleport menu.

Optionally, style it in `src/config/sections.ts`:

```ts
'new-section': { display: 'shelf', tint: '#f1e2ea', outfit: 'skirt', sizes: 'free', collection: 'shopify-collection-handle' },
```

- `display` is `rack` (hanging panels), `shelf` (framed cards on two shelves), `gallery` (framed wall art) or `boxes` (vitrines on plinths).
- Without an entry, the section gets a brand-derived pastel tint and a `rack` display.

To refresh images from Shopify's CDN, run `node scripts/fetch-assets.mjs` (it reads `products.remote.json`). For cutouts, run `.venv/Scripts/python scripts/remove-bg.py --only <id>`, then check the result before adding the `cutout` path.

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

Customers never chat with each other: chat is only between the customer and Le Voile staff.

**What's in the mall:**

- **Crowd (20–50 shoppers):** cartoon and modest, with these states:
  - browsing: walking between shops and stopping at displays;
  - buying: queueing at the cashier, then leaving through the doors with a Le Voile bag;
  - playing: at the wheel, or treasure hunting;
  - styling: at a Styling Studio mirror, with outfit colours changing every few seconds;
  - friends: groups of 2–3 standing together.
- **"What she's looking at":** get close to a browsing shopper and a card with the product appears above her head. Click it (or press E on her) to open that product.
- **Social proof:** "👀 N بيتفرجوا على ده دلوقتي" on the product card, and purchase toasts every 25–40 s ("واحدة من إسكندرية لسه اشترت …").
- **Staff chat:**
  - E on any sales assistant (one in every shop), the concierge or a stylist, or the persistent "محتاجة مساعدة" button;
  - quick replies: sizes, colours, hijab styling, prices, shipping, suggestions;
  - staff-sent products are added to the cart only after you approve them.
- **Styling Studio:** in the lounge slot at the end of the boulevard. Three stylists with mirrors; a stylist sends a full look (outfit + hijab + accessory) with "ضيفي اللوك كله للسلة".
- **Games:**
  - **Section passport:** a stamp per section, 9/9 → 15%.
  - **Treasure hunt:** 5 glowing Le Voile logos hidden around the mall, press E to collect, 5/5 → 20%.
  - **Wheel of fortune:** at the entrance, one spin per session. Prizes: 5% / 10% / 15% / free shipping / gift inner cap / better luck.
  - Every prize shows at once. "خديه" asks for phone + (mock) OTP, then saves the coupon and applies it in the cart and the mock checkout. Coupons are single-use.
- **Group deal:**
  - one product, with live boards in the atrium and in front of its shop, plus a HUD chip;
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

1. Open `http://localhost:5173/?fps` and enter the mall. The atrium has shoppers: friends chatting, people at the wheel, a queue at the cashier.
2. Press E on the **wheel** (right of the entrance) → spin → if you win, "خديه" → any name, `01001234567`, any 4 digits → the coupon is saved (🎟️ chip).
3. Click **محتاجة مساعدة** → tap "اقترحي عليا" → approve the suggested product → it lands in the cart.
4. Walk into the boulevard. The 🛂 passport chip stamps each shop you enter. Watch for purchase toasts.
5. Step close to a shopper standing in a shop: the "بتتفرج على …" card shows above her head; click it.
6. Open the **group deal** board (atrium, near the boulevard mouth) → "انضمي للصفقة". Fake shoppers keep joining; when it hits 10/10 you get confetti and 25% off.
7. At ~45 s the **flash sale** chime and banner appear → "روحي هناك" → shoppers hurry into that shop.
8. Teleport to the **Styling Studio** (menu → lounge) → E on a stylist → "عايزة لوك لخروجة" → "ضيفي اللوك كله للسلة".
9. Open the cart: the flash / group / coupon discounts, shipping and total. Go to the cashier and place the mock order.

To trigger things on demand (dev / `?debug`): `lv.social.deals.nextFlash = 0`, `lv.social.deals.nextJoin = 0`, `lv.social.presence.nextPurchase = 0`.

## Performance notes

- **Quality tiers:** Low / Medium / High, auto-detected from device class and GPU, then stepped down at runtime if FPS stays under 28 (`FpsGovernor`). Manual override is in Settings.
- **Draw calls:** static geometry is instanced (`Batcher`). Each character is merged per bone with vertex colours, with the hijab merged into the head and spine bones (~10 draw calls). Shop interiors and their characters are culled when not visible.
- **Crowd LOD (`src/world/crowd.ts`):**
  - only the nearest on-screen shoppers are full animated rigs (High 8 within 11 m, Medium 6 within 9 m, Low 4 within 7 m), and rigs beyond 8 m animate at a third of the rate;
  - every other visible shopper is a static LOD mesh drawn in **one `BatchedMesh` call**, plus one `InstancedMesh` for all their shadows;
  - shoppers off-screen, inside a culled shop, or (when you're in a shop) outside it are not drawn.
- **Measured** (desktop, High tier, 1280×760, `?fps`; avg draw calls / fps):

| Area | `?nodemo` | `?crowd=20` | `?crowd=30` | `?crowd=50` |
|---|---|---|---|---|
| Atrium | 133 / 45–57 | 191 / 61 | 191 / 55 | 212 / 40–54 |
| Boulevard | 272 / 37–46 | 328 / 48 | 328 / 46 | 350 / 47 |
| Inside a shop | 87 / 78–85 | 87 / 86 | 87 / 82 | 150 / 82 |
- **Lighting:** image-based lighting plus two lights, with blob shadows instead of shadow maps. The planar floor reflection is enabled on High only, and only while the atrium is in view.
- **Textures:** product images load lazily per shop as you approach and are downscaled to 512 px (Low) or 1024 px.
- **No WebGL:** a 2D catalogue fallback with links to the website.
