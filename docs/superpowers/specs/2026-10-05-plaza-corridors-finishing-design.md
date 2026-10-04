# Plaza and corridors finishing: design

**Status:** approved in chat (2026-10-05). Approach C (hybrid): procedural structure in code + baked kit plants + fake contact shadows + live screens.
**Scope:** the 122 Mall plaza (events stage) and the three wing corridors (warm luxury). Shops, lighting bake, controls and product display are separate later projects.

## Goals

- The plaza and corridors look finished and premium, in the same warm palette as the Le Voile boutique: cream, oak, bronze, marble, warm light.
- A central **events stage** with a live LED screen becomes the mall's meeting point and its main ad surface.
- The corridors get real finishing: floor inlays, islands with seating, pendant lights, column screens, storefront framing, wayfinding, and end walls.
- Performance stays within budget:
  - plaza ≤ 220 draw calls;
  - wing ≤ 300 draw calls;
  - about 50 FPS on desktop (High tier);
  - mid-range phones ≥ 30 FPS.

## Non-goals

- Baking lighting in Blender (that's the graphics project; the layout must stay bake-friendly).
- Changing shop interiors.
- Changing the wing/plaza geometry from `config/layout.ts`.

## Current state (what we build on)

**Plaza:** x ∈ [−22, 22], z ∈ [−34, 0], ceiling 9 m, skylight x ∈ [−10, 10], z ∈ [−25, −9].

| Feature | Position |
|---|---|
| Floor medallion with the 122 logo | (0, −17) |
| Benches | (±6.2, −17) and (−12, −4.5 / −11.5) |
| Columns | (±8, −6) and (±8, −28) |
| Directory totem | (−3.4, −7.2) |
| Concierge | (4.2, −6.2) |
| Wheel of fortune | (6.2, −3.6) |
| Cashier zone | x 9.5..16.5, z −11.5..−5.4 |
| Group-deal board | (11, −27.5) |
| Treasure logos | (−3.85, −8.15) and (20.6, −32.6) |

**Wings:** each has a local frame (origin = mouth, local −Z away from the plaza).
- Corridor x ±6, ceiling 6 m, with a runner and light strips.
- Shops alternate L/R in 12 m rows; openings ±3 m around each row centre.
- North and west wings are 48 m long; the east wing is 36 m.

## Section 1: Plaza (events stage)

**Layout:**

```
        [ North wing ]
   ┌──────── LED screen (two faces) ────────┐  z ≈ −22.6
   │   stage 9 × 4.5 × 0.45 m               │  z ≈ −21.5 (centre), front edge z ≈ −19.3
   └────────────────────────────────────────┘
      ╲ 3 curved rows of upholstered benches ╱   radius 6.5 / 8 / 9.5 m around (0, −21.5), arc ±48°, centre aisle
        ( 122 floor medallion moved to (0, −9.5) )
   🧭 directory (−3.4, −7.2)   🎡 wheel (6.2, −3.6)   👩 concierge (4.2, −6.2)   💲 cashier (13, −9)
                ═══ entrance (z = 0) ═══
```

**Components** (new module `src/world/plaza.ts`, called from `buildShell` instead of the old medallion and centre benches):

1. **Stage**
   - Platform 9 × 4.5 m at y 0–0.45, with an oak top, a bronze edge band, and a cream front skirt.
   - Two full-width steps on the front (0.15 m each).
   - Warm uplight strips (unlit warm material) under the front lip.
   - One collider for the platform; the steps are walkable (step height < player step).
2. **LED screen**
   - A 7 × 3.94 m (16:9) panel at 2.5–6.44 m height, at z −22.9, on two bronze posts.
   - Both faces are unlit canvas textures:
     - the **front** (+z, towards the entrance) shows the live carousel;
     - the **back** (−z, towards the north wing) shows a brand reel.
   - A thin dark bezel and a bronze frame.
3. **Lighting truss**
   - A bronze box-truss arch over the stage (posts at x ±5, beam at y 7.2).
   - 6 spot cans (dark cylinders).
   - Additive soft light cones from each can onto the stage (Medium/High only, the `fancyDecor` flag).
4. **Audience seating**
   - 3 curved rows of cushioned benches facing the screen, each row split into 2 arcs with a 2 m centre aisle.
   - Built from short straight bench segments (0.9 m) placed along the arc and batched: plum cushion, cream base, bronze legs.
   - A collider per segment.
5. **Planters**
   - 4 large round marble planters (r 0.7 m, h 0.6 m) at the stage corners and front sides.
   - Each holds a kit plant (procedural fallback).
6. **Floor medallion:** the existing ring + disc + 122 floor logo moves to (0, −9.5), between the entrance and the seating.
7. **Column screens**
   - The 4 plaza columns get a portrait screen (1.0 × 1.8 m, at 1.2–3.0 m height) on the face that points to the plaza centre.
   - They show the same carousel (shared textures).
8. **Contact shadows:** soft blob-shadow decals under the stage (stretched), each bench segment row (one stretched decal per arc), planters, and the screen posts.
9. **Crowd "watching" state**
   - A new presence activity `watching`.
   - The crowd target is a spot in front of the seating, facing the screen; up to 6 at once.
   - Hangouts near the stage are added so friends groups gather there too.

**Screen content (new `src/world/screens.ts`, shared by the stage, column and corridor screens):**

- **`ScreenFeed`:** builds slides from the app state, then renders the current slide into a shared canvas texture.
- **Front carousel slides** (6 s each, 0.5 s cross-fade), skipping slides with no data:
  1. Flash sale: brand monogram/logo, "⚡ −20%", the brand name in EN + AR, and an mm:ss countdown.
  2. Group deal: product photo, "👥 7/10", a progress bar, and the time left.
  3. Brand of the hour: the brand fascia art, plus 2 product photos and "اكتشفي <brand>".
  4. Games: "العبي واكسبي 122 Coins": wheel, passport and treasure icons.
  5. Welcome: the 122 logo and "SHOP · PLAY · MEET".
- **Back reel:** brand fascia art rotating every 4 s.
- **Rendering cost:**
  - Canvas 1024×576, redrawn at most 2×/s, and only while the screen is visible (inside the frustum and within 45 m).
  - The cross-fade uses two textures and a material opacity tween; no per-frame canvas redraw.
- **Interaction:** E (or a tap) on the front screen does the current slide's action:
  - flash sale → teleport to that shop;
  - group deal → open the product;
  - brand → teleport to it;
  - games → open the wheel.

## Section 2: Corridors (warm luxury)

All three wings, built per wing in its local frame (new module `src/world/corridor.ts`, called from `buildWing`).

| # | Component | Spec |
|---|---|---|
| 1 | Floor | Remove the runner. Add two bronze inlay lines at x ±1.8 along the whole corridor (0.06 m wide, unlit bronze, 2 mm above the floor). At each row centre, a marble star inlay (an 8-point star, r 1.1 m) with a bronze ring. |
| 2 | Islands | At the row boundaries (local z = −12, −24, −36…, only where both rows exist): a 1.4 × 5.2 m island = two marble planters (with a kit plant) and a cushioned bench between them, centred at x 0. That leaves lanes of 4.8 m on each side. Colliders for the planters and bench. |
| 3 | Pendants | Two rows (x ±2.6) every 6 m: a bronze rod from the ceiling to 4.3 m and a warm glass globe (r 0.18, unlit warm). An additive glow sprite (r 0.6) on each globe (Medium/High only). All instanced. |
| 4 | Ceiling | Replace the centre light strips with recessed cove strips along both corridor edges (unlit warm, x ±5.7), plus a shallow coffer edge (bronze band). |
| 5 | Column screens | On the corridor face of every unit separator (the pilaster, 0.5 m wide): a portrait screen 0.9 × 1.6 m at 1.1–2.7 m. Content cycles that wing's brands (fascia art + product photo); during a flash sale, the sale card. E → teleport to that brand. Corridor screens share 3 rotating canvases per wing (not one per screen). |
| 6 | Storefront finish | For every `shop` unit: a bronze frame around the 6 m opening (jambs + head); a lightbox strip (unlit warm) under the fascia; uplight strips (unlit warm) at the base of the window posters; and a doormat (2.4 × 1.2 m) in the brand colour with the monogram (or logo), just outside the opening. |
| 7 | Wing portal | A bronze portal frame around each wing mouth, and a wing directory board (1.2 × 2.2 m, double-sided) at the mouth (local x −4.6, z −1.5) listing that wing's units in order (EN + AR + monogram colour bars). |
| 8 | Wayfinding | A hanging double-sided sign at the middle of each wing (y 4.6), listing the units ahead in each direction. |
| 9 | End wall | A feature wall on the corridor end: a 10 × 4 m collage panel (canvas) with one product photo per brand in the wing and the 122 logo, a bronze frame, and 2 kit plants. |
| 10 | Wall gradient | A darker wainscot gradient band (0–1.1 m) along the corridor walls between storefronts, plus a contact-shadow decal under each island. |

## Architecture

**New modules:**
- `src/world/plaza.ts`: `buildPlaza(ctx)` builds the stage, screen, truss, seating, planters and column screens; it returns `{ update(dt, time) }`.
- `src/world/corridor.ts`: `buildCorridor(ctx, wing, shops)` builds per-wing finishing.
- `src/world/screens.ts`: `ScreenFeed` (slide model, rendering, visibility-gated updates, shared textures) and `screenMesh(feed, w, h)`.
- `src/world/decals.ts`: `contactShadow(x, z, w, d, opacity)` decals, built as one `InstancedMesh` for the whole mall.

**Changed modules:**
- `mall.ts`: `buildShell` drops the old medallion/benches, calls `buildPlaza`, and calls `buildCorridor` inside `buildWing`.
- `liveMall.ts`: the group-deal board moves to (11, −27.5) (unchanged) and the stage screen becomes the main deal surface.
- `crowd.ts` + `mockPresence.ts`: add the `watching` activity and stage spots.
- `i18n.ts`: new strings (screen texts, "Next: …", wing directory).

**Data flow:**
- `ScreenFeed` reads `store` (flash sale, group deal) and `catalog()` (brands, products).
- Slides are rebuilt when the deal or flash state changes, and also on a timer.
- Screens register interactables through `ctx.interaction` with `enabled()` gating, so only visible slides with an action respond.

**Performance plan:**
- **Batched/instanced:** stage, steps, truss, bench segments, planters, inlays, star inlays, pendants, frames and doormat bases.
- **Unlit materials** for all light-emitting strips, globes and screens.
- **Additive glow/cones** are hidden on Low.
- **Textures:**
  - 1 front stage canvas pair (cross-fade) and 1 back canvas;
  - 4 plaza column screens share the front canvas;
  - 3 canvases per wing for column screens;
  - 1 collage canvas per wing;
  - 1 directory canvas per wing;
  - doormats use one atlas of monograms (or one texture each, small, 256×128).
- **Expected:** +12–18 draw calls in the plaza and +18–25 per wing in view.

## Error handling and fallbacks

- No kit → planters use the procedural plant.
- A failed image load on a screen → that slide falls back to a text-only layout.
- Screens never block boot: their slides fill in as data arrives.
- `?nodemo` → screens show only the brand / games / welcome slides (no flash sale or group deal).

## Testing and verification

- Build: `npx tsc --noEmit` and `npm run build`.
- Screenshots (Playwright harness):
  - plaza from the entrance, the stage close-up, the seating from the stage, the screen interaction;
  - each wing from its mouth, an island close-up, a storefront close-up, a column screen, the end wall, the wing directory.
- Perf script: plaza and wing draw calls and FPS for `?nodemo` and `?crowd=50`; report against the budgets above.
- Interaction checks: E on the stage screen during a flash sale teleports to the brand; E on a corridor screen teleports; colliders stop the player at the stage edge, the benches and the islands, while the stage steps stay walkable.
- The crowd still routes through every wing (islands leave 4.8 m lanes); no agent gets stuck for more than 2 s on islands, verified by sampling agent progress over 60 s.

## Planning clarifications (2026-10-05)

1. `buildPlaza` / `buildCorridor` are called from `main.ts` (`buildMall`) after `buildShell` (they need `interaction` and screen actions). `mall.ts` only moves the medallion to (0, −9.5) and removes the centre benches, the corridor runner and the centre light strips.
2. The stage and its steps are not walkable (no vertical movement); both collide.
3. Corridor column screens share one `ScreenFeed` per wing.
