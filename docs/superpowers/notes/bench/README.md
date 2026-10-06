# Bench harness (District 122 décor swarm)

Measures ms/frame, draw calls and texture memory at fixed spots on each quality tier, with
screenshots, on a phone-sized viewport (844×390 @ DPR 2, Chrome/ANGLE headless). Every décor
agent measures with the same command so numbers and screenshots are comparable:

```bash
npm run bench -- --spots atrium-entrance,wing-north-mid --label A6
npm run bench -- --label baseline --docs            # all 18 spots × low/medium/high
npm run bench -- --label A6 --compare docs/superpowers/notes/bench/baseline.json
```

| Flag | Meaning |
|---|---|
| `--spots a,b,c` | Spot ids from `src/bench/spots.ts` (`BENCH_SPOT_IDS`); default all 18. |
| `--q low,medium,high` | Tiers; default all three. `low` runs with a 4× CPU throttle (CDP) from the settle phase on. |
| `--label name` | Output name: `docs/superpowers/notes/bench/<label>.json`, `screenshots/bench/<label>/<spot>-<q>.png`. |
| `--docs` | Also writes JPEGs ≤ 300 KB to `docs/superpowers/notes/bench/<label>/` for committing. |
| `--compare other.json` | Prints Δ ms / Δ calls / Δ MB / Δ tris against another run. |
| `--override <dir>` | Serves any URL path that exists under `<dir>` instead of `public/` (Playwright route; nothing is written to the repo). |
| `--headed` | Visible Chrome. |

The script starts its own Vite dev server (port 5190+) and its own Chrome (Playwright
`channel: 'chrome'`, no browser download), so it never touches the app's preview pane. It
bundles `src/bench/spots.ts` with the Vite build API into `node_modules/.cache/district-bench/`
(Vite's SSR module runner hangs on this project).

## What a row means

- `msFrame` / `msMedian` / `msP95`: CPU time of `tick + render submit` per frame (mean / median /
  p95) over 150 frames. `msInterval` / `fps`: rAF-to-rAF interval (vsync-capped at ~16.7 ms).
- `calls` / `callsMax`: `engine.frameCalls().total` (bloom passes included); `triangles`.
- `textures`: `renderer.info.memory.textures`. `textureMB`: **estimate** of the uploaded
  (GPU-resident) textures: Σ w × h × 4 × 1.33 over every texture reachable from the scene's
  materials that `renderer.properties` has uploaded. `textureMBScene`: same sum over every
  reachable texture, uploaded or not (the warmer uploads hidden shop interiors over time, so
  the resident figure grows towards it). `texHist`: uploaded textures by longer side
  (`4096:9 2048:40 1024:156 512:35 <512:9`). Render targets (mirror, bloom, PMREM) are not counted.
- `settled`: image loading was idle for 1 s before sampling (shops within 34 m load their
  photos two at a time; from the plaza that takes 20–30 s). `NO` = the 90 s timeout hit; the
  numbers then include loading stalls.
- `budget`: plaza ≤ 220 calls, wing ≤ 300, shop ≤ 130; ≤ 16 ms on medium/high, ≤ 33 ms on low
  (throttled); ≤ 180 MB textures on low, ≤ 320 MB on medium.

Numbers on a loaded machine (several agents benching at once, a build running) are approximate:
report them as measured; the integrator re-measures sequentially.

## In-app flow (`?bench=<spot>&q=<tier>`)

`src/bench/run.ts`: the tier is forced before the engine exists (`store.quality`, so the
governor never steps it down), `nodemo` + `nolock` are added by a one-time reload, the intro
and the avatar editor are skipped (`phase: 'playing'` straight after boot), `body.bench` hides
`#ui`, the player is teleported to the spot's pose (yaw and pitch), then the page waits ≥ 4 s
and until image loading is idle, samples 150 frames and publishes the result on
`window.__bench` and as `document.title = 'BENCH ' + JSON`. A boot failure publishes an
error row instead, so the script fails fast.

## Baseline (`baseline.json`, taken on `decor/base` @ 37b2f7a before any décor change)

`decor/base` does not boot as committed: `public/models/avatar/avatar.glb` (commit e8b401d)
names the dress belt piece `belt.001` while `src/actors/avatar/pieces.ts` asks for `belt`, so
`buildPeople` throws `avatar piece missing: belt` and the app ends in `phase: 'error'`. The
baseline was therefore taken with `--override` pointing at a copy of that GLB whose node and
mesh are renamed `belt` (nothing else differs; the décor numbers don't depend on it). The
integrator should pick up the rebuilt GLB from the avatar swarm (or rename the piece) before
Phase 1, otherwise every area agent's bench will report `boot failed`.
