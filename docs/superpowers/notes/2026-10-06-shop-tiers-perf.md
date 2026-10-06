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
