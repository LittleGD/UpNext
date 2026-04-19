import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.littlegd.upnext',
  appName: 'UpNext',
  webDir: 'www',
  server: {
    url: 'https://up-next-phi.vercel.app',
    cleartext: false,
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0A0A0A',
    limitsNavigationsToAppBoundDomains: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      launchFadeOutDuration: 0,
      backgroundColor: '#0A0A0A',
      showSpinner: false,
      splashImmersive: false,
      splashFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0A',
      overlaysWebView: false,
    },
  },
};

export default config;
