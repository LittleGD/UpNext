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
    /// 영웅 이름 inline 편집 버퍼 (웹 HeroNameEditor).
    @State private var editingName: String = ""
    @FocusState private var nameFocused: Bool

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
                VStack(spacing: 22) {
                    heroSummary(hero: hero, leveled: leveled, level: level)
                    if let cls = hero.classType {
                        classSection(cls, hero: hero)
                    }
                    skillsSection(hero: hero)
                    if let cls = hero.classType {
                        skillTreeSection(cls, hero: hero, level: level)
                    }
                    statsSection(base: leveled.baseStats, effective: effective,
                                 level: level, classType: hero.classType)
                    equippedSection(hero: hero)
                }
                .padding(20)
                .padding(.bottom, 32)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .onAppear { editingName = upHero.state.hero.name }
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
        VStack(spacing: 10) {
            // R5 마감 — PixelIcon(.user) stand-in 폐기, 캠프와 동일한 실제 HeroSprite.
            HeroSprite(variant: UpHeroRules.getHeroAppearanceVariant(level: level),
                       classType: hero.classType,
                       size: 72,
                       color: HeroSprite.themeColor(hero.classType))
            // 영웅 이름 inline 편집 (웹 HeroNameEditor) — 탭하면 키보드, 완료/blur 시 renameHero.
            TextField("영웅 이름", text: $editingName)
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .focused($nameFocused)
                .submitLabel(.done)
                .onSubmit { upHero.renameHero(editingName); editingName = upHero.state.hero.name }
                .onChange(of: nameFocused) { focused in
                    if !focused { upHero.renameHero(editingName); editingName = upHero.state.hero.name }
                }
                .padding(.horizontal, 14).padding(.vertical, 6)
                .background(Color.bgSurface, in: Capsule())
                .frame(maxWidth: 220)
            Text("영웅 Lv.\(level) · HP \(leveled.hp) / \(leveled.maxHp)")
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - 클래스 섹션 (웹 ClassSection — 메타 + 패시브 + 자동 스킬 토글)

    private func classSection(_ cls: ClassType, hero: Hero) -> some View {
        let meta = UpHeroRules.classMeta[cls]
        return VStack(alignment: .leading, spacing: 10) {
            sectionTitle(AppConfig.loc("클래스"))
            HStack(spacing: 12) {
                PixelIcon(PixelIconName.resolve(meta?.icon ?? "user"), size: 22,
                          color: Color.accentPrimary)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 3) {
                    Text(meta?.name ?? AppConfig.loc("영웅"))
                        .typography(.body)
                        .foregroundStyle(Color.textPrimary)
                    Text(meta?.passive ?? "")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            // 자동 스킬 토글 (웹 autoSkillEnabled).
            Button {
                upHero.toggleAutoSkill()
            } label: {
                HStack(spacing: 10) {
                    PixelIcon(.zap, size: 16,
                              color: (hero.autoSkillEnabled ?? true) ? Color.accentPrimary : Color.textTertiary)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("액티브 스킬 자동 발동")
                            .typography(.caption)
                            .foregroundStyle(Color.textPrimary)
                        Text((hero.autoSkillEnabled ?? true) ? "전투 중 조건 충족 시 자동 사용" : "꺼짐 — 자동 발동 안 함")
                            .typography(.micro)
                            .foregroundStyle(Color.textTertiary)
                    }
                    Spacer(minLength: 0)
                    // 토글 pill (보더 금지 — 채움 색으로 on/off 표현)
                    Capsule()
                        .fill((hero.autoSkillEnabled ?? true) ? Color.accentPrimary : Color.bgElevated)
                        .frame(width: 40, height: 24)
                        .overlay(alignment: (hero.autoSkillEnabled ?? true) ? .trailing : .leading) {
                            Circle().fill(Color.bgPrimary).frame(width: 18, height: 18).padding(3)
                        }
                }
                .padding(14)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - 스킬 섹션 (learnedSkills → findSkillById, 노비스/클래스 공통)

    @ViewBuilder
    private func skillsSection(hero: Hero) -> some View {
        let learned = (hero.learnedSkills ?? []).compactMap { ClassSkills.findSkillById($0) }
        if !learned.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle(hero.classType == nil ? AppConfig.loc("수련 스킬") : AppConfig.loc("보유 스킬"))
                VStack(spacing: 8) {
                    ForEach(learned, id: \.id) { skill in
                        HStack(alignment: .top, spacing: 10) {
                            PixelIcon(.sparkle, size: 14, color: Color.accentPrimary)
                                .frame(width: 20)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(LocalizedStringKey(skill.name))
                                    .typography(.caption)
                                    .foregroundStyle(Color.textPrimary)
                                Text(LocalizedStringKey(skill.description))
                                    .typography(.caption)   // 본문 설명 — micro(12) 너무 작아 caption(15)
                                    .foregroundStyle(Color.textTertiary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 0)
                            if skill.cooldown > 0 {
                                Text("CD \(skill.cooldown)")
                                    .typography(.micro)
                                    .monospacedDigit()
                                    .foregroundStyle(Color.textTertiary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }

    // MARK: - 스킬트리 섹션 (웹 SkillTreePanel — tier 1-4, 스킬 포인트로 해금)

    private enum LearnStatus { case ok, learned, needLevel, needPoints }

    private func learnStatus(_ skill: ClassSkill, learned: [String],
                             points: Int, level: Int) -> LearnStatus {
        if learned.contains(skill.id) { return .learned }
        if level < skill.requiredLevel { return .needLevel }
        if points < skill.pointCost { return .needPoints }
        return .ok
    }

    @ViewBuilder
    private func skillTreeSection(_ cls: ClassType, hero: Hero, level: Int) -> some View {
        let tree = ClassSkills.classSkillTrees[cls] ?? []
        if !tree.isEmpty {
            let learned = hero.learnedSkills ?? []
            let points = hero.skillPoints ?? 0
            let resourceSpec = UpHeroRules.classResource[cls]
            let resColor = resourceSpec.map { Color(hexString: $0.color) } ?? Color.accentPrimary
            VStack(alignment: .leading, spacing: 12) {
                // 헤더 — 타이틀 + 남은 SP
                HStack {
                    sectionTitle(AppConfig.loc("스킬트리"))
                    Spacer(minLength: 0)
                    HStack(spacing: 4) {
                        PixelIcon(.star, size: 12, color: Color.textPrimary)
                        Text("\(points)").typography(.caption).monospacedDigit()
                            .foregroundStyle(Color.textPrimary)
                        Text("SP").typography(.micro).foregroundStyle(Color.textTertiary)
                    }
                }
                if let resourceSpec {
                    Text("자원 \(resourceSpec.name) · 레벨업마다 SP 획득")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                }
                ForEach(1...4, id: \.self) { tier in
                    let skills = tree.filter { $0.tier == tier }
                    if !skills.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(tierLabel(tier, skills: skills))
                                .typography(.micro)
                                .tracking(1)
                                .foregroundStyle(Color.textTertiary)
                            ForEach(skills, id: \.id) { skill in
                                skillTreeRow(skill, learned: learned, points: points,
                                             level: level, resColor: resColor,
                                             resShort: resourceSpec?.short ?? "")
                            }
                        }
                    }
                }
            }
        }
    }

    private func tierLabel(_ tier: Int, skills: [ClassSkill]) -> String {
        guard tier > 1, let first = skills.first else { return AppConfig.loc("\(tier)단계") }
        return AppConfig.loc("\(tier)단계 · Lv.\(first.requiredLevel) · SP \(first.pointCost)")
    }

    private func skillTreeRow(_ skill: ClassSkill, learned: [String], points: Int,
                              level: Int, resColor: Color, resShort: String) -> some View {
        let status = learnStatus(skill, learned: learned, points: points, level: level)
        let isLearned = status == .learned
        let dimmed = !(status == .ok || isLearned)
        return HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(LocalizedStringKey(skill.name))
                        .typography(.caption)
                        .foregroundStyle(Color.textPrimary)
                    if isLearned {
                        Text("✓")
                            .typography(.micro)
                            .foregroundStyle(Color.bgPrimary)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Color.accentPrimary, in: Capsule())
                    }
                }
                Text(LocalizedStringKey(skill.description))
                    .typography(.caption)   // 본문 설명 — micro(12) 너무 작아 caption(15)
                    .foregroundStyle(Color.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text("\(skill.resourceCost) \(resShort)")
                        .typography(.micro).monospacedDigit()
                        .foregroundStyle(resColor)
                    Text("·").typography(.micro).foregroundStyle(Color.textTertiary)
                    Text("CD \(skill.cooldown)")
                        .typography(.micro).monospacedDigit()
                        .foregroundStyle(Color.textTertiary)
                }
            }
            Spacer(minLength: 0)
            if !isLearned {
                Button {
                    upHero.learnSkill(skill.id, gameLevel: store.progress?.level ?? 1)
                } label: {
                    Text(learnButtonLabel(status, skill: skill))
                        .typography(.micro)
                        .foregroundStyle(status == .ok ? Color.bgPrimary : Color.textTertiary)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 32)
                        .background(status == .ok ? Color.accentPrimary : Color.bgElevated,
                                    in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(status != .ok)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
        .opacity(dimmed ? 0.55 : 1)
    }

    private func learnButtonLabel(_ status: LearnStatus, skill: ClassSkill) -> String {
        switch status {
        case .needLevel:  return "Lv.\(skill.requiredLevel)"
        case .needPoints: return "SP \(skill.pointCost)"
        default:          return AppConfig.loc("해금")
        }
    }

    // MARK: - 장착 장비 4슬롯 (웹 HeroStatPanel 하단 equipped)

    private func equippedSection(hero: Hero) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle(AppConfig.loc("장착 장비"))
            VStack(spacing: 8) {
                ForEach(EquipSlot.allCases, id: \.self) { slot in
                    equipRow(slot: slot, item: hero.equipped[slot])
                }
            }
        }
    }

    private func equipRow(slot: EquipSlot, item: Equipment?) -> some View {
        HStack(spacing: 12) {
            PixelIcon(item.map { PixelIconName.resolve($0.iconName) } ?? slotIcon(slot),
                      size: 18,
                      color: item.map { $0.rarity.color } ?? Color.textTertiary.opacity(0.4))
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(slotLabel(slot))
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                if let item {
                    HStack(spacing: 6) {
                        Text(item.localizedDisplayName)
                            .typography(.caption)
                            .foregroundStyle(Color.textPrimary)
                            .lineLimit(1)
                        if let lv = item.enhanceLevel, lv > 0 {
                            Text("+\(lv)")
                                .typography(.micro)
                                .foregroundStyle(Color.accentPrimary)
                        }
                    }
                } else {
                    Text("비어 있음")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary.opacity(0.6))
                }
            }
            Spacer(minLength: 0)
            if let item {
                Text(item.rarity.displayName)
                    .typography(.micro)
                    .foregroundStyle(item.rarity.color)
            }
        }
        .padding(12)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
    }

    private func slotLabel(_ slot: EquipSlot) -> String {
        switch slot {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }

    private func slotIcon(_ slot: EquipSlot) -> PixelIconName {
        switch slot {
        case .weapon:    return .sword
        case .armor:     return .shield
        case .accessory: return .gift
        case .talisman:  return .sparkle
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .typography(.caption)
            .foregroundStyle(Color.textTertiary)
            .frame(maxWidth: .infinity, alignment: .leading)
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
