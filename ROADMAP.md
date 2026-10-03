# Roadmap

## 1. Shopify Storefront API (next)
- Fill `ShopifyStorefrontProvider`: fetch per collection (already written), map variants to sizes and colors, and color swatches from metafields.
- Cart sync: mirror the local cart into a Shopify Cart (`cartCreate`/`cartLinesAdd`/`cartLinesUpdate`) so it survives devices, and add buyer identity before redirecting to `checkoutUrl`.
- Drive `modelOutfit` and the hosted cutout URL from product tags or metafields; regenerate cutouts in a CI job (`scripts/remove-bg.py`).
- Inventory: show "sold out" on panels and disable sizes without stock.
- Handle Shopify's return from checkout (order status page → "thank you" scene).

## 2. Store visuals: baked boutique scene
- Use the Le Voile boutique Blender scene (`EL_REBAT_Render.blend`) as the store. Bake its Cycles lighting (lightmaps/AO) into textures and export a Draco-compressed GLB to `public/models/mall/`.
- Place sections, products, models and the cashier on anchors (empties) authored in Blender, so merchandisers can rearrange the store without code.
- Adopt its look across the procedural parts: warm palette (cream, oak, bronze, marble) and warm area lighting.
- Convert product photos to WebP/AVIF at 1024 px (currently ~45 MB of JPEG/PNG) and generate KTX2 textures for the GLB.

## 3. Better clothing on models
- Replace procedural bodies with a CC0 rigged base character (slot already wired: `public/models/characters/base.glb`).
- Outfit meshes per silhouette (abaya, wide-leg pants, maxi skirt, cardigan) skinned to the same rig, textured from the product photo (projected or AI-generated texture), instead of a flat tint.
- Hijab variants as skinned meshes with light cloth wobble (vertex shader), plus hair cards for non-hijabi models.
- Pose library and subtle idle loops (Mixamo-retargeted).

## 4. Voice / chat shopping assistant
- A sales-assistant character opens a chat panel ("Ask Mariam"), reusing the existing Le Voile bot logic and tone in Egyptian Arabic and English.
- Tools: search the catalogue, "take me to…" (calls `game.teleport`), add to cart, size advice, current promos.
- Voice input and output (Web Speech API, or a TTS service) with lip-flap animation on the assistant.

## 5. Analytics
- Events: section entered, product viewed (dwell time), add to cart, checkout started, order placed, exit (with or without purchase).
- Heatmap of walked paths and gaze (crosshair targets) per section, to inform layout and merchandising.
- Send to GA4 / Shopify Pixels; A/B test layouts and display types.

## 6. Multiplayer / guided tours
- Shared sessions (WebRTC or a small WebSocket relay): shop with friends and see each other's avatars.
- Guided tours: a stylist hosts a live session, with teleport-together, product spotlight and voice.
- Events in the mall: launch days and collection reveals with timed scenes.

## Housekeeping
- Unit tests for the cart store, phone validation and layout generation; a Playwright smoke test (boot → add to cart → mock checkout → exit).
- Accessibility: keyboard-only UI navigation, reduced-motion mode, and a 2D catalogue toggle for anyone who prefers it.
