//
//  HeroStatPanel.swift
//  UpNext — Up Hero 영웅 스탯 패널 (08-cardmatch-hero 웹 파리티 복원).
//
//  웹 components/uphero/HeroStatPanel.tsx 포팅. 아지트에서 영웅을 탭하면 sheet 로
//  뜨며, 영웅 요약 + 클래스/스킬 + 육각 스탯 차트 + 장착 장비를 보여준다.
//
//  아트디렉션 복원: 웹은 아지트 전체를 GameBoy 모노 팔레트(GB.darkest/dark/light/
//  lightest)로 통일한다. iOS 도 GBPalette 로 배경·텍스트·구분선을 통일해
//  "레트로 게임보이 오버레이" 정체성을 되살린다 (앱 공통 accentPrimary 치환 복원).
//
//  복원 항목: 전직 전 NoviceSkillSection(로드맵), 클래스 액티브 스킬 실시간 cooldown
//  bar, 장비 행 talisman skill 칩(✦) + 사진 부적 썸네일.
//

import SwiftUI

struct HeroStatPanel: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    @EnvironmentObject private var growth: GrowthStore   // 사진 부적 썸네일 로드용
    @Environment(\.dismiss) private var dismiss
    /// 영웅 이름 inline 편집 버퍼 (웹 HeroNameEditor).
    @State private var editingName: String = ""
    @FocusState private var nameFocused: Bool

    // ── GB 팔레트 별칭 (웹 GB.* / gbClass.textDim 대응) ──────────────
    private let gbBg = GBPalette.darkest
    private let gbCard = GBPalette.dark.opacity(0.5)          // 웹 `${GB.dark}80`
    private let gbCardDim = GBPalette.dark.opacity(0.38)      // 웹 `${GB.dark}60`
    private let gbText = GBPalette.lightest                   // 밝은 텍스트
    private let gbDim = GBPalette.light                       // dim 텍스트 (gbClass.textDim)
    private let gbDivider = GBPalette.dark

    var body: some View {
        // 영웅 전용 레벨 → 레벨 스케일 적용된 영웅 → effective 스탯.
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
                        skillTreeSection(cls, hero: hero, level: level)
                    } else {
                        noviceSkillSection(hero: hero, level: level)
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
        .background(gbBg)                       // 웹 background: GB.darkest
        .onAppear { editingName = upHero.state.hero.name }
    }

    // MARK: - 헤더 (웹 header: 제목 GB.lightest + ghost 닫기 ✕)

    private var header: some View {
        HStack {
            Text(AppConfig.loc("영웅 정보"))
                .typography(.body)
                .foregroundStyle(gbText)
            Spacer()
            Button {
                dismiss()
            } label: {
                HStack(spacing: 3) {
                    Text("✕").font(.system(size: 13, weight: .bold))
                    Text(AppConfig.loc("닫기")).typography(.caption)
                }
                .foregroundStyle(gbDim)
                .frame(minHeight: 40)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Rectangle().fill(gbDivider).frame(height: 1)   // 구분선 GB 계열
        }
    }

    // MARK: - 영웅 요약

    private func heroSummary(hero: Hero, leveled: Hero, level: Int) -> some View {
        VStack(spacing: 10) {
            HeroSprite(variant: UpHeroRules.getHeroAppearanceVariant(level: level),
                       classType: hero.classType,
                       size: 72,
                       color: hero.classType != nil ? HeroSprite.themeColor(hero.classType) : gbText)
            // 영웅 이름 inline 편집 (웹 HeroNameEditor) — GB.lightest 배경 chip + PenSquare.
            HStack(spacing: 6) {
                TextField(AppConfig.loc("영웅 이름"), text: $editingName)
                    .typography(.caption)
                    .foregroundStyle(gbBg)
                    .multilineTextAlignment(.center)
                    .focused($nameFocused)
                    .submitLabel(.done)
                    .onSubmit { commitName() }
                    .onChange(of: nameFocused) { focused in if !focused { commitName() } }
                    .fixedSize()
                if !nameFocused {
                    PixelIcon(.penSquare, size: 12, color: gbBg.opacity(0.55))
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(gbText, in: RoundedRectangle(cornerRadius: 4))
            .frame(maxWidth: 220)
            Text(AppConfig.loc("영웅 Lv.\(level) · HP \(leveled.hp) / \(leveled.maxHp)"))
                .typography(.caption)
                .foregroundStyle(gbDim)
        }
        .frame(maxWidth: .infinity)
    }

    private func commitName() {
        upHero.renameHero(editingName)
        editingName = upHero.state.hero.name
    }

    // MARK: - 클래스 섹션 (웹 ClassSection — 메타 + 액티브 스킬 카드 + 실시간 cooldown)

    private func classSection(_ cls: ClassType, hero: Hero) -> some View {
        let meta = UpHeroRules.classMeta[cls]
        let skill = ClassSkills.classSkills[cls]
        // 전투 중이면 실시간 skillCooldown 참조 (웹 currentSession.skillCooldown).
        let session = upHero.state.currentSession
        let sessionActive = session != nil && session?.status != .completed
            && session?.hero.classType == cls
        let cd = sessionActive ? (session?.skillCooldown ?? 0) : 0
        let ready = cd == 0
        let maxCd = max(1, skill?.cooldown ?? 1)
        let cooldownPct = sessionActive ? Double(maxCd - cd) / Double(maxCd) : 1.0

        return VStack(alignment: .leading, spacing: 10) {
            sectionTitle(AppConfig.loc("클래스"))
            // 클래스 메타 카드 (아이콘 + 이름 + 패시브)
            HStack(spacing: 12) {
                PixelIcon(PixelIconName.resolve(meta?.icon ?? "user"), size: 22, color: gbText)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 3) {
                    Text(AppConfig.locRuntime(meta?.name ?? "영웅"))
                        .typography(.body).foregroundStyle(gbText)
                    Text(AppConfig.locRuntime(meta?.passive ?? ""))
                        .typography(.caption).foregroundStyle(gbDim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(gbCard, in: RoundedRectangle(cornerRadius: 12))

            // 액티브 스킬 카드 (dashed border) + 실시간 cooldown bar + skillReady/Cooldown.
            if let skill {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        PixelIcon(.zap, size: 18, color: gbText).frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 8) {
                                Text(AppConfig.loc("액티브: ") + skillDisplayName(skill))
                                    .typography(.caption).foregroundStyle(gbText)
                                if sessionActive {
                                    Text(ready ? AppConfig.loc("준비됨")
                                               : AppConfig.loc("쿨다운 \(cd)"))
                                        .typography(.micro).monospacedDigit()
                                        .foregroundStyle(ready ? gbText : gbDim)
                                }
                            }
                            Text(sessionActive
                                 ? AppConfig.loc("조건 충족 시 자동 발동")
                                 : AppConfig.loc("쿨다운 \(skill.cooldown) · 조건 충족 시 자동 발동"))
                                .typography(.micro).foregroundStyle(gbDim)
                        }
                        Spacer(minLength: 0)
                        // 자동 스킬 토글 (보더 금지 — 채움 pill)
                        autoSkillToggle(hero: hero)
                    }
                    // 실시간 cooldown bar — 세션 active 일 때만 (웹 :485-500, transition 280ms).
                    if sessionActive {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(gbDivider)
                                Capsule().fill(ready ? gbText : gbDim)
                                    .frame(width: geo.size.width * cooldownPct)
                                    .animation(.easeOut(duration: 0.28), value: cooldownPct)
                            }
                        }
                        .frame(height: 2)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(gbCardDim, in: RoundedRectangle(cornerRadius: 12))
                .overlay(   // 웹 dashed border — 액티브 스킬 구분 아트.
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(gbDim.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                )
            }
        }
    }

    private func autoSkillToggle(hero: Hero) -> some View {
        let on = hero.autoSkillEnabled ?? true
        return Button {
            Haptics.play(.selection)
            upHero.toggleAutoSkill()
        } label: {
            Text(on ? AppConfig.loc("자동 ON") : AppConfig.loc("자동 OFF"))
                .typography(.micro)
                .foregroundStyle(on ? gbBg : gbDim)
                .padding(.horizontal, 10)
                .frame(minHeight: 32)
                .background(on ? gbText : gbCard, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func skillDisplayName(_ skill: ClassSkill) -> String {
        AppConfig.locRuntime(skill.name)   // 런타임 문자열 — 인앱 언어 카탈로그 경유.
    }

    // MARK: - 전직 전 노비스 스킬 섹션 (웹 NoviceSkillSection — 로드맵)

    private func noviceSkillSection(hero: Hero, level: Int) -> some View {
        let learned = hero.learnedSkills ?? []
        return VStack(alignment: .leading, spacing: 8) {
            sectionTitle(AppConfig.loc("수련 스킬"))
            Text(AppConfig.loc("전직 전 영웅이 배우는 기본 스킬. 레벨에 도달하면 자동 습득해요"))
                .typography(.micro).foregroundStyle(gbDim)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 6) {
                ForEach(ClassSkills.noviceSkills, id: \.id) { skill in
                    noviceSkillRow(skill, learned: learned.contains(skill.id), level: level)
                }
            }
        }
    }

    private func noviceSkillRow(_ skill: ClassSkill, learned: Bool, level: Int) -> some View {
        let levelOk = level >= skill.requiredLevel
        let borderColor = learned ? gbText : (levelOk ? gbDim : gbDivider)
        return HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(LocalizedStringKey(skill.name))
                        .typography(.caption).foregroundStyle(gbText)
                    if learned {
                        Text("✓").typography(.micro)
                            .foregroundStyle(gbBg)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(gbText, in: Capsule())
                    }
                }
                Text(LocalizedStringKey(skill.description))
                    .typography(.caption).foregroundStyle(gbDim)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text(AppConfig.loc("쿨다운 \(skill.cooldown)"))
                        .typography(.micro).monospacedDigit().foregroundStyle(gbDim)
                    if !learned {
                        Text("·").typography(.micro).foregroundStyle(gbDim)
                        Text(AppConfig.loc("Lv.\(skill.requiredLevel) 해금"))
                            .typography(.micro)
                            .foregroundStyle(levelOk ? gbDim : GBPalette.dark)
                    }
                }
            }
            Spacer(minLength: 0)
            // learned / locked 뱃지
            Text(learned ? AppConfig.loc("습득") : AppConfig.loc("잠김"))
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(gbDim)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(gbCard, in: RoundedRectangle(cornerRadius: 4))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(GBPalette.dark.opacity(0.33), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(borderColor.opacity(0.5), lineWidth: 1))
        .opacity(learned ? 1 : 0.75)
    }

    // MARK: - 스킬트리 섹션 (웹 SkillTreePanel — GB 팔레트)

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
            let resColor = resourceSpec.map { Color(hexString: $0.color) } ?? gbText
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    sectionTitle(AppConfig.loc("스킬트리"))
                    Spacer(minLength: 0)
                    HStack(spacing: 4) {
                        PixelIcon(.star, size: 12, color: gbText)
                        Text("\(points)").typography(.caption).monospacedDigit().foregroundStyle(gbText)
                        Text("SP").typography(.micro).foregroundStyle(gbDim)
                    }
                }
                if let resourceSpec {
                    // 자원명(분노/마나…)은 콘텐츠 문자열 — 보간 인자로 넣으면 %@ 가 원문(한국어)
                    // 그대로 새므로 locRuntime 으로 먼저 현지화한 뒤 템플릿에 끼운다.
                    Text(AppConfig.loc("자원 \(AppConfig.locRuntime(resourceSpec.name)) · 레벨업마다 SP 획득"))
                        .typography(.micro).foregroundStyle(gbDim)
                }
                ForEach(1...4, id: \.self) { tier in
                    let skills = tree.filter { $0.tier == tier }
                    if !skills.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(tierLabel(tier, skills: skills))
                                .typography(.micro).tracking(1).foregroundStyle(gbDim)
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
                        .typography(.caption).foregroundStyle(gbText)
                    if isLearned {
                        Text("✓").typography(.micro).foregroundStyle(gbBg)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(gbText, in: Capsule())
                    }
                }
                Text(LocalizedStringKey(skill.description))
                    .typography(.caption).foregroundStyle(gbDim)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text("\(skill.resourceCost) \(resShort)")
                        .typography(.micro).monospacedDigit().foregroundStyle(resColor)
                    Text("·").typography(.micro).foregroundStyle(gbDim)
                    Text(AppConfig.loc("쿨다운 \(skill.cooldown)"))
                        .typography(.micro).monospacedDigit().foregroundStyle(gbDim)
                }
            }
            Spacer(minLength: 0)
            if !isLearned {
                Button {
                    upHero.learnSkill(skill.id, gameLevel: store.progress?.level ?? 1)
                } label: {
                    Text(learnButtonLabel(status, skill: skill))
                        .typography(.micro)
                        .foregroundStyle(status == .ok ? gbBg : gbDim)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 32)
                        .background(status == .ok ? gbText : gbCard, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(status != .ok)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(gbCard, in: RoundedRectangle(cornerRadius: 10))
        .opacity(dimmed ? 0.55 : 1)
    }

    private func learnButtonLabel(_ status: LearnStatus, skill: ClassSkill) -> String {
        switch status {
        case .needLevel:  return "Lv.\(skill.requiredLevel)"
        case .needPoints: return "SP \(skill.pointCost)"
        default:          return AppConfig.loc("해금")
        }
    }

    // MARK: - 장착 장비 4슬롯 (웹 equipped — talisman 칩 + 사진 부적 썸네일)

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
        HStack(alignment: .top, spacing: 12) {
            Text(slotLabel(slot))
                .typography(.caption).foregroundStyle(gbDim)
                .frame(width: 56, alignment: .leading)
            if let item {
                // 사진 부적이면 썸네일, 아니면 픽셀 아이콘.
                if let photoId = item.photoId {
                    photoThumb(photoId)
                } else {
                    PixelIcon(PixelIconName.resolve(item.iconName), size: 16, color: gbText)
                        .frame(width: 18, height: 18)
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(item.localizedDisplayName)
                            .typography(.caption).foregroundStyle(gbText).lineLimit(1)
                        if let lv = item.enhanceLevel, lv > 0 {
                            Text("+\(lv)").typography(.micro).foregroundStyle(gbText)
                        }
                    }
                    // talisman skill 칩 (✦ 이름) — 웹 :244-276.
                    if let ids = item.talismanSkills, !ids.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(ids, id: \.self) { id in
                                if let sk = TalismanSkills.catalog[id] {
                                    Text("✦ " + AppConfig.locRuntime(sk.name))
                                        .font(.system(size: 9))
                                        .foregroundStyle(gbText)
                                        .padding(.horizontal, 5).padding(.vertical, 2)
                                        .background(GBPalette.lightest.opacity(0.13),
                                                    in: RoundedRectangle(cornerRadius: 3))
                                }
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
                Text(item.rarity.displayName)
                    .typography(.micro).foregroundStyle(item.rarity.color)
            } else {
                Text(AppConfig.loc("비어 있음"))
                    .typography(.caption).foregroundStyle(gbDim.opacity(0.6))
                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(item != nil ? gbCard : GBPalette.dark.opacity(0.2),
                    in: RoundedRectangle(cornerRadius: 10))
    }

    /// 사진 부적 썸네일 (웹 StatPanelPhotoThumb 18px). 썸네일 경로로 로드.
    private func photoThumb(_ photoId: String) -> some View {
        GrowthThumbImage(id: photoId, growth: growth) {
            RoundedRectangle(cornerRadius: 3).fill(GBPalette.dark)
        }
        .frame(width: 18, height: 18)
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }

    private func slotLabel(_ slot: EquipSlot) -> String {
        switch slot {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .typography(.caption)
            .foregroundStyle(gbDim)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 스탯 섹션

    private func statsSection(base: HeroBaseStats, effective: HeroBaseStats,
                              level: Int, classType: ClassType?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle(AppConfig.loc("스탯"))
            HexStatChart(base: base, effective: effective,
                         level: level, classType: classType, size: 240)
                .frame(maxWidth: .infinity)
            // 격자 가방 시너지 합 — 세션 시작 때 baseStats 에 가산되는 값과 **같은 순수
            // 함수**로 라이브 계산한다. 여기서 따로 더하면 화면과 전투가 갈린다.
            let bagText = bagSynergyText(level: level)
            if !bagText.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(AppConfig.loc("가방 시너지 \(bagText)"))
                        .typography(.caption)
                        .monospacedDigit()
                        .foregroundStyle(gbText)
                    Text(AppConfig.loc(
                        "사진 부적을 앵커 옆에 두면 스탯 보너스, 스킬은 착용한 부적만"))
                        .typography(.micro)
                        .foregroundStyle(gbDim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// 가방 시너지 합계 문장. StatKey 는 `allCases` 로 훑는다 — Dictionary 순회 순서에
    /// 맡기면 열 때마다 항목 순서가 달라진다.
    private func bagSynergyText(level: Int) -> String {
        let synergy = UpHeroBag.computeBagSynergy(
            equipped: upHero.state.hero.equipped,
            inventory: upHero.state.inventory,
            rows: UpHeroBag.bagRows(level))
        return StatKey.allCases.compactMap { key -> String? in
            guard let v = synergy.bonuses[key], v != 0 else { return nil }
            return "+\(v) \(key.label)"
        }.joined(separator: "  ")
    }
}
