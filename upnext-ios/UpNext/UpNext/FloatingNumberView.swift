//
//  FloatingNumberView.swift
//  UpNext — 전투 부유 숫자 (14 keyframe variant 통합).
//
//  웹 globals.css 의 14개 float keyframe 을 단일 컴포넌트로 통합:
//   - uphero-hp-regen-float     800ms  y 0→-3→-18, opacity 0→1→0
//   - uphero-xp-float           900ms  y 0→-4→-22
//   - uphero-heal-float         900ms  y +4→0→-16
//   - uphero-coin-float        1000ms  x/y diagonal -20
//   - uphero-time-tag           700ms  x -4→0→+14 (sideways)
//   - uphero-start-bonus       1100ms  y/scale combo (0.9→1.1→1→0.95)
//   - uphero-dodge-pulse        450ms  scale 0.6→1.1→1.4 (✦)
//   - uphero-crit-pulse         500ms  scale 0.5→1.2→1.6 + rotate 0→45→90 (◇)
//
//  사용:
//    FloatingNumberOverlay()
//        .onCombatEvent(session) { event in ... }
//
//  각 인스턴스는 자체 라이프사이클 — onAppear 에서 progress 0→1, duration 끝나면 onComplete.
//

import SwiftUI
import Combine

enum FloatVariant {
    case hpRegen, xp, heal, coin, timeTag, startBonus, dodgePulse, critPulse

    var duration: Double {
        switch self {
        case .hpRegen:    return 0.80
        case .xp:         return 0.90
        case .heal:       return 0.90
        case .coin:       return 1.00
        case .timeTag:    return 0.70
        case .startBonus: return 1.10
        case .dodgePulse: return 0.45
        case .critPulse:  return 0.50
        }
    }

    /// 변형 색상 기본값. 호출자가 override 가능.
    var defaultColor: Color {
        switch self {
        case .hpRegen:    return Color.accentPrimary
        case .xp:         return Color(red: 0.647, green: 0.784, blue: 0.859) // mage 컬러 #a5c8db
        case .heal:       return Color(red: 0.545, green: 0.788, blue: 0.788) // priest #8bc9c9
        case .coin:       return Color(red: 0.910, green: 0.847, blue: 0.545) // druid #e8d88b
        case .timeTag:    return Color.accentCyan
        case .startBonus: return Color.accentPrimary
        case .dodgePulse: return Color(red: 0.647, green: 0.784, blue: 0.859)
        case .critPulse:  return Color.accentFushia
        }
    }
}

/// 한 개의 부유 숫자 인스턴스. position 은 부모 좌표계에서의 시작 위치.
struct FloatingNumberItem: Identifiable {
    let id = UUID()
    let text: String
    let variant: FloatVariant
    let color: Color
    let position: CGPoint
    let createdAt: Date

    init(text: String, variant: FloatVariant, color: Color? = nil, position: CGPoint) {
        self.text = text
        self.variant = variant
        self.color = color ?? variant.defaultColor
        self.position = position
        self.createdAt = Date()
    }
}

/// 단일 부유 숫자 뷰 (TimelineView 로 progress 보간).
struct FloatingNumberView: View {
    let item: FloatingNumberItem

    var body: some View {
        TimelineView(.animation) { context in
            let elapsed = context.date.timeIntervalSince(item.createdAt)
            let progress = min(elapsed / item.variant.duration, 1)
            let frame = computeFrame(variant: item.variant, progress: progress)

            Text(item.text)
                .typography(.caption)
                .monospacedDigit()
                .foregroundStyle(item.color)
                .opacity(frame.opacity)
                .scaleEffect(frame.scale)
                .rotationEffect(.degrees(frame.rotation))
                .offset(x: frame.offset.width, y: frame.offset.height)
                .position(item.position)
                .allowsHitTesting(false)
        }
    }

    private struct Frame {
        var opacity: Double
        var offset: CGSize
        var scale: Double
        var rotation: Double
    }

    private func computeFrame(variant: FloatVariant, progress p: Double) -> Frame {
        switch variant {
        case .hpRegen:
            // 0% (o=0, y=0) → 15% (o=1, y=-3) → 100% (o=0, y=-18)
            return Frame(
                opacity: lerpStops([(0, 0), (0.15, 1), (1, 0)], at: p),
                offset: CGSize(width: 0, height: lerpStops([(0, 0), (0.15, -3), (1, -18)], at: p)),
                scale: 1, rotation: 0
            )
        case .xp:
            return Frame(
                opacity: lerpStops([(0, 0), (0.15, 1), (1, 0)], at: p),
                offset: CGSize(width: 0, height: lerpStops([(0, 0), (0.15, -4), (1, -22)], at: p)),
                scale: 1, rotation: 0
            )
        case .heal:
            return Frame(
                opacity: lerpStops([(0, 0), (0.20, 1), (1, 0)], at: p),
                offset: CGSize(width: 0, height: lerpStops([(0, 4), (0.20, 0), (1, -16)], at: p)),
                scale: 1, rotation: 0
            )
        case .coin:
            return Frame(
                opacity: lerpStops([(0, 0), (0.15, 1), (0.60, 1), (1, 0)], at: p),
                offset: CGSize(
                    width: lerpStops([(0, 0), (0.15, 0), (0.60, 2), (1, -1)], at: p),
                    height: lerpStops([(0, 0), (0.15, -3), (0.60, -10), (1, -20)], at: p)
                ),
                scale: 1, rotation: 0
            )
        case .timeTag:
            return Frame(
                opacity: lerpStops([(0, 0), (0.20, 1), (1, 0)], at: p),
                offset: CGSize(width: lerpStops([(0, -4), (0.20, 0), (1, 14)], at: p), height: 0),
                scale: 1, rotation: 0
            )
        case .startBonus:
            return Frame(
                opacity: lerpStops([(0, 0), (0.20, 1), (0.45, 1), (1, 0)], at: p),
                offset: CGSize(width: 0, height: lerpStops([(0, 6), (0.20, 0), (0.45, -3), (1, -18)], at: p)),
                scale: lerpStops([(0, 0.9), (0.20, 1.1), (0.45, 1), (1, 0.95)], at: p),
                rotation: 0
            )
        case .dodgePulse:
            return Frame(
                opacity: lerpStops([(0, 0), (0.30, 1), (1, 0)], at: p),
                offset: .zero,
                scale: lerpStops([(0, 0.6), (0.30, 1.1), (1, 1.4)], at: p),
                rotation: 0
            )
        case .critPulse:
            return Frame(
                opacity: lerpStops([(0, 0), (0.30, 1), (1, 0)], at: p),
                offset: .zero,
                scale: lerpStops([(0, 0.5), (0.30, 1.2), (1, 1.6)], at: p),
                rotation: lerpStops([(0, 0), (0.30, 45), (1, 90)], at: p)
            )
        }
    }

    private func lerpStops(_ stops: [(Double, Double)], at p: Double) -> Double {
        if p <= stops.first!.0 { return stops.first!.1 }
        if p >= stops.last!.0 { return stops.last!.1 }
        for i in 0..<(stops.count - 1) {
            let a = stops[i], b = stops[i + 1]
            if p >= a.0 && p <= b.0 {
                let t = (p - a.0) / (b.0 - a.0)
                // ease-gb-out (cubic-bezier(0.23,1,0.32,1)) 근사 — 빠르게 시작.
                let eased = 1 - pow(1 - t, 3)
                return a.1 + (b.1 - a.1) * eased
            }
        }
        return stops.last!.1
    }
}

/// 부유 숫자 오버레이 — 활성 아이템 목록을 그린다.
/// 활성 라이프사이클은 아이템의 createdAt + duration 시점에 자동 제거됨.
struct FloatingNumberOverlay: View {
    @Binding var items: [FloatingNumberItem]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if !reduceMotion {
                ForEach(items) { item in
                    FloatingNumberView(item: item)
                }
            }
        }
        .allowsHitTesting(false)
        .onReceive(Timer.publish(every: 0.2, on: .main, in: .common).autoconnect()) { _ in
            // 만료된 아이템 정리
            let now = Date()
            items.removeAll { item in
                now.timeIntervalSince(item.createdAt) > item.variant.duration + 0.05
            }
        }
    }
}
