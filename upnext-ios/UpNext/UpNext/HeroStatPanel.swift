//
//  HeroStatPanel.swift
//  UpNext — Up Hero 영웅 스탯 패널 (Phase 4 슬라이스 16).
//
//  웹 components/uphero/HeroStatPanel.tsx 포팅. 아지트에서 영웅을 탭하면 sheet 로
//  뜨며, 영웅 요약 + 육각 스탯 차트를 보여준다.
//
//  웹 패널의 클래스 섹션·스킬트리·장착 장비 4슬롯은 각각 전직(슬라이스 8대)·
//  스킬트리·장비 슬라이스로 분리 — 여기선 영웅 헤더 + HexStatChart 만 (condensed).
//  영웅 sprite 는 HeroSprite(566줄 픽셀아트) 대신 SF Symbol stand-in.
//

import SwiftUI

struct HeroStatPanel: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        // 영웅 전용 레벨 → 레벨 스케일 적용된 영웅 → effective 스탯.
        // 웹 HeroStatPanel 의 getEffectiveHeroLevel → computeHeroForLevel 흐름.
        let hero = upHero.state.hero
        let level = UpHeroRules.getEffectiveHeroLevel(
            gameLevel: store.progress?.level ?? 1,
            heroStartLevel: upHero.state.heroStartLevel)
        let leveled = UpHeroRules.computeHeroForLevel(hero, level: level)
        let effective = UpHeroRules.computeEffectiveStats(leveled)

        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(spacing: 24) {
                    heroSummary(hero: hero, leveled: leveled, level: level)
                    statsSection(base: leveled.baseStats, effective: effective,
                                 level: level, classType: hero.classType)
                }
                .padding(20)
                .padding(.bottom, 32)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    // MARK: - 헤더

    private var header: some View {
        HStack {
            Text("영웅 정보")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            Button("닫기") { dismiss() }
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    // MARK: - 영웅 요약

    private func heroSummary(hero: Hero, leveled: Hero, level: Int) -> some View {
        VStack(spacing: 8) {
            PixelIcon(.user, size: 56, color: Color.accentPrimary)
            Text(hero.name)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            Text("Lv.\(level) · HP \(leveled.hp) / \(leveled.maxHp)")
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - 스탯 섹션

    private func statsSection(base: HeroBaseStats, effective: HeroBaseStats,
                              level: Int, classType: ClassType?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("스탯")
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
            HexStatChart(base: base, effective: effective,
                         level: level, classType: classType, size: 240)
                .frame(maxWidth: .infinity)
        }
    }
}
