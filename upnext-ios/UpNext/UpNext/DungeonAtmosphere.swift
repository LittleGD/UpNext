//
//  DungeonAtmosphere.swift
//  UpNext — 던전 분위기 레이어.
//
//  웹 components/uphero/DungeonAtmosphere.tsx (604 LOC) 핵심 회복.
//   - 던전 themeColor 기반 base gradient
//   - depth tint: floor 가 깊을수록 darker (1층=원본, 30층=80% 어두움)
//   - 보스 floor (10/20/30) 에서는 red pulsing 추가
//   - 파티클 ambient (10~30개, themeColor 톤)
//

import SwiftUI

struct DungeonAtmosphere: View {
    let dungeon: Dungeon
    let floor: Int
    let isBoss: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startTime = Date()

    private var depthMix: Double {
        // 1층 0, 30층 0.8
        min(0.8, Double(max(0, floor - 1)) / 30 * 0.8)
    }

    private var themeColor: Color {
        Color(hexString: dungeon.themeColor)
    }

    var body: some View {
        ZStack {
            // 1. Base gradient — themeColor (depth 에 따라 어두워짐)
            LinearGradient(
                colors: [
                    themeColor.opacity(0.18 * (1 - depthMix)),
                    themeColor.opacity(0.06 * (1 - depthMix)),
                    Color.black.opacity(depthMix * 0.6),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            // 2. Radial 글로우 — 중앙 위쪽에서 themeColor breathe
            if !reduceMotion {
                TimelineView(.animation) { context in
                    let t = context.date.timeIntervalSince(startTime)
                    let breathe = 0.5 + 0.5 * sin(t * 0.7)
                    RadialGradient(
                        colors: [
                            themeColor.opacity(0.20 * breathe * (1 - depthMix)),
                            .clear
                        ],
                        center: UnitPoint(x: 0.5, y: 0.3),
                        startRadius: 50, endRadius: 280
                    )
                    .ignoresSafeArea()
                    .blendMode(.screen)
                }
            }

            // 3. 보스 floor — red 펄스 오버레이
            if isBoss && !reduceMotion {
                TimelineView(.animation) { context in
                    let t = context.date.timeIntervalSince(startTime)
                    let pulse = 0.5 + 0.5 * sin(t * 2.0)
                    RadialGradient(
                        colors: [
                            Color.accentSecondary.opacity(0.18 * pulse),
                            .clear
                        ],
                        center: UnitPoint(x: 0.5, y: 0.45),
                        startRadius: 30, endRadius: 320
                    )
                    .ignoresSafeArea()
                    .blendMode(.screen)
                }
            }

            // 4. 파티클 ambient (정적 무작위 점)
            particles
                .ignoresSafeArea()
                .allowsHitTesting(false)
        }
        .allowsHitTesting(false)
    }

    private var particles: some View {
        GeometryReader { geo in
            TimelineView(.animation) { context in
                let t = context.date.timeIntervalSince(startTime)
                Canvas { ctx, size in
                    let count = 30
                    for i in 0..<count {
                        let phase = Double(i) * 0.31
                        let baseX = (Double(i) * 137.5).truncatingRemainder(dividingBy: 1.0)
                        let baseY = (Double(i) * 211.3).truncatingRemainder(dividingBy: 1.0)
                        // 천천히 떠다님
                        let driftX = sin(t * 0.3 + phase) * 30
                        let driftY = sin(t * 0.2 + phase * 1.7) * 20
                        let x = baseX * Double(size.width) + driftX
                        let y = baseY * Double(size.height) + driftY
                        let alpha = 0.4 + 0.3 * sin(t * 1.5 + phase)
                        let rect = CGRect(x: x, y: y, width: 1.5, height: 1.5)
                        ctx.fill(Path(rect),
                                 with: .color(themeColor.opacity(alpha * (1 - depthMix * 0.5))))
                    }
                }
            }
        }
    }
}
