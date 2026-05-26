//
//  BurningBorder.swift
//  UpNext — Extra/Super 챌린지 phase 화면 가장자리 inner glow breathing.
//
//  웹 src/components/effects/BurningBorder.tsx 포팅.
//  - phase: "extra" | "super" — Super 가 더 강한 강도
//  - 3s ease-in-out infinite 호흡 (inner shadow 강/약 교대)
//  - 0.8s easeInOut fade-in/out
//
//  SwiftUI 는 box-shadow inset 직접 대응이 없어 — Rectangle stroke 와 안쪽 그라데이션
//  으로 inset glow 효과 재현. 가장자리에서 안쪽으로 페이드.
//

import SwiftUI

struct BurningBorder: View {
    enum Phase { case extra, sup }
    let phase: Phase
    var active: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if !active {
            Color.clear
        } else {
            TimelineView(.animation) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                let breathePhase = (t.truncatingRemainder(dividingBy: 3.0)) / 3.0
                // 0 → 1 → 0 cosine
                let intensity = 0.5 - 0.5 * cos(breathePhase * 2 * .pi)
                ZStack {
                    innerGlow(intensity: intensity)
                }
            }
            .opacity(reduceMotion ? 0.6 : 1.0)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .transition(.opacity)
        }
    }

    private func innerGlow(intensity: Double) -> some View {
        let (outerAlpha, innerAlpha, blurRadius, innerBlurRadius) = config(for: phase, intensity: intensity)
        let outerColor = Color(red: 1.0, green: 70.0/255, blue: 50.0/255)
        let innerColor: Color
        switch phase {
        case .extra:
            innerColor = Color(red: 1.0, green: 100.0/255, blue: 0)
        case .sup:
            innerColor = Color(red: 1.0, green: 50.0/255, blue: 100.0/255)
        }
        return ZStack {
            RoundedRectangle(cornerRadius: 0)
                .stroke(outerColor.opacity(outerAlpha), lineWidth: blurRadius)
                .blur(radius: blurRadius)
                .mask(Rectangle())
            RoundedRectangle(cornerRadius: 0)
                .stroke(innerColor.opacity(innerAlpha), lineWidth: innerBlurRadius)
                .blur(radius: innerBlurRadius)
                .mask(Rectangle())
        }
    }

    /// extra: 60/120, alpha 0.25→0.15 / 0.10→0.06
    /// super: 80/150, alpha 0.35→0.20 / 0.15→0.08
    private func config(for phase: Phase, intensity: Double) -> (Double, Double, CGFloat, CGFloat) {
        switch phase {
        case .extra:
            let outer = 0.15 + intensity * 0.10
            let inner = 0.06 + intensity * 0.04
            return (outer, inner, 60, 120)
        case .sup:
            let outer = 0.20 + intensity * 0.15
            let inner = 0.08 + intensity * 0.07
            return (outer, inner, 80, 150)
        }
    }
}
