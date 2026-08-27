//
//  WelcomeGiftOverlay.swift
//  UpNext — 신규 유저 시작 선물(100코인) 축하 오버레이.
//
//  리롤이 유료화되면서 첫 리롤 한 번은 앱이 대신 내준다 — 그 100코인이 도착하는
//  순간을 연출로 만든다. 지급 자체는 UpHeroStore.claimWelcomeGift() 가 최초 1회만
//  수행하고(영속), 이 뷰는 표시와 확인 버튼만 담당한다.
//
//  연출 관례는 UpHeroLevelUpOverlay 를 따른다: 백드롭 fade-in → spring 팝인 →
//  방사 파티클. 다만 이건 자동 dismiss 하지 않는다 — "받기" 를 눌러 닫는다
//  (선물을 받는 행위 자체가 첫 인터랙션이 되도록).
//

import SwiftUI

struct WelcomeGiftOverlay: View {
    /// 지급된 코인 수 (UpHeroStore.welcomeGiftCoins).
    let coins: Int
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var rootOpacity: Double = 0
    @State private var cardScale: Double = 0.72
    @State private var cardOpacity: Double = 0
    @State private var glowRadius: CGFloat = 0
    @State private var particlesAnimating = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.85 * rootOpacity)
                .ignoresSafeArea()

            VStack(spacing: 18) {
                // 아이콘 박스 없이 선물 아이콘 단독 — 글로우로만 강조.
                PixelIcon(.gift, size: 56, color: Color.accentPrimary)
                    .shadow(color: Color.accentPrimary.opacity(0.7), radius: glowRadius)
                    .overlay(particleBurst)

                VStack(spacing: 8) {
                    Text("시작 선물")
                        .typography(.title)
                        .foregroundStyle(Color.textPrimary)
                    Text(AppConfig.loc("\(coins)코인이 도착했어요. 첫 리롤에 쓸 수 있어요."))
                        .typography(.body)
                        .foregroundStyle(Color.textSecondary)
                        .multilineTextAlignment(.center)
                }

                UNButton(AppConfig.loc("받기"), variant: .primary) { dismiss() }
                    .padding(.top, 4)
            }
            .padding(28)
            .frame(maxWidth: 340)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 20))
            .padding(.horizontal, 24)
            .scaleEffect(cardScale)
            .opacity(cardOpacity)
        }
        .onAppear { runSequence() }
    }

    /// 12 방사 파티클 — 선물이 "터지는" 한순간. UpHeroLevelUpOverlay 와 같은 방식.
    private var particleBurst: some View {
        ZStack {
            ForEach(0..<12, id: \.self) { i in
                let angle = Double(i) * (360.0 / 12.0) + Double.random(in: -8..<8)
                let rad = angle * .pi / 180
                let dist = particlesAnimating ? 56 + Double.random(in: 0..<44) : 0
                Circle()
                    .fill([Color.accentPrimary, Color.accentCyan, Color.rarityLegend][i % 3])
                    .frame(width: 4, height: 4)
                    .offset(x: cos(rad) * dist, y: sin(rad) * dist)
                    .scaleEffect(particlesAnimating ? 0 : 1)
                    .opacity(particlesAnimating ? 0 : 1)
            }
        }
        .allowsHitTesting(false)
    }

    private func runSequence() {
        SoundPlayer.shared.play(.packOpen)
        Haptics.play(.success)

        if reduceMotion {
            rootOpacity = 1
            cardScale = 1
            cardOpacity = 1
            return
        }

        withAnimation(.easeOut(duration: 0.2)) { rootOpacity = 1 }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.62)) {
            cardScale = 1
            cardOpacity = 1
            glowRadius = 20
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) {
            withAnimation(.easeOut(duration: 0.8)) { particlesAnimating = true }
        }
    }

    private func dismiss() {
        SoundPlayer.shared.play(.collect)
        Haptics.play(.light)
        withAnimation(.easeIn(duration: 0.22)) {
            rootOpacity = 0
            cardOpacity = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { onClose() }
    }
}
