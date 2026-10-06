# Mobile app (Android first): design

**Status:** decided with the user on 2026-10-06 ("a proper app for Android and iOS that plays better than PUBG"). The user answered four questions, then asked for the work to be done overnight.

## Decisions (user)

| Question | Answer |
|---|---|
| iOS | **Android only for now.** This machine is Windows; an iOS build needs a Mac and an Apple Developer account. |
| Assets | **Inside the app** (offline, about 180 MB). No server needed. |
| "Better than PUBG" | All four: PUBG-style controls, third person by default, smooth 60 fps, real-app feel. |
| Where to work | Branch `mobile-app` in its own worktree, from the last commit. The uncommitted avatar work on `122-mall` is untouched. |

## Approach

**Capacitor wraps the existing Vite + Three.js build.** No rewrite: the mall, HUD and store are the same code as the web version, and `dist/` ships inside the APK. A native engine (Unity/Unreal) would throw the whole project away, and a PWA can't lock orientation, hide the system bars or vibrate reliably.

- `capacitor.config.ts`: app id `com.district122.mall`, name "District 122", `webDir: dist`.
- `android/`: the generated Gradle project, committed. `MainActivity` adds immersive full screen, keep-screen-on and drawing under the cutout; the manifest locks `sensorLandscape`.
- `src/platform/native.ts`: the only file that imports Capacitor. Haptics, the Android back button and the splash screen; every call is a no-op (or the Vibration API) in a browser.
- Fonts are bundled (`@fontsource`) instead of loaded from Google Fonts, so signage and UI look right offline.
- Icons and splash: `scripts/app-assets.mjs` renders the sources into `assets/`; `capacitor-assets` cuts the densities.

## Controls (touch)

1. **Joystick** at a fixed home (bottom left, safe-area aware); it still re-centres under the thumb anywhere in the left 42% of the screen.
2. **Sprint lock:** drag the stick well past its rim, straight up, onto the lock marker and release: the player keeps running forward. Touching the stick again ends it.
3. **Run button** (bottom right): toggles run mode. **Camera button** next to it: first person ↔ third person.
4. **Look sensitivity** setting (4 steps, multiplies `touchLookSens`). **Vibration** setting.
5. Game pads use physical left/right, so they don't mirror in Arabic.
6. Tap-to-walk and tap-to-open stay as they are.

## Third person by default on touch

The store's default `view` is `third` on coarse-pointer devices; persisted store v3 moves existing touch users there once. Desktop stays first person.

## Frame rate

1. **Frame cap** setting: 30 / 60 / Max, default 60 (`shouldRender` in `controlsMath.ts`). On a 120 Hz phone the 60 cap halves GPU work and heat.
2. **Dynamic resolution** on touch with Auto quality (`resolutionStep` in `engine/quality.ts`): each 2 s governor window, the render scale drops by 0.1 (floor 0.7) when the frame rate is under 85% of the target, and rises by 0.05 after three good windows. A quality tier only drops once the scale has bottomed out.

## Real-app feel

- Full screen, landscape, no browser chrome, screen stays on.
- Haptics ride along the existing UI sounds (`audio.click`, `addToCart`, `coin`, `stamp`, `celebrate`, `success`), so no call sites change.
- Android back: closes the open overlay, else opens the menu, else backgrounds the app.
- Short landscape screens get denser sheets and a smaller minimap (`@media (max-height: 520px)`).
- `?touch` forces the touch HUD in a desktop browser for layout checks.

## Not in this round

- iOS project and signing.
- A signed release build / Play Store listing (the output is a debug APK).
- Asset delivery from a server, and shrinking the 163 MB of product photos.
- Gyro aiming, jump, crouch, gamepad support.

## Verification

- `tsc`, unit tests (sprint lock, frame cap, resolution step), `npm run build`.
- Browser at 844 × 390 with `?touch`: HUD layout, sprint lock via synthetic touch events, menu and product sheet.
- `gradlew assembleDebug`, then install and launch on the emulator.
- Real-phone frame rates are **not** measured in this round (the connected phone was not authorised for debugging).
