//
//  UpNextApp.swift
//  UpNext — Native iOS App entry point.
//
//  Firebase iOS SDK 초기화 + SwiftUI Scene 생성.
//  Phase 0.3에서 Capacitor 플러그인을 폐기하고 native Firebase SDK 직통합.
//

import SwiftUI
import FirebaseCore

@main
struct UpNextApp: App {
    // 앱 전역 게임 상태 (Phase 4) — 모든 화면이 환경 객체로 공유.
    // GameStore 가 AuthService·UpHeroStore·GrowthStore 를 소유 → 함께 환경에 노출.
    @StateObject private var store = GameStore()
    @Environment(\.scenePhase) private var scenePhase

    /// 스플래시 모션이 끝나면 true → 본 컨텐츠 노출. 콜드 스타트 1회만 발생 (App 인스턴스
    /// 생애 동안 유지) — scenePhase background→active 복귀 시엔 다시 안 나타남.
    /// UI 테스트는 스플래시를 건너뛴다 (deterministic 진입을 위해 UITestBypassAuth 검사).
    @State private var splashDone: Bool = {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("UITestBypassAuth")
        #else
        return false
        #endif
    }()

    init() {
        // Firebase iOS SDK 초기화 — GoogleService-Info.plist를 읽어 FirebaseApp.default 설정.
        // FirebaseAuth/Firestore/Messaging 등 모든 Firebase 서비스가 이 시점 이후 사용 가능.
        FirebaseApp.configure()

        // 커스텀 폰트(April16th-Promise) 런타임 등록 — typography(_:) 모디파이어가 쓰는 폰트.
        AppFont.register()
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                ContentView()
                    .environmentObject(store)
                    .environmentObject(store.auth)
                    .environmentObject(store.upHero)
                    .environmentObject(store.growth)
                    .environmentObject(store.duo)
                if !splashDone {
                    // 스플래시는 본 컨텐츠 위에 떠 있다가 끝나면 사라진다. 아래에서 auth
                    // 부트스트랩이 병렬로 진행되므로 3.2s 뒤 곧장 로그인/메인으로 진입.
                    SplashView { splashDone = true }
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            .animation(.easeOut(duration: 0.2), value: splashDone)
            .onChange(of: scenePhase) { phase in
                if phase == .active {
                    store.reconcileForToday()
                }
            }
            // 14-completion-delay(선택) — 첫 렌더 후 사운드 프리웜(완료/레벨업 버퍼 합성 +
            //   오디오 세션·엔진 워밍). 첫 챌린지 완료의 동기 합성·세션활성 지연을 제거한다.
            .task { SoundPlayer.shared.prewarm() }
        }
    }
}
