//
//  RarityBackdrop.swift
//  UpNext — 등급별 카드 뒷배경 이펙트 (R4 — UI/인터랙션 회복).
//
//  웹 src/components/cards/RarityBackdrop.tsx (423줄) 포팅.
//  Card3DViewer/CardDetailModal 의 카드 뒤에 배치되는 등급별 분위기 레이어.
//
//  웹은 CSS @keyframes (off-main-thread GPU) + framer-motion entrance.
//  네이티브는 TimelineView(.animation) 의 연속 시간으로 회전/호흡/반짝임을 계산.
//   - conic-gradient → SwiftUI AngularGradient
//   - radial-gradient → RadialGradient
//   - filter: blur → .blur(radius:)
//   - maskImage radial → .mask(RadialGradient)
//   - 서로소 주기 (spin 28/40 · 30/41 · 46/33 · breath 13/17/15/19) 그대로 유지.
//
//  등급별 개성 (웹 동일):
//   - normal: 약한 halo pulse
//   - rare: 회전 오로라 2층 + 수평 커튼
//   - unique: 중앙 코어 + 회전 광선 2층 + 16 에너지 파편
//   - legend: 거대 영광 + 광선 2층 + 12 궤도 입자 + 24 반짝임 + shimmer sweep
//

import SwiftUI

struct RarityBackdrop: View {
    let rarity: Rarity
    // 리뷰 #6 — reduce-motion 시 연속 회전/호흡/반짝임 중단, 정적 등급색 glow 만.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if reduceMotion {
                RadialGradient(
                    colors: [rarity.color.opacity(rarity == .normal ? 0.12 : 0.18),
                             rarity.color.opacity(0.05), .clear],
                    center: .center, startRadius: 0, endRadius: 280)
            } else {
                switch rarity {
                case .normal: NormalBackdrop()
                case .rare:   RareBackdrop(color: rarity.color)
                case .unique: UniqueBackdrop(color: rarity.color)
                case .legend: LegendBackdrop(color: rarity.color)
                }
            }
        }
        .allowsHitTesting(false)
        .clipped()
    }
}

// MARK: - 공통 시간 헬퍼

/// 주기 `period` 초에 대한 0~1 정규화 위상 (선형 — spin 회전용).
private func linearPhase(_ t: TimeInterval, period: Double, delay: Double = 0) -> Double {
    let shifted = t - delay
    return (shifted / period).truncatingRemainder(dividingBy: 1.0)
}

/// 주기 `period` 초의 사인 0~1 위상 (호흡·펄스용). delay 로 phase 오프셋.
private func sinePhase(_ t: TimeInterval, period: Double, delay: Double = 0) -> Double {
    let shifted = t - delay
    return (sin(shifted / period * 2 * .pi) + 1) / 2   // 0~1
}

// MARK: - NORMAL

/// 약한 흰 halo pulse (웹 rb-halo-pulse 5s). opacity + scale 약하게 맥동.
private struct NormalBackdrop: View {
    var body: some View {
        TimelineView(.animation) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            let p = sinePhase(t, period: 5)
            RadialGradient(
                colors: [.white.opacity(0.14), .white.opacity(0.05), .clear],
                center: .center, startRadius: 0, endRadius: 280
            )
            .scaleEffect(0.95 + 0.1 * p)
            .opacity(0.6 + 0.4 * p)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

// MARK: - RARE

/// 회전 오로라 2층(시계/반시계, 서로소 28/40s) + 수평 커튼.
private struct RareBackdrop: View {
    let color: Color

    var body: some View {
        TimelineView(.animation) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            ZStack {
                // 메인 오로라 — 시계 회전 + opacity pulse
                AngularGradient(
                    gradient: Gradient(stops: [
                        .init(color: .clear, location: 0.0),
                        .init(color: color.opacity(0.33), location: 0.17),
                        .init(color: .clear, location: 0.39),
                        .init(color: color.opacity(0.27), location: 0.61),
                        .init(color: .clear, location: 0.83),
                        .init(color: .clear, location: 1.0),
                    ]),
                    center: .center,
                    angle: .degrees(linearPhase(t, period: 28) * 360)
                )
                .blur(radius: 50)
                .opacity(0.5 + 0.3 * sinePhase(t, period: 5))

                // 반대 방향 — 깊이감
                AngularGradient(
                    gradient: Gradient(stops: [
                        .init(color: .clear, location: 0.0),
                        .init(color: color.opacity(0.27), location: 0.22),
                        .init(color: .clear, location: 0.44),
                        .init(color: color.opacity(0.2), location: 0.67),
                        .init(color: .clear, location: 0.89),
                    ]),
                    center: .center,
                    angle: .degrees(-linearPhase(t, period: 40) * 360 + 45)
                )
                .blur(radius: 60)
                .opacity(0.4 + 0.25 * sinePhase(t, period: 7, delay: 1))

                // 수평 커튼 — 좌우 sweep
                let curtain = sinePhase(t, period: 14)
                LinearGradient(
                    colors: [.clear, color.opacity(0.2), color.opacity(0.4),
                             color.opacity(0.2), .clear],
                    startPoint: .leading, endPoint: .trailing
                )
                .frame(height: 180)
                .blur(radius: 35)
                .opacity(0.4 + 0.4 * curtain)
                .offset(y: -40)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

// MARK: - UNIQUE

/// 중앙 코어(맥동) + 회전 광선 2층(30/41s, 호흡 13/17s) + 16 에너지 파편.
private struct UniqueBackdrop: View {
    let color: Color

    /// 16 파편 — 방향/거리/크기/주기/위상 결정적 시드 (웹 useMemo 와 동일 공식).
    private struct Fragment {
        let angle: Double, distance: Double, size: Double, duration: Double, delay: Double
    }
    private let fragments: [Fragment] = (0..<16).map { i in
        let angle = (Double(i) / 16 * .pi * 2) + Double((i * 37) % 11) * 0.07
        let distance = 180 + Double((i * 53) % 90)
        let size = 4 + Double((i * 29) % 5)
        let duration = 2.6 + Double((i * 31) % 160) / 100.0
        let delay = -Double((i * 23) % 240) / 100.0
        return Fragment(angle: angle, distance: distance, size: size,
                        duration: duration, delay: delay)
    }

    var body: some View {
        TimelineView(.animation) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            ZStack {
                // 중앙 코어 — 맥동 (3s)
                let core = sinePhase(t, period: 3)
                RadialGradient(
                    colors: [color, color.opacity(0.4), color.opacity(0.13), .clear],
                    center: .center, startRadius: 0, endRadius: 130
                )
                .blur(radius: 22)
                .scaleEffect(0.92 + 0.16 * core)
                .opacity(0.55 + 0.35 * core)

                // 메인 광선 — 시계 회전 30s
                rayLayer(t: t, period: 30, reverse: false, blurR: 18, op: 0.65)

                // 보조 광선 — 반시계 41s
                rayLayer(t: t, period: 41, reverse: true, blurR: 22, op: 0.45)

                // 16 에너지 파편 — 중앙에서 방사
                ForEach(0..<fragments.count, id: \.self) { i in
                    let f = fragments[i]
                    let p = linearPhase(t, period: f.duration, delay: f.delay)
                    let dist = f.distance * (0.3 + 1.3 * p)  // emanate outward
                    Circle()
                        .fill(color)
                        .frame(width: f.size, height: f.size)
                        .shadow(color: color, radius: f.size * 1.5)
                        .offset(x: cos(f.angle) * dist, y: sin(f.angle) * dist)
                        .opacity(p < 0.1 ? p * 10 : (1 - p) * 1.1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// 회전 광선 한 층 — AngularGradient + radial mask + breath.
    private func rayLayer(t: TimeInterval, period: Double, reverse: Bool,
                          blurR: CGFloat, op: Double) -> some View {
        let dir = reverse ? -1.0 : 1.0
        let breath = sinePhase(t, period: reverse ? 17 : 13)
        return AngularGradient(
            gradient: Gradient(stops: rayStops(color: color)),
            center: .center,
            angle: .degrees(dir * linearPhase(t, period: period) * 360)
        )
        .blur(radius: blurR)
        .mask(
            RadialGradient(
                colors: [.black, .black.opacity(0.4), .clear],
                center: .center, startRadius: 0, endRadius: 240
            )
        )
        .scaleEffect(0.98 + 0.08 * breath)
        .opacity(op)
    }
}

// MARK: - LEGEND

/// 거대 영광 + 광선 2층(46/33s) + 12 궤도 입자 + 24 반짝임 + 대각 shimmer.
private struct LegendBackdrop: View {
    let color: Color

    private struct Sparkle {
        let x: Double, y: Double, size: Double, duration: Double, delay: Double
    }
    private let sparkles: [Sparkle] = (0..<24).map { i in
        let x = Double((i * 73 + 11) % 90) + 5
        let y = Double((i * 41 + 19) % 90) + 5
        let size = 2 + Double(i % 3)
        let duration = 1.6 + Double((i * 29) % 190) / 100.0
        let delay = -Double((i * 47) % 280) / 100.0
        return Sparkle(x: x, y: y, size: size, duration: duration, delay: delay)
    }

    private struct Orbit {
        let radius: Double, size: Double, duration: Double, delay: Double
    }
    private let orbits: [Orbit] = (0..<12).map { i in
        let startAngleDeg = Double(i) / 12 * 360
        let radius = 160 + Double(i % 3) * 45
        let size = 5 + Double(i % 2) * 3
        let duration = 14 + Double(i % 3) * 3
        let delay = -(startAngleDeg / 360) * duration
        return Orbit(radius: radius, size: size, duration: duration, delay: delay)
    }

    var body: some View {
        TimelineView(.animation) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            GeometryReader { geo in
                let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
                ZStack {
                    // 거대 영광 — 4s 맥동
                    let glow = sinePhase(t, period: 4)
                    RadialGradient(
                        colors: [color, color.opacity(0.6), color.opacity(0.33),
                                 color.opacity(0.13), .clear],
                        center: .center, startRadius: 0, endRadius: 200
                    )
                    .blur(radius: 22)
                    .scaleEffect(0.94 + 0.12 * glow)
                    .opacity(0.6 + 0.3 * glow)

                    // 메인 광선 — 시계 46s
                    rayLayer(t: t, period: 46, reverse: false, blurR: 20, op: 0.6, breathPeriod: 15)
                    // 반대 광선 — 반시계 33s
                    rayLayer(t: t, period: 33, reverse: true, blurR: 22, op: 0.5, breathPeriod: 19)

                    // 12 궤도 입자
                    ForEach(0..<orbits.count, id: \.self) { i in
                        let o = orbits[i]
                        let ang = linearPhase(t, period: o.duration, delay: o.delay) * 2 * .pi
                        Circle()
                            .fill(color)
                            .frame(width: o.size, height: o.size)
                            .shadow(color: color, radius: o.size * 1.5)
                            .position(
                                x: center.x + cos(ang - .pi / 2) * o.radius,
                                y: center.y + sin(ang - .pi / 2) * o.radius
                            )
                    }

                    // 24 반짝임 별
                    ForEach(0..<sparkles.count, id: \.self) { i in
                        let s = sparkles[i]
                        let p = sinePhase(t, period: s.duration, delay: s.delay)
                        Circle()
                            .fill(.white)
                            .frame(width: s.size, height: s.size)
                            .shadow(color: color, radius: s.size * 2)
                            .position(x: geo.size.width * s.x / 100,
                                      y: geo.size.height * s.y / 100)
                            .opacity(0.2 + 0.8 * p)
                            .scaleEffect(0.4 + 0.6 * p)
                    }

                    // 대각 shimmer sweep — 5s
                    let sweep = sinePhase(t, period: 5)
                    LinearGradient(
                        colors: [.clear, color.opacity(0.2), .clear],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    .blur(radius: 30)
                    .opacity(0.3 + 0.5 * sweep)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func rayLayer(t: TimeInterval, period: Double, reverse: Bool,
                          blurR: CGFloat, op: Double, breathPeriod: Double) -> some View {
        let dir = reverse ? -1.0 : 1.0
        let breath = sinePhase(t, period: breathPeriod)
        return AngularGradient(
            gradient: Gradient(stops: rayStops(color: color)),
            center: .center,
            angle: .degrees(dir * linearPhase(t, period: period) * 360)
        )
        .blur(radius: blurR)
        .mask(
            RadialGradient(
                colors: [.black, .black.opacity(0.45), .clear],
                center: .center, startRadius: 0, endRadius: 260
            )
        )
        .scaleEffect(0.97 + 0.08 * breath)
        .opacity(op)
    }
}

// MARK: - 광선 conic stops 공용

/// 회전 광선의 AngularGradient stops — 등급 광선 공통 (밝은 ray + 어두운 gap 반복).
/// 웹의 다단 conic-gradient (8-12 ray) 를 6 ray 로 압축 (시각적 동치, 성능).
private func rayStops(color: Color) -> [Gradient.Stop] {
    var stops: [Gradient.Stop] = []
    let rays = 6
    for r in 0..<rays {
        let base = Double(r) / Double(rays)
        let span = 1.0 / Double(rays)
        stops.append(.init(color: .clear, location: base))
        stops.append(.init(color: color.opacity(0.33), location: base + span * 0.35))
        stops.append(.init(color: color.opacity(0.13), location: base + span * 0.55))
        stops.append(.init(color: .clear, location: base + span * 0.9))
    }
    stops.append(.init(color: .clear, location: 1.0))
    return stops
}
