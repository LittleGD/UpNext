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

            // 로그인
            VStack(spacing: 12) {
                providerButton(
                    title: "Apple로 계속하기", systemImage: "apple.logo",
                    foreground: .white, background: .black
                ) { Task { await auth.signInWithApple() } }

                providerButton(
                    title: "Google로 계속하기", systemImage: nil,
                    foreground: Color(hex: 0x1F1F1F), background: .white
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

    private func providerButton(
        title: String,
        systemImage: String?,
        foreground: Color,
        background: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title).typography(.body)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .foregroundStyle(foreground)
            .background(background, in: RoundedRectangle(cornerRadius: 12))
        }
        .disabled(auth.isWorking)
    }
}
