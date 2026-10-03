# Le Voile — Virtual Store

A walkable 3D fashion mall for **Le Voile** (levoilestores.com). Visitors walk through the shops, look at styled models and products, add to cart, pay at the cashier (mocked for now) and leave through the doors. It's frontend-only and builds to a static `dist/`. The data and checkout sit behind interfaces, so Shopify can replace them later.

- **Stack:** Vite + TypeScript, Three.js (plain, no React), Zustand (vanilla) for state, and an HTML/CSS HUD over the canvas.
- **Languages:** Arabic (default, RTL) and English, switchable at any time.
- **Assets:** everything 3D is generated in code (mall, props, signage, characters). Optional GLB models can replace the procedural ones, and the app never blocks on missing assets.

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
  world/                   mall shell, shops, cashier desk, people, props, signage, materials
  actors/                  procedural character, hijab/hair, palettes, GLB character path
  player/                  input (keyboard/mouse), touch joystick, player movement/camera
  interact/                raycast interaction
  ui/                      HUD, product card, cart, checkout, menu, minimap, screens
  audio/                   generative ambient music + UI sounds (Web Audio, no files)
public/
  products/<id>/1.jpg …    product photos; cutout.png (valid cutouts only)
  brand/                   logo.png, logo-trim.png, logo-white.png
  models/{characters,props,mall}/   optional GLBs (see below)
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

## Characters and models

| Slot | Expected file | Status | Recommended source (CC0) |
|---|---|---|---|
| Base character | `public/models/characters/base.glb` | Not provided; procedural characters in use | Quaternius "Universal Base Characters" (CC0), Kenney "Mini Characters" (CC0), or any humanoid exported from Mixamo |
| Props (racks, plants…) | `public/models/props/*.glb` | Procedural in code (`src/world/props.ts`) | Kenney "Furniture Kit" (CC0), Quaternius "Ultimate Furniture" (CC0) |
| Store / mall shell | `public/models/mall/*.glb` | Procedural in code (`src/world/mall.ts`) | Baked export of the Le Voile boutique scene (in progress) |

**Using a GLB character:** export a rigged humanoid as glTF Binary with Draco compression. It needs a bone whose name contains `Head` (and ideally `Neck`) and, optionally, an animation clip named `*Idle*`. Save it as `public/models/characters/base.glb`.

On load, `src/actors/glbCharacter.ts` detects it and attaches the procedural hijab or hair to the head bone. The cap goes on `Head` and the drape on `Neck`, so one body still yields varied hijabi and non-hijabi models. Staff vests and outfit tints apply only to the procedural body; GLB bodies keep their own materials. If the file is missing or fails to load, everything falls back to the procedural characters.

## Performance notes

- **Quality tiers:** Low / Medium / High, auto-detected from device class and GPU, then stepped down at runtime if FPS stays under 28 (`FpsGovernor`). Manual override is in Settings.
- **Draw calls:** static geometry is instanced (`Batcher`). Each character is merged per bone with vertex colors (~12 draw calls). Shop interiors and their characters are culled when not visible. Typical counts are ~140 in the atrium, ~110 on the boulevard and ~40–80 inside a shop.
- **Lighting:** image-based lighting plus two lights, with blob shadows instead of shadow maps. The planar floor reflection is enabled on High only, and only while the atrium is in view.
- **Textures:** product images load lazily per shop as you approach and are downscaled to 512 px (Low) or 1024 px.
- **No WebGL:** a 2D catalogue fallback with links to the website.
