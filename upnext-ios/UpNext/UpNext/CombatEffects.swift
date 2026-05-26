//
//  CombatEffects.swift
//  UpNext — 전투 시각 효과 모디파이어 모음.
//
//  웹 globals.css 의 화면-레벨 keyframe 을 SwiftUI ViewModifier 로 포팅:
//   - attackFlash(side:)   좌/우 가장자리 빨간 또는 클래스색 플래시 320ms
//   - floorSweep(trigger:) "Floor N" 라벨 위 빛 띠 sweep 900ms
//
//  crit-shake 는 Animations.swift 의 ShakeEffect 를 그대로 사용 (이미 있음).
//

import SwiftUI

// MARK: - Attack Flash (좌/우 가장자리 320ms 플래시)

enum AttackSide { case hero, enemy }

extension View {
    /// `trigger` 가 바뀔 때마다 한 번 재생. hero=좌측 accent-primary, enemy=우측 accent-secondary.
    func attackFlash(_ trigger: some Equatable, side: AttackSide) -> some View {
        modifier(AttackFlashModifier(trigger: trigger, side: side))
    }
}

private struct AttackFlashModifier<T: Equatable>: ViewModifier {
    let trigger: T
    let side: AttackSide
    @State private var opacity: Double = 0

    func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geo in
                    let w = geo.size.width
                    let stripeWidth = w * 0.35
                    let color = side == .hero ? Color.accentPrimary : Color.accentSecondary
                    LinearGradient(
                        gradient: Gradient(colors: [color.opacity(0.7), Color.clear]),
                        startPoint: side == .hero ? .leading : .trailing,
                        endPoint: side == .hero ? .trailing : .leading
                    )
                    .frame(width: stripeWidth)
                    .position(x: side == .hero ? stripeWidth / 2 : w - stripeWidth / 2,
                              y: geo.size.height / 2)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .opacity(opacity)
                    .allowsHitTesting(false)
                }
            )
            .onChange(of: trigger) { _ in
                opacity = 0
                withAnimation(.easeOut(duration: 0.06)) { opacity = 0.7 }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) {
                    withAnimation(.easeOut(duration: 0.26)) { opacity = 0 }
                }
            }
    }
}

// MARK: - Floor Sweep (층 라벨 위 sweep 900ms)

extension View {
    /// `trigger` 가 바뀔 때마다 1회 sweep — clip-path 띠가 좌→우 이동하며 밝게 덮음.
    func floorSweep(_ trigger: some Equatable) -> some View {
        modifier(FloorSweepModifier(trigger: trigger))
    }
}

private struct FloorSweepModifier<T: Equatable>: ViewModifier {
    let trigger: T
    @State private var progress: Double = 0
    @State private var visible: Bool = false

    func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geo in
                    let w = geo.size.width
                    Rectangle()
                        .fill(LinearGradient(
                            colors: [.clear, Color.accentPrimary.opacity(0.8), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        ))
                        .frame(width: w * 0.3)
                        .position(x: w * progress, y: geo.size.height / 2)
                        .opacity(visible ? 1 : 0)
                        .allowsHitTesting(false)
                }
            )
            .onChange(of: trigger) { _ in
                progress = -0.15
                visible = true
                withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.9)) {
                    progress = 1.15
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
                    visible = false
                }
            }
    }
}

// MARK: - Card Select Pulse (uphero-card-select 280ms)

extension View {
    /// 카드/버튼 selected 토글 시 한 번 pulse — scale 0.97→1.03→1 + brightness.
    func cardSelectPulse(_ trigger: some Equatable) -> some View {
        modifier(CardSelectPulseModifier(trigger: trigger))
    }
}

private struct CardSelectPulseModifier<T: Equatable>: ViewModifier {
    let trigger: T
    @State private var scale: Double = 1
    @State private var brightness: Double = 0

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .brightness(brightness)
            .onChange(of: trigger) { _ in
                scale = 0.97
                brightness = -0.1
                withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.155)) {
                    scale = 1.03
                    brightness = 0.18
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.155) {
                    withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.125)) {
                        scale = 1
                        brightness = 0
                    }
                }
            }
    }
}
