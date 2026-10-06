# Shop tiers (Flagship / Standard / Compact): design

**Status:** agreed with the user on 2026-10-06 in a visual brainstorm. The user chose the display style, the sizes and the wing map. They then asked the controller to settle the look and build it overnight ("اعمل كل حاجة واعتمد الشكل"). The look decisions in §4 are the controller's.

Mockups: `.superpowers/brainstorm/1302-1791243805/content/` (`product-display.html`, `shop-tiers.html`, `wing-map-v2.html`; git-ignored).

## 1. Goals

- Big brands get big shops, small brands get small ones, and every shop looks like a premium boutique, not a catalogue on a wall.
- No lag on mid-range phones: the cost of a shop doesn't grow with its product count.
- A shop shows its **best** products. The full catalogue is one tap away on an in-shop "All products" screen.

Out of scope: real package billing, bespoke décor for brands other than Le Voile, and walking/animation changes.

## 2. Decisions taken with the user

1. **Display style B, "campaign boutique".** Apparel photos include the model, so garments aren't hung on hangers. Products show in:
   - **lightboxes**: backlit framed photos on the walls, one product each;
   - **life-size standees** on round plinths;
   - **islands and plinths** for bags, shoes and accessories (their cut-outs are product-only).
2. **Tier sizes** (frontage × depth):

| Tier | Size | Physical products | Extras |
|---|---|---|---|
| Flagship | 24 × 16 m | ~55 | Hero campaign wall, 2 display windows (4 standees), 3 islands, fitting room, "All products" screen |
| Standard | 12 × 16 m | ~32 | Hero, 1–2 display windows, 1 island, "All products" screen |
| Compact | 6 × 10 m | ~10 | Small hero, 1 window standee, "All products" screen |

3. **How tiers are assigned:** by paid package plus a minimum catalogue size (Flagship 50+, Standard 25+, Compact any). For the demo, `BrandDef.tier` is set by hand. Le Voile, Pistage, Nourhan and DND are Flagship by exception.
4. **Wing map:**

| Wing | Left side (from the plaza) | Right side (from the plaza) | Length |
|---|---|---|---|
| West | Le Voile F · Noha S · BezraVoga S · Soon 4 C + Pop-up C | Scarfest F · Nourhan F · Rwan S | 60 m |
| North | Pistage F · DND F · Lounge S | Jeno F · Fashion Avenue S · Axis C + The Cause Wear C · seating nook | 60 m |
| East | Slip & Go F · HashBag S · ProMax C + Soon 1 C | Nanosh F · Styling Studio S · Soon 2 C + Soon 3 C | 48 m |

5. **Le Voile Flagship:**
   - The plaza-side half is the existing baked boutique, unchanged (12 × 16).
   - The far half is a style-B lightbox hall: hero campaign, lightboxes, standees.
   - Both halves sit behind one continuous 24 m fascia. The 45-product catalogue is an accepted exception.
6. **Pop-up unit:** a Compact unit for a guest brand that rotates monthly. It's configured by `POPUP_BRAND_ID` (null today). When null, it shows a branded "122 Pop-up · Book this space" kiosk.

## 3. Layout model

- `BrandDef` gains `tier: 'flagship' | 'standard' | 'compact'`. `depth` is removed, because tier dimensions replace it.
- `TIERS = { flagship: { front: 24, depth: 16 }, standard: { front: 12, depth: 16 }, compact: { front: 6, depth: 10 } }`.
  - Amenities (`studio`, `lounge`) are Standard.
  - Coming Soon units and the Pop-up are Compact.
  - The filler **nook** is a 4 m-deep open bay that fills whatever frontage is left.
- `WingDef` changes from `slots` to `left: string[]` and `right: string[]`.
  - Units on each side are packed by cumulative frontage from the plaza mouth.
  - `wing.len` = the longer side's frontage. If the shorter side ends short, a nook fills the gap with a bench and a planter. The nook isn't a shop and has no zone.
- `ShopLayout` gains:
  - `tier`
  - `front` (frontage in m) and `depth`
  - `z0` / `z1` (wing-local span along the corridor)

  `index`, `side`, `rect`, `entrance`, `yaw` and `center` keep their meaning. `entrance` is the centre of the unit's frontage.
- Everything that assumed "slot k, side k % 2, row k / 2, 12 m rows" moves to the unit list: `layout.ts`, `mall.ts` (back walls, separators, shopfront openings), `corridor.ts`, `banners.ts` and `hud.ts`.
  - Corridor features that used rows (star inlays, islands, pilasters, wainscot) work from **unit boundaries**: each side has its own boundary list, and there's a combined list for centre-line features.
- Separators between units are as tall as the deeper neighbour. Back walls follow each unit's depth.
- **Pure, unit-tested layout maths** goes in `src/config/layoutMath.ts`:
  - packing
  - wing length
  - rect overlap
  - unit boundaries
  - opening spans per tier

## 4. The look (controller decisions)

The look is one mall-wide luxury palette, continuous with the existing décor: cream plaster, oak, bronze and grey marble. Each brand's identity shows as a **restrained accent** (brand colour on less than 10 % of surfaces):
- the fascia and blade sign (existing);
- a thin accent line on the hero frame;
- section plaques;
- the island inlay strip;
- the rewards counter (existing).

**Lightbox module** (the unit everything else is built around):
- Photo area 0.86 × 1.04 m (the product photo ratio 1080:1306).
- A 3 cm warm-white backlit margin around the photo.
- A 4 cm bronze frame, 8 cm deep.
- Centre height 1.62 m, pitch 1.10 m along the wall.
- A cream price plaque under each lightbox (title, then price; sale price with the old price struck through and "-x%"). It's printed in the same atlas, so it costs nothing extra.
- Lightboxes are grouped by section. Each group has a **section plaque** above it: a cream panel with bronze English text plus the Arabic name, at y 2.55 m.
- The photo is `images[1] ?? images[0]`, the campaign shot. The lit look comes from an unlit (`MeshBasicMaterial`) atlas registered for bloom at the lightbox weight.

**Hero campaign wall:**
- Flagship 3.2 × 2.0 m, Standard 2.4 × 1.5 m, Compact 1.6 × 1.0 m.
- Centred on the back wall, with the brand's best wide photo (cover-cropped).
- A bottom band in the brand colour with the logo or monogram and the brand name.
- Bronze frame, bloom-registered.

**Standees:**
- The existing cut-out standee, restyled: no white backing card.
- A round grey-marble plinth (r 0.45, h 0.12) with a bronze edge.
- A soft cone of light from above (Medium/High only).

**Islands** (Flagship 3, Standard 1, Compact 1 small):
- An oak table (procedural; the kit table if the kit is present) with a bronze edge and a brand-colour inlay strip.
- Products whose cut-out is **not tall** (trimmed aspect < 1.45: bags, shoes, boxes, folded scarves) stand on small cream risers as alpha cut-outs.
- For apparel-only brands, islands carry easel cards (existing `easelRow`).

**"All products" screen:**
- A portrait 0.9 × 1.6 m digital screen in a bronze frame by the counter.
- It shows the brand name, "All N products · كل المنتجات" and a 3 × 3 thumbnail mosaic.
- Interacting opens a new HUD overlay **`brandCatalog`**: the brand's sections as tabs and a product grid, each product opening the existing product sheet. It goes through `paint()`, with strings in both languages.

**Fitting room** (Flagship only, décor):
- Two booths with oak frames and plum curtains, a "FITTING · البروفة" sign and a pouf.
- Collider only, no interaction.

**Display windows:** reuse the existing storefront window design, parameterised by unit width:

| Tier | Windows | Opening |
|---|---|---|
| Flagship | 2 windows, 2 standees each | 6 m |
| Standard | 2 windows, 1 standee each (as today) | 6 m |
| Compact | 1 window with 1 standee | 3.4 m |

**Lighting:**
- A warm linear slot light runs along the ceiling edge over each lightbox wall (an emissive strip, batched). It replaces the 6 square ceiling panels.
- One downlight row lights the islands.
- No real lights are added.

**Product selection:**
- Lightbox slots are shared between sections in proportion to section size (minimum 2 per section, catalogue order = featured order).
- Standees prefer `modelOutfit`, then tall cut-outs.
- Islands take non-tall cut-outs.
- A product never appears twice on lightbox walls. Unused lightbox positions are left out and the group re-spaces, so the wall never looks empty.

## 5. Performance budget

- **One atlas per shop for all its lightboxes, including plaques.**
  - 2048² on High/Medium: cells 288 × 400 (7 × 5 = 35 per atlas, so a Flagship uses 2).
  - 1024² on Low: cells 144 × 200.
  - Cells are drawn from the small WebP (512) through `imagePacer`, so loading spreads across frames.
- **Draw calls inside a shop** (the static fixtures are batched through `engine/batcher.ts`):
  - lightboxes: 1–2;
  - section plaques: 1 atlas mesh;
  - standees: 1 merged mesh with a shared 2-up/4-up canvas, like the window figures;
  - island cut-outs: 1;
  - hero: 1; screen: 1.
  - Target ≤ 20 per shop interior (Flagship ≤ 30).
- **Gating:** interiors keep the 19/22 m hysteresis gate, measured from the nearest point of the unit's frontage (not its centre), so long Flagships don't pop. Lazy loading starts within 34 m of the nearest frontage point.
- **Hit tests:** one invisible plane per product (the `cardPanel` pattern), a hover outline per product, and the existing distance limit.
- **Low tier:** no cones or halos, atlas 1024, the standee canvas at 512 per figure.
- **Acceptance:** with `?fps`, walking the length of each wing at the emulated mobile preset (Low) stays at or above the current baseline FPS, and `renderer.info.render.calls` inside any Flagship is at most baseline + 30. Both are measured before and after and reported.

## 6. Code structure

| Unit | Responsibility |
|---|---|
| `src/config/mall.ts` | `BrandDef.tier`, `TIERS`, `WINGS` (left/right), `POPUP_BRAND_ID`, the `popup` and nook ids |
| `src/config/layoutMath.ts` (new, pure) | Packing, boundaries, opening spans, product selection maths (allocation per section) |
| `src/config/layout.ts` | `buildLayout` built on layoutMath |
| `src/world/mall.ts` | Shell walls, separators and shopfront openings per unit |
| `src/world/corridor.ts` | Finishing per unit boundary |
| `src/world/boutiqueShop.ts` (new) | Style-B tier interior: lightbox walls, hero, standees, islands, screen, fitting room, slot lights |
| `src/world/lightbox.ts` (new) | Lightbox atlas builder + plaque drawing + hit planes (shop-agnostic) |
| `src/world/shop.ts` | Storefront parameterised by width/tier; dispatches to bespoke → `boutiqueShop` |
| `src/world/bespoke/levoile.ts` | Baked half offset into the Flagship; the far half built by `boutiqueShop` |
| `src/ui/brandCatalog.ts` (new) + `i18n.ts` | "All products" overlay |

The old `furnishWithKit` and the `rack/shelf/gallery/boxes` displays are no longer used by brand shops. They stay for `?nokit` / `?boutique` until a cleanup pass.

## 7. Testing

- **Unit tests** (`tests/layoutMath.test.ts`):
  - side packing and wing lengths match §2.4 (60 / 60 / 48);
  - no two unit rects overlap, and every rect touches the corridor;
  - every brand in `BRANDS` is placed exactly once;
  - opening spans stay inside the unit;
  - the per-section allocation sums to the slot count and gives each section at least 2 when possible;
  - no duplicate products.
- **`npm run build` and `npm test` pass.**
- **Browser check (dev preview):**
  - teleport into one shop of each tier and into both halves of Le Voile;
  - screenshot each;
  - the console shows no errors;
  - "All products" opens and a product opens from it;
  - mobile preset screenshots of a Flagship and a Compact;
  - FPS and draw-call numbers before and after (§5).

## 8. Changes during implementation

1. Compact fronts use glass sidelights flush with the wall, and the compact standee stands inside behind one. A projecting window does not fit: a 6 m front can't hold a 3.2 m opening plus windows.
2. Brand shop interiors get a cream ceiling with a 0.9 m soffit, slot lights and spot cans. The dark mall slab read as a black void inside shops.
3. Islands show tall apparel cut-outs as mounted prints instead of tiny figures.
4. Corridor screen totems stand only at unit boundaries on the 12 m grid.
5. `furnishWithKit` and the rack / shelf / gallery / boxes displays were removed (tsc flagged them unused), contrary to §6's "kept until a cleanup pass". `DisplayKind` / `SectionStyle.display` and the kit's rack / bay pieces are now unused and are left for the cleanup pass.
