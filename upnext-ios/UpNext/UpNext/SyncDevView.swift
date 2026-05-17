//
//  SyncDevView.swift
//  UpNext — Phase 4 슬라이스 1 검증용 개발 화면.
//
//  GameStore 를 환경 객체로 받아 확인:
//   (1) Apple / Google 네이티브 로그인 (AuthService)
//   (2) 로그인 시 GameStore 가 클라우드 데이터를 자동 부트스트랩 → progress/daily 표시
//
//  Phase 4 가 실제 게임 화면(Daily Home / Collection / Camp …)을 채우면 이 화면은
//  제거된다. 게임 액션은 화면별로 GameStore 에 한 슬라이스씩 추가된다.
//

import SwiftUI

struct SyncDevView: View {
    @EnvironmentObject private var store: GameStore
    @EnvironmentObject private var auth: AuthService

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                authCard
                storeCard
                if let err = auth.lastError {
                    Text(err)
                        .typography(.caption)
                        .foregroundStyle(Color.colorError)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    private var header: some View {
        VStack(spacing: 4) {
            Text("Phase 4 — 상태 스토어")
                .typography(.heading)
                .foregroundStyle(Color.accentPrimary)
            Text("네이티브 로그인 + GameStore 클라우드 부트스트랩")
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
        }
    }

    // MARK: - 인증

    @ViewBuilder private var authCard: some View {
        VStack(spacing: 12) {
            switch auth.state {
            case .unknown:
                ProgressView("Auth 상태 확인 중…")

            case .signedOut:
                Text("로그아웃 상태")
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                Button { Task { await auth.signInWithApple() } } label: {
                    Label("Apple로 로그인", systemImage: "apple.logo")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                Button { Task { await auth.signInWithGoogle() } } label: {
                    Text("Google로 로그인").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

            case let .signedIn(uid, provider, name):
                Label("\(provider) 계정 로그인됨", systemImage: "checkmark.seal.fill")
                    .typography(.body)
                    .foregroundStyle(.green)
                Text("UID  \(uid.prefix(20))…")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(Color.textSecondary)
                if let name, !name.isEmpty {
                    Text(name).typography(.caption).foregroundStyle(Color.textSecondary)
                }
                Button("로그아웃") { auth.signOut() }
                    .buttonStyle(.bordered)
            }

            if auth.isWorking { ProgressView() }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: - 스토어 부트스트랩

    @ViewBuilder private var storeCard: some View {
        VStack(spacing: 12) {
            Text("GameStore")
                .typography(.caption)
                .foregroundStyle(Color.textPrimary)

            switch store.phase {
            case .launching:
                Text("Auth 확인 중…")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)

            case .needsSignIn:
                Text("로그인하면 클라우드 데이터를 자동으로 불러옵니다")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.center)

            case .loading:
                ProgressView("클라우드 데이터 로드 중…")

            case .ready:
                if let p = store.progress, let d = store.daily {
                    VStack(spacing: 4) {
                        Label("부트스트랩 완료", systemImage: "checkmark.circle.fill")
                            .typography(.body)
                            .foregroundStyle(.green)
                        Text(progressSummary(p))
                            .typography(.caption)
                            .foregroundStyle(Color.textSecondary)
                            .multilineTextAlignment(.center)
                        Text("오늘(daily) \(d.date) · 드로우 \(d.drawnCards.count)장")
                            .typography(.micro)
                            .foregroundStyle(Color.textTertiary)
                    }
                }

            case let .failed(message):
                VStack(spacing: 8) {
                    Label("로드 실패", systemImage: "xmark.octagon.fill")
                        .typography(.body)
                        .foregroundStyle(Color.colorError)
                    Text(message)
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                        .multilineTextAlignment(.center)
                    Button("다시 시도") { store.retry() }
                        .buttonStyle(.bordered)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
    }

    private func progressSummary(_ p: UserProgress) -> String {
        "Lv.\(p.level) · \(p.totalDaysCompleted)일 완료 · 스트릭 \(p.currentStreak)\n"
        + "해금 카드 \(p.unlockedCardIds.count)장 · 모드 \(p.mode.rawValue)"
    }
}
