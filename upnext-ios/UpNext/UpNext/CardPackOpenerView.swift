//
//  CardPackOpenerView.swift
//  UpNext — 카드팩 개봉 화면.
//
//  웹 src/components/cards/CardPackOpener.tsx 충실 회복:
//   - tier 별 pre-open 시퀀스: shake 320ms → flash 200ms → 3-halo ring expand 600ms → reveal
//   - reveal cards 스태거 spring (0.08s delay)
//   - tier=legend 일수록 강한 효과 (shake 진폭·flash 강도·halo 색)
//

import SwiftUI

struct CardPackOpenerView: View {
    @EnvironmentObject private var store: GameStore
    let onComplete: () -> Void

    @State private var revealed: Reveal?
    @State private var phase: OpeningPhase = .idle
    @State private var shakeOffset: CGSize = .zero
    @State private var flashOpacity: Double = 0
    @State private var haloProgress: Double = 0
    @State private var packScale: Double = 1

    private enum OpeningPhase { case idle, shaking, flashing, halo, revealed, absorbing }

    private struct Reveal {
        let cards: [ChallengeCard]
        let tier: Rarity
    }

    private var pendingCount: Int {
        (store.progress?.pendingPacks ?? 0) + (store.progress?.pendingBonusCards ?? 0)
    }

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                if let revealed, phase == .revealed || phase == .absorbing {
                    revealView(revealed)
                } else {
                    promptOrOpening
                }
                Spacer()
                bottomButton
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
            .padding(.top, 32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Halo rings (tier 색 기반)
            if phase == .halo, let tier = revealed?.tier {
                haloRings(tier: tier)
                    .allowsHitTesting(false)
            }

            // 풀스크린 플래시
            Color.white.opacity(flashOpacity)
                .ignoresSafeArea()
                .allowsHitTesting(false)
        }
    }

    // MARK: - 개봉 전 / 진행 중 prompt

    @ViewBuilder
    private var promptOrOpening: some View {
        VStack(spacing: 12) {
            ZStack {
                if phase == .halo, let tier = revealed?.tier {
                    // Halo 중심 — 팩이 사라지는 단계
                    Circle()
                        .fill(tier.color.opacity(0.30))
                        .frame(width: 80, height: 80)
                        .scaleEffect(packScale)
                        .opacity(1 - haloProgress)
                }
                PixelIcon(.gift, size: 48, color: revealed?.tier.color ?? Color.accentPrimary)
                    .scaleEffect(packScale)
                    .offset(shakeOffset)
                    .opacity(phase == .halo ? max(0, 1 - haloProgress * 1.5) : 1)
            }

            Text("카드팩 \(pendingCount)개")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Text(phaseSubtitle)
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
                .multilineTextAlignment(.center)
        }
    }

    private var phaseSubtitle: String {
        switch phase {
        case .idle:     return "레벨업·챌린지 보상으로 받은 카드팩이에요.\n열어서 새 카드를 덱에 추가하세요."
        case .shaking:  return "팩이 흔들리는 중…"
        case .flashing: return ""
        case .halo:     return ""
        case .revealed: return ""
        case .absorbing: return ""
        }
    }

    // MARK: - Halo rings (3-ring expanding)

    private func haloRings(tier: Rarity) -> some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .stroke(tier.color.opacity(0.7), lineWidth: 3)
                    .scaleEffect(60 + CGFloat(haloProgress) * 800 + CGFloat(i) * 30)
                    .opacity(max(0, 1 - haloProgress * 1.1))
                    .blur(radius: tier == .legend ? 2 : 0)
                    .animation(.easeOut(duration: 0.6).delay(Double(i) * 0.10), value: haloProgress)
            }
        }
    }

    // MARK: - Reveal 그리드

    private func revealView(_ r: Reveal) -> some View {
        VStack(spacing: 16) {
            Text("\(r.tier.displayName) 팩")
                .typography(.heading)
                .foregroundStyle(r.tier.color)
            if r.cards.isEmpty {
                Text("새로 해금할 카드가 없어요")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
            } else {
                Text("새 카드 \(r.cards.count)장 해금!")
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3),
                    spacing: 10
                ) {
                    ForEach(Array(r.cards.enumerated()), id: \.element.id) { idx, card in
                        RevealCard(card: card, index: idx)
                    }
                }
            }
        }
        .scaleEffect(phase == .absorbing ? 0.72 : 1)
        .opacity(phase == .absorbing ? 0 : 1)
        .offset(y: phase == .absorbing ? 220 : 0)
        .animation(.easeInOut(duration: 0.45), value: phase)
    }

    /// 카드 한 장 — 스태거 spring reveal.
    private struct RevealCard: View {
        let card: ChallengeCard
        let index: Int
        @State private var shown = false

        var body: some View {
            VStack(spacing: 6) {
                Text(card.rarity.displayName)
                    .typography(.micro)
                    .foregroundStyle(Color.bgPrimary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(card.rarity.color, in: Capsule())
                Text(card.title)
                    .typography(.micro)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 72)
            .padding(.vertical, 10)
            .padding(.horizontal, 6)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
            // 웹 CardPackOpener(L271) 패리티 — reveal 카드에 등급 표면 텍스처 + 글로우.
            // 기존 stroke 보더는 디자인 룰(카드 보더 금지) 위반이라 제거하고 텍스처로 대체.
            .overlay(
                RarityTexture(rarity: card.rarity, cornerRadius: 10)
                    .allowsHitTesting(false)
            )
            .shadow(color: card.rarity.color.opacity(Self.glowOpacity(card.rarity)),
                    radius: Self.glowRadius(card.rarity))
            .opacity(shown ? 1 : 0)
            .scaleEffect(shown ? 1 : 1.2)
            .onAppear {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.65)
                    .delay(Double(index) * 0.08)) {
                    shown = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(index) * 0.08) {
                    SoundPlayer.shared.play(.cardFlip)
                }
            }
        }

        /// 등급별 글로우 — 웹 rarityGlow 대응. normal 은 글로우 없음.
        static func glowOpacity(_ r: Rarity) -> Double {
            switch r {
            case .normal: return 0
            case .rare:   return 0.25
            case .unique: return 0.4
            case .legend: return 0.55
            }
        }
        static func glowRadius(_ r: Rarity) -> CGFloat {
            switch r {
            case .normal: return 0
            case .rare:   return 6
            case .unique: return 10
            case .legend: return 14
            }
        }
    }

    // MARK: - 하단 버튼

    @ViewBuilder private var bottomButton: some View {
        if phase == .revealed || phase == .idle {
            if revealed == nil {
                button("팩 열기") { startOpen() }
            } else if pendingCount > 0 {
                button("다음 팩 열기 (\(pendingCount))") { absorbThen { startOpen() } }
            } else {
                button("완료") { absorbThen(onComplete) }
            }
        } else {
            // 시퀀스 진행 중 — 빈 자리만 유지
            Color.clear.frame(height: 52)
        }
    }

    private func startOpen() {
        // 1) 미리 카드 목록 결정 (open 시 tier 알아야 halo 색이 결정됨)
        guard let result = store.openCardPack() else {
            onComplete()
            return
        }
        revealed = Reveal(cards: result.cards, tier: result.tier)

        // tier 별 진폭
        let shakeMagnitude: CGFloat = result.tier == .legend ? 8 : result.tier == .unique ? 5 : 3

        // 2) Shake 320ms
        phase = .shaking
        SoundPlayer.shared.play(.packOpen)
        Haptics.play(.medium)
        runShake(magnitude: shakeMagnitude, duration: 0.32)

        // 3) Flash 200ms (320~520ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
            phase = .flashing
            Haptics.play(.heavy)
            withAnimation(.easeOut(duration: 0.08)) { flashOpacity = result.tier == .legend ? 1.0 : 0.7 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                withAnimation(.easeIn(duration: 0.12)) { flashOpacity = 0 }
            }
        }

        // 4) Halo expand 600ms (520~1120ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.52) {
            phase = .halo
            withAnimation(.easeOut(duration: 0.4)) {
                packScale = 1.4
            }
            withAnimation(.easeOut(duration: 0.6)) {
                haloProgress = 1
            }
        }

        // 5) Reveal 1120ms
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.12) {
            phase = .revealed
            haloProgress = 0
            packScale = 1
        }
    }

    private func absorbThen(_ completion: @escaping () -> Void) {
        phase = .absorbing
        Haptics.play(.light)
        SoundPlayer.shared.play(.collect)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            revealed = nil
            phase = .idle
            completion()
        }
    }

    /// 32-step shake (~10ms each).
    private func runShake(magnitude: CGFloat, duration: TimeInterval) {
        let steps = Int(duration / 0.01)
        for i in 0..<steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.01) {
                let damp = 1.0 - Double(i) / Double(steps)
                shakeOffset = CGSize(
                    width: CGFloat.random(in: -magnitude...magnitude) * damp,
                    height: CGFloat.random(in: -magnitude...magnitude) * damp
                )
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            shakeOffset = .zero
        }
    }

    private func button(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .typography(.body)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .foregroundStyle(Color.bgPrimary)
                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}
