# PBR texture library sources

All maps come from [ambientCG](https://ambientcg.com/) and are **CC0 1.0** (public domain, no attribution required).
Downloaded as the 1K JPG zips by `node scripts/fetch-textures.mjs` (into `tools/textures-src/`, git-ignored) and
converted by `.venv/Scripts/python scripts/optimize-images.py --pbr` to `<map>.webp` (1024, q82; normal maps q90)
and `<map>.s.webp` (512) in this folder. Used at runtime through `src/engine/pbr.ts` (`pbrMaterial(name)`).

| Library name | Role | ambientCG asset | Mean linear albedo (tint base) |
|---|---|---|---|
| `marble-dark` | Dark polished floor marble (Nero Marquina style, light veins) | `Marble016` | untinted |
| `marble-cream` | Cream marble: pilasters, counter tops, medallion disc | `Marble014` | untinted |
| `oak-dark` | Oak wainscot and shop joinery (tinted to `THEME.oak`) | `Wood049` | 0.198 / 0.125 / 0.075 |
| `bronze-brushed` | The only metal: frames, rails, bezels (tinted to `THEME.bronze`) | `Metal009` | 0.288 / 0.299 / 0.314 |
| `plaster-cream` | Cream plaster walls (tinted to `THEME.wall`) | `Plaster003` | 0.680 / 0.656 / 0.633 |
| `velvet-plum` | Seating cushions (tinted to `THEME.plum`) | `Fabric036` | 0.491 / 0.491 / 0.491 |
| `carpet-dark` | Nook / lounge carpet (tinted to `THEME.wallShadow`) | `Carpet016` | 0.500 / 0.435 / 0.293 |
| `concrete-dark` | Charcoal ceilings where a texture is wanted (tinted to `THEME.ceiling`) | `Concrete017` | 0.136 / 0.150 / 0.155 |
| `leather-tan` | Leather accents (bench straps, counter fronts) | `Leather023` | untinted |

Maps per name: `color` (`*_Color.jpg`), `normal` (`*_NormalGL.jpg`, OpenGL convention as three.js expects) and
`roughness` (`*_Roughness.jpg`, loaded only with `roughnessMap: true`).

The tint base is the mean albedo of the colour map in linear space (measured over a 256 px downscale with
Pillow); `pbrMaterial` divides the requested colour by it, so `pbrMaterial('oak-dark', { color: THEME.oak })`
shows `THEME.oak` as its mean colour. Re-measure and update `DEFS` in `src/engine/pbr.ts` when an asset changes.

Sizes (after `--pbr`): 54 files, about 6.1 MB in total (5.0 MB for the 1024 set, 1.2 MB for the 512 set).
