# Mobile performance: design

**Status:** decided by the controller overnight (2026-10-05); the user asked for mobile performance work.

## Facts (measured)

| Asset | Size |
|---|---|
| Product photos | 86 JPEG ≈ 17 MB, 1080×1306 |
| Cut-outs | 45 PNG ≈ 29 MB |
| Décor models | `kit.glb` 4.1 MB + `store.glb` 4.1 MB |

- Product images load per shop, but each shop pulls full-size files (≈ 0.2–0.6 MB each), and PNG cut-outs are heavy.
- The GPU only ever uses ≤ 512–1024 px of these images (`loadProductTexture(url, maxSize)`).

## Decisions

1. **Web-sized derivatives** built by a script (`scripts/optimize-images.py`, Pillow in `.venv`):
   - **Photos:** `/products/<id>/<n>.webp`, longest side 1024, quality 80.
   - **Cut-outs:** `cutout.webp` (WebP with alpha), longest side 1024, quality 82.
   - **Small variants** for 3D cards and screens: `<n>.s.webp` / `cutout.s.webp`, longest side 512.
   - Originals stay in the repo as the source, but they're excluded from the build output (see 3).
2. **Runtime selection** (`src/engine/textures.ts` / `src/data/types.ts`):
   - a helper `webImage(url, size: 'small' | 'large')` maps `/products/x/1.jpg` → `/products/x/1.webp` or `1.s.webp`;
   - `cutout.png` maps to `cutout.webp` / `cutout.s.webp`;
   - every non-`/products/` URL (data: placeholders, CDN) passes through unchanged.
   - **3D textures** (`loadProductTexture` with maxSize ≤ 512) use the small variant.
   - **The product sheet and cart** (DOM) use large.
   - **Fallback:** if a WebP fails to load, retry the original URL once.
3. **Build output:** a Vite plugin (in `vite.config.ts`) deletes `dist/products/**/*.{jpg,png}` after the build when matching `.webp` files exist, so the deploy ships only WebP.
   - The dev server still serves both.
   - Expected `dist/products` size: under 8 MB.
4. **Décor GLBs:** keep them as they are for this round. They're already Draco-compressed and lazy (the kit loads at boot; Le Voile's store preloads after boot). KTX2 needs a toolchain this machine doesn't have, so it's a roadmap item.
5. **Mobile runtime:**
   - on Low tier, cap `textureMax` at 512 (already the case);
   - on touch devices, don't preload the Le Voile store GLB until the player is within 40 m of its shop.
   - The crowd defaults stay.

## Verification

- The script is idempotent and reports total sizes before and after.
- Unit test for `webImage()` mapping.
- `npm run build`, then report the `du -sh dist` and `dist/products` sizes.
- Playwright: the network log for one shop visit shows `.webp` requests and no `.jpg`/`.png` from `/products`; the product sheet shows the large WebP; there are no console errors.
