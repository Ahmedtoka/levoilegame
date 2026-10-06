# Avatar rebuild on the Quaternius base: design

**Status:** chosen by the user on 2026-10-06 ("let's work step by step towards strong graphics; start with the characters" → "rebuild the model itself"). AI generation was the user's first pick but the generation account has no credits, so the free CC0 base is the path; AI assets can be layered on later.

## Goal

Replace the procedural "egg head + lofted tubes" avatar with a sculpted stylised character: a real face (eyes, brows, normal maps), hands with fingers, modelled hair, and modest garments that fit a real body — without changing the modesty guarantees, the skeleton, the animation clips, the piece/palette contract or the LOD path.

## Source

`tools/quaternius/UBC/Universal Base Characters[Standard]` (CC0): `Superhero_Female_FullBody.gltf` (7 376 verts, one 2048² base colour + normal + roughness), `Eyes` (iris texture), `Eyebrows`, and the head-rigged hairstyles `Hair_Long`, `Hair_Buns`, `Hair_SimpleParted` (hair base colour + normal). Its skeleton is the same 65-joint Unreal-style rig as the animation library (`UAL1_Standard.glb`), so every clip we use plays unchanged.

## Modesty (unchanged, mandatory)

- The body mesh is **never exported**. The GLB holds only: `head` (head + neck cut from the body), `hands` (wrist down), `eyes`, `brows`, hair pieces, and garment pieces.
- Garments are derived from the body so they fit, then the body is discarded. Every look still has to pass `modestyProblems()` (long-sleeved top with a high collar, long skirt/abaya or trousers, leggings under skirts, shoes, hijab or hair).
- `root.visible` stays false until the merged mesh exists.

## Build (`scripts/blender/build_avatar.py`, rewritten)

1. **Load** the UAL skeleton + clips as today; import the UBC body, eyes, brows and the three hairstyles; parent everything to the UAL armature (bone names are identical).
2. **Cut the body by bone weight / height** into regions:
   - `head`: vertices weighted to `Head`/`neck_01` above the collar line (z ≥ 1.47); keeps the body UVs.
   - `hands`: `hand_*` + finger bones.
   - the rest is only used as a template for garments.
3. **Garments as offset shells of the body** (duplicate faces, move along vertex normals, copy the body's skin weights — no hand-written weight functions for the torso/arms/legs any more):
   - `upper` / `upper_abaya`: torso + arms from the jaw line (high collar) to the hips/wrists, offset 1.6 cm (abaya 2.4 cm, looser sleeves).
   - `leggings`: legs offset 0.5 cm; `trousers`: legs offset 2 cm, widened at the ankle (wide-leg).
   - `shoes`: feet offset 0.8 cm (closed shoes).
   - `tunic`: hip band shell, offset 2.5 cm, hem at mid-thigh.
   - `hijab_classic` / `hijab_long`: head shell offset 1.2 cm with the face opening cut out (face zone of the head), plus the chin wrap and shoulder drape lofted from the real neck/shoulder rings (existing loft code, re-measured).
   - `skirt_flare` / `skirt_straight`: lofted from the real hip ring to the floor (existing loft + `leg_weights`, re-measured).
   - `belt`, `cuffs`, `abaya_trim`, `vest`, `logo`, `hijab_band`: thin shells/bands re-measured on the new body.
4. **Hair**: the three UBC styles as `hair_long`, `hair_bun`, `hair_bob` (SimpleParted); `hair_ponytail` reuses `hair_long` until a ponytail exists. Hair keeps its UVs (hair atlas).
5. **Textures** exported next to the GLB, 1024²: `skin.png` + `skin_n.png` (body atlas, used by head and hands), `hair.png` + `hair_n.png`, `eyes.png`. Skin is tinted at runtime: `albedo × (palette.skin / reference skin)` so the six editor skin tones still work.
6. **Head size**: the UBC proportions are natural; the head is enlarged ×1.12 about the neck (stylised, not Zepeto-big) — a build constant to tune on the previews.
7. **Export** as today (one GLB, NLA tracks → clips, `export_materials NONE`), plus the textures. Preview renders (front/face/side/walk) for the four reference looks, reviewed by the user before the runtime switch.

## Runtime

- `pieces.ts`: `eyes` and `brows` are always included; `PIECE_PART` gains `eyes` and `brows` (brows take the hair colour).
- `material.ts`: new uniforms `lvSkin`, `lvSkinN`, `lvHair`, `lvHairN`, `lvEyes`; parts `face`/`skin` sample the skin atlas (tinted), `hair`/`brows` the hair atlas, `eyes` the iris texture; the garment palette, triplanar fabric try-on, rim light and logo paths stay. The canvas face overlay goes (the face is textured); blink becomes a small eyelid scale on the `eyes` piece later (not in this round).
- `character.ts`: `BASE_SCALE` so the 1.78 m model stands 1.66 m; hitbox/bounds re-measured; IK hand targets unchanged (same skeleton).
- `face.ts` / editor: face presets become lip + blush tints drawn into a small overlay only if cheap; otherwise the preset picker is hidden for now.
- LOD snapshots keep working (vertex colours from the palette; textured parts fall back to their palette colour at distance).

## Budget

Per full rig: head ≈ 1.7k verts, hands ≈ 0.3k, eyes + brows ≈ 1.5k, garments ≈ 3–4k, hair 0.8–3.5k → 8–11k verts, one draw call, one material. Textures: 3 × 1024² atlases shared by every character.

## Verification

- Build runs headless on the portable Blender; `avatar.glb` size reported; every piece in `PIECE_PART` present.
- Preview sheet (idle front/face/back, walk side) for `abaya_hijab`, `skirt_long_hijab`, `trousers_hair`, `staff_bun` — user approval gate.
- `tests/avatarPieces.test.ts` still green; `tsc`; the mall boots with the new GLB; phone build.
