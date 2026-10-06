# Roadmap

Current state: the District 122 is a frontend-only demo (plaza, three wings, 16 brands + 4 Coming Soon, Le Voile's real boutique, 122 Coins, simulated crowd). Next steps, roughly in order:

## 1. Real catalogues per brand (Shopify per brand)
- Replace the generated placeholder products (`src/data/mallCatalog.ts`) with one real data source per brand: a data file first, then a Shopify Storefront collection or store per brand (`ShopifyStorefrontProvider` already exists for Le Voile).
- Map variants to sizes and colours, swatches from metafields, inventory ("sold out", disabled sizes), `modelOutfit` and hosted cutouts from tags or metafields.
- Per-brand checkout: cart lines grouped by brand, redirect to the brand's `checkoutUrl`; handle the return from checkout ("thank you" scene).
- Brand logos (`BrandDef.logo`) and Arabic names confirmed with each client.

## 2. Bespoke décor per brand
- Le Voile is done (`src/world/bespoke/levoile.ts`, baked boutique). Give each open brand its own interior through `ShopContext.bespoke[brandId]`: palette, fixtures, signage and display layout.
- Open the 4 Coming Soon units as brands sign up (replace the `soon-N` slot in `WINGS`).

## 3. Live backend: Laravel + Reverb on Cloudways
Each mock in `src/social/` gets a real implementation of the same interface:
- `PresenceSource` → a Reverb presence channel per mall: real shoppers, what they view, purchases.
- `StaffChatService` → realtime staff ↔ customer chat on private channels with a staff console in Laravel (reply, send product cards and full looks). Customers never chat with each other.
- `DealsService` → group deals, flash sales and coupons from an admin panel, broadcast as events.
- `IdentityService` → Sanctum + SMS OTP.
- Server-side 122 Coins and coupons: earning and spending validated on the server, brand-scoped coupons redeemed as discount codes.
- Hosting: Laravel + Reverb on Cloudways; the static frontend keeps deploying through the GitHub Action.

## 4. Visual quality and weight
- **Whole-mall lighting bake** (plaza, wings, shops) in the boutique's warm look, plus **KTX2** textures for the GLBs and large images.
- **Kit re-bake without soft goods:** the baked garments are hidden at runtime (`hideSoft`), but their faint baked shadows remain; re-bake the kit without them.
- Mobile: measure real phones (current numbers are desktop/High only) and tune tiers.

## 5. Analytics
- Events: shop entered, product viewed (dwell time), add to cart, checkout started, order placed, coins earned and redeemed, exit.
- Heatmaps of walked paths and gaze per wing and shop, to inform brand placement; send to GA4 / Shopify Pixels; A/B test layouts.

## 6. AI first responder
- Staff chat gets an AI first responder in Egyptian Arabic and English, with hand-off to a human. Tools: search catalogues, "take me to…" (`game.teleport`), add to cart, size advice, current promos.
- Optional voice input/output with lip-flap on the assistant.

## 7. Real-shopper avatars and events
- Real shoppers as crowd avatars via the presence channel (the crowd already renders `PresenceSource` members).
- Events on the plaza stage: launch days, collection reveals, guided tours hosted by a stylist.

## Housekeeping
- Remove the now-unused `DisplayKind` / `BrandDef.display` / `SectionStyle.display` and the kit's rack / hangbay / scarfbay pieces (and their bake in `scripts/blender/export_store.py` `kit_pieces()` if `?boutique` no longer needs them).
- Playwright smoke test (boot → add to cart → mock checkout → exit).
- Accessibility: keyboard-only UI navigation, reduced-motion mode, and a 2D catalogue toggle.
