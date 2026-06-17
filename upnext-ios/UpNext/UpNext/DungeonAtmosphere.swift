//
//  DungeonAtmosphere.swift
//  UpNext — 던전별 분위기 레이어 (웹 components/uphero/DungeonAtmosphere.tsx 포팅).
//
//  웹은 dungeonId 별로 8종 분위기 컴포넌트를 분기한다 — 던전마다 완전히 다른 무드.
//   - fitness      → SnowFall    (눈 25송이 낙하+drift, #cdf564)
//   - learning     → Library     (먼지 12 부유 + 우상단 종이 접힘, #a5c8db)
//   - mindfulness  → Incense     (향 연기 5 상승+blur, #c9b8e8)
//   - nutrition    → GoldDust    (금가루 20 부유+glow, #e8d88b)
//   - social       → Confetti    (색종이 14 낙하+회전, 4색)
//   - productivity → ClockGears  (톱니 2개 회전, #bca88b)
//   - wellness     → Mist        (하단 안개 breathing+drift, #8bc9c9)
//   - trending     → Glitch      (scanline + 픽셀 shift, #cdf564)
//
//  base gradient(themeColor·depth 어둠) + 중앙 breathe + 보스 red 펄스는 공통 유지.
//  reduce-motion 시 파티클/모션 레이어 생략(정적 tint 만).
//

import SwiftUI

struct DungeonAtmosphere: View {
    let dungeon: Dungeon
    let floor: Int
    let isBoss: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startTime = Date()

    private var depthMix: Double {
        min(0.8, Double(max(0, floor - 1)) / 30 * 0.8)
    }
    private var themeColor: Color { Color(hexString: dungeon.themeColor) }

    var body: some View {
        ZStack {
            // 1. Base gradient — themeColor (depth 에 따라 어두워짐)
            LinearGradient(
                colors: [
                    themeColor.opacity(0.18 * (1 - depthMix)),
                    themeColor.opacity(0.06 * (1 - depthMix)),
                    Color.black.opacity(depthMix * 0.6),
                ],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            // 2. 중앙 breathe 글로우
            if !reduceMotion {
                TimelineView(.animation) { context in
                    let t = context.date.timeIntervalSince(startTime)
                    let breathe = 0.5 + 0.5 * sin(t * 0.7)
                    RadialGradient(
                        colors: [themeColor.opacity(0.20 * breathe * (1 - depthMix)), .clear],
                        center: UnitPoint(x: 0.5, y: 0.3), startRadius: 50, endRadius: 280
                    )
                    .ignoresSafeArea().blendMode(.screen)
                }
            }

            // 3. 던전별 분위기 레이어 (웹 8종 분기)
            if !reduceMotion {
                effectLayer
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            }

            // 4. 보스 floor — red 펄스
            if isBoss && !reduceMotion {
                TimelineView(.animation) { context in
                    let t = context.date.timeIntervalSince(startTime)
                    let pulse = 0.5 + 0.5 * sin(t * 2.0)
                    RadialGradient(
                        colors: [Color.accentSecondary.opacity(0.18 * pulse), .clear],
                        center: UnitPoint(x: 0.5, y: 0.45), startRadius: 30, endRadius: 320
                    )
                    .ignoresSafeArea().blendMode(.screen)
                }
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - 던전별 분기

    @ViewBuilder
    private var effectLayer: some View {
        switch dungeon.id {
        case .fitness:      SnowFallFX(startTime: startTime)
        case .learning:     LibraryFX(startTime: startTime)
        case .mindfulness:  IncenseFX(startTime: startTime)
        case .nutrition:    GoldDustFX(startTime: startTime)
        case .social:       ConfettiFX(startTime: startTime)
        case .productivity: ClockGearsFX(startTime: startTime)
        case .wellness:     MistFX(startTime: startTime)
        case .trending:     GlitchFX(startTime: startTime)
        }
    }
}

// MARK: - 결정론 의사난수 (웹 pseudoRandom 대응)

private func prand(_ n: Int) -> Double {
    let x = sin(Double(n) * 12.9898 + 78.233) * 43758.5453
    return x - floor(x)
}

// MARK: - fitness · SnowFall (눈 25송이 낙하 + drift, #cdf564)

private struct SnowFallFX: View {
    let startTime: Date
    private let color = Color(hexString: "#cdf564")
    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(startTime)
            Canvas { g, size in
                for i in 0..<25 {
                    let sx = prand(i)
                    let sz = 2 + prand(i + 100) * 2          // 2-4
                    let dur = 8 + prand(i + 200) * 6          // 8-14s
                    let delay = prand(i + 300) * dur
                    let drift = (prand(i + 400) - 0.5) * 60
                    let p = ((t + delay) / dur).truncatingRemainder(dividingBy: 1)
                    let y = (p * 1.1 - 0.05) * size.height
                    let x = sx * size.width + sin(p * .pi * 2) * drift
                    let fade = sin(p * .pi)                   // 0→1→0
                    let op = (0.3 + prand(i + 500) * 0.3) * fade
                    g.fill(Path(ellipseIn: CGRect(x: x, y: y, width: sz, height: sz)),
                           with: .color(color.opacity(op)))
                }
            }
        }
    }
}

// MARK: - learning · Library (먼지 12 부유 + 우상단 종이 접힘, #a5c8db)

private struct LibraryFX: View {
    let startTime: Date
    private let color = Color(hexString: "#a5c8db")
    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(startTime)
            Canvas { g, size in
                // 우상단 종이 접힘 — 삼각형
                var tri = Path()
                tri.move(to: CGPoint(x: size.width - 36, y: 0))
                tri.addLine(to: CGPoint(x: size.width, y: 0))
                tri.addLine(to: CGPoint(x: size.width, y: 36))
                tri.closeSubpath()
                g.fill(tri, with: .color(color.opacity(0.13)))
                // 떠다니는 먼지
                for i in 0..<12 {
                    let bx = prand(i) * size.width
                    let by = prand(i + 50) * size.height
                    let dur = 10 + prand(i + 200) * 8
                    let amp = 6 + prand(i + 250) * 10
                    let ph = t / dur * .pi * 2 + Double(i)
                    let x = bx + sin(ph) * amp
                    let y = by + cos(ph * 0.8) * amp
                    let op = 0.2 + (0.5 - 0.2) * (0.5 + 0.5 * sin(ph))
                    g.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 2, height: 2)),
                           with: .color(color.opacity(op)))
                }
            }
        }
    }
}

// MARK: - mindfulness · Incense (향 연기 5 상승 + blur, #c9b8e8)

private struct IncenseFX: View {
    let startTime: Date
    private let color = Color(hexString: "#c9b8e8")
    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(startTime)
            Canvas { g, size in
                for i in 0..<5 {
                    let sx = 0.2 + prand(i) * 0.6
                    let sz = 40 + prand(i + 10) * 30
                    let dur = 14 + prand(i + 20) * 6
                    let delay = prand(i + 30) * dur
                    let p = ((t + delay) / dur).truncatingRemainder(dividingBy: 1)
                    let y = (1.0 - p * 1.1) * size.height          // 하단→상단
                    let x = sx * size.width + sin(p * .pi * 3) * 24
                    let fade = sin(p * .pi) * 0.9
                    g.fill(Path(ellipseIn: CGRect(x: x - sz / 2, y: y - sz / 2, width: sz, height: sz)),
                           with: .radialGradient(
                            Gradient(colors: [color.opacity(0.4 * fade), .clear]),
                            center: CGPoint(x: x, y: y), startRadius: 0, endRadius: sz / 2))
                }
            }
            .blur(radius: 8)
        }
    }
}

// MARK: - nutrition · GoldDust (금가루 20 부유 + glow, #e8d88b)

private struct GoldDustFX: View {
    let startTime: Date
    private let color = Color(hexString: "#e8d88b")
    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(startTime)
            Canvas { g, size in
                for i in 0..<20 {
                    let bx = prand(i) * size.width
                    let by = prand(i + 40) * size.height
                    let dur = 6 + prand(i + 100) * 5
                    let sz = 1.5 + prand(i + 150) * 2
                    let ph = t / dur * .pi * 2 + Double(i) * 0.7
                    let x = bx + sin(ph) * 18
                    let y = by + cos(ph * 1.3) * 14
                    let op = 0.2 + (0.75 - 0.2) * (0.5 + 0.5 * sin(ph))
                    // glow
                    g.fill(Path(ellipseIn: CGRect(x: x - sz * 2, y: y - sz * 2, width: sz * 4, height: sz * 4)),
                           with: .color(color.opacity(op * 0.3)))
                    g.fill(Path(ellipseIn: CGRect(x: x, y: y, width: sz, height: sz)),
                           with: .color(color.opacity(op)))
                }
            }
        }
    }
}

// MARK: - social · Confetti (색종이 14 낙하 + 회전, 4색)

private struct ConfettiFX: View {
    let startTime: Date
    private let colors = ["#e8a8a8", "#e8d88b", "#87b8cd", "#cdf564"].map { Color(hexString: $0) }
    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(startTime)
            Canvas { g, size in
                for i in 0..<14 {
                    let sx = prand(i)
                    let sz = 4 + prand(i + 30) * 4
                    let dur = 5 + prand(i + 100) * 4
                    let delay = prand(i + 200) * dur
                    let p = ((t + delay) / dur).truncatingRemainder(dividingBy: 1)
                    let y = (p * 1.2 - 0.1) * size.height
                    let x = sx * size.width
                    let rot = prand(i + 400) * 360 + p * 720
                    let fade = min(1, sin(p * .pi) * 1.4)
                    g.drawLayer { layer in
                        layer.translateBy(x: x, y: y)
                        layer.rotate(by: .degrees(rot))
                        layer.fill(Path(CGRect(x: -sz / 2, y: -sz / 2, width: sz, height: sz)),
                                   with: .color(colors[i % colors.count].opacity(0.7 * fade)))
                    }
                }
            }
        }
    }
}

// MARK: - productivity · ClockGears (톱니 2개 회전, #bca88b)

private struct ClockGearsFX: View {
    let startTime: Date
    private let color = Color(hexString: "#bca88b")
    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(startTime)
            Canvas { g, size in
                drawGear(&g, center: CGPoint(x: 40, y: 70), radius: 42,
                         teeth: 12, angle: t * 12, op: 0.12)
                drawGear(&g, center: CGPoint(x: size.width - 30, y: size.height - 60), radius: 54,
                         teeth: 14, angle: -t * 9, op: 0.10)
            }
        }
    }
    private func drawGear(_ g: inout GraphicsContext, center: CGPoint, radius r: CGFloat,
                          teeth: Int, angle deg: Double, op: Double) {
        g.drawLayer { layer in
            layer.translateBy(x: center.x, y: center.y)
            layer.rotate(by: .degrees(deg))
            // 톱니
            for i in 0..<teeth {
                let a = Double(i) / Double(teeth) * .pi * 2
                let tx = cos(a) * r, ty = sin(a) * r
                layer.drawLayer { tl in
                    tl.translateBy(x: tx, y: ty)
                    tl.rotate(by: .radians(a))
                    tl.fill(Path(CGRect(x: -3, y: -5, width: 6, height: 10)),
                            with: .color(color.opacity(op)))
                }
            }
            // 링 + 중심
            layer.stroke(Path(ellipseIn: CGRect(x: -r, y: -r, width: r * 2, height: r * 2)),
                         with: .color(color.opacity(op)), lineWidth: 4)
            layer.stroke(Path(ellipseIn: CGRect(x: -r * 0.4, y: -r * 0.4, width: r * 0.8, height: r * 0.8)),
                         with: .color(color.opacity(op)), lineWidth: 3)
        }
    }
}

// MARK: - wellness · Mist (하단 안개 breathing + drift, #8bc9c9)

private struct MistFX: View {
    let startTime: Date
    private let color = Color(hexString: "#8bc9c9")
    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(startTime)
            Canvas { g, size in
                for i in 0..<4 {
                    let baseY = size.height * (0.7 + Double(i) * 0.08)
                    let w = size.width * (0.7 + prand(i) * 0.4)
                    let h: CGFloat = 80 + CGFloat(prand(i + 5)) * 60
                    let drift = sin(t * 0.15 + Double(i)) * 40
                    let x = size.width * 0.5 - w / 2 + drift
                    let breathe = 0.5 + 0.5 * sin(t * 0.4 + Double(i) * 1.3)
                    let op = (0.10 + 0.12 * breathe)
                    g.fill(Path(ellipseIn: CGRect(x: x, y: baseY - h / 2, width: w, height: h)),
                           with: .color(color.opacity(op)))
                }
            }
            .blur(radius: 18)
        }
    }
}

// MARK: - trending · Glitch (scanline + 픽셀 shift, #cdf564)

private struct GlitchFX: View {
    let startTime: Date
    private let color = Color(hexString: "#cdf564")
    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(startTime)
            Canvas { g, size in
                // scanlines — 4px 간격 가로 라인
                var y: CGFloat = 0
                while y < size.height {
                    g.fill(Path(CGRect(x: 0, y: y, width: size.width, height: 1)),
                           with: .color(color.opacity(0.04)))
                    y += 4
                }
                // 픽셀 shift 블록 — 몇 개가 t 기반으로 가로 이동·점멸
                for i in 0..<6 {
                    let band = prand(i) * size.height
                    let h: CGFloat = 6 + CGFloat(prand(i + 3)) * 14
                    let on = sin(t * (2 + Double(i)) + Double(i) * 2) > 0.6
                    if on {
                        let shift = (prand(i + 7) - 0.5) * 40
                        g.fill(Path(CGRect(x: shift, y: band, width: size.width, height: h)),
                               with: .color(color.opacity(0.10)))
                    }
                }
            }
        }
    }
}
