//
//  AmbientBackground.swift
//  UpNext — 전 화면 오로라 앰비언트 배경 (3-layer drift/breathe).
//
//  웹 src/components/effects/AmbientBackground.tsx + globals.css `aurora-drift 20s`
//  / `aurora-drift-alt 25s` / `aurora-breathe 8s` 의 SwiftUI 포팅.
//
//  3-layer 구성:
//   Layer 1 — 딥 퍼플 베이스 (하단 60%, blur 40, opacity 0.8)
//   Layer 2 — 메인 오로라 밴드 (보라/마젠타, blur 45, breathe opacity 0.35↔0.5)
//   Layer 3 — 상단 엣지 하이라이트 (delay -6s, blur 50)
//
//  TimelineView + 부드러운 sinPhase 보간으로 CSS keyframe 의 0/25/50/75/100 stop 을
//  연속적으로 재현. reduce-motion 가드 포함.
//
//  마운트: MainTabView 의 ZStack 가장 바닥 (Color.bgPrimary 바로 위).
//

import SwiftUI

struct AmbientBackground: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        // reduce-motion 시 — 정적 그라데이션 한 장만 (절반 톤다운).
        if reduceMotion {
            staticFallback
        } else {
            TimelineView(.animation) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                ZStack {
                    layer1(time: t)
                    layer2(time: t)
                    layer3(time: t)
                }
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
        }
    }

    private var staticFallback: some View {
        ZStack {
            // L1
            radialGradient(color: Color(red: 0.231, green: 0.027, blue: 0.392), opacity: 0.40)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            // L2 (옅게)
            radialGradient(color: Color(red: 0.471, green: 0.157, blue: 0.745), opacity: 0.20)
                .offset(y: 80)
        }
        .blur(radius: 40)
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - Layer 1 — 딥 퍼플 베이스 (aurora-drift 20s)

    private func layer1(time t: TimeInterval) -> some View {
        let phase = (t.truncatingRemainder(dividingBy: 20)) / 20  // 0…1
        let (tx, ty, sx) = drift1(phase)
        return GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                ellipseGradient(
                    color: Color(red: 0.231, green: 0.027, blue: 0.392), // rgba(59,7,100,0.45)
                    alpha: 0.45,
                    centerX: 0.35, centerY: 0.90,
                    radiusX: 0.5, radiusY: 0.35
                )
                ellipseGradient(
                    color: Color(red: 0.118, green: 0.024, blue: 0.220), // rgba(30,6,56,0.35)
                    alpha: 0.35,
                    centerX: 0.65, centerY: 0.95,
                    radiusX: 0.4, radiusY: 0.30
                )
            }
            .frame(width: w * 1.5, height: h * 0.6)
            .offset(x: -w * 0.25 + tx * w, y: h * 0.4 - h * 0.15 + ty)
            .scaleEffect(x: sx, y: 1, anchor: .center)
            .blur(radius: 40)
            .opacity(0.8)
        }
    }

    // MARK: - Layer 2 — 메인 오로라 밴드 (aurora-drift-alt 25s + aurora-breathe 8s)

    private func layer2(time t: TimeInterval) -> some View {
        let driftPhase = (t.truncatingRemainder(dividingBy: 25)) / 25
        let (tx, ty, sx, rot) = drift2(driftPhase)

        let breathePhase = (t.truncatingRemainder(dividingBy: 8)) / 8
        // 0.35 → 0.5 sine breath
        let breathe = 0.35 + 0.075 * (1 - cos(breathePhase * 2 * .pi))

        return GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                ellipseGradient(
                    color: Color(red: 0.471, green: 0.157, blue: 0.745), // rgba(120,40,190,0.25)
                    alpha: 0.25,
                    centerX: 0.20, centerY: 0.60,
                    radiusX: 0.35, radiusY: 0.40
                )
                ellipseGradient(
                    color: Color(red: 0.667, green: 0.196, blue: 0.588), // rgba(170,50,150,0.15)
                    alpha: 0.15,
                    centerX: 0.55, centerY: 0.55,
                    radiusX: 0.30, radiusY: 0.35
                )
                ellipseGradient(
                    color: Color(red: 0.353, green: 0.118, blue: 0.667), // rgba(90,30,170,0.20)
                    alpha: 0.20,
                    centerX: 0.85, centerY: 0.65,
                    radiusX: 0.32, radiusY: 0.37
                )
            }
            .frame(width: w * 1.4, height: h * 0.45)
            .offset(x: -w * 0.20 + tx * w, y: h * 0.05 + ty)
            .scaleEffect(x: sx, y: 1, anchor: .center)
            .rotationEffect(.degrees(rot))
            .blur(radius: 45)
            .opacity(breathe)
        }
    }

    // MARK: - Layer 3 — 상단 엣지 하이라이트 (aurora-drift 18s, delay -6s)

    private func layer3(time t: TimeInterval) -> some View {
        // delay -6s = 위상을 6초 앞당김
        let shifted = (t + 6).truncatingRemainder(dividingBy: 18) / 18
        let (tx, ty, sx) = drift1(shifted)
        return GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                ellipseGradient(
                    color: Color(red: 0.627, green: 0.471, blue: 0.902), // rgba(160,120,230,0.10)
                    alpha: 0.10,
                    centerX: 0.28, centerY: 0.55,
                    radiusX: 0.25, radiusY: 0.45
                )
                ellipseGradient(
                    color: Color(red: 0.863, green: 0.706, blue: 0.941), // rgba(220,180,240,0.06)
                    alpha: 0.06,
                    centerX: 0.72, centerY: 0.50,
                    radiusX: 0.20, radiusY: 0.40
                )
            }
            .frame(width: w * 1.3, height: h * 0.25)
            .offset(x: -w * 0.15 + tx * w, y: h * 0.20 + ty)
            .scaleEffect(x: sx, y: 1, anchor: .center)
            .blur(radius: 50)
        }
    }

    // MARK: - Drift 함수 (CSS keyframe 보간)

    /// aurora-drift: 0/25/50/75/100 stop 의 부드러운 보간.
    /// translateX 0%/3%/-2%/-4%/0%, translateY 0/-8/4/-4/0, scaleX 1/1.05/0.97/1.03/1.
    private func drift1(_ p: Double) -> (tx: Double, ty: Double, sx: Double) {
        // 각 stop 시간(0..1) 과 값.
        let stopsX: [(Double, Double)] = [(0, 0), (0.25, 0.03), (0.5, -0.02), (0.75, -0.04), (1.0, 0)]
        let stopsY: [(Double, Double)] = [(0, 0), (0.25, -8), (0.5, 4), (0.75, -4), (1.0, 0)]
        let stopsS: [(Double, Double)] = [(0, 1), (0.25, 1.05), (0.5, 0.97), (0.75, 1.03), (1.0, 1)]
        return (lerpStops(stopsX, at: p), lerpStops(stopsY, at: p), lerpStops(stopsS, at: p))
    }

    /// aurora-drift-alt: 0/30/60/100 stop. tx 0%/-5%/4%/0%, ty 0/6/-6/0, sx 1/1.08/0.95/1, rot 0/0.5/-0.5/0.
    private func drift2(_ p: Double) -> (tx: Double, ty: Double, sx: Double, rot: Double) {
        let stopsX: [(Double, Double)] = [(0, 0), (0.30, -0.05), (0.60, 0.04), (1.0, 0)]
        let stopsY: [(Double, Double)] = [(0, 0), (0.30, 6), (0.60, -6), (1.0, 0)]
        let stopsS: [(Double, Double)] = [(0, 1), (0.30, 1.08), (0.60, 0.95), (1.0, 1)]
        let stopsR: [(Double, Double)] = [(0, 0), (0.30, 0.5), (0.60, -0.5), (1.0, 0)]
        return (lerpStops(stopsX, at: p), lerpStops(stopsY, at: p),
                lerpStops(stopsS, at: p), lerpStops(stopsR, at: p))
    }

    /// 정렬된 stop 사이를 cosine ease-in-out 으로 보간 (CSS `ease-in-out` 대응).
    private func lerpStops(_ stops: [(Double, Double)], at p: Double) -> Double {
        if p <= stops.first!.0 { return stops.first!.1 }
        if p >= stops.last!.0 { return stops.last!.1 }
        for i in 0..<(stops.count - 1) {
            let a = stops[i], b = stops[i + 1]
            if p >= a.0 && p <= b.0 {
                let local = (p - a.0) / (b.0 - a.0)
                let eased = (1 - cos(local * .pi)) / 2  // ease-in-out
                return a.1 + (b.1 - a.1) * eased
            }
        }
        return stops.last!.1
    }

    // MARK: - 그라데이션 헬퍼

    /// SwiftUI 의 RadialGradient 는 원형만 — ellipse 효과는 `.scaleEffect` 로 비율 변형.
    private func ellipseGradient(color: Color, alpha: Double,
                                  centerX: Double, centerY: Double,
                                  radiusX: Double, radiusY: Double) -> some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            RadialGradient(
                gradient: Gradient(colors: [color.opacity(alpha), Color.clear]),
                center: UnitPoint(x: centerX, y: centerY),
                startRadius: 0,
                endRadius: max(w, h) * 0.5
            )
            .scaleEffect(x: radiusX * 2, y: radiusY * 2, anchor: UnitPoint(x: centerX, y: centerY))
        }
    }

    private func radialGradient(color: Color, opacity: Double) -> some View {
        RadialGradient(
            gradient: Gradient(colors: [color.opacity(opacity), Color.clear]),
            center: .bottom,
            startRadius: 0,
            endRadius: 600
        )
    }
}
