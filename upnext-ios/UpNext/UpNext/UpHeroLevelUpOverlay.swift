//
//  UpHeroLevelUpOverlay.swift
//  UpNext — 영웅 레벨업 풀스크린 오버레이.
//
//  웹 components/uphero/UpHeroLevelUpOverlay.tsx 포팅.
//  세션 종료 후 헤로 레벨이 올라가면 표시. 1.6s 후 자동 dismiss.
//   - 어두운 백드롭 fade-in
//   - "LEVEL UP" 텍스트 spring scale + golden glow
//   - 신규 레벨 숫자 0→target 카운트업
//   - 16 방사 파티클
//   - 사운드: levelUp
//

import SwiftUI

struct UpHeroLevelUpOverlay: View {
    let oldLevel: Int
    let newLevel: Int
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var rootOpacity: Double = 0
    @State private var titleScale: Double = 0.5
    @State private var titleOpacity: Double = 0
    @State private var levelDisplay: Int = 0
    @State private var particlesAnimating = false
    @State private var glowRadius: CGFloat = 0

    var body: some View {
        ZStack {
            Color.black.opacity(0.85 * rootOpacity)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { dismiss() }

            VStack(spacing: 20) {
                Text("LEVEL UP")
                    .typography(.display)
                    .tracking(4)
                    .foregroundStyle(Color.accentPrimary)
                    .shadow(color: Color.accentPrimary.opacity(0.7), radius: glowRadius)
                    .scaleEffect(titleScale)
                    .opacity(titleOpacity)

                HStack(spacing: 12) {
                    Text("Lv.\(oldLevel)")
                        .typography(.title)
                        .foregroundStyle(Color.textTertiary)
                    PixelIcon(.arrowUp, size: 18, color: Color.accentPrimary)
                    Text("Lv.\(levelDisplay)")
                        .typography(.title)
                        .monospacedDigit()
                        .foregroundStyle(Color.accentPrimary)
                }
                .opacity(titleOpacity)
            }
            .overlay(
                // 16 방사 파티클
                particleBurst
            )
        }
        .onAppear { runSequence() }
    }

    private var particleBurst: some View {
        ZStack {
            ForEach(0..<16, id: \.self) { i in
                let angle = Double(i) * (360.0 / 16.0) + Double.random(in: -8..<8)
                let rad = angle * .pi / 180
                let dist = particlesAnimating ? 80 + Double.random(in: 0..<60) : 0
                Circle()
                    .fill([Color.accentPrimary, Color.accentCyan, Color.rarityLegend][i % 3])
                    .frame(width: 4, height: 4)
                    .offset(x: cos(rad) * dist, y: sin(rad) * dist)
                    .scaleEffect(particlesAnimating ? 0 : 1)
                    .opacity(particlesAnimating ? 0 : 1)
            }
        }
    }

    private func runSequence() {
        SoundPlayer.shared.play(.levelUp)
        Haptics.play(.success)

        if reduceMotion {
            rootOpacity = 1
            titleScale = 1
            titleOpacity = 1
            levelDisplay = newLevel
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { dismiss() }
            return
        }

        withAnimation(.easeOut(duration: 0.2)) { rootOpacity = 1 }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.55)) {
            titleScale = 1
            titleOpacity = 1
            glowRadius = 24
        }
        // 카운트업 0→newLevel
        let total = newLevel
        let stepInterval = 0.05
        for i in 0...total {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3 + Double(i) * stepInterval) {
                levelDisplay = i
            }
        }
        // 파티클 발사 (0.5s 시점)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.easeOut(duration: 0.8)) { particlesAnimating = true }
        }
        // 자동 dismiss 1.6s 후
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { dismiss() }
    }

    private func dismiss() {
        withAnimation(.easeIn(duration: 0.25)) {
            rootOpacity = 0
            titleOpacity = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { onDismiss() }
    }
}
