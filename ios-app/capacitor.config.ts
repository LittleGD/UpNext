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
  android: {
    // iOS 의 contentInset:'never' 와 동등 효과 — 안드로이드는 기본적으로 WebView가
    //   safe-area padding 을 자동 적용하지 않으므로 추가 옵션 불필요.
    //   CSS env(safe-area-inset-*) 만으로 일관 처리.
    backgroundColor: '#0A0A0A',
    // Mixed content (https 페이지에서 http 리소스) 차단 — 보안 기본값.
    allowMixedContent: false,
    // WebView 가 키 이벤트를 우선 처리. 게임/입력 안정성 위해 유지.
    captureInput: true,
    // 프로덕션 빌드에서는 chrome://inspect debugging 비활성화.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // @capacitor-firebase/authentication 네이티브 handler는 providers 배열에 명시된 것만 init.
    // 빠뜨리면 signInWithApple/signInWithGoogle이 "Provider not enabled"로 reject됨.
    //
    // skipNativeAuth=true: 플러그인이 OAuth credential(idToken+nonce)만 획득하고 네이티브 Firebase
    // sign-in은 스킵. 이후 JS 쪽에서 signInWithCredential로 Firebase Web SDK에 로그인.
    // false로 두면 native가 먼저 idToken을 소모해서 JS 재사용 시 `auth/missing-or-invalid-nonce` 발생
    // (특히 Apple이 엄격). 우리는 WKWebView 웹앱이라 JS 로그인만 필요하므로 true가 정답.
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['apple.com', 'google.com'],
    },
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
