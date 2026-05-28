//
//  ChallengePhaseBanner.swift
//  UpNext — Extra/Super 챌린지 hold-to-charge 배너.
//
//  웹 components/daily/ExtraChallengeBanner.tsx + SuperChallengeBanner.tsx 포팅.
//  유저가 버튼을 누르고 있는 동안 진행 ring 이 차오르고, 100% 도달 시 onConfirm.
//   - 1.2s (extra) / 1.8s (super) hold 필요
//   - 이내 release → 진행 ring 0 으로 복귀
//   - 100% 도달 시 ChallengeConfirmModal 자동 트리거
//   - 시각: BurningBorder 호흡 + 불씨 ember 라이즈 + diagonal shimmer sweep
//

import SwiftUI
import Combine

struct ChallengePhaseBanner: View {
    enum Phase { case extra, sup }
    let phase: Phase
    let onConfirm: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var charging: Bool = false
    @State private var progress: Double = 0
    @State private var holdStarted: Date?
    @State private var shimmerPhase: Double = 0
    @State private var embers: [Ember] = []

    private struct Ember: Identifiable {
        let id = UUID()
        let x: Double
        var y: Double
        let speed: Double
    }

    private var holdDuration: Double {
        phase == .extra ? 1.2 : 1.8
    }

    private var accentColor: Color {
        phase == .extra
        ? Color(red: 1, green: 70/255, blue: 50/255)        // #FF4632
        : Color(red: 200/255, green: 50/255, blue: 160/255)  // #C832A0
    }

    var body: some View {
        ZStack {
            // 배경 카드
            backgroundCard
            content
        }
        .frame(maxWidth: .infinity, minHeight: 88)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !charging {
                        charging = true
                        holdStarted = Date()
                        Haptics.play(.selection)
                        SoundPlayer.shared.play(.chargeUp)
                    }
                }
                .onEnded { _ in
                    if charging && progress < 1 {
                        // 미달 — 복귀
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            progress = 0
                        }
                    }
                    charging = false
                    holdStarted = nil
                }
        )
        .onReceive(Timer.publish(every: 1.0/60, on: .main, in: .common).autoconnect()) { _ in
            guard let s = holdStarted, charging else { return }
            let elapsed = Date().timeIntervalSince(s)
            progress = min(elapsed / holdDuration, 1)
            if progress >= 1 {
                Haptics.play(.heavy)
                SoundPlayer.shared.play(phase == .extra ? .fireIgnite : .superIgnite)
                charging = false
                holdStarted = nil
                onConfirm()
                progress = 0
            }
        }
        .onReceive(Timer.publish(every: 1.0/30, on: .main, in: .common).autoconnect()) { _ in
            shimmerPhase = (shimmerPhase + 0.02).truncatingRemainder(dividingBy: 1.0)
            // ember 갱신 (charging 중일 때 가속)
            if charging && !reduceMotion {
                if Double.random(in: 0..<1) < 0.15 {
                    embers.append(Ember(x: Double.random(in: 0.1...0.9),
                                        y: 0,
                                        speed: Double.random(in: 0.005...0.020)))
                }
                var alive: [Ember] = []
                for var e in embers {
                    e.y += e.speed
                    if e.y < 1 { alive.append(e) }
                }
                embers = alive
            } else {
                embers.removeAll()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(phase == .extra ? "추가 챌린지 도전" : "슈퍼 챌린지 도전")
        .accessibilityHint("길게 누르면 시작합니다")
        .accessibilityAction {
            onConfirm()
        }
    }

    private var backgroundCard: some View {
        ZStack {
            LinearGradient(
                colors: [
                    accentColor.opacity(0.08 + progress * 0.20),
                    accentColor.opacity(0.04 + progress * 0.12),
                ],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            // shimmer sweep
            if !reduceMotion {
                LinearGradient(
                    colors: [.clear,
                             Color.white.opacity(0.12 + progress * 0.20),
                             .clear],
                    startPoint: UnitPoint(x: shimmerPhase - 0.2, y: 0),
                    endPoint: UnitPoint(x: shimmerPhase + 0.2, y: 1)
                )
                .blendMode(.screen)
            }
            // embers
            GeometryReader { geo in
                ForEach(embers) { e in
                    Circle()
                        .fill(accentColor)
                        .frame(width: 4, height: 4)
                        .shadow(color: accentColor, radius: 4)
                        .position(x: geo.size.width * e.x,
                                  y: geo.size.height * (1 - e.y))
                        .opacity(1 - e.y)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(accentColor.opacity(0.30 + progress * 0.40),
                        lineWidth: 1 + progress * 1.5)
        )
        .shadow(color: accentColor.opacity(progress * 0.5), radius: progress * 16)
    }

    private var content: some View {
        HStack(spacing: 12) {
            // 진행 ring + 불 아이콘
            ZStack {
                Circle()
                    .stroke(accentColor.opacity(0.2), lineWidth: 3)
                    .frame(width: 44, height: 44)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(accentColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .frame(width: 44, height: 44)
                    .rotationEffect(.degrees(-90))
                PixelIcon(.flame, size: 18, color: accentColor)
                    .scaleEffect(1 + progress * 0.15)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(phase == .extra ? "추가 챌린지 도전" : "슈퍼 챌린지 도전")
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                Text(charging ? "꾹 누르고 있어요…" : "버튼을 꾹 눌러 시작")
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
            }
            Spacer(minLength: 0)
            Text("\(Int(progress * 100))%")
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(accentColor)
                .opacity(charging ? 1 : 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 18)
    }
}
