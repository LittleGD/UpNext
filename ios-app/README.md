# UpNext iOS (Capacitor)

Next.js 웹앱(`up-next-phi.vercel.app`)을 감싸는 iOS 네이티브 쉘. 안드로이드의 Bubblewrap TWA(`/android-twa/`)와 동일한 포지션.

상위 플랜: `/Users/jmlee/.claude/plans/twa-breezy-swing.md`

---

## 현재 상태 (Phase 1 — 스캐폴딩 완료, 사용자 작업 대기)

### 완료 (자동화된 셋업)
- [x] `ios-app/` 디렉토리 + Capacitor 8 의존성 설치
- [x] `capacitor.config.ts` — Vercel 리모트 URL, 다크 테마, 스플래시/상태바 설정
- [x] `www/index.html` — 오프라인 fallback (네트워크 끊겼을 때 표시)
- [x] `.gitignore` — Xcode/CocoaPods/시크릿 제외
- [x] `public/apple-touch-icon.png` 180×180 생성 (웹용)
- [x] `src/app/layout.tsx` metadata에 `appleWebApp` 추가
- [x] CocoaPods 1.16.2 (`brew install cocoapods`)
- [x] `npx cap add ios` — `ios/App/App.xcworkspace` 생성
- [x] `LaunchScreen.storyboard` 정리 — UIImageView 제거, 단색 `#0A0A0A` 배경만 남김
- [x] `Assets.xcassets/Splash.imageset` 삭제 (Capacitor 기본 로고 제거)
- [x] `Info.plist` 정리 — 카메라/사진 권한 문구 추가, portrait-only (iPhone) / portrait + upside-down (iPad)
- [x] `npx cap sync ios` 완료 — 플러그인·config 반영

### 사용자가 직접 해야 하는 일 (남은 블로커)

#### 1. 1024×1024 앱 아이콘 마스터 (Figma에서 직접 내보내기 — 필수)
- **크기**: 1024×1024 PNG
- **배경**: 꽉 차게 (투명 배경 금지. Apple이 ITMS-90717로 리젝)
- **내용**: UpNext 로고 중앙, 여백은 약 10~15% (iOS는 자동으로 둥근 모서리 처리)
- **저장 위치**: `ios-app/resources/icon.png`
- **체크리스트**:
  - [ ] Figma 프레임 1024×1024, 배경을 `#0A0A0A`(또는 브랜드 색) 단색으로 깔 것
  - [ ] 내보낼 때 "Transparent background" 체크 해제
  - [ ] PNG로 Export → 파일 열어서 마우스 오버 시 "RGB" 표시(RGBA 아님) 확인

#### 2. ~~스플래시 마스터~~ — 완료 (로고 없음, 단색만)
정적 아이콘 스플래시 제거 완료. 세 레이어 전부 "가능한 한 빨리 지나가게" 처리됨:

| 레이어 | 상태 | 처리 |
|---|---|---|
| 1. iOS 시스템 LaunchScreen | ✅ 로고 제거 완료 | `LaunchScreen.storyboard`를 단색 `#0A0A0A` View로 교체. iOS 하드 플로어(~300ms)만 남음 |
| 2. Capacitor 플러그인 스플래시 오버레이 | ✅ 0프레임 세팅 완료 | `launchShowDuration: 0` + `launchFadeOutDuration: 0` |
| 3. 웹 모션 스플래시 | ✅ 유지 | `SplashScreen.tsx` (U↗Next 2.8s + fade 0.4s) — 실제 브랜드 모먼트 |
| 0. SSR 부트 커버 (웹, 모든 standalone 셸) | ✅ 추가 | `src/lib/bootCover.ts` + `layout.tsx`: 첫 페인트 ~ 모션 스플래시 사이의 OnboardingFlow 프레임을 `#0A0A0A` 로 가림. `NativeSplashHide` 가 `splashActive` 에 걷음, JS 실패 시 8s CSS 만료 |

**결과**: 앱 탭 → 검은 화면 깜박(~300ms, iOS 하드 플로어) → 바로 웹 로드 → U↗Next 모션.

**안드로이드(Capacitor)**: `capacitor.config.ts` 의 `SplashScreen.launchShowDuration 6000` 은 오프라인·멈춘 로드용 상한이고, 정상 경로는 `NativeSplashHide` 가 `splashActive` 순간 `hide()` 로 걷는다. `server.errorPath: 'index.html'` 로 메인 프레임 오류 시 Chromium 흰 오류 페이지 대신 다크 `www/index.html`(자동 재시도)이 뜬다.

#### 3. Apple Developer 포털 설정
1. https://developer.apple.com/account/resources/identifiers → **+** → App IDs
2. Bundle ID: **explicit `com.littlegd.upnext`**
3. Capabilities 체크 (전부 미리 켜두기):
   - [ ] Push Notifications
   - [ ] Associated Domains
   - [ ] Sign In with Apple
   - [ ] App Groups (위젯용, Phase 2.5)

#### 4. App Store Connect 레코드 생성
1. https://appstoreconnect.apple.com/apps → **+** → New App
2. 입력:
   - Platforms: iOS
   - Name: **UpNext**
   - Primary Language: English (U.S.)
   - Bundle ID: 방금 만든 `com.littlegd.upnext` 선택
   - SKU: `upnext-ios-001` (아무 고유 문자열이면 OK)

#### 5. Xcode 서명 설정 (프로젝트 생성 후)
`npm run open`으로 Xcode를 연 뒤:
1. 왼쪽 프로젝트 네비게이터에서 **App** 타깃 선택
2. **Signing & Capabilities** 탭
3. **Automatically manage signing** 체크
4. **Team**: 본인 Apple Developer 계정 선택
5. Xcode가 자동으로 프로비저닝 프로파일과 서명 인증서를 생성

#### 6. ~~Info.plist 카메라 권한~~ — 완료
이미 `ios/App/App/Info.plist`에 한국어 사유 문구로 추가됨 (`NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`).

#### 7. ~~iPad 지원~~ — 완료
`TARGETED_DEVICE_FAMILY = "1,2"` (iPhone + iPad Universal)이 Capacitor 템플릿에 기본 적용. Orientation도 portrait(iPhone) / portrait + upside-down(iPad)로 정리됨. 가로모드 허용하려면 `Info.plist`의 `UISupportedInterfaceOrientations~ipad`에 Landscape 두 값 추가.

---

## 일상 명령어

```bash
cd /Users/jmlee/Documents/UpNext/ios-app

# capacitor.config.ts / Info.plist / www 변경 시마다
npm run sync

# Xcode 열기 (아카이브·서명 작업 시)
npm run open

# 아이콘 마스터를 resources/icon.png에 둔 뒤, 전체 아이콘 사이즈 자동 생성
npm run assets
```

`npm run open`은 `ios/App/App.xcworkspace`를 연다 (`.xcodeproj`가 아님 — 워크스페이스를 반드시 열 것).

---

## 아카이브 & TestFlight 업로드 (Xcode GUI)

1. Xcode 상단 Destination: **Any iOS Device (arm64)** 선택 (시뮬레이터 아님)
2. **Product → Archive** (단축키: ⇧⌘B 먼저로 에러 체크, 그다음 Archive)
3. Organizer 창이 뜨면 **Distribute App → App Store Connect → Upload**
4. 15~60분 후 TestFlight에서 내부 테스터에게 배포 가능

---

## 트러블슈팅

**"pod: command not found"**
→ CocoaPods 미설치. 위 #1 참고.

**Xcode에서 "No signing certificate found"**
→ Xcode → Settings → Accounts → Apple ID → **Manage Certificates** → **+** → Apple Distribution

**"Archive" 메뉴가 회색**
→ Destination이 시뮬레이터일 것. **Any iOS Device (arm64)**로 변경.

**ITMS-90717 아이콘 알파 채널 리젝**
→ 1024 아이콘 내보낼 때 투명 배경 체크 해제. Preview.app에서 열어 보고 "File → Export" → "Alpha: off".

**`npx cap sync ios`에서 "Cannot find the Capacitor iOS platform"**
→ `npx cap add ios`를 먼저 실행했는지 확인.
