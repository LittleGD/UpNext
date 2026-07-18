//
//  ContentView.swift
//  UpNext — 앱 루트 뷰 (R1 — UI/인터랙션 회복).
//
//  GameStore.phase 로 화면을 분기한다 (R1 부터 익명 모드 우선):
//   .launching/.loading → 로딩
//   .onboarding         → 온보딩 (익명·로그인 공통)
//   .ready              → 메인 (익명·로그인 공통, LoginOverlay 는 별도 overlay)
//   .failed             → 에러
//
//  로그인 화면은 *별도 phase 가 아닌 LoginOverlayView (overlay)* — `.ready` 위에
//  표시·해제. 익명 사용을 가로막지 않음.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: GameStore

    var body: some View {
        ZStack {
            switch store.phase {
            case .launching, .loading:
                BootLoadingView()
            case .onboarding:
                OnboardingView()
            case .ready:
                MainTabView()
            case let .failed(message):
                BootErrorView(message: message)
            }

            // LoginOverlay — 익명 모드에서 사용자가 백업 권유받을 때만 표시.
            // 로그인 성공 또는 "건너뛰기" → showLoginOverlay = false 로 자동 해제.
            if store.showLoginOverlay {
                LoginView()
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                    .zIndex(1)
            }

            // MergeConflictDialog — 익명 → 로그인 시 양쪽 데이터 충돌 한정.
            if let conflict = store.mergeConflict {
                MergeConflictDialogView(conflict: conflict)
                    .transition(.opacity)
                    .zIndex(2)
            }
        }
        .animation(.easeOut(duration: 0.25), value: store.showLoginOverlay)
        .animation(.easeOut(duration: 0.25), value: store.mergeConflict)
        // 16-reroll-missing — scenePhase onChange(UpNextApp:57-60) 는 SwiftUI 의 알려진
        //   함정으로 콜드 런치의 최초 `.active` 전환을 놓치는 경우가 있다. 루트 onAppear 를
        //   폴백으로 둬 하루 롤오버(reconcileForToday)가 매 앱 진입 시 무조건 1회 보장되게
        //   한다. daily 가 아직 nil 이면 guard 로 안전 no-op 이라 중복 호출 비용은 무시 가능.
        .onAppear { store.reconcileForToday() }
        // 폰트/로케일 단일 출처 — 기기 로케일이 아닌 *앱 내 언어*(progress.language)를
        // 환경 locale 로 주입한다. Typography 가 @Environment(\.locale) 로 폰트 family 를
        // 고르는데(ko→April16th Promise), 기기 로케일이 en 이면 본문이 Menlo 로 폴백되고
        // 한글이 시스템 고딕으로 깨지던 버그를 차단. 웹의 lang 속성=앱 언어 동작과 일치.
        // `.locale` 은 중국어 zh→zh-Hans 로 매핑(카탈로그 코드)해 Text 카탈로그 해석을 보장.
        .environment(\.locale, (store.progress?.language ?? .ko).locale)
    }
}

// MARK: - 단계별 화면

/// Auth 확인 / 클라우드 부트스트랩 진행 중.
private struct BootLoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image("Wordmark")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(height: 48)
                .foregroundStyle(Color.accentPrimary)
            ProgressView()
                .tint(Color.accentPrimary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }
}

/// 부트스트랩 실패 — 재시도.
private struct BootErrorView: View {
    @EnvironmentObject private var store: GameStore
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            PixelIcon(.cancel, size: 36, color: Color.colorError)
            // message 는 런타임 String 이지만 고정된 에러 키 집합이라 LocalizedStringKey 로
            // 감싸 카탈로그 lookup → 인앱 언어로 해석(verbatim 회피).
            Text(LocalizedStringKey(message))
                .typography(.body)
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
            Button("다시 시도") { store.retry() }
                .buttonStyle(.borderedProminent)
                .tint(Color.accentPrimary)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }
}

// 로그인·부트스트랩 완료 후의 메인 앱은 MainShell.swift 의 MainTabView.
