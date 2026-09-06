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
//  복원 항목: 전직 전 NoviceSkillSection(로드맵), 보유 스킬 행별 실시간 cooldown
//  bar, 장비 행 talisman skill 칩(✦) + 사진 부적 썸네일.
//
//  Phase 3-F (피드백 34b) — 웹 HeroStatPanel.ClassSection / SkillTreePanel 미러:
//   - 클래스 섹션: deprecated classSkills 단일 카드 → 배운 스킬 목록(T{tier} 배지, 자원
//     비용, session.skillCooldowns[id] 기반 준비됨/쿨다운 n + 2pt 바). 레거시 스칼라
//     session.skillCooldown 은 더 읽지 않는다.
//   - 스킬트리: tier 2/3 은 a/b 두 카드를 HStack 2열로. 형제를 배우면 dim(배경 단계 +
//     opacity .45, "선택 완료"), 배운 카드는 자원색 글로우(선택 상태 예외). 판정은
//     ClassSkills.learnStatus 한 곳. 리스펙 버튼 + GbConfirm, 코인 부족은 인라인 문구.
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
    /// Phase 3-F — 리스펙 확인 다이얼로그 / 코인 부족 인라인 문구.
    @State private var respecOpen = false
    @State private var respecNoCoins = false

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
        let level = upHero.heroLevel   // Phase 2-A — heroXp 풀 기준 (웹 useHeroLevel)
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
        .overlay {
            // Phase 3-F — 리스펙 확인 (웹 SkillTreePanel GbConfirm respecConfirm).
            if respecOpen, let cls = hero.classType {
                let spent = spentSkillPoints(cls, hero: hero)
                GbConfirm(
                    title: "스킬 초기화",
                    message: "배운 스킬을 모두 잊고 SP \(spent)을 돌려받아요. \(ShopPrices.skillRespec) 코인을 쓸까요?",
                    confirmLabel: "스킬 초기화",
                    onConfirm: { confirmRespec() },
                    onCancel: { respecOpen = false })
            }
        }
    }

    /// 리스펙으로 되돌려받을 SP = 이 class 의 T2+ 학습 스킬 pointCost 합 (웹 spentSp).
    private func spentSkillPoints(_ cls: ClassType, hero: Hero) -> Int {
        let learned = hero.learnedSkills ?? []
        return (ClassSkills.classSkillTrees[cls] ?? [])
            .filter { $0.tier >= 2 && learned.contains($0.id) }
            .reduce(0) { $0 + $1.pointCost }
    }

    private func confirmRespec() {
        respecOpen = false
        let result = upHero.respecSkills()
        respecNoCoins = result == .noCoins
        if result != .ok { SoundPlayer.shared.play(.cancel) }
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

    // MARK: - 클래스 섹션 (웹 ClassSection — 메타 + 보유 스킬 목록 + 행별 실시간 cooldown)

    private func classSection(_ cls: ClassType, hero: Hero) -> some View {
        let meta = UpHeroRules.classMeta[cls]
        let resourceSpec = UpHeroRules.classResource[cls]
        let resColor = resourceSpec.map { Color(hexString: $0.color) } ?? gbText
        let learnedIds = hero.learnedSkills ?? []
        let learnedSkills = (ClassSkills.classSkillTrees[cls] ?? []).filter { learnedIds.contains($0.id) }
        // 전투 중이면 skillCooldowns 맵 참조 (웹 currentSession.skillCooldowns[id]).
        let session = upHero.state.currentSession
        let sessionActive = session != nil && session?.status != .completed
            && session?.hero.classType == cls

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

            // Phase 3-F — 보유 스킬 헤더 + 자동 토글 (웹 learnedSkillsLabel + autoFireHint)
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(AppConfig.loc("보유 스킬"))
                        .typography(.caption).foregroundStyle(gbDim)
                    Text(AppConfig.loc("조건 충족 시 자동 발동"))
                        .typography(.micro).foregroundStyle(gbDim)
                }
                Spacer(minLength: 0)
                autoSkillToggle(hero: hero)
            }

            // 보유 스킬 목록 — 행마다 실시간 cooldown (보더 없음, 배경 단계)
            VStack(spacing: 6) {
                if learnedSkills.isEmpty {
                    Text(AppConfig.loc("아직 배운 스킬이 없어요"))
                        .typography(.micro).foregroundStyle(gbDim)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(gbCardDim, in: RoundedRectangle(cornerRadius: 10))
                }
                ForEach(learnedSkills, id: \.id) { skill in
                    learnedSkillRow(skill, sessionActive: sessionActive, session: session,
                                    resColor: resColor, resShort: resourceSpec?.short ?? "")
                }
            }
        }
    }

    private func learnedSkillRow(_ skill: ClassSkill, sessionActive: Bool,
                                 session: CombatSession?, resColor: Color,
                                 resShort: String) -> some View {
        let cd = sessionActive ? ((session?.skillCooldowns ?? [:])[skill.id] ?? 0) : 0
        let ready = cd == 0
        let maxCd = max(1, skill.cooldown)
        let cooldownPct = sessionActive ? Double(maxCd - cd) / Double(maxCd) : 1.0
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                PixelIcon(.zap, size: 18, color: gbText).frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(LocalizedStringKey(skill.name))
                            .typography(.caption).foregroundStyle(gbText).lineLimit(1)
                        Text("T\(skill.tier)")
                            .font(.system(size: 9, weight: .semibold))
                            .tracking(0.5)
                            .foregroundStyle(gbDim)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(GBPalette.dark.opacity(0.67), in: RoundedRectangle(cornerRadius: 3))
                        if sessionActive {
                            Spacer(minLength: 0)
                            Text(ready ? AppConfig.loc("준비됨") : AppConfig.loc("쿨다운 \(cd)"))
                                .typography(.micro).monospacedDigit()
                                .foregroundStyle(ready ? gbText : gbDim)
                        }
                    }
                    HStack(spacing: 6) {
                        Text("\(skill.resourceCost) \(resShort)")
                            .typography(.micro).monospacedDigit().foregroundStyle(resColor)
                        Text("·").typography(.micro).foregroundStyle(gbDim)
                        Text(AppConfig.loc("쿨다운 \(skill.cooldown)"))
                            .typography(.micro).monospacedDigit().foregroundStyle(gbDim)
                    }
                }
                Spacer(minLength: 0)
            }
            // 실시간 cooldown bar — 세션 active 일 때만 (2pt, transition 280ms).
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
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(gbCardDim, in: RoundedRectangle(cornerRadius: 10))
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

    // MARK: - 스킬트리 섹션 (웹 SkillTreePanel — GB 팔레트, Phase 3-F 분기 트리)

    @ViewBuilder
    private func skillTreeSection(_ cls: ClassType, hero: Hero, level: Int) -> some View {
        let tree = ClassSkills.classSkillTrees[cls] ?? []
        if !tree.isEmpty {
            let learned = hero.learnedSkills ?? []
            let points = hero.skillPoints ?? 0
            let resourceSpec = UpHeroRules.classResource[cls]
            let resColor = resourceSpec.map { Color(hexString: $0.color) } ?? gbText
            let canRespec = tree.contains { $0.tier >= 2 && learned.contains($0.id) }
            let anyT3Learned = tree.contains { $0.tier == 3 && learned.contains($0.id) }
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    sectionTitle(AppConfig.loc("스킬트리"))
                    Spacer(minLength: 0)
                    if canRespec {
                        respecButton
                    }
                    HStack(spacing: 4) {
                        PixelIcon(.star, size: 12, color: gbText)
                        Text("\(points)").typography(.caption).monospacedDigit().foregroundStyle(gbText)
                        Text("SP").typography(.micro).foregroundStyle(gbDim)
                    }
                }
                if respecNoCoins {
                    Text(AppConfig.loc("코인이 부족해요"))
                        .typography(.micro).foregroundStyle(GBPalette.enemy)
                }
                if let resourceSpec {
                    // 자원명(분노/마나…)은 콘텐츠 문자열 — 보간 인자로 넣으면 %@ 가 원문(한국어)
                    // 그대로 새므로 locRuntime 으로 먼저 현지화한 뒤 템플릿에 끼운다.
                    Text(AppConfig.loc("자원 \(AppConfig.locRuntime(resourceSpec.name)) · 레벨업마다 SP 획득"))
                        .typography(.micro).foregroundStyle(gbDim)
                }
                ForEach(ClassSkills.skillTreeTiers, id: \.self) { tier in
                    let skills = tree.filter { $0.tier == tier }
                    if !skills.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(tierLabel(tier, skills: skills))
                                .typography(.micro).tracking(1).foregroundStyle(gbDim)
                            if tier == 2 {
                                Text(AppConfig.loc("2단계와 3단계는 둘 중 하나만 고를 수 있어요"))
                                    .typography(.micro).foregroundStyle(gbDim)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            if tier == 4, !anyT3Learned {
                                Text(AppConfig.loc("3단계 스킬 하나를 배우면 열려요"))
                                    .typography(.micro).foregroundStyle(gbDim)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            if tier == 2 || tier == 3 {
                                // a/b 두 카드 2열 (웹 grid-cols-2)
                                HStack(alignment: .top, spacing: 6) {
                                    ForEach(skills, id: \.id) { skill in
                                        skillTreeRow(skill, cls: cls, learned: learned, points: points,
                                                     level: level, resColor: resColor,
                                                     resShort: resourceSpec?.short ?? "",
                                                     branched: true)
                                            .frame(maxWidth: .infinity)
                                    }
                                }
                            } else {
                                ForEach(skills, id: \.id) { skill in
                                    skillTreeRow(skill, cls: cls, learned: learned, points: points,
                                                 level: level, resColor: resColor,
                                                 resShort: resourceSpec?.short ?? "",
                                                 branched: false)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// 리스펙 버튼 — T2+ 를 하나라도 배웠을 때만 (보더 없음, 배경 단계).
    private var respecButton: some View {
        Button {
            Haptics.play(.selection)
            respecOpen = true
        } label: {
            Text(AppConfig.loc("스킬 초기화 · \(ShopPrices.skillRespec) 코인"))
                .typography(.micro).monospacedDigit()
                .foregroundStyle(gbDim)
                .padding(.horizontal, 8)
                .frame(minHeight: 32)
                .background(GBPalette.dark.opacity(0.67), in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    private func tierLabel(_ tier: Int, skills: [ClassSkill]) -> String {
        guard tier > 1, let first = skills.first else { return AppConfig.loc("\(tier)단계") }
        return AppConfig.loc("\(tier)단계 · Lv.\(first.requiredLevel) · SP \(first.pointCost)")
    }

    private func skillTreeRow(_ skill: ClassSkill, cls: ClassType, learned: [String], points: Int,
                              level: Int, resColor: Color, resShort: String,
                              branched: Bool) -> some View {
        let status = ClassSkills.learnStatus(
            skill, classType: cls, heroLevel: level, learned: learned, points: points)
        let isLearned = status == .learned
        let isDimmed = status == .branchTaken   // 형제를 이미 배움 — 배경 단계 + opacity .45
        let opacity: Double = isDimmed ? 0.45 : ((status == .ok || isLearned) ? 1 : 0.7)
        let info = VStack(alignment: .leading, spacing: 4) {
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
        let button = Group {
            if !isLearned {
                Button {
                    let result = upHero.learnSkill(skill.id)
                    if result != .ok { SoundPlayer.shared.play(.cancel) }
                } label: {
                    Text(learnButtonLabel(status, skill: skill))
                        .typography(.micro)
                        .fontWeight(.semibold)
                        .foregroundStyle(status == .ok ? gbBg : gbDim)
                        .padding(.horizontal, 10)
                        .frame(maxWidth: branched ? .infinity : nil)
                        .frame(minHeight: 32)
                        .background(status == .ok ? gbText : GBPalette.dark.opacity(0.67),
                                    in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(status != .ok)
            }
        }
        return Group {
            if branched {
                // 2열 카드: 정보 위, 버튼 아래 전폭 (웹 flex-col + w-full)
                VStack(alignment: .leading, spacing: 8) {
                    info
                    button
                }
            } else {
                HStack(alignment: .top, spacing: 10) {
                    info
                    Spacer(minLength: 0)
                    button
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(isDimmed ? GBPalette.dark.opacity(0.15) : gbCard,
                    in: RoundedRectangle(cornerRadius: 10))
        // 배운 카드 = 자원색 글로우 (선택 상태 예외 — 보더 없이 위계)
        .shadow(color: isLearned ? resColor.opacity(0.35) : .clear, radius: isLearned ? 6 : 0)
        .opacity(opacity)
        .animation(.easeOut(duration: 0.18), value: isLearned)
    }

    private func learnButtonLabel(_ status: SkillLearnStatus, skill: ClassSkill) -> String {
        switch status {
        case .needLevel:   return "Lv.\(skill.requiredLevel)"
        case .needPoints:  return "SP \(skill.pointCost)"
        case .needPrereq:  return AppConfig.loc("이전 단계 필요")
        case .branchTaken: return AppConfig.loc("선택 완료")
        default:           return AppConfig.loc("해금")
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
            // Phase 6-E — 슬롯 글리프(박스 없이 맨 아이콘) + 라벨. EquipSlot.glyphName 단일 출처.
            HStack(spacing: 4) {
                PixelIcon(PixelIconName.resolve(slot.glyphName), size: 12, color: gbDim)
                Text(slotLabel(slot))
                    .typography(.caption).foregroundStyle(gbDim)
            }
            .frame(width: 68, alignment: .leading)
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
                    // Phase 6-E — 주스탯 한 줄 (EquipmentStats 순서의 첫 항목).
                    if let first = EquipmentStats.orderedEntries(item).first {
                        Text("\(first.key.label) \(EquipmentStats.format(first.key, first.value))")
                            .typography(.micro).monospacedDigit()
                            .foregroundStyle(gbDim)
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
            let bagText = bagSynergyText()
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
    private func bagSynergyText() -> String {
        // 행 수는 스토어의 단일 출처를 쓴다 — 레벨이 아니라 상점에서 산 행이 근거다.
        let synergy = UpHeroBag.computeBagSynergy(
            equipped: upHero.state.hero.equipped,
            inventory: upHero.state.inventory,
            rows: upHero.currentBagRows())
        return StatKey.allCases.compactMap { key -> String? in
            guard let v = synergy.bonuses[key], v != 0 else { return nil }
            return "+\(v) \(key.label)"
        }.joined(separator: "  ")
    }
}
