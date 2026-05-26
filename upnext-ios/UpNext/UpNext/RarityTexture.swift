//
//  RarityTexture.swift
//  UpNext — 등급별 표면 텍스처 + 홀로그래픽 글레어.
//
//  웹 src/components/cards/RarityTexture.tsx 포팅.
//   - rare    : 대각 해치 (50% angle)
//   - unique  : 허니콤 + 코너 보석
//   - legend  : 다이아 격자 + 대각 shimmer sweep
//  + HolographicGlare — tilt 추종 conic gradient (rotation 기반).
//

import SwiftUI

struct RarityTexture: View {
    let rarity: Rarity
    var cornerRadius: CGFloat = 10

    var body: some View {
        switch rarity {
        case .normal: EmptyView()
        case .rare:   rareTexture
        case .unique: uniqueTexture
        case .legend: legendTexture
        }
    }

    // MARK: - Rare — 대각 해치

    private var rareTexture: some View {
        Canvas { ctx, size in
            let spacing: CGFloat = 6
            let lineWidth: CGFloat = 1
            for x in stride(from: -size.height, to: size.width + size.height, by: spacing) {
                var p = Path()
                p.move(to: CGPoint(x: x, y: 0))
                p.addLine(to: CGPoint(x: x + size.height, y: size.height))
                ctx.stroke(p, with: .color(Color.rarityRare.opacity(0.18)),
                           lineWidth: lineWidth)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .allowsHitTesting(false)
    }

    // MARK: - Unique — 허니콤 + 코너 보석

    private var uniqueTexture: some View {
        ZStack {
            // 허니콤
            Canvas { ctx, size in
                let hexSize: CGFloat = 14
                let cols = Int(size.width / (hexSize * 1.5)) + 1
                let rows = Int(size.height / (hexSize * sqrt(3))) + 1
                for r in 0..<rows {
                    for c in 0..<cols {
                        let x = CGFloat(c) * hexSize * 1.5
                        let y = CGFloat(r) * hexSize * sqrt(3) + (c % 2 == 0 ? 0 : hexSize * sqrt(3) / 2)
                        var p = Path()
                        for i in 0..<6 {
                            let angle = Double(i) * .pi / 3
                            let px = x + hexSize * cos(angle)
                            let py = y + hexSize * sin(angle)
                            if i == 0 { p.move(to: CGPoint(x: px, y: py)) }
                            else { p.addLine(to: CGPoint(x: px, y: py)) }
                        }
                        p.closeSubpath()
                        ctx.stroke(p, with: .color(Color.rarityUnique.opacity(0.15)),
                                   lineWidth: 0.6)
                    }
                }
            }

            // 코너 보석 (4개)
            VStack {
                HStack {
                    cornerJewel(.topLeading)
                    Spacer()
                    cornerJewel(.topTrailing)
                }
                Spacer()
                HStack {
                    cornerJewel(.bottomLeading)
                    Spacer()
                    cornerJewel(.bottomTrailing)
                }
            }
            .padding(6)
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .allowsHitTesting(false)
    }

    private func cornerJewel(_ alignment: Alignment) -> some View {
        Diamond()
            .fill(Color.rarityUnique.opacity(0.45))
            .frame(width: 8, height: 8)
            .shadow(color: Color.rarityUnique.opacity(0.6), radius: 4)
    }

    // MARK: - Legend — 다이아 격자 + shimmer sweep

    private var legendTexture: some View {
        ZStack {
            // 다이아 격자
            Canvas { ctx, size in
                let spacing: CGFloat = 16
                for r in stride(from: -spacing, through: size.height + spacing, by: spacing) {
                    for c in stride(from: -spacing, through: size.width + spacing, by: spacing) {
                        var p = Path()
                        let cx = c + (Int(r / spacing) % 2 == 0 ? 0 : spacing / 2)
                        p.move(to: CGPoint(x: cx, y: r - 3))
                        p.addLine(to: CGPoint(x: cx + 3, y: r))
                        p.addLine(to: CGPoint(x: cx, y: r + 3))
                        p.addLine(to: CGPoint(x: cx - 3, y: r))
                        p.closeSubpath()
                        ctx.fill(p, with: .color(Color.rarityLegend.opacity(0.12)))
                    }
                }
            }

            // shimmer sweep — 대각선 밝은 띠가 좌→우 이동
            TimelineView(.animation) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                let phase = (t.truncatingRemainder(dividingBy: 3.0)) / 3.0
                LinearGradient(
                    colors: [.clear,
                             Color.rarityLegend.opacity(0.30),
                             .clear],
                    startPoint: UnitPoint(x: phase - 0.2, y: 0),
                    endPoint: UnitPoint(x: phase + 0.2, y: 1)
                )
                .blendMode(.screen)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .allowsHitTesting(false)
    }
}

// MARK: - 다이아 모양

private struct Diamond: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}

// MARK: - 홀로그래픽 글레어 (tilt 추종)

/// 카드 위에 얹는 conic-gradient 글레어. tilt 각도에 따라 회전.
/// rotateX/Y 가 ±15° 범위 입력 — 각도 합으로 conic phase 결정.
struct HolographicGlare: View {
    let rotateX: Double  // -15...15
    let rotateY: Double
    var cornerRadius: CGFloat = 10

    var body: some View {
        let phase = (rotateY + 15) / 30  // 0...1
        let intensity = sqrt(rotateX * rotateX + rotateY * rotateY) / 21  // 0~1
        ZStack {
            // 홀로 글레어 — conic gradient 회전.
            AngularGradient(
                gradient: Gradient(colors: [
                    Color.rarityLegend.opacity(0.35),
                    Color.accentCyan.opacity(0.25),
                    Color.accentFushia.opacity(0.30),
                    Color.rarityLegend.opacity(0.35),
                    Color.accentCyan.opacity(0.20),
                ]),
                center: .center,
                angle: .degrees(phase * 360)
            )
            .blendMode(.screen)
            .opacity(intensity * 0.6 + 0.1)

            // 좁은 화이트 sheen
            LinearGradient(
                colors: [.clear,
                         Color.white.opacity(0.20 * intensity),
                         .clear],
                startPoint: UnitPoint(x: phase, y: 0),
                endPoint: UnitPoint(x: 1 - phase, y: 1)
            )
            .blendMode(.screen)
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .allowsHitTesting(false)
    }
}
