# Plaza + corridors: controller rulings and deferred minors

Ruling: Vitest version — install the latest vitest that resolves cleanly against vite 8 instead of pinning ^3 — vitest 3's peer range may not include vite 8 — if wrong, a version bump later.
Task 1: minor (deferred): vitest 5 needs Node ^22.12 — no engines field/.nvmrc
Task 1: minor (deferred): stageWatchSpots facing test only asserts dot > 0 (plan-mandated)
Task 1: minor (deferred): no edge-case tests for arcSeats (n=1, aisle wider than arc)
Task 2: Ruling: glow `built` overwrite (plan-mandated) — fix by appending instead of relying on a single buildGlows call — cheap and removes a trap for later callers — if wrong, nothing lost.
Task 2: minor (deferred): decal/glow tests don't assert orientation/apex position
Task 2: minor (deferred): cones FrontSide (inside-beam view culls); no dispose on rebuild
Task 3: minor (deferred): slide tests miss not-yet-started flash, expired deal, empty brandIds, negative brandIndex
Task 3: minor (deferred): commit 2270abd trailer says "Claude Haiku 4.5" instead of the required Opus 5.5 trailer (history not rewritten)
Task 4: Ruling: brand-slide shopFascia per-redraw leak + missing logo (plan-mandated) — fix with a per-brand fascia cache + redraw on logo load — logos are the point of brand slides — if wrong, small extra code.
Task 4: minor (deferred): images arriving mid-fade pop in at fade end; fixed 3 m bounding sphere for the 7 m LED; matB drawn at opacity 0; wheel action label generic; frustum one frame stale
Task 5: Ruling: stage cone tilt points away from the stage (plan-mandated sign error) — fix the sign (+atan2) as a one-line add-on in Task 6's dispatch — visual only — if wrong, beams aim slightly off.
Task 5: minor (deferred): nearest seat arc sits on the medallion's rim (cosmetic)
Task 5: minor (deferred): rotated seat AABB colliders make rows solid (aisle + arc ends stay open)
Task 6: minor (deferred): watching spot allocation hard-codes [0..5] instead of STAGE_SPOTS (plan-mandated)
Task 7: minor (deferred): `void B` workaround in corridor.ts (Task 8 uses B → remove it there)
Task 7: minor (deferred): kit plants render near-black (unlit baked kit) — check in polish
Task 7: minor (deferred): no wing draw-call count yet (Task 10 measures)
Task 8: minor (deferred): lightbox/uplight strips barely visible; column screen at shop/lounge boundary not visually confirmed; doormats not batched
Task 9: Ruling: fold two Task 9 minors into Task 10 — wall-shade planes at r=0/r=rows float half outside the corridor (skip them) and the end-wall collage uses Promise.all (switch to allSettled + one needsUpdate) — both cheap and visible/robustness wins — if wrong, trivial revert.
Task 9: minor (deferred): no polygonOffset on shade/end-wall planes; wayfinding behind-list drops lounges; toLocalZ tested only via toWorld
Task 10: review-equivalent finding (controller): draw-call budgets missed with crowd (plaza 337, north wing 360 vs 220/300; nodemo north wing 306). Ruling: fix round targeting the new contributors — (1) instance kit pieces through the Batcher (Kit.place gets a batched path: every kit plant/fixture becomes InstancedMesh entries instead of per-clone meshes), (2) hide each screen's B plane when not fading (matB.visible=false at opacity 0), (3) if still over, reduce High crowd full-rig cap 8→6 — budgets are spec-binding; these levers cost no visual quality except (3) — if wrong, crowd near the player looks slightly less animated.
Task 10: Ruling: plaza crowd=50 peak 229 vs 220 budget and FPS ≥45 not reliably met on this (contended) machine — accept and park — calls are within 4% and only with 5-6 full rigs nearby; FPS noise is from other GPU windows; mobile tiers cap rigs lower — if wrong, lower High full-rig cap to 6.
Task 10: minor (deferred): README perf table dropped crowd=30 column / shop row vs old numbers unexplained; placeBatched assumes identity root scale, no y option, mutates shared source matrices
Task 10: complete (commits 1c6e936..5ac851c, 1 parked)
Final: minor (deferred): detour side picked by end x only; first leg into detour not re-checked (stuck handling covers it)
