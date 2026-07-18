//
//  LoginView.swift
//  UpNext — 로그인 오버레이 (R1 — UI/인터랙션 회복).
//
//  웹 src/components/auth/LoginOverlay.tsx 충실 포팅:
//   - line 42-46  "건너뛰기" — saveToStorage("login_prompt_seen", true) + dismiss
//   - line 60-67  fixed inset-0 z-50 + bg-black/70 + backdrop-blur-sm
//   - line 62-67  spring(y:40→0, opacity:0→1, scale:0.95→1)
//
//  R1 부터 *익명 모드 우선* — 이 화면은 별도 phase 가 아니라 ContentView 의
//  ZStack overlay 로 표시. store.showLoginOverlay 가 true 일 때만 등장.
//  사용자가 "건너뛰기" → store.dismissLoginPrompt() → 익명 모드 유지.
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var store: GameStore

    var body: some View {
        ZStack {
            // 백드롭 — bg-black/70 + backdrop-blur-sm.
            // 웹 LoginOverlay (L:60-67) 는 백드롭 탭 dismiss *없음* — 사용자는 "건너뛰기"
            // 버튼이나 로그인 성공으로만 닫을 수 있다. iOS 도 동일 (web fidelity 강제).
            Color.black.opacity(0.7)
                .ignoresSafeArea()
                .background(.ultraThinMaterial)

            VStack(spacing: 20) {
                // 브랜딩 — 워드마크 SVG.
                VStack(spacing: 14) {
                    Image("Wordmark")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(height: 48)
                        .foregroundStyle(Color.accentPrimary)
                    Text("다른 기기에서도 이어하기")
                        .typography(.heading)
                        .foregroundStyle(Color.textPrimary)
                    Text("로그인하면 진행 상황이\n모든 기기에서 실시간으로 동기화돼요")
                        .typography(.body)
                        .foregroundStyle(Color.textSecondary)
                        .multilineTextAlignment(.center)
                }

                // 로그인 — Apple/Google 동등 옵션 (커밋 2d1a76b 의 디자인 유지).
                VStack(spacing: 10) {
                    providerButton(
                        title: AppConfig.loc("Apple로 계속하기"),
                        icon: Image(systemName: "apple.logo"),
                        iconIsTemplate: true
                    ) {
                        AuthFunnel.log(.loginAttempt, ["provider": "apple"])
                        Task { await auth.signInWithApple() }
                    }

                    providerButton(
                        title: AppConfig.loc("Google로 계속하기"),
                        icon: Image("GoogleG"),
                        iconIsTemplate: false
                    ) {
                        AuthFunnel.log(.loginAttempt, ["provider": "google"])
                        Task { await auth.signInWithGoogle() }
                    }

                    if auth.isWorking {
                        ProgressView()
                            .tint(Color.accentPrimary)
                            .padding(.top, 4)
                    }
                    if let error = auth.lastError {
                        Text(error)
                            .typography(.caption)
                            .foregroundStyle(Color.colorError)
                            .multilineTextAlignment(.center)
                    }
                }

                // 건너뛰기 — 웹 LoginOverlay L:129-135.
                Button {
                    store.dismissLoginPrompt()
                } label: {
                    Text("나중에 할게요")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("loginOverlaySkipButton")
            }
            .padding(.horizontal, 24)
            .padding(.top, 32)
            .padding(.bottom, 24)
            .frame(maxWidth: 380)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 16)
        }
    }

    /// 공급자 버튼 골격 — Apple/Google 동등 옵션으로 *완전 동일* 외형. 색·크기·padding 모두
    /// 일치하고, 아이콘만 브랜드 식별 표지. SwiftUI .typography(.body) 가 lineSpacing 8pt
    /// 를 부여해 디센더가 frame boundary 에 닿는 케이스가 있어 `.fixedSize(vertical:)` 와
    /// 명시 `.padding(.vertical, 18)` 로 텍스트가 절대 잘리지 않게 강제.
    ///  - iconIsTemplate=true 면 .renderingMode(.template) + textPrimary tint (Apple).
    ///  - iconIsTemplate=false 면 자산 원본 색 유지 (Google 4색 G).
    private func providerButton(
        title: String,
        icon: Image,
        iconIsTemplate: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Group {
                    if iconIsTemplate {
                        icon
                            .renderingMode(.template)
                            .resizable()
                            .scaledToFit()
                            .foregroundStyle(Color.textPrimary)
                    } else {
                        icon
                            .resizable()
                            .scaledToFit()
                    }
                }
                .frame(width: 20, height: 20)

                Text(title)
                    .typography(.body)
                    .lineLimit(1)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(Color.textPrimary)
            }
            .padding(.vertical, 18)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                // 미세한 라인 — Color.bgPrimary 위에서 카드 분리감 확보.
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color.bgElevated, lineWidth: 1)
            )
        }
        .disabled(auth.isWorking)
    }
}
