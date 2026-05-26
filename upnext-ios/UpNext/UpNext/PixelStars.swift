//
//  PixelStars.swift
//  UpNext — 전 화면 1px 트윙클 별 캔버스.
//
//  웹 src/components/effects/PixelStars.tsx 의 SwiftUI 포팅.
//  - 밀도 0.00018/px² (~50개 @ 390×844)
//  - 88% 흰색 / 7% accent / 5% cyan
//  - 10-30초 주기 sine twinkle (별 사이 위상 무작위 분산)
//  - 마운트 후 0-4s stagger fade-in (별이 한꺼번에 켜지지 않음)
//  - reduce-motion: 정적 표시 (트윙클 정지)
//
//  렌더링: SwiftUI `Canvas` + `TimelineView` 60fps. 별 데이터는 init 시 1회 생성.
//

import SwiftUI

struct PixelStars: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stars: [Star] = []
    @State private var startTime = Date()

    private static let density: Double = 0.00018
    private static let colors: [Color] = [
        Color(red: 240/255, green: 240/255, blue: 240/255), // 흰
        Color(red: 205/255, green: 245/255, blue: 100/255), // accent (#CDF564)
        Color(red: 155/255, green: 240/255, blue: 225/255), // cyan (#9BF0E1)
    ]

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation) { context in
                Canvas { ctx, size in
                    let elapsed = context.date.timeIntervalSince(startTime)
                    for (i, star) in stars.enumerated() {
                        // stagger fade-in: 0-4s 사이 i/count 비율로 시작 → 2s fade
                        let fadeDelay = (Double(i) / Double(max(stars.count, 1))) * 4
                        let fadeProgress = min(max((elapsed - fadeDelay) / 2, 0), 1)
                        if fadeProgress <= 0 { continue }

                        // sine twinkle — reduce-motion 이면 정적 1.0
                        let twinkle: Double
                        if reduceMotion {
                            twinkle = 1.0
                        } else {
                            let phase = star.phase + star.speed * elapsed
                            twinkle = sin(phase) * 0.4 + 0.6
                        }

                        let alpha = star.baseAlpha * twinkle * fadeProgress
                        if alpha < 0.03 { continue }

                        let rect = CGRect(
                            x: CGFloat(star.x) * size.width,
                            y: CGFloat(star.y) * size.height,
                            width: 1, height: 1
                        )
                        ctx.fill(Path(rect), with: .color(Self.colors[star.colorIdx].opacity(alpha)))
                    }
                }
            }
            .onAppear {
                if stars.isEmpty {
                    let count = Int(geo.size.width * geo.size.height * Self.density)
                    stars = (0..<count).map { _ in
                        let colorRoll = Double.random(in: 0..<1)
                        let colorIdx: Int
                        if colorRoll < 0.88 { colorIdx = 0 }
                        else if colorRoll < 0.95 { colorIdx = 1 }
                        else { colorIdx = 2 }
                        return Star(
                            x: Double.random(in: 0..<1),
                            y: Double.random(in: 0..<1),
                            baseAlpha: 0.15 + Double.random(in: 0..<0.45),
                            phase: Double.random(in: 0..<(.pi * 20)),
                            speed: 0.04 + Double.random(in: 0..<0.12),
                            colorIdx: colorIdx
                        )
                    }
                    startTime = Date()
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    private struct Star {
        let x: Double
        let y: Double
        let baseAlpha: Double
        let phase: Double
        let speed: Double
        let colorIdx: Int
    }
}
