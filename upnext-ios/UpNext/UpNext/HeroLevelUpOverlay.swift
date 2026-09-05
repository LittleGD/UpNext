//
//  HeroLevelUpOverlay.swift
//  UpNext — 영웅 레벨업 풀스크린 오버레이 (Phase 2-A, Track A).
//
//  웹 components/uphero/HeroLevelUpOverlay.tsx 포팅. 영웅 XP 풀(heroXp)의 레벨업만
//  담당한다 — 계정(챌린지) 레벨업은 UpHeroLevelUpOverlay(MainShell) 가 그대로 맡는다.
//   - 어두운 백드롭 fade-in, 탭으로 즉시 닫기
//   - 타이틀(라임) → 스프라이트(레벨 variant 가 바뀌면 글로우 강조) → "영웅 Lv.a → Lv.b"
//   - 스탯 델타(최대 HP + STR/INT/VIT/DEX/AGI, computeHeroForLevel 차분) → 스킬 포인트
//     증가 → 전직 안내(Lv30 첫 도달, 아직 전직 전)
//   - 20 방사 파티클(라임 2 : 레전드 골드 1), reduceMotion 존중
//   - 3.2s 자동 해제 + 탭 → onDismiss (UpHeroStore.acknowledgeHeroLevelUp 이 Lv30 을
//     넘긴 레벨업이면 그 시점에 전직 제안 — 오버레이 → 전직 화면 순서)
//  디자인 규칙: 라임(솔로 accent), 카드/버튼 보더 없음, 아이콘 박스 없음.
//

import SwiftUI

struct HeroLevelUpOverlay: View {
    let event: HeroLevelUpEvent
    let hero: Hero
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var rootOpacity: Double = 0
    @State private var titleOpacity: Double = 0
    @State private var titleOffset: CGFloat = -12
    @State private var spriteScale: Double = 0.6
    @State private var spriteOpacity: Double = 0
    @State private var rangeOpacity: Double = 0
    @State private var detailOpacity: Double = 0
    @State private var particlesAnimating = false
    @State private var dismissed = false

    private static let autoDismissSeconds = 3.2
    private static let particleCount = 20
    private static let deltaStats: [StatKey] = [.str, .int, .vit, .dex, .agi]

    /// 레벨 from → to 사이 스탯 변화. 0 인 항목은 표시하지 않는다. 웹 heroLevelStatDeltas.
    static func statDeltas(hero: Hero, from: Int, to: Int) -> [(label: String, n: Int)] {
        let a = UpHeroRules.computeHeroForLevel(hero, level: from)
        let b = UpHeroRules.computeHeroForLevel(hero, level: to)
        var out: [(label: String, n: Int)] = []
        let hp = b.maxHp - a.maxHp
        if hp > 0 { out.append((AppConfig.loc("uphero.heroLevelup.stat.maxHp"), hp)) }
        for k in deltaStats {
            let n = b.baseStats[k] - a.baseStats[k]
            if n > 0 {
                // 웹 affixStatLabel(stat, language) — 카탈로그 런타임 키("힘"·"지성"…)로 재현지화.
                out.append((AppConfig.locRuntime(EquipmentPool.affixStatLabel[k] ?? k.rawValue), n))
            }
        }
        return out
    }

    /// 카탈로그의 `{param}` 토큰 치환 (웹 t(key, params) 대응 — 언어별 어순 무관).
    private static func fill(_ key: String, _ params: [String: String]) -> String {
        var s = AppConfig.loc(String.LocalizationValue(key))
        for (name, value) in params {
            s = s.replacingOccurrences(of: "{\(name)}", with: value)
        }
        return s
    }

    private var deltas: [(label: String, n: Int)] {
        Self.statDeltas(hero: hero, from: event.from, to: event.to)
    }
    private var spGain: Int {
        UpHeroRules.skillPointsTotalForLevel(event.to) - UpHeroRules.skillPointsTotalForLevel(event.from)
    }
    private var classReady: Bool {
        event.from < 30 && event.to >= 30 && hero.classType == nil
    }
    private var variantTo: Int { UpHeroRules.getHeroAppearanceVariant(level: event.to) }
    private var variantChanged: Bool {
        hero.classType == nil
            && UpHeroRules.getHeroAppearanceVariant(level: event.from) != variantTo
    }
    private var spriteColor: Color {
        hero.classType != nil ? HeroSprite.themeColor(hero.classType) : Color.accentPrimary
    }

    var body: some View {
        ZStack {
            // 웹 rgba(10,10,12,0.72)
            Color(red: 10 / 255, green: 10 / 255, blue: 12 / 255).opacity(0.72 * rootOpacity)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { dismiss() }

            VStack(spacing: 12) {
                Text(AppConfig.loc("uphero.heroLevelup.title"))
                    .typography(.heading)
                    .tracking(4)
                    .foregroundStyle(Color.accentPrimary)
                    .opacity(titleOpacity)
                    .offset(y: titleOffset)

                // 스프라이트 + 파티클 — 라임 글로우로 위계 (박스/보더 없음).
                HeroSprite(variant: variantTo, classType: hero.classType, size: 96, color: spriteColor)
                    .shadow(color: Color.accentPrimary.opacity(variantChanged ? 0.9 : 0.6),
                            radius: variantChanged ? 18 : 10)
                    .scaleEffect(spriteScale)
                    .opacity(spriteOpacity)
                    .overlay(particleBurst)

                Text(Self.fill("uphero.heroLevelup.range",
                               ["from": String(event.from), "to": String(event.to)]))
                    .typography(.title)
                    .monospacedDigit()
                    .foregroundStyle(Color.accentPrimary)
                    .opacity(rangeOpacity)

                VStack(spacing: 6) {
                    if !deltas.isEmpty {
                        // 스탯 델타 — 캡션, 줄바꿈 허용.
                        Text(deltas.map {
                            Self.fill("uphero.heroLevelup.statDelta", ["stat": $0.label, "n": String($0.n)])
                        }.joined(separator: "   "))
                            .typography(.caption)
                            .monospacedDigit()
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Color.textSecondary)
                    }
                    if spGain > 0 {
                        Text(Self.fill("uphero.heroLevelup.sp", ["n": String(spGain)]))
                            .typography(.body)
                            .monospacedDigit()
                            .foregroundStyle(Color.accentPrimary)
                    }
                    if classReady {
                        Text(AppConfig.loc("uphero.heroLevelup.classReady"))
                            .typography(.caption)
                            .foregroundStyle(Color.textTertiary)
                    }
                }
                .opacity(detailOpacity)
            }
            .padding(.horizontal, 24)
            .allowsHitTesting(false)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.fill("uphero.heroLevelup.announce", ["to": String(event.to)]))
        .onAppear { runSequence() }
    }

    /// 20 방사 파티클 — 라임 2 : 레전드 골드 1 (시안은 듀오/소셜 색이라 제외).
    private var particleBurst: some View {
        ZStack {
            if !reduceMotion {
                ForEach(0..<Self.particleCount, id: \.self) { i in
                    let angle = Double(i) * (360.0 / Double(Self.particleCount)) + Double.random(in: -9..<9)
                    let rad = angle * .pi / 180
                    let dist = particlesAnimating ? 80 + Double.random(in: 0..<100) : 0
                    Circle()
                        .fill(i % 3 == 2 ? Color.rarityLegend : Color.accentPrimary)
                        .frame(width: 3 + CGFloat(i % 3), height: 3 + CGFloat(i % 3))
                        .offset(x: cos(rad) * dist, y: sin(rad) * dist)
                        .scaleEffect(particlesAnimating ? 0 : 1)
                        .opacity(particlesAnimating ? 0 : 1)
                }
            }
        }
    }

    private func runSequence() {
        SoundPlayer.shared.play(.levelUp)
        Haptics.play(.celebration)

        if reduceMotion {
            rootOpacity = 1
            titleOpacity = 1
            titleOffset = 0
            spriteScale = 1
            spriteOpacity = 1
            rangeOpacity = 1
            detailOpacity = 1
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.autoDismissSeconds) { dismiss() }
            return
        }

        withAnimation(.easeOut(duration: 0.22)) { rootOpacity = 1 }
        withAnimation(.easeOut(duration: 0.4)) {
            titleOpacity = 1
            titleOffset = 0
        }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.6).delay(0.15)) {
            spriteScale = 1
            spriteOpacity = 1
        }
        withAnimation(.easeOut(duration: 0.3).delay(0.35)) { rangeOpacity = 1 }
        withAnimation(.easeOut(duration: 0.3).delay(0.5)) { detailOpacity = 1 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            withAnimation(.easeOut(duration: 0.95)) { particlesAnimating = true }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.autoDismissSeconds) { dismiss() }
    }

    private func dismiss() {
        guard !dismissed else { return }
        dismissed = true
        withAnimation(.easeIn(duration: 0.22)) {
            rootOpacity = 0
            titleOpacity = 0
            spriteOpacity = 0
            rangeOpacity = 0
            detailOpacity = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { onDismiss() }
    }
}
