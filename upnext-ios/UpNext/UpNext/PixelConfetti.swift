//
//  PixelConfetti.swift
//  UpNext — 픽셀 컨페티 파티클 버스트.
//
//  웹 src/components/effects/PixelConfetti.tsx 포팅.
//  - 24 개 파티클, 4×4 / 6×6 픽셀, 5색 (accent/cyan/fushia/secondary/white)
//  - 1.2s easeOut: x 중심 50% ± 10% → ± dx, y 40% → y - dy, opacity 1→0, rotate 0→random
//  - trigger 토글로 발사. 1.5s 후 자동 정리.
//
//  사용: `.overlay(PixelConfetti(trigger: $celebrate))` — trigger 가 true 로 변할 때 1회 재생.
//

import SwiftUI

struct PixelConfetti: View {
    @Binding var trigger: Bool

    @State private var particles: [Particle] = []
    @State private var animating: Bool = false

    private static let colors: [Color] = [
        .accentPrimary, .accentCyan, .accentFushia, .accentSecondary,
        Color(red: 1, green: 1, blue: 1),
    ]

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                ForEach(particles) { p in
                    Rectangle()
                        .fill(p.color)
                        .frame(width: p.size, height: p.size)
                        .rotationEffect(.degrees(animating ? p.rotation : 0))
                        .opacity(animating ? 0 : 1)
                        .position(
                            x: animating ? (p.x + p.dx) * w : p.x * w,
                            y: animating ? (p.y - p.dy) * h : p.y * h
                        )
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onChange(of: trigger) { newValue in
            if newValue { fire() }
        }
    }

    private func fire() {
        particles = (0..<24).map { i in
            Particle(
                id: i,
                x: 0.5 + Double.random(in: -0.10..<0.10),
                y: 0.40,
                color: Self.colors[Int.random(in: 0..<Self.colors.count)],
                size: Double.random(in: 0..<1) > 0.5 ? 6 : 4,
                dx: Double.random(in: -0.30..<0.30),
                dy: Double.random(in: 0.20..<0.60),
                rotation: Double.random(in: 0..<360)
            )
        }
        animating = false
        // 다음 RunLoop 에서 애니메이션 시작 — 초기값이 적용된 다음 끝값으로 보간.
        DispatchQueue.main.async {
            withAnimation(.easeOut(duration: 1.2)) {
                animating = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                particles = []
                animating = false
                trigger = false
            }
        }
    }

    private struct Particle: Identifiable {
        let id: Int
        let x: Double
        let y: Double
        let color: Color
        let size: Double
        let dx: Double
        let dy: Double
        let rotation: Double
    }
}
