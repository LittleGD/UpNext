//
//  HexStatChart.swift
//  UpNext — Up Hero 영웅 스탯 육각 레이더 차트 (08-cardmatch-hero 웹 파리티 복원).
//
//  웹 components/uphero/HexStatChart.tsx 포팅. 6축(STR/INT/VIT/DEX/AGI/CRIT)
//  레이더 차트로 영웅 스탯을 레벨/클래스별 max 대비 비율로 표시한다. 100% 링이
//  "레벨 자연 성장" 기준선 — 그 바깥(150/200/250%)은 장비/버프로 초과한 영역이라
//  대시(dash "2 3") stroke 로 그려 초과분이 시각적으로 드러난다.
//
//  아지트 = 레트로 게임보이 오버레이라는 아트디렉션을 위해 GBPalette 모노 팔레트
//  (dark/light/lightest)로 통일 (앱 공통 accentPrimary 치환 복원).
//
//  스케일 legend "Lv N 기준 · 초과=장비/버프" 로 100% 링의 의미를 노출한다(웹 :333-355).
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
            scaleLegend
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
                    .tracking(0.8)
                    .foregroundStyle(GBPalette.light)
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
        let dash = StrokeStyle(lineWidth: 1, dash: [2, 3])   // 웹 strokeDasharray "2 3"

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

        // 그리드 링 — 0.5(solid) / 1.0(base·강조) / 1.5·2.0·2.5(over·dash "2 3").
        // 웹 HexStatChart :180-201.
        // 0.5 — 일반 solid.
        ctx.stroke(ring(0.5), with: .color(GBPalette.dark.opacity(0.6)), lineWidth: 1)
        // 1.0 — "Lv 자연 성장" 기준 링. GB.light 굵게.
        ctx.stroke(ring(1.0), with: .color(GBPalette.light.opacity(0.9)), lineWidth: 1.5)
        // 1.5 / 2.0 / 2.5 — 초과 영역 dash.
        for over in [1.5, 2.0, 2.5] {
            ctx.stroke(ring(over), with: .color(GBPalette.dark.opacity(0.4)), style: dash)
        }

        // 축선 — 0~100% solid + 100%~cap dash (초과 영역 구분). 웹 :202-229.
        for i in 0..<6 {
            var inner = Path()
            inner.move(to: CGPoint(x: c, y: c))
            inner.addLine(to: point(i, 1.0))
            ctx.stroke(inner, with: .color(GBPalette.dark.opacity(0.55)), lineWidth: 1)

            var outer = Path()
            outer.move(to: point(i, 1.0))
            outer.addLine(to: point(i, cap))
            ctx.stroke(outer, with: .color(GBPalette.dark.opacity(0.35)), style: dash)
        }

        // base 다각형 — 어두운 채움 (레벨 자연 성장만). GB.light.
        let basePoly = polygon(base)
        ctx.fill(basePoly, with: .color(GBPalette.light.opacity(0.18)))
        ctx.stroke(basePoly, with: .color(GBPalette.light), lineWidth: 1)
        // effective 다각형 — 밝은 outline (장비/버프 포함). GB.lightest.
        let effPoly = polygon(effective)
        ctx.fill(effPoly, with: .color(GBPalette.lightest.opacity(0.25)))
        ctx.stroke(effPoly, with: .color(GBPalette.lightest), lineWidth: 2)
        // 꼭짓점 dot — effective 기준. GB.lightest.
        for i in 0..<6 {
            let q = point(i, ratio(effective, axes[i].key))
            ctx.fill(Path(ellipseIn: CGRect(x: q.x - 3, y: q.y - 3, width: 6, height: 6)),
                     with: .color(GBPalette.lightest))
        }
    }

    /// 꼭짓점 라벨 위치 — 가장 바깥 링보다 살짝 바깥 (r × 1.12).
    private func labelPoint(_ i: Int) -> CGPoint {
        let c = size / 2
        let labelR = (size / 2 - 32) * 1.12
        let a = -CGFloat.pi / 2 + CGFloat(i) * .pi / 3
        return CGPoint(x: c + labelR * cos(a), y: c + labelR * sin(a))
    }

    // MARK: - 스케일 legend (웹 :333-355 — 100% 링 의미 노출)

    private var scaleLegend: some View {
        HStack(spacing: 10) {
            HStack(spacing: 5) {
                RoundedRectangle(cornerRadius: 1)
                    .stroke(GBPalette.light, lineWidth: 1.5)
                    .frame(width: 10, height: 10)
                Text(AppConfig.loc("Lv.\(level) 기준"))
                    .typography(.micro).foregroundStyle(GBPalette.light)
            }
            Text("·").typography(.micro).foregroundStyle(GBPalette.light.opacity(0.5))
            Text(AppConfig.loc("초과 = 장비·버프"))
                .typography(.micro).foregroundStyle(GBPalette.light)
        }
        .opacity(0.85)
    }

    // MARK: - 숫자 legend (GB 팔레트)

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
                .foregroundStyle(GBPalette.light.opacity(0.7))
            Spacer(minLength: 0)
            Text("\(effVal)\(axis.key == .crit ? "%" : "")")
                .typography(.micro)
                .foregroundStyle(GBPalette.lightest)
            if bonus != 0 {
                Text("(\(bonus > 0 ? "+" : "")\(bonus))")
                    .typography(.micro)
                    .foregroundStyle(bonus > 0 ? GBPalette.lightest : GBPalette.enemy)
            }
            Text("\(pct)%")
                .typography(.micro)
                .foregroundStyle(GBPalette.light.opacity(0.7))
        }
    }
}
