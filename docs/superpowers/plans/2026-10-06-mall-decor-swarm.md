# Mall décor swarm (night mall, mobile first) — implementation plan

> **For agentic workers:** this plan is executed by a Workflow of 20 agents (3 foundation + 1 integrator run twice + 17 area agents). Each area agent owns one task below, works in its own git worktree on its own branch, and reports structured results. Agent 20 integrates. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** raise the visual quality of every part of District 122's décor to a premium "night mall" look that holds 60 fps on a mid-range phone (Medium) and 30 fps on a weak phone (Low), inside the Android app.

**Architecture:** the mall stays procedural Three.js. A shared theme (`src/world/theme.ts`) and a shared PBR texture library (`src/engine/pbr.ts`, CC0 textures in `public/textures/`) are built first; then 17 agents restyle their area in parallel from those tokens; a bench harness (`?bench=` flag + `scripts/bench.mjs`) measures every area on three quality tiers; the integrator merges only branches that pass budgets.

**Tech stack:** Vite 8, TypeScript (strict), Three.js r186, Zustand, Capacitor (Android), Playwright (channel: system Chrome) for the bench, Pillow in `.venv` for image conversion.

**Spec:** `docs/superpowers/specs/2026-10-06-mall-decor-swarm-brief.md` (decisions, art direction, budgets — Arabic). Earlier design context: `docs/superpowers/specs/2026-10-05-mall-finish-quality-design.md`, `2026-10-06-shop-tiers-design.md`, `2026-10-06-mobile-app-design.md`, `docs/superpowers/notes/2026-10-06-shop-tiers-perf.md`.

## Global constraints

Copied from the spec; every task includes these.

- **Branch and repos:** work happens on the `mobile-app` line. Integration branch: `decor/base` (worktree `C:\xampp\htdocs\LevoileGame-decor`). Area branches: `decor/<task-id>` in worktree `C:\xampp\htdocs\LevoileGame-decor-<task-id>`. At the end agent 20 fast-forwards `mobile-app` to the integrated result.
- **Worktree protocol (each agent):**
  ```bash
  git -C C:/xampp/htdocs/LevoileGame-decor worktree add C:/xampp/htdocs/LevoileGame-decor-<id> -b decor/<id> decor/base
  cmd //c mklink //J "C:\xampp\htdocs\LevoileGame-decor-<id>\node_modules" "C:\xampp\htdocs\LevoileGame-mobile\node_modules"
  ```
  Then work ONLY inside that folder with absolute paths. Never run bare `git stash`. Commit small, with messages like `feat(decor/<id>): …`.
- **Art direction (night mall):** colours come from `src/world/theme.ts` (`THEME`). Charcoal ceilings, cream walls washed with warm light, dark polished marble floors, bronze is the only metal, 122 plum only as an accent, warm (~2700 K) light. No new hex literals for these roles.
- **Textures:** real CC0 textures via `src/engine/pbr.ts` (`pbrMaterial(name, opts)`), 1K WebP, 512 on Low. Nothing from non-CC0 sources. The APK size has no cap, but every agent reports the bytes it added.
- **Quality tiers:** every effect must work on Medium. Heavy effects (planar reflections, bloom, extra additive décor) only when `quality.reflections` / `quality.bloom` / `quality.fancyDecor` say so, and they go off with the `FpsGovernor`. Low keeps the same palette and textures (512), with sprite halos instead of bloom.
- **Batching:** anything repeated is instanced or batched (`engine/batcher.ts`, `BatchFrame`, `InstancedMesh`). A new décor layer is one draw call.
- **Budgets (`?nodemo`, 844×390, see Task F3):** plaza ≤ 220 draw calls, wing ≤ 300, shop interior ≤ 130. Medium ≤ 16 ms/frame, Low (4× CPU throttle) ≤ 33 ms/frame. GPU textures ≤ 180 MB on Low, ≤ 320 MB on Medium.
- **Out of scope:** characters (`src/actors/**`), the modesty rule, the HUD/overlays (`src/ui/**`), controls, games, data. Don't touch them.
- **i18n:** any new user-visible string goes in `src/i18n/i18n.ts` in both `ar` and `en`.
- **Verification before you report:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`, then `node scripts/bench.mjs --spots <your spots> --label <id>` (produces the numbers and screenshots you report). Report honestly: numbers over budget are reported as over budget, not hidden.
- **Report format (every agent returns this JSON through the StructuredOutput tool):** `{ id, branch, commits: [sha], filesChanged: [], bytesAdded, bench: [{spot, quality, msFrame, calls, textureMB}], screenshots: [paths], overBudget: bool, notes }`.

---

## Phase 0 — foundation (3 agents in parallel, then integrate)

### Task F1 (agent 18): lighting rig and post for the night mall

**Files:**
- Modify: `src/engine/renderer.ts` (background, fog, environment intensity, hemi/sun from `THEME.lighting`)
- Modify: `src/engine/post.ts` (`BLOOM` constants: strength 0.55, radius 0.5, threshold 0.55 — tune on screenshots)
- Modify: `src/engine/bloom.ts` (`BLOOM_WEIGHT`: add `halo: 0.7` for sprite halos that must glow on High)
- Modify: `src/world/materials.ts` (`MAT.ceiling`, `MAT.wall`, `MAT.wallWarm`, `MAT.trim`, `MAT.brass`, `MAT.black`, `MAT.lightPanel`, `MAT.lightWarm` take `THEME` values; add `MAT.bronzeLight`, `MAT.plumAccent`)
- Modify: `src/world/glow.ts` (halo sprite texture warmer, `addPool` colour from `THEME.poolWarm`, pools visible on Low too — they are one instanced call)
- Create: `src/world/halo.ts` — `addLightHalo(x, y, z, r, color?)`: additive billboard sprite (one `InstancedMesh`, `FLOOR_FX_LAYER` not needed) used by every area agent for "glow without bloom" on Low/Medium; `buildHalos(parent)`; registered with `BLOOM_WEIGHT.halo` so it also blooms on High.
- Test: `tests/theme.test.ts` — `THEME` values are valid hex and the rig numbers are within sane ranges (env 0–0.5, exposure 0.6–1.3).

**Interfaces:**
- Produces: `THEME` (already in `src/world/theme.ts`), `addLightHalo(x: number, y: number, z: number, r: number, color = THEME.warmLight): void`, `buildHalos(parent: Object3D): InstancedMesh | null` (called once from `buildShell` after all areas have added halos — add the call next to `buildGlows` in `src/world/mall.ts`).

- [ ] Step 1: write `tests/theme.test.ts` (hex regex on every string in `THEME`, ranges on `THEME.lighting`), run `npx vitest run tests/theme.test.ts` → passes (theme exists already).
- [ ] Step 2: renderer: `scene.background = new Color(THEME.fog)`, `scene.fog = new Fog(THEME.fog, THEME.fogNear, THEME.fogFar)`, `environmentIntensity = THEME.lighting.env`, hemi/sun colours and intensities from `THEME.lighting`, `toneMappingExposure = THEME.lighting.exposure`.
- [ ] Step 3: materials from `THEME`; keep `registerBloom` calls. `MAT.ceiling` becomes charcoal with no emissive lift.
- [ ] Step 4: `halo.ts` with a 128² radial sprite (canvas), `AdditiveBlending`, `depthWrite: false`, instanced; a unit test that `buildHalos` returns null with no halos.
- [ ] Step 5: bloom constants, run the bench at low/medium/high on `atrium` and `wing-north`, screenshots; tune exposure so cream walls read cream (not grey) under the washes and the floor reads dark but not black.
- [ ] Step 6: `tsc`, tests, build, commit `feat(decor/F1): night-mall light rig, halos, bloom tuning`.

### Task F2 (agent 19): PBR texture library

**Files:**
- Create: `src/engine/pbr.ts` — `pbrMaterial(name: PbrName, opts?: { repeat?: [number, number]; color?: string; roughness?: number; metalness?: number; normalScale?: number }): MeshStandardMaterial` (cached per name+opts, loads `/textures/pbr/<name>/<map>.webp` lazily with `TextureLoader`, picks `.s.webp` (512) when `quality.textureMax <= 512`; maps: `color`, `normal`, `roughness` (optional)); `PBR_NAMES` list; `pbrTextureBytes()` for the report.
- Create: `public/textures/pbr/<name>/{color,normal,roughness}.webp` + `.s.webp` for: `marble-dark` (Nero Marquina style), `marble-cream`, `oak-dark`, `bronze-brushed`, `plaster-cream`, `velvet-plum`, `carpet-dark`, `concrete-dark` (ceiling), `leather-tan`. Source: ambientCG (CC0) 1K JPG zips, e.g. `https://ambientcg.com/get?file=Marble012_1K-JPG.zip`; pick one asset per role, record the asset ids in `public/textures/pbr/SOURCES.md`.
- Create: `scripts/fetch-textures.mjs` (downloads + unzips to `tools/textures-src/`, git-ignored) and extend `scripts/optimize-images.py` with `--pbr` (writes the WebPs, 1024 and 512, quality 82; normal maps quality 90).
- Modify: `src/world/finish.ts` — `floorAtlas()` builds from `marble-dark` (dark base, light veins, grout `rgba(0,0,0,0.6)`), `oakVeneerMat()` → `pbrMaterial('oak-dark', { color: THEME.oak })`, `marbleCladMat()` → `pbrMaterial('marble-cream')`, `GYPSUM` → charcoal ceiling material (`THEME.ceiling`, roughness 0.95, no emissive). Keep the exported names so other files compile.
- Test: `tests/pbr.test.ts` — URL mapping for sizes, caching returns the same material for the same key, unknown name throws.

**Interfaces:**
- Produces: `pbrMaterial`, `PbrName = 'marble-dark' | 'marble-cream' | 'oak-dark' | 'bronze-brushed' | 'plaster-cream' | 'velvet-plum' | 'carpet-dark' | 'concrete-dark' | 'leather-tan'`.
- Consumes: `qualitySettings` (`textureMax`), `setMaxAnisotropy` from `engine/textures.ts`.

- [ ] Step 1: test for URL mapping + cache (mock `TextureLoader` via `vi.mock('three', …)` partial), run → fails.
- [ ] Step 2: `pbr.ts` minimal, test passes.
- [ ] Step 3: fetch script + optimize `--pbr`; run both; verify every name has 6 WebPs; `SOURCES.md`.
- [ ] Step 4: `finish.ts` migration; bench `atrium` + `wing-north` on low/medium; texture MB must stay under budget.
- [ ] Step 5: `tsc`, tests, build (check `dist/textures/pbr` size and report it), commit `feat(decor/F2): CC0 PBR texture library and dark marble floor`.

### Task F3 (agent 20a): bench harness and screenshot spots

**Files:**
- Modify: `src/main.ts` + `src/game.ts` — `?bench=<spot>&q=<low|medium|high>` (always implies `nodemo`): skip the intro and the avatar editor (`store.set({ phase: 'playing' })` after boot, hide the HUD with a `bench` class on `body`), force the quality tier, teleport to the spot's pose with the **camera yaw and pitch** of the spot, wait until `imageLoads` is idle and 4 s have passed, then sample 150 frames: per-frame `performance.now()` deltas around `tick + render`, `engine.frameCalls().total`, `renderer.info.render.triangles`, `renderer.info.memory.textures`, and an estimate of texture bytes (sum over `renderer.properties`? not accessible — instead sum `w*h*4*1.33` over textures reachable from the scene materials; document the estimate). Result on `window.__bench` and `document.title = 'BENCH ' + JSON.stringify(result)`.
- Create: `src/bench/spots.ts` — `BENCH_SPOTS: Record<string, { x: number; z: number; yaw: number; pitch: number; zone: string }>` for: `atrium-entrance` (spawn, looking at the stage), `atrium-up` (centre, pitch +0.6 at the skylight), `atrium-stage` (3 m from the stage), `atrium-cashier`, `wing-west-mouth`, `wing-north-mouth`, `wing-east-mouth`, `wing-north-mid`, `wing-west-nook`, `storefront-pistage` (4 m in front of the opening), `storefront-axis`, `shop-pistage`, `shop-hashbag`, `shop-axis`, `shop-levoile`, `shop-levoile-hall`, `soon-1`, `popup`. Poses in world coordinates derived from `layout` (use `toWorld`, `shopArrival`).
- Create: `scripts/bench.mjs` — starts a Vite dev server on a free port (Vite JS API), launches Playwright with `channel: 'chrome'`, viewport 844×390, DPR 2, `--use-gl=angle`; for each spot × quality: navigates, waits for the title to start with `BENCH `, parses, screenshots to `screenshots/bench/<label>/<spot>-<q>.png`; for `low` also sets `Emulation.setCPUThrottlingRate` 4 via CDP; prints a markdown table and writes `docs/superpowers/notes/bench/<label>.json`. Flags: `--spots a,b,c` (default all), `--q low,medium,high`, `--label`, `--compare <other.json>` (prints deltas).
- Modify: `package.json` — `"bench": "node scripts/bench.mjs"`, devDependency `playwright` (no browser download; uses the installed Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`).
- Test: `tests/benchSpots.test.ts` — every spot's `zone` matches `game.zoneAt(x, z)` logic via `layout` (use `buildLayout` from `src/config/layout.ts`), pitch within ±1.2.

**Interfaces:**
- Produces: `npm run bench -- --spots … --label …` and `BENCH_SPOTS`. Every other agent uses this exact command.

- [ ] Step 1: spots + test (fails until spots exist) → implement → passes.
- [ ] Step 2: `?bench` flow in the app; verify in Chrome manually that the title updates.
- [ ] Step 3: `bench.mjs`; run `npm run bench -- --label baseline` on `decor/base` BEFORE any décor change → `docs/superpowers/notes/bench/baseline.json` + `screenshots/bench/baseline/*` (commit the JSON; screenshots are git-ignored, so also copy the baseline PNGs to `docs/superpowers/notes/bench/baseline/` and commit them, ≤ 300 KB each via `--quality`-style downscale in the script).
- [ ] Step 4: `tsc`, tests, build, commit `feat(decor/F3): bench harness, spots and baseline`.

### Task F4 (agent 20, first run): integrate the foundation

- [ ] Merge `decor/F2`, then `decor/F1`, then `decor/F3` into `decor/base` (`git -C C:/xampp/htdocs/LevoileGame-decor merge --no-ff decor/F2 …`), resolving conflicts (expected: `finish.ts`/`materials.ts` imports).
- [ ] `tsc`, tests, build. Run `npm run bench -- --label foundation` on all spots; the result must not exceed any budget; if it does, fix the rig/textures here (lower `textureMax` usage, halo count) and record what changed.
- [ ] Commit, and write `docs/superpowers/notes/bench/foundation.md` (table + deltas vs baseline). Return the report JSON plus the list of exported names area agents can use.

---

## Phase 1 — 17 area agents in parallel (from the integrated `decor/base`)

Each task: read `theme.ts`, `pbr.ts`, `halo.ts`, the relevant builder file(s), and the earlier spec sections for your area. Build in a **new file** under `src/world/<area>/` where the brief says so, and keep the edit in the existing builder to the minimal hook (import + call), so merges stay small. **Never edit a file listed as owned by another task.**

### Task A1 (agent 1): plaza floor, medallion, reflection

**Owns:** `src/world/plaza/floor.ts` (new), the plaza-floor block of `src/world/mall.ts` (lines ~109–160: `atriumFloorMat`, `plazaFloor`, `plazaMirror`, medallion), `src/world/floorMirror.ts`.
**Deliver:**
- Dark marble floor from `floorAtlas()` with a 1.6 m border band of `THEME.floorBorder` around the plaza perimeter and a 0.3 m bronze inlay line 1.2 m inside the walls (one merged geometry with vertex colours via `tintedPlane`).
- Medallion: bronze ring (keep), inner disc in `marble-cream` with the 122 logo, a plum (`THEME.plum`) thin ring inside the bronze one, a radial sunburst inlay in bronze vertex colour; a soft light pool on it.
- Reflection: on High keep the planar mirror, tuned for dark marble (`floorOpacity` lower, colour from `THEME.floor`). On Medium/Low: a cheap "gloss" — `envMapIntensity` 0.9 + roughness 0.18 on the floor material + a static fresnel sheen (vertex-colour gradient towards the walls). Must be visibly glossy on Low in the bench screenshot.
**Spots:** `atrium-entrance`, `atrium-stage`, `atrium-cashier`.

### Task A2 (agent 2): plaza ceiling and skylight

**Owns:** `src/world/plaza/ceiling.ts` (new), the ceilings block of `src/world/mall.ts` (lines ~314–430: `slab`, `buildPlazaCeiling`, skylight well, `skyPlane`, shafts).
**Deliver:**
- Charcoal gypsum slabs (`THEME.ceiling`) with coffer downstands in `THEME.ceilingCoffer`; a warm slot light (emissive strip + `addLightHalo`) along every coffer edge adjacent to the skylight, instanced.
- Skylight: night sky plane (`THEME.skyNight` gradient to `#060a18` with ~120 faint stars drawn on a 512 canvas, `toneMapped: false`), bronze frame (keep), **no daylight shafts** — replace with 4 narrow warm beams from the spot cans (additive cones from `glow.ts`, Medium/High).
- Ring of spot cans: bronze bezel + warm lens (`MAT.lightWarm`) + halo; and 6 pendant chandeliers (3 brass rings each, instanced cylinders, globe halos) over the seating.
**Spots:** `atrium-up`, `atrium-entrance`.

### Task A3 (agent 3): plaza walls, entrance, exit, directory

**Owns:** `src/world/plaza/walls.ts` (new), the plaza-walls block of `src/world/mall.ts` (lines ~162–197 and `SlidingDoors`), `directoryTexture` / `wingDirectoryTexture` in `src/world/signage.ts`.
**Deliver:**
- Walls: `plaster-cream` PBR above a 1.1 m `oak-dark` wainscot with a `bronzeLight` cap rail; 0.9 m wide `marble-cream` pilasters every 6 m; wall-wash light pools (instanced additive planes on the wall, from `glow.addRectHalo` or a new wall-wash in `halo.ts` style) above every pilaster so the cream reads warm.
- Entrance portal: double-height bronze frame, "122 MALL" fascia lightbox (reuse `logoTexture`, registered for bloom), a plum LED line under it, glass sliding doors (`windowGlass()`), a dark doormat band.
- Exit: same portal language, "THANK YOU · شكراً" sign (both languages, from `labelSign`).
- Directory board: dark panel (`THEME.ceiling` tone) with cream text and a plum header; bronze stand; a halo above it. Update the two directory textures accordingly (keep the data they show).
**Spots:** `atrium-entrance`, `atrium-cashier`.

### Task A4 (agent 4): stage, LED wall, seating

**Owns:** `src/world/plaza.ts` (stage, LED, seating, banners), `src/world/screens.ts` (bezel/gloss only; `ScreenFeed` logic untouched), `src/world/screenSlides.ts` (slide styling only).
**Deliver:**
- Stage: `oak-dark` deck with a bronze nosing and an LED edge line (plum, emissive) along the front; 4 bronze truss uprights with 2 moving-head-style can shapes each (static), halos; fog-light beams (additive cones) on Medium/High.
- LED wall: thinner bronze bezel, a subtle emissive bezel line, the gloss overlay kept; slide layouts restyled dark (charcoal backgrounds, cream type, plum accents) — same slide kinds.
- Seating: velvet plum (`velvet-plum` PBR) cushions on bronze-leg benches, dark marble plinths, soft under-seat light pools.
- Banners: dark fabric with cream type; keep the sway.
**Spots:** `atrium-stage`, `atrium-entrance`.

### Task A5 (agent 5): cashier, concierge, greenery

**Owns:** `src/world/cashier.ts`, `src/world/props.ts` (`plant`, `premiumPlanter`, `slimPlant`, `bench`, `column`), `src/world/kit.ts` usage for the cashier.
**Deliver:**
- Cashier counter: dark oak body with a `marble-cream` top and a bronze toe-kick; a backlit "Cashier · الكاشير" panel; a plum LED strip under the counter top; halo overhead.
- Plants: layered cut-out planes (3 crossed alpha-tested planes per plant, one shared 512 leaf texture drawn on canvas with 6 leaf shapes, not the current flat-shaded spheres), dark ceramic pots with a bronze ring; up-lights (small halo at the pot base). Keep the `plant()` / `premiumPlanter()` signatures.
- Benches: match A4's bench (velvet-plum cushion, bronze legs); `column()` becomes a `marble-cream` column with a bronze base and capital.
**Spots:** `atrium-cashier`, `atrium-entrance`.

### Task A6 (agent 6): corridor floors and AO

**Owns:** `src/world/corridor/floor.ts` (new), the floor inlays block of `src/world/corridor.ts` (lines ~63–83) and the corridor floor in `src/world/mall.ts` `buildWing` (only the floor plane lines), `src/world/aoStrips.ts`, `src/world/decals.ts`.
**Deliver:**
- Dark marble corridor floor from `corridorFloorMat()` with vertex-tinted: a 1.0 m `THEME.floorBorder` band along both walls, a bronze inlay line 0.8 m in, and the existing star medallions in `marble-cream`.
- AO strips: darker and wider for the night look (wall/floor 0–0.8 m, floor 0.6 m out), and a soft dark gradient at every storefront threshold.
- Contact shadows under islands/benches via `decals.ts` tuned darker.
**Spots:** `wing-north-mouth`, `wing-north-mid`.

### Task A7 (agent 7): corridor ceilings and light fixtures

**Owns:** `src/world/corridor/ceiling.ts` (new), the pendants + ceiling-tray blocks of `src/world/corridor.ts` (lines ~84–115), the corridor ceiling slab lines in `src/world/mall.ts` `buildWing` (line ~304).
**Deliver:**
- Charcoal ceiling with a recessed tray; warm slot lights along the tray edges (emissive strips, halos every 2 m); round spot cans every 3 m both sides with bronze bezels and lens halos; light pools on the floor under each (A6 owns the floor material, you add pools via `glow.addPool`).
- Pendants: bronze-ring pendants (two rings + a warm globe) instanced, with halos; 1 per 6 m centred.
**Spots:** `wing-north-mouth`, `wing-west-nook`.

### Task A8 (agent 8): corridor walls, pilasters, seating nooks

**Owns:** `src/world/corridor/walls.ts` (new), the wainscot/pilaster/column-screen/end-wall blocks of `src/world/corridor.ts` (lines ~116–180, ~245–end), and the nook lines of `src/world/mall.ts` `buildWing` (the `wing.nooks` loops at lines ~260, ~294 and ~470: back wall, open front and furnishing of the `wing-<id>` seating nook).
**Deliver:**
- Walls: `plaster-cream` above a 1.1 m `oak-dark` wainscot with a `bronzeLight` cap; wall washes above every pilaster; pilasters in `marble-cream` with a bronze base; column screens get a bronze frame.
- Seating nook at the wing end: velvet-plum banquette, two dark-oak side tables, a tall plant (from A5's `premiumPlanter`, call only), a backlit art panel (campaign photo of the nearest brand), low warm lighting.
- End wall: a large backlit "122" monogram panel.
**Spots:** `wing-west-nook`, `wing-east-mouth`.

### Task A9 (agent 9): banners, wayfinding, corridor screens

**Owns:** `src/world/banners.ts`, `wayfindingTexture` / `labelSign` in `src/world/signage.ts`, the banner/wayfinding/portal blocks of `src/world/corridor.ts` (lines ~180–244), the corridor column-screen bezels (coordinate: A8 owns the screen frame geometry; you own the screen's canvas styling).
**Deliver:**
- Banners: dark fabric, cream type, a thin bronze rod with finials, soft top-lit halo; sway kept.
- Wayfinding: dark panels, cream Arabic/English, plum arrows, bronze frame; a halo.
- Wing portal (the mouth header): bronze frame with a backlit wing-name lightbox ("North Wing · الجناح الشمالي") and a plum LED line.
**Spots:** `wing-north-mouth`, `wing-north-mid`.

### Task A10 (agent 10): storefront system (frames, glass, windows)

**Owns:** `src/world/shopfront/windows.ts` (new), the display-window part of `storefront()` in `src/world/shop.ts` (lines ~311–380, `WIN`, plinths, figures), `windowGlass()` in `src/world/finish.ts`.
**Deliver:**
- Portal frame: bronze, 0.25 m deep, with a recessed warm light line on its underside (emissive + halo) so every opening glows at night.
- Display windows: glass with a stronger sheen and a faint reflection of the corridor lights (static gradient in the sheen texture); stone base in `marble-cream`; a lit header; inside: a dark velvet backdrop, warm spot halo, the plinth in dark oak with a bronze edge; the window figure/product stays.
- Compact sidelights: slim bronze mullions.
**Spots:** `storefront-pistage`, `storefront-axis`, `wing-north-mid`.

### Task A11 (agent 11): fascia, blade signs, logos

**Owns:** `src/world/shopfront/signs.ts` (new), the fascia/blade part of `storefront()` in `src/world/shop.ts` (lines ~272–310), `shopFascia`, `lightboxFascia`, `lightboxBlade`, `bladeSign` in `src/world/signage.ts`, `BrandDef.logo` usage.
**Deliver:**
- Fascia: a thin bronze box; brand colour field with a dark inner vignette so it sits in the night; raised cream letters with a soft shadow; the brand logo when `BrandDef.logo` exists; emissive backlight halo (sprite) + bloom on High; a plum LED line under the fascia (one instanced strip per shop).
- Blade sign: same lightbox language on a bronze bracket; both faces.
- For `tier === 'compact'`: a smaller fascia with the monogram only.
**Spots:** `storefront-pistage`, `storefront-axis`, `wing-west-mouth`.

### Task A12 (agent 12): Coming Soon hoardings and the 122 Pop-up kiosk

**Owns:** `src/world/shopfront/hoarding.ts` (new), the hoarding lines in `src/world/shop.ts` `buildShop` (lines ~161–165), `comingSoonTexture` / `popupTexture` in `src/world/signage.ts`.
**Deliver:**
- Coming Soon: a dark charcoal hoarding with a cream "Coming Soon · قريباً" lockup, a bronze frame, 3 teaser posters (generated SVG silhouettes in the brand style of the mall) and a backlit 122 monogram; a plum LED line at the top; a warm halo.
- Pop-up kiosk: an open-sided bronze-and-oak kiosk 4 m wide with a counter, a backlit "122 Pop-up · Book this space · احجز المساحة دي" panel, a small screen (reuse `screenMesh` with the `brand` slide of the mall), spot halos; the hoarding plane replaced by the kiosk.
**Spots:** `soon-1`, `popup`.

### Task A13 (agent 13): shop shell per tier (walls, floor, ceiling, lighting)

**Owns:** `src/world/shopInterior/shell.ts` (new), `walls()`, `slotLights()`, `can()` and the ceiling lines in `src/world/boutiqueShop.ts` (lines ~174–263), the per-tier shell geometry in `src/config/boutiquePlan.ts` (`lights`, add `washes: {x,z,yaw,w}[]`), `GYPSUM_SOFFIT`.
**Deliver (three templates, by tier):**
- **Flagship:** cream plaster walls with a full-height `oak-dark` feature back wall tinted with the brand colour (mix 35 %), a `marble-cream` floor with a dark border, a charcoal ceiling with a bronze-edged central coffer and slot lights, 8 spot cans, wall washes on every lightbox run.
- **Standard:** cream plaster, a brand-tinted back wall panel (2/3 width), `carpet-dark` floor with a marble threshold, charcoal ceiling with two slot lines, 6 cans.
- **Compact:** a jewel box: dark walls (`THEME.wallShadow` tone) with one brand-colour backlit panel, `marble-dark` floor, a single central slot light ring, 4 cans; brighter halos so the products pop.
- Keep the function signatures used by `buildBoutique`.
**Spots:** `shop-pistage`, `shop-hashbag`, `shop-axis`.

### Task A14 (agent 14): lightbox walls, section signs, hero wall

**Owns:** `src/world/lightbox.ts`, `buildSectionPlaques`, `hero()` in `src/world/boutiqueShop.ts` (lines ~280–336), `SECTION_SIGN` / `drawSectionSign` / `boutiqueHeader` in `src/world/signage.ts`, `LIGHTBOX` / `HERO` constants in `src/config/boutiquePlan.ts`.
**Deliver:**
- Lightboxes: a bronze frame with a 3 mm warm emissive inner edge (so each box glows at night), the photo plane unchanged, a soft halo per run (not per box: one instanced sprite per 1.1 m pitch is fine, cap 28 per shop), a dark plaque with cream type and the price.
- Section signs: charcoal plaque, cream serif title, Arabic below, a bronze rule, backlit.
- Hero wall: full-bleed campaign photo on a dark velvet wall with a bronze frame, a thin plum LED line below, 2 spot halos; brand logo if present.
**Spots:** `shop-pistage`, `shop-hashbag`.

### Task A15 (agent 15): standees, plinths, islands

**Owns:** `src/world/showcase.ts`, `plinth()`, `island()` and the standee/island placement block in `src/world/boutiqueShop.ts` (lines ~84–112, ~264–279), `src/world/displays.ts` (`OAK`, `OAK_DARK`, `CREAM`, `BRONZE` materials + `frameGeometry`).
**Deliver:**
- Standees on `marble-dark` plinths with a bronze edge and an up-light halo; a soft contact shadow; the cut-out slightly rim-lit (a second additive copy of the standee alpha scaled 1.03 with 12 % opacity, same mesh batch — only on Medium/High).
- Islands: `oak-dark` top on a bronze base, a glass vitrine bell (`windowGlass()`) over the cut-outs, a spot halo above each island, dark leather (`leather-tan`) tray inserts.
- `displays.ts` materials move to the night palette (keep names) so Le Voile's half (A17) and `?boutique` follow.
**Spots:** `shop-pistage`, `shop-axis`.

### Task A16 (agent 16): counters, fitting room, stories and catalogue screens

**Owns:** `rewardsCounter()` in `src/world/shop.ts` (lines ~403–end), `screen()` and `fitting()` in `src/world/boutiqueShop.ts` (lines ~337–end), `src/world/storyScreen.ts` (framing only; playback logic untouched).
**Deliver:**
- 122 Coins counter: dark oak with a `marble-cream` top, a backlit "122 Coins · Rewards" panel in plum and cream, a bronze coin-slot detail, a halo; the interaction label unchanged.
- Fitting room: a plum velvet curtain (sine-waved plane, static), bronze rail, a "Fitting · القياس" backlit sign, a warm halo inside.
- Stories screen: a slim bronze portrait frame with a plum LED edge, a "stories" caption plaque; the "All products" screen: same frame language, landscape, on a bronze stand.
**Spots:** `shop-pistage`, `shop-hashbag`.

### Task A17 (agent 17): Le Voile's baked boutique at night

**Owns:** `src/world/bespoke/levoile.ts`, `src/world/boutique.ts` (`prepareBakedStore` only), `cardPanel` / `easelRow` / `lookbookStand` in `src/world/displays.ts` (geometry; materials are A15's — coordinate by reading them).
**Deliver:**
- The baked store is unlit (baked cream daylight). At night: darken it with a multiply tint on its `MeshBasicMaterial`s (`color` × 0.62 warm `#d9c4a8`) in `prepareBakedStore`, add warm spot halos and light pools where the store's 10 area lights were (positions from `BOUTIQUE` in `src/config/boutique.ts`), and a plum LED line along the cream partition.
- Card panels get a bronze frame + a warm edge glow; easels get a halo each; the rails' hangers unchanged.
- The hall half (lightbox hall) follows A13/A14 automatically; make sure the partition reads as one object with both halves.
**Spots:** `shop-levoile`, `shop-levoile-hall`.

---

## Phase 2 — integration (agent 20, second run)

### Task I: merge, measure, decide, ship

- [ ] Order: A13 → A14 → A15 → A16 → A10 → A11 → A12 → A6 → A7 → A8 → A9 → A1 → A2 → A3 → A4 → A5 → A17 (interior first: most shared lines in `boutiqueShop.ts`; then storefronts; then corridors; then plaza; Le Voile last).
- [ ] For each branch: `git merge --no-ff decor/<id>`; resolve conflicts keeping both agents' intent (they edited different blocks; where the same line differs, prefer the later task's block and re-apply the earlier one's hook); `tsc` + `vitest` + `build`; `npm run bench -- --label after-<id> --spots <its spots + atrium-entrance + wing-north-mouth>`; if a budget is exceeded, first try the agent's own fallback notes, then reduce halo/pool counts or texture sizes in that area; if still over, revert that merge, record why, and continue.
- [ ] Full bench on all spots at low/medium/high: `npm run bench -- --label final`; write `docs/superpowers/notes/2026-10-06-decor-swarm-results.md` (tables vs baseline, per-area screenshots before/after side by side — copy the final PNGs into `docs/superpowers/notes/bench/final/`).
- [ ] Update `CLAUDE.md` "District 122 structure" (theme, pbr, halo, bench flag) and `README.md` flags (`?bench`).
- [ ] `npm run android:sync` and `cd android && gradlew assembleDebug`; report the APK size vs before; `adb install -r` on the connected device (`R5CXB1MLG1K`) and record `adb shell dumpsys gfxinfo com.district122.mall` frame stats after a 30 s walk if reachable (otherwise say it was not measured).
- [ ] Fast-forward `mobile-app` to `decor/base` (`git -C C:/xampp/htdocs/LevoileGame-mobile merge --ff-only decor/base`). Remove the `decor-*` worktrees (`git worktree remove`), keep the branches.
- [ ] Return the final report JSON: merged ids, reverted ids with reasons, bench table, APK size, screenshot folder.

## Self-review

- Spec coverage: 20 areas ↔ F1, F2, F3 (= 18, 19, 20), A1–A17, I. The spec's Low requirement is enforced by the Low bench row in every task. The "3 templates per tier" decision is A13. The dark-direction details map to A2 (sky), A1/A6 (floors), A3/A8 (walls), A11/A14 (lightboxes), F1 (rig). Textures CC0 = F2.
- Names used across tasks: `THEME`, `pbrMaterial`, `PbrName`, `addLightHalo`, `buildHalos`, `BENCH_SPOTS`, `npm run bench`, `floorAtlas`, `corridorFloorMat`, `oakVeneerMat`, `marbleCladMat`, `windowGlass`, `plant`, `premiumPlanter`, `addPool`, `addRectHalo`, `logoTexture`, `labelSign`, `screenMesh`. All exist today or are produced by F1/F2/F3.
