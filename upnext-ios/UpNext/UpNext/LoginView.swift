//
//  LoginView.swift
//  UpNext — 로그인 화면 (Phase 4 슬라이스 3).
//
//  웹 src/components/auth/LoginOverlay.tsx 를 네이티브 화면으로 포팅.
//  store.phase == .needsSignIn 일 때 ContentView 라우터가 이 화면을 띄운다.
//  로그인 성공 → AuthService 상태 변화 → GameStore 부트스트랩 → phase 전환으로
//  ContentView 가 자동으로 MainTabView 로 넘어간다 (이 화면이 직접 dismiss 안 함).
//
//  네이티브는 클라우드 백업 상태가 단일 진실의 원천 — 로컬 캐시 슬라이스 전까지
//  로그인은 필수 게이트다 (웹의 "건너뛰기" 미포팅).
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthService

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // 브랜딩 — 워드마크 SVG (텍스트 렌더 대신 정식 로고 자산).
            VStack(spacing: 14) {
                Image("Wordmark")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 56)
                    .foregroundStyle(Color.accentPrimary)
                Text("로그라이크 챌린지 카드로\n매일 갓생을 시작하세요")
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            // 로그인 — Apple/Google 두 버튼은 *동등한 옵션*. 색 차이가 위계를 만들지
            //   않도록 둘 다 Color.bgSurface (다크) + 흰 텍스트로 통일하고, 브랜드
            //   identity 는 아이콘만 차별화 (Apple 흰 로고 · Google 4색 G).
            //   Apple SIWA 가이드: 검정 배경 + 흰 텍스트 + apple.logo 조합은 compliant.
            //   Google 가이드: 다크 테마 G 로고 사용 허용.
            VStack(spacing: 12) {
                providerButton(
                    title: "Apple로 계속하기",
                    icon: Image(systemName: "apple.logo"),
                    iconIsTemplate: true
                ) { Task { await auth.signInWithApple() } }

                providerButton(
                    title: "Google로 계속하기",
                    icon: Image("GoogleG"),
                    iconIsTemplate: false
                ) { Task { await auth.signInWithGoogle() } }

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

                Text("로그인하면 진행 상황이 클라우드에 저장되어\n기기를 바꿔도 이어집니다")
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 6)
            }
            .padding(.bottom, 48)
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
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
