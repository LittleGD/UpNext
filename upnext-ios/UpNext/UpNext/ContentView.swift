//
//  ContentView.swift
//  UpNext — 앱 루트 뷰 (단계 기반 라우터, Phase 4 슬라이스 3).
//
//  GameStore.phase 로 화면을 분기한다:
//   .launching/.loading → 로딩  ·  .needsSignIn → 로그인  ·  .ready → 메인  ·  .failed → 에러
//
//  Phase 4 가 진행되며 MainTabView 의 탭이 실제 게임 화면(Daily Home / Collection /
//  Camp …)으로 채워진다. 현재는 디자인 갤러리(Phase 1 참조) + 설정.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: GameStore

    var body: some View {
        switch store.phase {
        case .launching, .loading:
            BootLoadingView()
        case .needsSignIn:
            LoginView()
        case .onboarding:
            OnboardingView()
        case .ready:
            MainTabView()
        case let .failed(message):
            BootErrorView(message: message)
        }
    }
}

// MARK: - 단계별 화면

/// Auth 확인 / 클라우드 부트스트랩 진행 중.
private struct BootLoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("UpNext")
                .typography(.display)
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
