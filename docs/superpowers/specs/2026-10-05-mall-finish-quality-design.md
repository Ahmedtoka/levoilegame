# Mall finishing quality: design (approved in chat 2026-10-05)

**Scope:** plaza, wing corridors and shopfronts. Shop interiors are out of scope, except for the storefront itself.
**Rule:** hit a premium look without breaking performance. Heavy effects run on High only. Everything repeated is batched or instanced.

## 1. Lighting depth (fake GI)

- **Ambient-occlusion strips:** soft dark gradient bands (one shared texture, instanced quads) at:
  - every wall/floor junction (0–0.6 m up the wall, plus 0.5 m out on the floor);
  - every wall/ceiling junction;
  - the base of columns, rings on the floor.
  - This applies to the plaza walls, corridor walls and storefront piers.
- **Light pools:** additive warm radial decals on the floor under every pendant, and under the plaza skylight (a large soft rectangle). Instanced; Medium and High only.
- **Floor reflection:** extend the planar reflector to the wing corridors on High only, as one reflector per wing, rendered only while you are inside that wing. Keep the plaza reflector as it is.
- **Bloom:** `UnrealBloomPass` via EffectComposer on High only, with a high threshold so that only light panels, globes, screens and lightboxes glow. On Low and Medium, render without a composer.

## 2. Ceilings (light gypsum)

- The plaza and corridor ceilings switch from dark to warm off-white gypsum (`#efe9e1`, matte).
- **Corridors:** a recessed central coffer (a lower band 0.25 m down at the edges forming a tray), linear slot lights along the tray edges, and round spotlight cans (instanced) every 3 m on both sides.
- **Plaza:**
  - gypsum slabs with a coffer grid around the skylight;
  - a bronze frame on the skylight well;
  - spot cans in a ring.
- **Shop ceilings stay dark,** to keep the contrast and the focus on the products.

## 3. Walls and floor

- **Corridor walls:**
  - a 1.1 m oak-veneer wainscot (wood texture) with a bronze cap rail on the solid wall segments between storefronts;
  - cream plaster above.
  - The wall shade from the previous round stays at the base.
- **Piers:** marble-clad pilasters (0.6 m wide, protruding 0.08 m) at every row boundary on both sides, framing the column screens.
- **Floors:**
  - large-format marble with a visible tile grid (a subtle grout line pattern in the texture);
  - random per-tile tint variation baked into a 2048 texture atlas (one material), so the repetition is broken;
  - a border band of a darker marble along the corridor walls.
  - The plaza gets the same tiles plus the existing medallion.

## 4. Shopfronts

- **Display windows:**
  - glass panes (transparent physical material, one shared) on the two solid segments beside the 6 m opening, from 0.3 m to 3.6 m, set 0.15 m into the opening;
  - a lit plinth behind each, carrying a product (the existing window poster becomes the backdrop) and a small spotlight glow.
- **Frames:** a bronze portal frame around the opening (already present: keep, and refine its proportions).
- **Lightbox fascia:**
  - the fascia sits in a thin bronze box;
  - the background is the brand colour, with a light inner gradient;
  - the brand name is in raised-look white or cream letters with a soft drop shadow;
  - an emissive backlight halo (bloom on High).

## 5. Signage and ads

- **Hanging fabric banners:** vertical banners (1.2 × 3.2 m, double-sided):
  - 4 in the plaza and 2 per wing, hanging from thin rods;
  - a gentle sway animation (vertex-free: rotate the banner group by a small sine, updated only when visible);
  - content cycles brand ads and offers, sharing `ScreenFeed`-style canvases (static per banner, rotated on a slow timer).
- **Blade signs:** the same lightbox style as the fascia, with a bronze bracket.
- **Screens:** a thinner bronze bezel, and a subtle gloss overlay (a gradient plane, additive, low opacity). Slide layouts get refined typography and spacing (no new slide types).

## Performance budget

- Plaza ≤ 220 and wing ≤ 300 draw calls at `?nodemo`, as before.
- **New instanced layers:**
  - AO strips: 1 call;
  - light pools: 1;
  - spot cans: about 2;
  - banners: one mesh each, about 10 in view at most;
  - glass panes: shared material, about 32 meshes, culled with the frustum.
- Bloom and the corridor reflectors are High only, and go off automatically with the `FpsGovernor`.

## Verification

- `tsc`, the tests and a build.
- Before/after screenshots: plaza from the entrance, plaza looking up, each wing from its mouth, a storefront close-up, a banner close-up.
- Draw calls and FPS at Medium and High in the plaza, a wing, and a shop.
