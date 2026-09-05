import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // 안드로이드 Play 리스팅(app.vercel.upnext)을 업데이트해야 하므로 TWA 와 동일한 id 를 쓴다.
  // (iOS 는 이 프로젝트를 쓰지 않는다 — 네이티브 SwiftUI 앱 upnext-ios/ 가 com.littlegd.upnext 로 출시됨)
  appId: 'app.vercel.upnext',
  appName: 'UpNext',
  webDir: 'www',
  server: {
    url: 'https://up-next-phi.vercel.app',
    cleartext: false,
    iosScheme: 'https',
    // 메인 프레임 로드 실패(오프라인, DNS, 5xx)에 Chromium 의 밝은 오류 페이지 대신 로컬 다크
    // 페이지(www/index.html)를 띄운다. 그 페이지는 플러그인 접근이 없어 스플래시를 직접 걷지
    // 못하며, 아래 SplashScreen.launchShowDuration 타이머가 걷는다. 페이지 자체의 재시도
    // 스크립트(online 이벤트 + 8s/20s 폴링)가 원격 origin 으로 되돌린다.
    errorPath: 'index.html',
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
    // 콜드 스타트 체감을 iOS(빈 다크 → 모션 스플래시)와 맞추기 위한 설정.
    // Capacitor 8 안드로이드는 Android 12 SplashScreen API(setKeepOnScreenCondition)로
    // 시스템 스플래시를 그대로 붙잡아 두므로, 여기서 0 을 주면 WebView 의 원격 로드·SSR·
    // 하이드레이션(온보딩 첫 화면 1프레임 번쩍)이 전부 노출된다.
    // 정상 경로: 웹 모션 스플래시가 마운트되어 splashActive 가 켜지는 순간(보통 2~5초)
    //   NativeSplashHide(src/components/native)가 SplashScreen.hide() 로 즉시 걷는다.
    //   hide() 는 pre-draw 리스너를 제거하므로 뒤늦게 도는 아래 타이머는 no-op.
    // launchShowDuration 6000 = 오프라인·멈춘 로드용 네이티브 상한. 느린 망에서 먼저 끝나도
    //   아래 WebView 는 이미 다크(android.backgroundColor + 웹 SSR 부트 커버, src/lib/bootCover.ts)
    //   라 앱 UI 가 새지 않는다. launchAutoHide false 는 "JS 가 hide() 를 못 부르면 영원히
    //   검은 화면"(errorPath 페이지는 플러그인 접근 불가)이라 채택하지 않는다.
    // launchFadeOutDuration 0: 다크(#0A0A0A) → 다크 위 모션이라 페이드가 필요 없다.
    SplashScreen: {
      launchShowDuration: 6000,
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
      overlaysWebView: true,
    },
    // Capacitor 8 안드로이드의 실제 시스템 바 처리기 (StatusBar 설정은 15+에서 사실상 무동작).
    // style DARK = 다크 배경 -> 밝은 아이콘. insetsHandling css = WebView 140+ 에서는
    // env(safe-area-inset-*) 패스스루, 미만에서는 네이티브 패딩 폴백 (windowBackground 가 보임 —
    // styles.xml 에서 다크로 지정).
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
    },
  },
};

export default config;
