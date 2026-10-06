# Graphics swarm: 12 prompts, one area each

Goal: characters and their clothes at Snapchat-Bitmoji quality, in the game, on a phone, with no clipping and no lag. Each prompt owns **its own files and its own piece names**, so the agents can run at the same time. Paste one prompt per chat (Claude Code, this repo).

## Before you start (once, by you)

Every agent works in its own worktree and branch, cut from `mobile-app`:

```bash
cd C:\xampp\htdocs\LevoileGame-mobile && git worktree add -b gfx/<area> ..\LevoileGame-gfx-<area> mobile-app
```

Then in that worktree: `npm ci`, and link the Quaternius assets: `cmd /c mklink /J tools\quaternius C:\xampp\htdocs\LevoileGame\tools\quaternius`.

When an agent finishes, merge its branch into `mobile-app` (`git merge gfx/<area>`); conflicts should only ever be in the one file it owns. Run **Prompt 12 (integration + QA)** last, after all merges.

## Shared preamble (put at the top of every prompt)

```
You are working on District 122 (Vite + TypeScript + three.js), a walkable 3D mall. Read CLAUDE.md first.
Reply to me in Egyptian Arabic; code and commits in English.

Characters: src/actors/ (one skinned mesh per character, Quaternius UAL skeleton, Bitmoji-like toon
shading in src/actors/avatar/material.ts). The avatar GLB is built by Blender:
  C:\xampp\htdocs\LevoileGame\tools\blender-4.2.23-windows-x64\blender.exe -b -P scripts/blender/build_avatar.py -- --preview <dir>
  node scripts/avatar-postprocess.mjs
The build renders preview PNGs of four reference looks into <dir>; look at them (Read the PNGs) after every change.
Garments are PLUG-INS: create scripts/blender/garments/<area>.py exporting PIECES = {"<name>": (factory(ctx), "<part>")};
your pieces REPLACE the default ones with the same names (see scripts/blender/garments/__init__.py and _example.py).
Do not edit build_avatar.py, pieces.ts, character.ts or material.ts unless your prompt says you own them.

MODESTY RULE (mandatory, no exceptions): no body mesh is ever exported; tops reach the wrists and up to the
jaw (high collar), bottoms reach the ankles, skirts are always worn over leggings, hijab covers all hair.
Any piece you make must keep this at every frame of Idle_Loop, Walk_Modest, Jog_Modest and Dance_Loop.

Quality bar (Snapchat Bitmoji): clean big shapes, crisp edges (collars, cuffs, hems, belts), soft folds only
where cloth would really fold, no muscle or body detail showing through, no self-intersection, no gaps.
Budget: your pieces together under 4 000 triangles. Test: no clipping between your pieces and the body,
hands, head, hair or the other garments, in every frame of the clips above (render a walk sheet and look).

Work in your own worktree/branch (gfx/<area>); commit when done with screenshots of the previews
attached to your final message; do not push, do not merge.
```

---

## Prompt 1: Abaya

```
<preamble>
Area: abaya. File: scripts/blender/garments/abaya.py. You own the pieces upper_abaya, cuffs, abaya_trim.
Design: a classic Egyptian/Gulf abaya: a loose A-line body falling from the shoulders to the floor in one
piece with soft vertical folds (6–8), wide sleeves that widen towards the wrist, a 2.5 cm contrast band down
the front (abaya_trim) and 4 cm contrast cuffs (cuffs) that sit OUTSIDE the sleeve end (no z-fighting).
A small stand collar under the jaw. upper_abaya must cover hips to collar; the skirt part is skirt_flare
(owned by Prompt 3) so make upper_abaya end at hip height with a hem that the skirt tucks under cleanly.
Skin weights: use ctx.top_weights for the torso/sleeves. Preview look: abaya_hijab.
```

## Prompt 2: Blouse + dress bodice + belt

```
<preamble>
Area: blouse. File: scripts/blender/garments/blouse.py. You own upper, belt.
Design: a long modest blouse (tunic length, hem at mid-hip, slight A-line), stand collar under the jaw,
long sleeves with a neat 3 cm cuff, a visible placket line down the front (geometry, 2 mm raised), and
shoulder seams. It is worn with skirt_straight, trousers, and (as the bodice) skirt_flare for the dress.
belt: a 4 cm belt at the waist with a small flat buckle, sitting outside the blouse (no z-fighting).
Fitted at the bust/waist but with 2.5 cm ease everywhere; nothing of the body shows through.
Preview looks: skirt_long_hijab, trousers_hair, staff_bun.
```

## Prompt 3: Skirts

```
<preamble>
Area: skirts. File: scripts/blender/garments/skirts.py. You own skirt_flare, skirt_straight.
Design: skirt_flare is a full-circle maxi skirt (abaya/dress) with 8 soft pleats growing to the hem;
skirt_straight is a long A-line skirt with 4 soft front pleats. Both start at the waist (z 1.06, under the
blouse hem) and end 2 cm above the floor; both must clear the leggings and the lofted shoes at every walk
frame (use ctx.leg_weights so the front/back panels follow skirt_f / skirt_b, the hinge bones the runtime
drives). Hem must not intersect the feet in Walk_Modest and Jog_Modest. Preview looks: abaya_hijab,
skirt_long_hijab, staff_bun.
```

## Prompt 4: Trousers, leggings, shoes

```
<preamble>
Area: legs. File: scripts/blender/garments/legs.py. You own trousers, leggings, shoes.
Design: trousers are wide-leg palazzo trousers with a clean waistband, a front crease line and a hem that
flares from the knee; leggings are a snug tube (worn under skirts, never visible as skin); shoes are closed
flat shoes (ballet-flat silhouette with a small heel cap) in one clean shape. Use ctx.leg_tube_weights for
trousers/leggings and foot_/ball_ weights for shoes. The trousers must never clip the blouse hem or the
shoes; the shoes must sit on the floor (z 0) in the idle pose. Preview look: trousers_hair.
```

## Prompt 5: Hijab

```
<preamble>
Area: hijab. File: scripts/blender/garments/hijab.py. You own hijab_classic, hijab_long, hijab_band.
Design: hijab_classic is a wrapped scarf: a smooth head cap over the (×1.15 enlarged) head with the face
opening on the face zone (ctx.face_zone), a chin wrap, and a drape that lies ON the shoulders and chest like
real cloth (not a bib), with 5–6 soft folds; hijab_long is the same with the drape to the waist (khimar).
hijab_band is the thin under-scarf band along the face opening. The cap must completely cover the hair and
ears; no hair piece is worn with a hijab. No gap at the neck/collar and no clipping with the blouse collar
or the abaya. Weights: Head for the cap, ctx.drape_weights for the drape. Preview looks: abaya_hijab,
skirt_long_hijab.
```

## Prompt 6: Hair

```
<preamble>
Area: hair. Files: scripts/blender/garments/hair.py (you own hair_long, hair_bun, hair_ponytail, hair_bob)
and the hair atlas (public/models/avatar/hair.png + hair_n.png: you may replace them).
Today three styles are the Quaternius meshes and two of them are duplicates. Make four DISTINCT Bitmoji-like
styles: long straight, low bun, high ponytail, chin-length bob. Chunky clean strands (not single hairs),
rounded volumes, parting line. Rigged to Head (ponytail tail may use neck_01 blend). Must sit on the
enlarged head without clipping the brows, glasses or the blouse collar. The runtime tints hair.png's
luminance by the hair colour (see material.ts lvHair): keep the atlas a mid-grey strand mask with highlights.
Preview looks: trousers_hair, staff_bun.
```

## Prompt 7: Staff uniform (vest + logo)

```
<preamble>
Area: uniform. File: scripts/blender/garments/uniform.py. You own vest, logo.
Design: the staff vest is a fitted sleeveless waistcoat worn over the blouse: V-neck, two front panels, a
3 cm hem, two welt pockets (raised geometry), worn open or closed (choose closed, cleaner). The logo is a
flat 8 × 3 cm patch on the left chest with UV 0..1 (the runtime draws the brand logo texture on it).
No z-fighting with the blouse (≥ 1.2 cm outside it). Preview look: staff_bun.
```

## Prompt 8: Character shader (Bitmoji look)

```
<preamble>
Area: shading. File: src/actors/avatar/material.ts (you own it) and tests/avatarMaterial.test.ts (new).
Goal: the Snapchat Bitmoji 3D look: 2-band toon lighting with a soft terminator, a slightly lighter
"fresnel" edge, flat saturated colours, a thin dark outline (screen-space via a back-face hull pass is NOT
available — use the rim term, or add an inverted-hull outline mesh in character.ts ONLY if it costs one
extra draw call), matte cloth, soft skin with a subtle SSS-like warm shadow, glossy eyes, hair with one
specular band. Keep the existing uniforms/contract (palette per part, face mask tints, try-on fabrics,
LOD snapshots). Must compile on mobile WebGL2 (Adreno/Mali): no dynamic loops, no derivatives in loops.
Verify in the browser: `npm run dev`, open ?debug, enter in third person, screenshots of the player and a
staff member at High and Low. Measure draw calls unchanged (lv.engine.renderer.info).
```

## Prompt 9: Face: eyes, blink, lashes, makeup

```
<preamble>
Area: face. Files: src/actors/avatar/face.ts (you own it), the lids/blink in src/actors/character.ts
(only the blink() method and what it needs), scripts/blender/build_avatar.py ONLY the export_face_mask
function, public/models/avatar/face_mask.png.
Goal: Bitmoji-like face: a real blink (scale the `eyes` piece vertically to 0 over 80 ms every 3–6 s,
instead of the old texture swap), eyelashes as a thin dark band on the lid (face mask channel B), soft
blush on the cheeks (G), lip tint with a slightly darker lip line (R), optional eyeliner. The selfie
flow already supplies iris/lips/brows colours. Keep the editor's face thumbnails working.
```

## Prompt 10: Editor stage and outfit thumbnails

```
<preamble>
Area: editor. Files: src/ui/avatarEditor.ts, src/styles/avatar.css (you own both).
Goal: the "My character" screen like Snapchat's Bitmoji editor: outfit cards are REAL renders of the
character wearing each OUTFIT_PRESET (render them with PreviewStage into an offscreen canvas once, cache
as data URLs, show with a soft shadow), the stage has a studio backdrop gradient and a slow idle turn,
tapping a category zooms the camera (face tabs → head and shoulders, outfit → full body) with a 300 ms
ease, selfie button shows the captured photo thumbnail next to the result. Landscape phone (844×390) and
portrait both clean, RTL correct. No layout shift when switching tabs.
```

## Prompt 11: Animation polish

```
<preamble>
Area: animation. File: src/actors/character.ts (you own update(), the pose/IK code, skirt bones) and
scripts/blender/build_avatar.py ONLY modest_walk() and MODEST_DAMP.
Goal: Bitmoji-like motion: idle with a subtle breath and weight shift, a gentle head turn towards the
player (already lookTarget), the walk with no foot sliding at both WALK_3P and RUN_3P speeds (verify
clipStride), skirt hinge bones with damping (no jitter when turning), hands relaxed (slight finger curl),
a cleaner wave. Blend idle↔walk↔jog over 0.25 s. Keep the LOD snapshot contract (lodGeometry / walkPhase).
```

## Prompt 12: Integration + QA (run last)

```
<preamble>
Area: integration. You may touch any file but prefer the smallest fix.
All gfx/* branches are merged into mobile-app. Rebuild the avatar (build + postprocess), `npm run build`,
run the four preview looks and a walk sheet, and hunt for: clipping between pieces, gaps at collars/cuffs/
hems, z-fighting, wrong part colours, hair under the hijab, feet through skirts, triangles over budget
(print TRIS), GLB over 2.5 MB, any shader compile error in the browser console, draw calls per character
> 1, frame time regressions (headless Chrome: measure 10 s at High in a shop; compare with the number in
docs/superpowers/specs/2026-10-06-mobile-app-design.md). Fix what you find, then build the APK
(`npm run android:apk` with JAVA_HOME = Android Studio's jbr) and report with screenshots from the game.
```
