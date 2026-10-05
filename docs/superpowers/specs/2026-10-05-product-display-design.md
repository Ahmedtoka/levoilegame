# Product display in every shop: design

**Status:** decided by the controller overnight (2026-10-05). The user asked for "the best way to display products" and pre-approved working through the night. Decisions are recorded here.

## Problem

- Generic brand shops (every brand except Le Voile) are furnished with the baked décor kit: hangbays, scarfbays, racks, a table and a gondola.
- Those kit pieces include the **baked garments and folded scarves** from the Le Voile boutique (the `*_store_soft` sub-meshes). So every shop shows the same fake Le Voile clothes, while the brand's real products appear only on one lookbook stand at the entrance.
- The user already rejected that look for Le Voile ("مش عاوز اشوف غير منتجات" — I only want to see products). The same rule now applies to every shop.

## Decisions

1. **No fake goods.**
   - `Kit.place(…, { hideSoft: true })` hides the piece's `*_store_soft` child.
   - Every fixture placed by `furnishWithKit` uses it.
   - Plants and pendants keep their soft part, because it is their foliage or shade.
2. **Products live on the fixtures.**
   - The composed card panel already used in Le Voile (one textured plane per fixture, one draw call) moves to `displays.ts` as a shared helper, `cardPanel()`. Each panel carries invisible per-product hit planes and a hover outline per card.
   - Le Voile switches to the shared helper (no visual change).
3. **Placement per fixture type** (piece-local, using `kit.json` `front` and `size`):

| Fixture | Placement |
|---|---|
| hangbay / scarfbay (wall bays) | 3 cards in a row on the front face, centred at y 1.55, 0.12 m in front of the bay's back (inside its frame), facing out |
| rack (free-standing rail) | double-sided row of 3 cards hanging under the rail (y ≈ 1.25), along the rail's long axis, visible from both sides |
| reardisplay | 3×2 grid on its front |
| table / gondola | an easel row of up to 4 cards on the top surface (the existing `easelRow`) |

4. **Fill strategy.**
   - Brands have 6 products (placeholders today) and a shop has about 10–14 fixture slots.
   - Fixture *k* shows products starting at index `(3k) mod n`, so every product appears several times. That reads like a real store with stock on several rails.
   - The lookbook stand at the entrance stays as the overview of the whole range.
5. **Cost.**
   - One panel mesh per fixture, plus invisible hits. Panels are inside the shop interior group, so they are culled with the shop.
   - Textures are drawn lazily (the shop's existing `loaders`) at 192×288 per card.
   - **Budget:** shop interior ≤ 200 draw calls (desktop High, `?nodemo`).
6. **Hover:** the card under the crosshair gets the plum outline (`interaction.highlight`). E or a tap opens the product sheet, as today.

## Out of scope

- Real per-brand catalogues (they arrive per brand later).
- Bespoke décor for other brands.
- 3D garment models.

## Verification

- `tsc`, the unit tests, and a build.
- Screenshots of a rack shop (Nourhan), a shelf shop (Scarfest), a gallery shop (AXIS), a boxes shop (HashBag) and Le Voile (unchanged):
  - no baked garments are visible;
  - cards sit on the fixtures without z-fighting or floating;
  - a hover outline shows on one card;
  - E opens the right product.
- Perf: shop draw calls for one of each display type.
