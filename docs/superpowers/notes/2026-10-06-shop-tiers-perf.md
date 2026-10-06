# Shop tiers: performance notes

**Method.** The in-app browser pane was hidden overnight, so `requestAnimationFrame` didn't run and FPS couldn't be sampled. Instead each sample:
1. teleports to the shop;
2. drives the game manually for 6 s (`lv.game.tick()` + `gl.finish()` every 16 ms, so loaders and the pacer run);
3. reports the mean wall time per frame (tick + render + GPU finish) over the last 40 frames, plus `renderer.info` (calls, triangles, live textures and geometries).

Same machine and viewport for before and after. Absolute ms are pessimistic: `gl.finish` serialises the GPU. Compare relatively.

## Baseline (before tiers), commit 068e828

| Quality | Target | ms/frame | Draw calls | Triangles | Textures (cumulative) |
|---|---|---|---|---|---|
| medium (auto) | pistage | 14.6 | 129 | 194 k | 204 |
| medium | nourhan | 15.0 | 133 | 202 k | 326 |
| medium | axis | 40.1 / 32.4 (two runs, still loading) | 163–167 | 194 k | 393–528 |
| medium | levoile | 14.2 | 92 | 219 k | 427 |
| medium | atrium | 16.1 | 146 | 227 k | 553 |
| low | pistage | 15.4 | 125 | 178 k | 553 |
| low | axis | 22.0 | 163 | 177 k | 553 |

## After tiers (Task 6, commit 144892f)

| Quality | Target | ms/frame | Draw calls | Triangles | Textures (cumulative) |
|---|---|---|---|---|---|
| low | pistage (flagship) | 10.9 | 116 | 221 k | 295 |
| low | nourhan (flagship) | 10.8 | 66 | 221 k | 333 |
| low | axis (compact) | 14.9 | 67 | 217 k | 358 |
| medium | pistage | 17.1 | 128 | 243 k | 365 |
| medium | nourhan | 10.5 | 76 | 243 k | 368 |
| medium | axis | 9.3 | 72 | 238 k | 368 |

The shop-interior cost no longer grows with product count. Flagships are at or below the baseline's draw calls, and the compact Axis drops from 163 to ~70 calls.

## Final (after Task 8, commit 921024b): mobile viewport 375×812, quality low

| Target | ms/frame | Draw calls | Triangles | Textures (cumulative) |
|---|---|---|---|---|
| pistage (flagship) | 12.9 | 77 | 317 k | 185 |
| axis (compact) | 14.8 | 57 | 314 k | 189 |

Baseline at low: pistage 15.4 ms / 125 calls, axis 22.0 ms / 163 calls.

- **Acceptance:** met. Frame time is at or below the baseline, and flagship draw calls are well under baseline + 30.
- **Load time:** interiors take longer to load in the hidden, unthrottled test pane. `imagePacer` falls back to a 100 ms timer when `requestAnimationFrame` doesn't run, so each lightbox atlas draws a few cells per 100 ms. In a visible tab the pacer runs every frame.
