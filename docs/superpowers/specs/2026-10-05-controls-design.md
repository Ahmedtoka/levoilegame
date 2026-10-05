# Controls: design

**Status:** decided by the controller overnight (2026-10-05) from the user's request for "better controls". The user pre-approved overnight work.

## Goals

- Movement and looking feel smooth and premium on desktop and phones.
- Getting to a product, or to a place, takes fewer, easier inputs.

## Decisions

1. **Look smoothing (all platforms).**
   - Mouse/touch look deltas feed a target yaw and pitch; the camera eases towards the target with time constant `1 − exp(−dt·25)`.
   - This removes jitter from uneven pointer events without adding noticeable lag.
   - Keyboard turning (arrow keys) keeps its current rate.
2. **Tap-to-walk (touch, and click in drag-look mode).**
   - A tap on the floor (no interactable under it) walks the player to that point.
   - The pick ray must hit the floor (y = 0 plane) within 25 m and not through a wall: use `colliders.raycast` along the ray to the hit point.
   - A small plum ring marker appears at the target and fades on arrival.
   - The player turns to face the walking direction.
   - **Pathing:** a straight line with collision sliding. If the player doesn't make progress for 1 s, walking stops.
   - Any joystick or WASD input cancels it.
3. **Focus on product.**
   - Opening a product (E, tap, or a click on a card or model) eases the camera yaw and pitch over 0.35 s, so the product sits centred behind the sheet.
   - Position is unchanged.
   - Skip it in third person.
4. **Smoother third person.**
   - The camera follows its target with exponential smoothing on both position and orbit.
   - Collision pull-in stays instant; release eases out.
5. **Speed and feel.**
   - Acceleration and deceleration curves stay as they are.
   - Head bob amplitude drops by 40% (0.025 → 0.015) for comfort.
   - Walk speed stays at 3.3 m/s and run at 6.2 m/s.
6. **Touch quality of life.**
   - The joystick dead zone becomes 8 px.
   - Look sensitivity on touch scales with screen width: `0.0022 × 900 / max(600, innerWidth)`, clamped.
   - Double-tap on a product card opens it, the same as a single tap (already works).
7. **Prompts.** The interact prompt shows "E" on desktop and a hand icon on touch (already so). Add "Tap the floor to walk / المسي الأرض عشان تمشي" to the mobile controls hint.

## Non-goals

- Navmesh pathfinding.
- Gamepad support.
- Rebinding keys.

## Verification

- `tsc`, the unit tests, and a build.
- Unit-test the pure helpers:
  - the look-smoothing step;
  - the tap target validation (floor hit, max distance);
  - the walk-to arrival / stall logic, as a function of position, velocity, target and dt.
- Playwright:
  - simulate a tap-to-walk in `?nolock` (click on the floor) and assert the player moved towards the point and stopped within 0.5 m;
  - assert that pressing W cancels it;
  - open a product and assert the yaw changed towards it.
