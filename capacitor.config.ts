import type { CapacitorConfig } from '@capacitor/cli'

// Native shell for the mall: the built site (dist/) ships inside the app, so it runs offline.
const config: CapacitorConfig = {
  appId: 'com.district122.mall',
  appName: 'District 122',
  webDir: 'dist',
  backgroundColor: '#fbf6f8',
  android: { backgroundColor: '#fbf6f8' },
  plugins: {
    // The WebView draws edge to edge, so the keyboard height reaches the page as a CSS variable (native.ts).
    Keyboard: { resize: 'none' },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#fbf6f8',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
}

export default config
