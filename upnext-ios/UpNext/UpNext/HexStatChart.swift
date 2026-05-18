//
//  HexStatChart.swift
//  UpNext — Up Hero 영웅 스탯 육각 레이더 차트 (Phase 4 슬라이스 16).
//
//  웹 components/uphero/HexStatChart.tsx 포팅. 6축(STR/INT/VIT/DEX/AGI/CRIT)
//  레이더 차트로 영웅 스탯을 레벨/클래스별 max 대비 비율로 표시한다. 100% 링이
//  "레벨 자연 성장" 기준선 — 그 바깥은 장비/버프로 초과한 영역.
//
//  웹의 탭 가능한 스탯 설명 popover·스케일 legend·꼭짓점 pull 애니메이션은
//  condensed — 차트(그리드 + base/eff 다각형 + 꼭짓점)와 숫자 legend 만 포팅.
//

import SwiftUI

struct HexStatChart: View {
    /// 레벨 기반 base 스탯 (장비 보너스 제외).
    let base: HeroBaseStats
    /// 장비 포함 effective 스탯.
    let effective: HeroBaseStats
    let level: Int
    let classType: ClassType?
    var size: CGFloat = 240

    private struct Axis { let key: StatKey; let label: String }
    private let axes: [Axis] = [
        Axis(key: .str, label: "STR"), Axis(key: .int, label: "INT"),
        Axis(key: .vit, label: "VIT"), Axis(key: .dex, label: "DEX"),
        Axis(key: .agi, label: "AGI"), Axis(key: .crit, label: "CRIT"),
    ]

    /// 레벨 기준의 250% 까지 시각화 (웹 overflowCap). 초과분은 차트 edge 로 clip.
    private let overflowCap: Double = 2.5

    /// 축별 max 기준값 — 레벨 + 클래스 편향. 웹 computeStatMax.
    private var statMax: [StatKey: Int] {
        UpHeroRules.computeStatMax(level: level, classType: classType)
    }

    var body: some View {
        VStack(spacing: 12) {
            chart
            legend
        }
    }

    // MARK: - 차트 (Canvas)

    private var chart: some View {
        ZStack {
            Canvas { ctx, _ in draw(&ctx) }
            ForEach(axes.indices, id: \.self) { i in
                Text(axes[i].label)
                    .typography(.micro)
                    .foregroundStyle(Color.textSecondary)
                    .position(labelPoint(i))
            }
        }
        .frame(width: size, height: size)
    }

    /// 그리드 링 + 축선 + base/eff 다각형 + 꼭짓점 dot 를 한 번에 그린다.
    private func draw(_ ctx: inout GraphicsContext) {
        let c = size / 2
        let radius = size / 2 - 32  // 라벨 공간 확보
        let cap = overflowCap
        let maxes = statMax

        func angle(_ i: Int) -> CGFloat { -.pi / 2 + CGFloat(i) * .pi / 3 }
        func point(_ i: Int, _ ratio: Double) -> CGPoint {
            let clamped = min(max(0, ratio), cap)
            let rr = radius * CGFloat(clamped / cap)
            return CGPoint(x: c + rr * cos(angle(i)), y: c + rr * sin(angle(i)))
        }
        func ring(_ ratio: Double) -> Path {
            var p = Path()
            for i in 0..<6 {
                let q = point(i, ratio)
                if i == 0 { p.move(to: q) } else { p.addLine(to: q) }
            }
            p.closeSubpath()
            return p
        }
        func ratio(_ s: HeroBaseStats, _ key: StatKey) -> Double {
            min(cap, Double(s[key]) / Double(max(1, maxes[key] ?? 1)))
        }
        func polygon(_ s: HeroBaseStats) -> Path {
            var p = Path()
            for i in 0..<6 {
                let q = point(i, ratio(s, axes[i].key))
                if i == 0 { p.move(to: q) } else { p.addLine(to: q) }
            }
            p.closeSubpath()
            return p
        }

        // 그리드 링 — 0.5/1.0/1.5/2.0/2.5. 100%(1.0) 링만 강조한다.
        for ringRatio in [0.5, 1.0, 1.5, 2.0, 2.5] {
            let isBase = ringRatio == 1.0
            ctx.stroke(ring(ringRatio),
                       with: .color(isBase ? Color.accentPrimary.opacity(0.55)
                                            : Color.textTertiary.opacity(0.28)),
                       lineWidth: isBase ? 1.5 : 1)
        }
        // 축선 — 중심에서 edge 까지.
        for i in 0..<6 {
            var axis = Path()
            axis.move(to: CGPoint(x: c, y: c))
            axis.addLine(to: point(i, cap))
            ctx.stroke(axis, with: .color(Color.textTertiary.opacity(0.22)),
                       lineWidth: 1)
        }
        // base 다각형 — 어두운 채움 (레벨 자연 성장만).
        let basePoly = polygon(base)
        ctx.fill(basePoly, with: .color(Color.accentPrimary.opacity(0.14)))
        ctx.stroke(basePoly, with: .color(Color.accentPrimary.opacity(0.55)),
                   lineWidth: 1)
        // effective 다각형 — 밝은 outline (장비/버프 포함).
        let effPoly = polygon(effective)
        ctx.fill(effPoly, with: .color(Color.accentPrimary.opacity(0.28)))
        ctx.stroke(effPoly, with: .color(Color.accentPrimary), lineWidth: 2)
        // 꼭짓점 dot — effective 기준.
        for i in 0..<6 {
            let q = point(i, ratio(effective, axes[i].key))
            ctx.fill(Path(ellipseIn: CGRect(x: q.x - 3, y: q.y - 3, width: 6, height: 6)),
                     with: .color(Color.accentPrimary))
        }
    }

    /// 꼭짓점 라벨 위치 — 가장 바깥 링보다 살짝 바깥 (r × 1.12).
    private func labelPoint(_ i: Int) -> CGPoint {
        let c = size / 2
        let labelR = (size / 2 - 32) * 1.12
        let a = -CGFloat.pi / 2 + CGFloat(i) * .pi / 3
        return CGPoint(x: c + labelR * cos(a), y: c + labelR * sin(a))
    }

    // MARK: - 숫자 legend

    private var legend: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12),
                            GridItem(.flexible(), spacing: 12)],
                  spacing: 6) {
            ForEach(axes.indices, id: \.self) { i in
                legendRow(axes[i])
            }
        }
    }

    private func legendRow(_ axis: Axis) -> some View {
        let maxRef = max(1, statMax[axis.key] ?? 1)
        let effVal = effective[axis.key]
        let bonus = effVal - base[axis.key]
        let pct = Int((Double(effVal) / Double(maxRef) * 100).rounded())
        return HStack(spacing: 4) {
            Text(axis.label)
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
            Spacer(minLength: 0)
            Text("\(effVal)\(axis.key == .crit ? "%" : "")")
                .typography(.micro)
                .foregroundStyle(Color.textPrimary)
            if bonus != 0 {
                Text("(\(bonus > 0 ? "+" : "")\(bonus))")
                    .typography(.micro)
                    .foregroundStyle(bonus > 0 ? Color.accentPrimary : Color.colorError)
            }
            Text("\(pct)%")
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
        }
    }
}
