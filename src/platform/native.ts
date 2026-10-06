// Native shell (Capacitor) glue: haptics, the Android back button and the splash screen.
// Everything degrades to a no-op (or the Vibration API) in a plain browser.

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { SplashScreen } from '@capacitor/splash-screen'

export const isNative = Capacitor.isNativePlatform()

export type HapticKind = 'light' | 'medium' | 'success'

let hapticsOn = true
export function setHaptics(on: boolean): void {
  hapticsOn = on
}

export function haptic(kind: HapticKind): void {
  if (!hapticsOn) return
  if (isNative) {
    const p =
      kind === 'success'
        ? Haptics.notification({ type: NotificationType.Success })
        : Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light })
    p.catch(() => {})
    return
  }
  try {
    navigator.vibrate?.(kind === 'light' ? 8 : kind === 'medium' ? 16 : [12, 40, 18])
  } catch {
    /* unsupported */
  }
}

/** Hides the native splash once the first screen is painted. */
export function hideSplash(): void {
  if (isNative) SplashScreen.hide().catch(() => {})
}

/** Android back button: `onBack` returns false when there is nothing left to close, which backgrounds the app. */
export function onBackButton(onBack: () => boolean): void {
  if (!isNative) return
  App.addListener('backButton', () => {
    if (!onBack()) App.minimizeApp().catch(() => {})
  }).catch(() => {})
}
