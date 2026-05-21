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
            Image(systemName: "xmark.octagon.fill")
                .font(.system(size: 36))
                .foregroundStyle(Color.colorError)
            Text(message)
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
