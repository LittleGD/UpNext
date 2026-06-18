//
//  LevelUpBurstScreen.swift
//  UpNext — 온보딩 마지막 단계 + 인게임 레벨업 연출.
//
//  웹 src/components/onboarding/LevelUpScreen.tsx 포팅.
//  타임라인:
//   0     : Zap 아이콘 + Lv 0 + 칭호 0 등장 (spring scale 0.5→1)
//   300ms : "chargeUp" 사운드
//   0-1500ms (delay 300ms): XP 바 0%→100% fill (easeInOut)
//   1800ms: phase="burst" — Zap 떨림, 레벨 0→1 롤링, 칭호 변경, 16개 파티클 발사, levelUp 사운드
//   2600ms: phase="done" — 메시지 + 계속 버튼 fade-in
//

import SwiftUI

struct LevelUpBurstScreen: View {
    var nextLevel: Int = 1
    let onComplete: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: Phase = .filling
    @State private var barProgress: Double = 0
    @State private var iconScale: Double = 0.5
    @State private var iconOpacity: Double = 0
    @State private var iconRotation: Double = 0
    @State private var iconShake: CGSize = .zero
    @State private var labelLevel: Int = 0
    @State private var labelYOffset: CGFloat = 30
    @State private var labelOpacity: Double = 0
    @State private var messageOpacity: Double = 0
    @State private var buttonOpacity: Double = 0
    @State private var particles: [BurstParticle] = []
    @State private var particlesAnimating = false

    private enum Phase { case filling, burst, done }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 24) {
                iconSection
                barSection
                messageSection
            }
            Spacer()
            continueButton
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { runSequence() }
    }

    private var iconSection: some View {
        VStack(spacing: 8) {
            PixelIcon(.zap, size: 48, color: Color.accentPrimary)
                .offset(iconShake)
                .scaleEffect(iconScale)
                .rotationEffect(.degrees(iconRotation))
                .opacity(iconOpacity)

            VStack(spacing: 4) {
                Text("Lv. \(labelLevel)")
                    .typography(.title)
                    .foregroundStyle(Color.accentPrimary)
                Text(titleFor(level: labelLevel))
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
            }
            .offset(y: labelYOffset)
            .opacity(labelOpacity)
        }
    }

    private var barSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .leading) {
                Capsule().fill(Color.bgElevated)
                Capsule().fill(Color.accentPrimary)
                    .frame(width: barWidth)
            }
            .frame(height: 8)
            .overlay(alignment: .trailingFirstTextBaseline) {
                // particles — bar 오른쪽 끝에서 발사
                ZStack {
                    ForEach(particles) { p in
                        Circle()
                            .fill(p.color)
                            .frame(width: p.size, height: p.size)
                            .offset(x: particlesAnimating ? p.x : 0,
                                    y: particlesAnimating ? p.y : 0)
                            .scaleEffect(particlesAnimating ? 0 : 1)
                            .opacity(particlesAnimating ? 0 : 1)
                    }
                }
                .offset(y: -20)
            }

            HStack {
                Text("Lv. 0").typography(.caption).foregroundStyle(Color.textTertiary)
                Spacer()
                Text("Lv. \(nextLevel)").typography(.caption).foregroundStyle(Color.accentPrimary)
            }
        }
        .frame(maxWidth: 280)
    }

    private var barWidth: CGFloat {
        280 * CGFloat(barProgress)
    }

    private var messageSection: some View {
        Text("준비 완료! 첫 카드 뽑으러 가요.")
            .typography(.body)
            .foregroundStyle(Color.textPrimary)
            .multilineTextAlignment(.center)
            .opacity(messageOpacity)
    }

    private var continueButton: some View {
        Button {
            Haptics.play(.selection)
            onComplete()
        } label: {
            Text("계속")
                .typography(.body)
                .foregroundStyle(Color.bgPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
        }
        .opacity(buttonOpacity)
        .disabled(phase != .done)
    }

    // MARK: - 시퀀스

    private func runSequence() {
        if reduceMotion {
            barProgress = 1
            iconScale = 1
            iconOpacity = 1
            labelLevel = nextLevel
            labelYOffset = 0
            labelOpacity = 1
            messageOpacity = 1
            buttonOpacity = 1
            phase = .done
            return
        }

        // 0ms — icon + Lv0 entrance
        withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
            iconScale = 1
            iconOpacity = 1
            labelYOffset = 0
            labelOpacity = 1
        }

        // 300-1800ms — bar fill
        withAnimation(.easeInOut(duration: 1.5).delay(0.3)) {
            barProgress = 1
        }

        // 1800ms — burst: 떨림 + 롤링 + 파티클
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            phase = .burst
            SoundPlayer.shared.play(.levelUp)
            // 아이콘 떨림 (sequence: 7 steps × ~70ms)
            runIconShake()
            // 레벨 라벨 롤링 (out → in)
            withAnimation(.spring(response: 0.4, dampingFraction: 0.55)) {
                labelYOffset = -30
                labelOpacity = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                labelLevel = nextLevel
                labelYOffset = 30
                labelOpacity = 0
                withAnimation(.spring(response: 0.4, dampingFraction: 0.55)) {
                    labelYOffset = 0
                    labelOpacity = 1
                }
            }
            // 파티클 발사 — 16개 방사 + 무작위 거리
            spawnParticles()
        }

        // 2600ms — done
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) {
            phase = .done
            withAnimation(.easeOut(duration: 0.4)) {
                messageOpacity = 1
            }
            withAnimation(.easeOut(duration: 0.4).delay(0.2)) {
                buttonOpacity = 1
            }
        }
    }

    private func runIconShake() {
        let steps: [CGSize] = [
            CGSize(width: -3, height: -2),
            CGSize(width: 3, height: 1),
            CGSize(width: -2, height: -1),
            CGSize(width: 2, height: 2),
            CGSize(width: -1, height: -1),
            CGSize(width: 1, height: 0),
            .zero,
        ]
        for (i, s) in steps.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.07) {
                iconShake = s
            }
        }
        // 회전 wobble
        let rotSteps: [Double] = [-5, 5, -4, 4, -2, 2, 0]
        for (i, r) in rotSteps.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.085) {
                withAnimation(.easeInOut(duration: 0.085)) { iconRotation = r }
            }
        }
    }

    private func spawnParticles() {
        let colorPool: [Color] = [
            .accentPrimary, .accentCyan, .accentSecondary, .rarityLegend,
        ]
        particles = (0..<16).map { i in
            let angle = Double(i) * (360.0 / 16.0) + Double.random(in: -10..<10)
            let rad = angle * .pi / 180
            let dist = 60.0 + Double.random(in: 0..<80)
            return BurstParticle(
                id: i,
                x: cos(rad) * dist,
                y: sin(rad) * dist,
                size: 1.5 + Double.random(in: 0..<1.5),
                color: colorPool[Int.random(in: 0..<colorPool.count)],
                delay: Double.random(in: 0..<0.15)
            )
        }
        particlesAnimating = false
        DispatchQueue.main.async {
            withAnimation(.easeOut(duration: 0.9)) {
                particlesAnimating = true
            }
        }
    }

    private func titleFor(level: Int) -> LocalizedStringKey {
        level <= 0 ? "초보 도전자" : "갓생 견습생"
    }

    private struct BurstParticle: Identifiable {
        let id: Int
        let x: Double
        let y: Double
        let size: Double
        let color: Color
        let delay: Double
    }
}
