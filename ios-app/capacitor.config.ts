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
    // 'never': WebView 네이티브 safe-area 패딩 OFF. CSS env(safe-area-inset-*)가
    // 유일한 safe-area 소스가 되어 이중 패딩(네이티브 + CSS) 버그 제거.
    // 'always'로 두면 Header의 pt-[max(env(safe-area-inset-top),12px)]와 합쳐져
    // iPhone 14 Pro 상단에 59+59=118pt 공백이 생김.
    contentInset: 'never',
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
