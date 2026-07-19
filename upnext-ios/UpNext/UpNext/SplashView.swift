//
//  SplashView.swift
//  UpNext — 부트 모션 스플래시 (Phase 5 슬라이스 — 웹 SplashScreen.tsx 포팅).
//
//  웹 src/components/onboarding/SplashScreen.tsx 의 framer-motion 시퀀스를
//  SwiftUI Animation 으로 1:1 포팅. 타이밍 동일 — 2,800ms 모션 + 400ms fade.
//
//  순서:
//   t=0       : U↗ spring up (y 40→0, opacity 0→1, scale 1.15→1)
//   t=0.5     : 컨테이너 x 64→0 (U↗ 가 처음에 중앙에 있다가 Next 가 등장하면서 왼쪽 정렬)
//   t=0.55    : Next clip-reveal 왼→오 (mask Rectangle 너비 0→full)
//   t=1.4     : 태그라인 fade-in (opacity 0→0.6, y 8→0)
//   t=1.4     : 로딩바 width 0→48
//   t=2.8     : 루트 opacity 1→0 (400ms fade)
//   t=3.2     : onComplete 콜백
//
//  웹의 spring(duration: 0.7, bounce: 0.3) 은 iOS 17+ API 라 16.2 호환을 위해
//  response:dampingFraction: 형태로 근사.
//

import SwiftUI

struct SplashView: View {
    let onComplete: () -> Void

    // MARK: - 모션 상태

    @State private var uOffsetY: CGFloat = 40
    @State private var uOpacity: Double = 0
    @State private var uScale: CGFloat = 1.15
    @State private var nextRevealRatio: CGFloat = 0
    @State private var containerOffsetX: CGFloat = 64
    @State private var taglineOpacity: Double = 0
    @State private var taglineOffsetY: CGFloat = 8
    @State private var loadingBarRatio: CGFloat = 0
    @State private var rootOpacity: Double = 1
    @State private var started = false

    // MARK: - 크기 상수

    private let logoHeight: CGFloat = 75
    // wordmark-left viewBox 50×52 → at h=75: w ≈ 72.1
    private var uWidth: CGFloat { logoHeight * 50.0 / 52.0 }
    // wordmark-right viewBox 89×52 → at h=75: w ≈ 128.4
    private var nextWidth: CGFloat { logoHeight * 89.0 / 52.0 }

    // MARK: - 타이밍 (웹 SplashScreen.tsx 와 동일)

    private static let motionMs: Double = 2.8
    private static let fadeMs: Double = 0.4

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()

            // 중앙 — 워드마크 + 태그라인
            VStack(spacing: 24) {
                HStack(spacing: 0) {
                    Image("WordmarkLeft")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: uWidth, height: logoHeight)
                        .foregroundStyle(Color.accentPrimary)
                        .offset(y: uOffsetY)
                        .scaleEffect(uScale)
                        .opacity(uOpacity)

                    Image("WordmarkRight")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: nextWidth, height: logoHeight)
                        .foregroundStyle(Color.accentPrimary)
                        // clip-path inset(0 100% 0 0) → 0 → mask 너비 0→full.
                        .mask(alignment: .leading) {
                            Rectangle()
                                .frame(width: nextWidth * nextRevealRatio, height: logoHeight)
                        }
                }
                .offset(x: containerOffsetX)

                // 19-i18n-mixed — 인앱 언어(부트 시 App Group 선반영)로 명시 해석.
                // 문자열 리터럴 Text 는 카탈로그 LocalizedStringKey 로 취급돼, SplashView 가
                // ContentView 의 `.environment(\.locale)` 밖에 있어 *기기 로케일*로 새는(스플래시만
                // 앱 본문과 다른 언어) 결함이 있었다. verbatim 인자로 카탈로그 경로 자체를 차단.
                Text(verbatim: OnboardingI18n.splashTagline(Language.current))
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                    .multilineTextAlignment(.center)
                    .opacity(taglineOpacity)
                    .offset(y: taglineOffsetY)
            }

            // 하단 — 로딩바 (절대 위치)
            VStack {
                Spacer()
                Capsule()
                    .fill(Color.bgElevated)
                    .frame(width: 48, height: 4)
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(Color.accentPrimary.opacity(0.4))
                            .frame(width: 48 * loadingBarRatio, height: 4)
                    }
                    .padding(.bottom, 48)
            }
        }
        .opacity(rootOpacity)
        .onAppear {
            // 동일 인스턴스가 onAppear 를 두 번 받아도 모션이 한 번만 돌도록.
            guard !started else { return }
            started = true
            runAnimation()
        }
    }

    // MARK: - 모션 시퀀스

    private func runAnimation() {
        // 1) U↗ spring — 웹 type:spring duration:0.7 bounce:0.3 의 response/damping 근사.
        withAnimation(.spring(response: 0.6, dampingFraction: 0.65)) {
            uOffsetY = 0
            uOpacity = 1
            uScale = 1
        }

        // 2) 컨테이너 슬라이드 — easeOut 0.8s, delay 0.5s.
        withAnimation(.easeOut(duration: 0.8).delay(0.5)) {
            containerOffsetX = 0
        }

        // 3) Next clip-reveal — easeOut 0.6s, delay 0.55s.
        withAnimation(.easeOut(duration: 0.6).delay(0.55)) {
            nextRevealRatio = 1
        }

        // 4) 태그라인 fade-in — easeOut 0.5s, delay 1.4s.
        withAnimation(.easeOut(duration: 0.5).delay(1.4)) {
            taglineOpacity = 0.6
            taglineOffsetY = 0
        }

        // 5) 로딩바 — easeInOut 1.2s, delay 1.4s.
        withAnimation(.easeInOut(duration: 1.2).delay(1.4)) {
            loadingBarRatio = 1
        }

        // 6) Fade-out — 2.8s 후 시작.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.motionMs) {
            withAnimation(.easeOut(duration: Self.fadeMs)) {
                rootOpacity = 0
            }
        }

        // 7) 완료 콜백 — fade-out 끝(3.2s) 시점.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.motionMs + Self.fadeMs) {
            onComplete()
        }
    }
}
