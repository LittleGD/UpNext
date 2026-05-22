//
//  Animations.swift
//  UpNext — 모션 어휘 단일 출처 (R6 — 모달·전환·NumberRoll).
//
//  웹 src/lib/motion.ts 스프링 프리셋 + src/app/globals.css 핵심 keyframe 을 SwiftUI
//  named 곡선으로 1:1 대응. 모든 회복 슬라이스가 같은 곡선을 쓰도록 — withAnimation 에
//  매번 매직넘버를 흩뿌리지 않고 `Anim.springBouncy` 처럼 명명 참조.
//
//  스프링 변환: 웹 framer-motion 은 stiffness(k)/damping(c) — SwiftUI 는 response/
//  dampingFraction. ω₀=√k, response=2π/ω₀, ζ=c/(2√k). (질량 1 가정 — framer 기본.)
//

import SwiftUI

enum Anim {
    // ── motion.ts 스프링 프리셋 ──
    /// springSnappy — stiffness 500, damping 30 → resp 0.28, ζ 0.67. (모달 슬라이드·미니카드)
    static let springSnappy = Animation.spring(response: 0.28, dampingFraction: 0.67)
    /// springGentle — stiffness 200, damping 20 → resp 0.44, ζ 0.71.
    static let springGentle = Animation.spring(response: 0.44, dampingFraction: 0.71)
    /// springBouncy — stiffness 300, damping 15 → resp 0.36, ζ 0.43. (카드 등장 stagger)
    static let springBouncy = Animation.spring(response: 0.36, dampingFraction: 0.43)
    /// cardOverlayEnter — motion.ts spring(duration 0.32, bounce 0.18). bounce→ζ = 1-0.18.
    static let cardOverlayEnter = Animation.spring(response: 0.32, dampingFraction: 0.82)
    /// cardOverlayExit — 0.25s cubic-bezier(0.32,0,0.67,0) (강한 ease-in, 단방향 퇴장).
    static let cardOverlayExit = Animation.timingCurve(0.32, 0, 0.67, 0, duration: 0.25)
    /// scaleBounce — stampIn: stiffness 400, damping 15 → resp 0.31, ζ 0.375. (보상 강조)
    static let scaleBounce = Animation.spring(response: 0.31, dampingFraction: 0.375)

    // ── globals.css 핵심 keyframe ──
    /// EASE_OUT cubic-bezier(0.23,1,0.32,1) — 웹 표준 ease-out.
    static func easeOut(_ duration: Double) -> Animation {
        .timingCurve(0.23, 1, 0.32, 1, duration: duration)
    }
    /// tabEnter — uphero-tab-enter 200ms EASE_OUT (opacity + y 4→0).
    static let tabEnter = Animation.timingCurve(0.23, 1, 0.32, 1, duration: 0.2)
    /// numberRoll — uphero-num-roll 260ms EASE_OUT.
    static let numberRoll = Animation.timingCurve(0.23, 1, 0.32, 1, duration: 0.26)
    /// glowPulse — 2s easeInOut 무한 (scale 1↔1.05, opacity 0.6↔1).
    static let glowPulse = Animation.easeInOut(duration: 2).repeatForever(autoreverses: true)
}

// MARK: - tabEnter 전환 (uphero-tab-enter: opacity 0→1 + translateY 4→0)

extension AnyTransition {
    /// 탭/뷰 전환 등장 — 웹 .eq-tab-content (uphero-tab-enter 200ms).
    static var tabEnter: AnyTransition {
        .modifier(
            active: TabEnterModifier(progress: 0),
            identity: TabEnterModifier(progress: 1))
    }
}

private struct TabEnterModifier: ViewModifier {
    let progress: Double
    func body(content: Content) -> some View {
        content
            .opacity(progress)
            .offset(y: (1 - progress) * 4)
    }
}

// MARK: - shake (uphero-crit-shake: translate 5-step, 260ms)

/// 웹 uphero-crit-shake keyframe (steps(5)) 의 translate 경로를 progress(0→1) 로 보간.
struct ShakeEffect: GeometryEffect {
    var progress: CGFloat
    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }
    // 0%→(0,0) 20%→(-4,-3) 40%→(4,2) 60%→(-3,3) 80%→(3,-1) 100%→(0,0)
    private static let steps: [(CGFloat, CGFloat)] =
        [(0, 0), (-4, -3), (4, 2), (-3, 3), (3, -1), (0, 0)]

    func effectValue(size: CGSize) -> ProjectionTransform {
        let p = max(0, min(progress, 1)) * 5     // 0→5
        let i = min(Int(p), 4)
        let f = p - CGFloat(i)
        let a = Self.steps[i]
        let b = Self.steps[i + 1]
        let x = a.0 + (b.0 - a.0) * f
        let y = a.1 + (b.1 - a.1) * f
        return ProjectionTransform(CGAffineTransform(translationX: x, y: y))
    }
}

extension View {
    /// `trigger` 가 바뀔 때마다 crit-shake 1회 재생 (error/invalid 흔들기).
    func shake(_ trigger: some Equatable) -> some View {
        modifier(ShakeOnChange(trigger: trigger))
    }
}

private struct ShakeOnChange<T: Equatable>: ViewModifier {
    let trigger: T
    @State private var progress: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .modifier(ShakeEffect(progress: progress))
            .onChange(of: trigger) { _ in
                progress = 0
                withAnimation(.linear(duration: 0.26)) { progress = 1 }
            }
    }
}
