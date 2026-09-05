//
//  EnhanceRitualOverlay.swift
//  UpNext — 장비 강화 의식 오버레이 (2초).
//
//  웹 src/components/uphero/EnhanceRitualOverlay.tsx 포팅.
//  타임라인:
//   0–600ms   : 아이템 scale 1→1.08, glow 0→0.5. 6개 spark 외곽(60px)→중심 수렴.
//   600–1600ms: scale→1.1, glow→0.7. spark 중앙 회전 360°→540°.
//   1600–2000ms: outcome 분기 — 최종 flash + spark 분산/수렴.
//                - success  : GB.lightest (녹) 폭발 — spark scale 1.5
//                - keep     : GB_WARN (황) 미묘 — spark 작게 수축
//                - destroyed: GB_ENEMY (적) — spark 3× 분산, item 0.8 + opacity 0
//
//  2000ms 후 onDone 호출 → 부모가 결과 모달 전환. reduce-motion 시 60ms.
//
//  Phase 5-B — `band` 로 연출이 단계별로 커진다 (목표 레벨 기준, enhanceRitualBand).
//   band 0 (+1..+10): 2000ms / 6 spark (위 그대로)
//   band 1 (+11..+15): 2600ms / 10 spark / 성공 시 마지막 260ms 루트 shake (4px, 5 step)
//   band 2 (+16..+20): 3400ms / 14 spark / shake 420ms (6px, 7 step, 웹 enhance-shake-strong)
//                      / 소실 시 spark 분산 ×4 + 두 번째 링 (반대 위상, 120ms 지연)
//   reduced-motion: 60ms 후 onDone, shake·spark 없음. 웹 EnhanceRitualOverlay.tsx 와 같은 값.
//

import SwiftUI

enum EnhanceRitualOutcome { case success, keep, destroyed }

/// 밴드별 연출 길이(초) / spark 수 / shake 길이(초). 웹 RITUAL_DURATION_MS 등과 같은 값.
private let ritualDuration: [Double] = [2.0, 2.6, 3.4]
private let ritualSparks: [Int] = [6, 10, 14]
private let ritualShake: [Double] = [0, 0.26, 0.42]

struct EnhanceRitualOverlay: View {
    let equipment: Equipment
    let outcome: EnhanceRitualOutcome
    /// Phase 5-B — 연출 밴드 (UpHeroRules.enhanceRitualBand(targetLevel:)). 필수 —
    /// 호출부가 밴드를 빠뜨리면 컴파일이 잡는다.
    let band: Int
    let onDone: () -> Void

    private var bandIndex: Int { min(max(band, 0), 2) }
    private var duration: Double { ritualDuration[bandIndex] }
    private var sparkCount: Int { ritualSparks[bandIndex] }
    private var shakeDuration: Double { ritualShake[bandIndex] }
    /// 소실 분산 배율 — band >= 1 은 ×4 (웹 --enh-scatter).
    private var scatterMul: Double { bandIndex >= 1 ? 4.0 : 3.0 }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startTime = Date()

    private var flashColor: Color {
        switch outcome {
        case .success:   return GBPalette.lightest
        case .keep:      return Color(red: 1.0, green: 0.85, blue: 0.4)  // amber
        case .destroyed: return Color.accentSecondary
        }
    }

    var body: some View {
        ZStack {
            // 배경
            GBPalette.dark.opacity(0.90).ignoresSafeArea()

            TimelineView(.animation) { context in
                let elapsed = context.date.timeIntervalSince(startTime)
                let p = min(elapsed / duration, 1.0)
                let shake = shakeOffset(elapsed: elapsed)

                ZStack {
                    // ambient glow
                    Circle()
                        .fill(RadialGradient(
                            colors: [flashColor.opacity(0.33 * glowAt(p)), .clear],
                            center: .center, startRadius: 0, endRadius: 200
                        ))
                        .frame(width: 400, height: 400)

                    // spark — 밴드별 6/10/14 개를 원주에 균등 배치
                    ForEach(0..<sparkCount, id: \.self) { i in
                        let angle = Double(i) / Double(sparkCount) * 2 * .pi
                        let sx = cos(angle) * 60
                        let sy = sin(angle) * 60
                        let pos = sparkPosition(p: p, sx: sx, sy: sy)
                        Circle()
                            .fill(flashColor)
                            .frame(width: 6, height: 6)
                            .shadow(color: flashColor, radius: 6)
                            .offset(x: pos.x, y: pos.y)
                            .scaleEffect(sparkScale(p))
                            .opacity(sparkOpacity(p))
                    }
                    // Phase 5-B — band >= 1 소실은 두 번째 spark 링 (120ms 지연, 반대 위상).
                    if bandIndex >= 1 && outcome == .destroyed {
                        let p2 = min(max(0, elapsed - 0.12) / duration, 1.0)
                        ForEach(0..<sparkCount, id: \.self) { i in
                            let angle = Double(i) / Double(sparkCount) * 2 * .pi
                            let sx = -cos(angle) * 60
                            let sy = -sin(angle) * 60
                            let pos = sparkPosition(p: p2, sx: sx, sy: sy)
                            Circle()
                                .fill(flashColor)
                                .frame(width: 6, height: 6)
                                .shadow(color: flashColor, radius: 6)
                                .offset(x: pos.x, y: pos.y)
                                .scaleEffect(sparkScale(p2))
                                .opacity(sparkOpacity(p2))
                        }
                    }

                    // 아이템 본체
                    itemView(scale: itemScale(p), brightness: itemBrightness(p))
                }
                .offset(x: shake.x, y: shake.y)
            }
        }
        .onAppear {
            startTime = Date()
            if reduceMotion {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { onDone() }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + duration) { onDone() }
            }
        }
    }

    // MARK: - 아이템 뷰

    private func itemView(scale: Double, brightness: Double) -> some View {
        VStack(spacing: 6) {
            PixelIcon(PixelIconName.resolve(equipment.iconName), size: 42, color: flashColor)
            Text("강화 중...")
                .typography(.caption)
                .foregroundStyle(GBPalette.lightest)
        }
        .frame(width: 120, height: 150)
        .background(GBPalette.dark.opacity(0.85), in: RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(flashColor, lineWidth: 1)
        )
        .scaleEffect(scale)
        .brightness(brightness)
        .opacity(outcome == .destroyed ? destroyedOpacity(progressEnd()) : 1)
    }

    // MARK: - 타임라인 보간

    private func progressEnd() -> Double {
        // 0..1 progress (helper)
        let elapsed = Date().timeIntervalSince(startTime)
        return min(elapsed / duration, 1.0)
    }

    /// Phase 5-B — 성공 시 마지막 구간 루트 shake. band 1 은 4px 5 step (웹
    /// uphero-crit-shake 재사용), band 2 는 6px 7 step (웹 enhance-shake-strong).
    /// reduce-motion 이면 0. transform 만 쓴다.
    private func shakeOffset(elapsed: Double) -> CGPoint {
        guard !reduceMotion, outcome == .success, bandIndex >= 1, shakeDuration > 0 else {
            return .zero
        }
        let begin = duration - shakeDuration
        guard elapsed >= begin, elapsed < duration else { return .zero }
        let steps: [(Double, Double)] = bandIndex == 2
            ? [(-6, -4), (6, 3), (-5, 4), (4, -3), (-3, 2), (2, -1), (0, 0)]
            : [(-4, -2), (4, 2), (-3, 3), (3, -2), (0, 0)]
        let t = (elapsed - begin) / shakeDuration
        let idx = min(steps.count - 1, Int(t * Double(steps.count)))
        return CGPoint(x: steps[idx].0, y: steps[idx].1)
    }

    private func glowAt(_ p: Double) -> Double {
        // 0→0, 30%→0.5, 75%→0.7, 85%→1.0, 100%→0.4
        return lerpStops([(0, 0), (0.30, 0.5), (0.75, 0.7), (0.85, 1.0), (1.0, 0.4)], at: p)
    }

    private func itemScale(_ p: Double) -> Double {
        if outcome == .destroyed {
            // 0→1, 30%→1.08, 75%→1.1, 85%→1.1, 95%→0.9, 100%→0.8
            return lerpStops([(0, 1.0), (0.30, 1.08), (0.75, 1.10), (0.85, 1.10),
                              (0.95, 0.9), (1.0, 0.8)], at: p)
        }
        // success/keep: 0→1, 30%→1.08, 75%→1.10, 85%→1.15, 100%→1.08
        return lerpStops([(0, 1.0), (0.30, 1.08), (0.75, 1.10), (0.85, 1.15), (1.0, 1.08)], at: p)
    }

    private func itemBrightness(_ p: Double) -> Double {
        if outcome == .destroyed {
            return lerpStops([(0, 0), (0.30, 0.1), (0.75, 0.25), (0.80, -0.1), (0.85, -0.4), (1.0, -0.4)], at: p)
        }
        return lerpStops([(0, 0), (0.30, 0.1), (0.75, 0.25), (0.85, 0.5), (1.0, 0.2)], at: p)
    }

    private func destroyedOpacity(_ p: Double) -> Double {
        lerpStops([(0, 1), (0.85, 1), (0.95, 0.3), (1.0, 0)], at: p)
    }

    private func sparkPosition(p: Double, sx: Double, sy: Double) -> CGPoint {
        // 0→(sx,sy), 30%→(sx/2, sy/2), 70%→(0,0), 85%→(0,0)
        // outcome 별 마지막 위치 다름:
        //   success/keep : 100% → (sx*0.3, sy*0.3) 수렴
        //   destroyed    : 100% → (sx*3, sy*3) 분산 (band >= 1 은 ×4)
        let endMul: Double = outcome == .destroyed ? scatterMul : 0.3
        let xStops: [(Double, Double)] = [(0, sx), (0.30, sx * 0.5), (0.70, 0), (0.85, 0), (1.0, sx * endMul)]
        let yStops: [(Double, Double)] = [(0, sy), (0.30, sy * 0.5), (0.70, 0), (0.85, 0), (1.0, sy * endMul)]
        return CGPoint(x: lerpStops(xStops, at: p), y: lerpStops(yStops, at: p))
    }

    private func sparkScale(_ p: Double) -> Double {
        if outcome == .destroyed {
            return lerpStops([(0, 0.4), (0.30, 1.0), (0.70, 1.2), (0.85, 0.8), (1.0, 0)], at: p)
        }
        // success/keep
        return lerpStops([(0, 0.4), (0.30, 1.0), (0.70, 1.2), (0.85, 1.5), (1.0, 0.4)], at: p)
    }

    private func sparkOpacity(_ p: Double) -> Double {
        lerpStops([(0, 0), (0.30, 1), (0.85, 1), (1.0, 0)], at: p)
    }

    private func lerpStops(_ stops: [(Double, Double)], at p: Double) -> Double {
        if p <= stops.first!.0 { return stops.first!.1 }
        if p >= stops.last!.0 { return stops.last!.1 }
        for i in 0..<(stops.count - 1) {
            let a = stops[i], b = stops[i + 1]
            if p >= a.0 && p <= b.0 {
                let t = (p - a.0) / (b.0 - a.0)
                return a.1 + (b.1 - a.1) * t
            }
        }
        return stops.last!.1
    }
}
