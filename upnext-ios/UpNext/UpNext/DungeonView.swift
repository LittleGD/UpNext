//
//  DungeonView.swift
//  UpNext — Up Hero 던전 전투 화면.
//
//  R8 — 충실 회복:
//   - HeroSprite vs MonsterSprite 대치 UI (단순 텍스트 로그 격하 → 시각화)
//   - BossBanner 보스 등장 연출 (2.4s)
//   - FloatingNumberOverlay 14 keyframe (hp/xp/heal/coin/timeTag/start/dodge/crit)
//   - Crit shake (uphero-crit-shake) + Attack flash (좌=영웅/우=적) + Floor sweep
//   - SessionResultModal — 인라인 endResult 텍스트 격하 → 모달
//
//  세션 로그 변화에 따라 위 효과 트리거. id 기반 dedup 으로 중복 발사 방지.
//

import SwiftUI
import Combine

struct DungeonView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore

    @State private var tick = Timer.publish(every: 0.7, on: .main, in: .common).autoconnect()

    // R8 — 효과 트리거 (값이 바뀔 때 1회 재생)
    @State private var critShakeTrigger: Int = 0
    @State private var attackFlashSide: AttackSide = .hero
    @State private var attackFlashTrigger: Int = 0
    @State private var floorSweepTrigger: Int = 0
    @State private var bossBannerData: (monster: Monster, floor: Int)? = nil
    /// 전투 효과 dispatch 커서 — 웹 useDungeonAnimations 의 per-index dedupe set 이식.
    /// 이미 효과를 발사한 로그 index 집합. 취약한 count 커서(lastProcessedLogCount) 대체:
    /// onAppear 반복 발화·onChange stale capture·off-by-one 과 무관하게 신규 entry 만 1회 처리.
    @State private var seenEffectIdx: Set<Int> = []
    /// 현재 dedupe set 이 추적 중인 세션 식별자(startedAt). 세션 교체 시 set 리셋 트리거.
    @State private var effectSessionStamp: Int = -1
    @State private var floatingItems: [FloatingNumberItem] = []
    /// 스프라이트 컬럼 상대 데미지 부유 숫자 — 영웅 피격(적→영웅)은 heroFloats,
    /// 적 피격(영웅→적)은 enemyFloats. 웹 heroDamage/enemyDamage 컬럼 상대 배치 패리티.
    @State private var heroFloats: [FloatingNumberItem] = []
    @State private var enemyFloats: [FloatingNumberItem] = []
    /// 보스 배너가 표시 중인 동안엔 tick 일시정지 — 등장 연출 중 다음 round 가 겹치지 않게.
    @State private var pausedForBoss: Bool = false
    /// 탐험 인터랙션 도움말 오버레이 (웹 DungeonHelpModal).
    @State private var helpOpen: Bool = false
    /// 선택지 결과 모달 (웹 ChoiceResultModal) — 표시 중 tick pause. 로그 한 줄로
    /// 흘러가던 이벤트 결과를 모달로 보여줘 읽을 시간 보장(rpg 리뷰 P0).
    @State private var choiceResultText: String?
    @State private var choiceResultSummary: String?
    /// 스프라이트 전투 반응 — 공격 시 lunge(중앙 쪽), 피격 시 recoil(바깥쪽). x offset.
    /// 웹은 attack/hurt 포즈 프레임이 있으나 iOS 는 신규 프레임 없이 transform 으로 반응 재현.
    @State private var heroReact: CGFloat = 0
    @State private var enemyReact: CGFloat = 0

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            // R8 — DungeonAtmosphere 레이어 (themeColor + depth tint + boss pulse).
            if let session = upHero.state.currentSession,
               let dungeon = Dungeons.all[session.dungeonId] {
                DungeonAtmosphere(
                    dungeon: dungeon,
                    floor: session.currentFloor,
                    isBoss: [10, 20, 30].contains(session.currentFloor)
                )
            }
            if let session = upHero.state.currentSession {
                content(session)
                    .shake(critShakeTrigger)
                    .attackFlash(attackFlashTrigger, side: attackFlashSide)
                    .floorSweep(floorSweepTrigger)
                    // 로그 카운트 변화가 트리거. 핸들러는 session 을 캡처하지 않고 store 에서
                    // 매번 최신 세션을 다시 읽어(stale capture 제거) dedupe-set 으로 신규 entry 만
                    // 정확히 처리한다 — 트리거 형태(단일/2-파라미터)와 무관하게 동작.
                    .onChange(of: session.log.count) { _ in
                        syncCombatEffects()
                    }
                    .onAppear { syncCombatEffects() }

                FloatingNumberOverlay(items: $floatingItems)

                // 보스 배너 오버레이
                if let bb = bossBannerData {
                    BossBanner(monster: bb.monster, floor: bb.floor) {
                        bossBannerData = nil
                        pausedForBoss = false
                    }
                    .transition(.opacity)
                    .zIndex(50)
                }

                // 선택지 결과 모달 — 결과 텍스트 + 효과 요약 + 계속(2.6s 자동 닫힘).
                if let text = choiceResultText {
                    choiceResultModal(text: text, summary: choiceResultSummary)
                        .transition(.opacity)
                        .zIndex(58)
                }

                // 세션 결산 모달
                if session.status == .completed {
                    SessionResultModal(session: session) {
                        store.finishUpHeroSession()
                    }
                    .transition(.opacity)
                    .zIndex(60)
                }

                // 미니게임 오버레이 — 자동 승리 격하 해소
                if session.status == .awaitingMinigame, let pending = session.pendingMinigame {
                    MinigameRouter(pending: pending) { success in
                        upHero.resolveMinigameResult(success: success)
                    }
                    .transition(.opacity)
                    .zIndex(55)
                }

                // 탐험 도움말 오버레이 (웹 DungeonHelpModal)
                if helpOpen {
                    DungeonHelpModal(onClose: { helpOpen = false })
                        .transition(.opacity)
                        .zIndex(62)
                }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: helpOpen)
        .animation(.easeInOut(duration: 0.2), value: bossBannerData != nil)
        .animation(.easeInOut(duration: 0.2), value: choiceResultText != nil)
        .onReceive(tick) { _ in
            #if DEBUG
            // UITest 전용 — 자동 전투(조우 선택지 자동 해소). 출시 바이너리엔 비포함.
            if ProcessInfo.processInfo.arguments.contains("UITestAutoFight"),
               upHero.state.currentSession?.status == .awaitingChoice {
                upHero.resolveChoice(0)
                return
            }
            #endif
            // 보스 배너·선택지 결과 모달 표시 중엔 tick 정지 (읽을 시간 보장).
            guard !pausedForBoss, choiceResultText == nil else { return }
            upHero.advanceCombat()
        }
    }

    /// 선택지 결과 모달 (웹 ChoiceResultModal) — 백드롭 + 결과 텍스트 + 효과 요약 + 계속.
    private func choiceResultModal(text: String, summary: String?) -> some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { dismissChoiceResult() }
            VStack(spacing: 14) {
                PixelIcon(.zap, size: 28, color: Color.accentPrimary)
                Text(text)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if let summary, !summary.isEmpty {
                    Text(summary)
                        .typography(.caption)
                        .foregroundStyle(Color.accentPrimary)
                        .multilineTextAlignment(.center)
                }
                Button("계속") { dismissChoiceResult() }
                    .buttonStyle(.un(.primary))
            }
            .padding(22)
            .frame(maxWidth: 320)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 32)
        }
    }

    private func dismissChoiceResult() {
        choiceResultText = nil
        choiceResultSummary = nil
    }

    /// 전투 반응 — 공격자는 중앙 쪽으로 lunge(영웅 +, 적 −), 명중 시 피격자는 바깥으로
    /// recoil. 짧은 spring 후 0 으로 복귀. reduce-motion 가드는 호출부 모션 일관성상 생략
    /// (offset 만이라 멀미 영향 미미).
    private func reactCombat(heroIsAttacker: Bool, didHit: Bool) {
        withAnimation(.spring(response: 0.16, dampingFraction: 0.5)) {
            if heroIsAttacker {
                heroReact = 14
                if didHit { enemyReact = 10 }
            } else {
                enemyReact = -14
                if didHit { heroReact = -10 }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.6)) {
                heroReact = 0
                enemyReact = 0
            }
        }
    }

    // MARK: - 콘텐츠

    private func content(_ session: CombatSession) -> some View {
        VStack(spacing: 0) {
            statusHeader(session)
            spriteVsRow(session)
            logScroll(session)
            skillBar(session)
            footer(session)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 스킬 바 (웹 SkillBar — 보유 스킬 + 쿨다운/자원 상태 + 탭 발동)

    @ViewBuilder
    private func skillBar(_ session: CombatSession) -> some View {
        let learned = (session.hero.learnedSkills ?? []).compactMap { ClassSkills.findSkillById($0) }
        if !learned.isEmpty && session.status == .active {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(learned, id: \.id) { skill in
                        skillChip(skill, session: session)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
    }

    private func skillChip(_ skill: ClassSkill, session: CombatSession) -> some View {
        let cd = (session.skillCooldowns ?? [:])[skill.id] ?? 0
        let check = ClassSkills.canFireSkill(session, skillId: skill.id)
        let stateLabel = cd > 0 ? "CD \(cd)"
            : check.reason == .resource ? AppConfig.loc("자원 부족")
            : AppConfig.loc("준비")
        return Button {
            upHero.fireSkillManual(skill.id)
        } label: {
            VStack(spacing: 3) {
                Text(LocalizedStringKey(skill.name))
                    .typography(.caption)
                    .foregroundStyle(check.ok ? Color.textPrimary : Color.textTertiary)
                    .lineLimit(1)
                Text(stateLabel)
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(check.ok ? Color.accentPrimary : Color.textTertiary)
                if skill.resourceCost > 0 {
                    Text("−\(skill.resourceCost)")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(check.ok ? Color.bgElevated : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 10))
            .opacity(check.ok ? 1 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!check.ok)
    }

    // MARK: - 스프라이트 대치 (HeroSprite vs MonsterSprite)

    @ViewBuilder
    private func spriteVsRow(_ session: CombatSession) -> some View {
        let hero = session.hero
        let enemy = currentEnemy(session)
        HStack(alignment: .center) {
            // Hero 좌
            VStack(spacing: 4) {
                HeroSprite(
                    variant: hero.appearanceVariant,
                    classType: hero.classType,
                    size: 56,
                    color: HeroSprite.themeColor(hero.classType)
                )
                .offset(x: heroReact)
                Text(hero.name)
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                    .lineLimit(1)
            }
            // 영웅 피격(적→영웅) "−N" — 웹 heroDamage: hero 컬럼 상대, top:-18, GB_ENEMY 색.
            .overlay(alignment: .topTrailing) {
                AnchoredFloatOverlay(items: $heroFloats, baseOffsetY: -18)
            }
            Spacer()
            Text("VS")
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
                .tracking(2)
            Spacer()
            // Enemy 우
            VStack(spacing: 4) {
                if let enemy {
                    MonsterSprite(
                        kind: enemy.kind,
                        size: 56,
                        color: enemy.isBoss == true ? Color.accentSecondary : Color.textPrimary,
                        glow: enemy.isBoss == true
                    )
                    .offset(x: enemyReact)
                    Text(LocalizedStringKey(enemy.name))
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                        .lineLimit(1)
                    // 적 HP 바 — 웹 enemyHpPct 패리티. 로그 replay 로 현재 HP 계산해
                    // "적이 죽어가는지" 시각화 (전투 가독성 핵심, rpg 리뷰 P0).
                    if let hp = enemyHpInfo(session) {
                        enemyHpBar(cur: hp.cur, max: hp.max)
                    }
                } else {
                    // 탐험 중 (몬스터 없음)
                    Color.clear.frame(width: 56, height: 56)
                    Text("탐험 중...")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary.opacity(0.5))
                }
            }
            // 적 피격(영웅→적) "−N" — 웹 enemyDamage: enemy 컬럼 상대, top:-16, 클래스 테마색.
            .overlay(alignment: .topTrailing) {
                AnchoredFloatOverlay(items: $enemyFloats, baseOffsetY: -16)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 12)
        .frame(minHeight: 88)
    }

    /// 현재 적의 HP (현재/최대) — 로그 replay 로 계산. 일반 encounter 만 (보스는 자체 배너).
    /// nil 이면 HP 바 미표시 (탐험 중·보스·전투 종료).
    private func enemyHpInfo(_ session: CombatSession) -> (cur: Int, max: Int)? {
        let idx = UpHeroCombat.findLastEncounterIndex(session.log)
        guard idx >= 0, case let .encounter(monster, _) = session.log[idx] else { return nil }
        let cur = UpHeroCombat.computeMonsterHp(log: session.log, encounterIdx: idx, monster: monster)
        let maxHp = monster.maxHp ?? monster.hp
        return (Swift.max(0, cur), Swift.max(1, maxHp))
    }

    /// 적 HP 바 — 적 스프라이트 폭(56)에 맞춘 얇은 바 + 수치.
    private func enemyHpBar(cur: Int, max: Int) -> some View {
        VStack(spacing: 2) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.bgElevated)
                    Capsule().fill(Color.accentSecondary)
                        .frame(width: geo.size.width * min(1, Double(cur) / Double(max)))
                }
            }
            .frame(width: 56, height: 4)
            Text("\(cur)/\(max)")
                .typography(.micro)
                .monospacedDigit()
                .foregroundStyle(Color.textTertiary)
        }
    }

    /// 현재 진행 중인 적 — 최근 encounter/boss 의 monster (victory/sessionEnd 이후엔 nil).
    private func currentEnemy(_ session: CombatSession) -> Monster? {
        for entry in session.log.reversed() {
            switch entry {
            case let .encounter(monster, _):
                return monster
            case let .boss(monster, _, _):
                return monster
            case .victory, .sessionEnd:
                return nil
            default:
                continue
            }
        }
        return nil
    }

    // MARK: - 상태 헤더

    private func statusHeader(_ session: CombatSession) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                Text(LocalizedStringKey(Dungeons.all[session.dungeonId]?.name ?? "던전"))
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                Text("\(session.currentFloor)층")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
                // 탐험 도움말 — HP·시간/자원/스킬/속도/포기 안내(웹 DungeonHelpModal).
                Button { helpOpen = true } label: {
                    Text("?")
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                        .frame(width: 26, height: 26)
                        .background(Color.bgElevated, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("탐험 도움말")
            }
            // HP 위기 색 (웹 패리티) — 50%↑ 정상, 20~50% 경고(앰버), 20%↓ 위험(적).
            let hpPct = Double(session.hero.hp) / Double(Swift.max(1, session.hero.maxHp))
            let hpColor = hpPct > 0.5 ? Color.accentPrimary
                : hpPct > 0.2 ? Color(hexString: "#e8c76b") : Color.accentSecondary
            statBar("HP", session.hero.hp, session.hero.maxHp, hpColor)
            statBar(AppConfig.loc("탐험 시간"), session.time, session.maxTime, Color.accentCyan)
            // 클래스 자원 게이지(분노/마나/기 등) — 전직 영웅만. 웹 ClassResourceBar.
            // 스킬 발동에 쓰이는 자원이 보이지 않던 갭(rpg 리뷰) 해소. 표시 전용.
            if let cls = session.hero.classType,
               let spec = UpHeroRules.classResource[cls] {
                statBar(AppConfig.locRuntime(spec.name), session.classResource ?? 0,
                        UpHeroRules.classResourceMax, Color(hexString: spec.color))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private func statBar(_ label: String, _ value: Int, _ max: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label).typography(.micro).foregroundStyle(Color.textTertiary)
                Spacer()
                Text("\(Swift.max(0, value)) / \(max)")
                    .typography(.micro)
                    .foregroundStyle(Color.textSecondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.bgElevated)
                    Capsule().fill(color)
                        .frame(width: geo.size.width * barFraction(value, max))
                }
            }
            .frame(height: 6)
        }
    }

    private func barFraction(_ v: Int, _ m: Int) -> CGFloat {
        guard m > 0 else { return 0 }
        return min(Swift.max(CGFloat(v) / CGFloat(m), 0), 1)
    }

    // MARK: - 로그 스크롤

    private func logScroll(_ session: CombatSession) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(session.log.enumerated()), id: \.offset) { idx, entry in
                        // 최신 1줄만 typewriter, 나머지는 정적 (성능 보호).
                        if idx == session.log.count - 1 {
                            CombatLogText(fullText: logText(entry), color: logColor(entry))
                                .id(idx)
                        } else {
                            Text(logText(entry))
                                .typography(.caption)
                                .foregroundStyle(logColor(entry))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .id(idx)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .onChange(of: session.log.count) { _ in
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(session.log.count - 1, anchor: .bottom)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 푸터

    @ViewBuilder
    private func footer(_ session: CombatSession) -> some View {
        if session.status == .completed {
            // SessionResultModal 이 처리 — 빈 footer.
            EmptyView()
        } else if session.status == .awaitingChoice {
            choiceOptions(session)
        } else {
            abandonButton
        }
    }

    @ViewBuilder
    private func choiceOptions(_ session: CombatSession) -> some View {
        if let idx = session.pendingChoiceIndex, session.log.indices.contains(idx),
           case let .choice(_, _, _, options, _, _, _, _, _, _) = session.log[idx] {
            VStack(spacing: 8) {
                ForEach(Array(options.enumerated()), id: \.offset) { i, option in
                    Button {
                        upHero.resolveChoice(i)
                    } label: {
                        // 전투 선택지 라벨 i18n — labelKey(uphero.combat.choice.*)로 인앱 언어
                        //   해석. 이전엔 raw option.label(한국어 "싸운다"/"도망간다 (85%)")을
                        //   그대로 렌더해 전 언어에서 한국어로 샜다(카탈로그엔 키가 이미 있었으나
                        //   코드가 미사용). 로그 텍스트(logText)와 동일한 resolveLog 경로로 통일.
                        Text(option.labelKey.map {
                            UpHeroNarrative.resolveLog($0, option.labelParams, fallback: option.label)
                        } ?? option.label)
                    }
                    // 공용 secondary(bgSurface/textPrimary) — minHeight 라 긴 선택지도 안 잘림.
                    .buttonStyle(.un(.secondary))
                }
            }
            // 12-combat-parity(3): 전투는 이제 풀스크린 몰입(네비는 MainShell 에서 숨김 —
            // 웹 DungeonView fixed inset-0 패리티). footer 버튼이 홈 인디케이터를 피하도록 하단 여유.
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 24)
        } else {
            abandonButton
        }
    }

    private var abandonButton: some View {
        Button("탐험 포기") { upHero.abandonSession() }
            .buttonStyle(.un(.secondary, tint: .textSecondary))
        // 12-combat-parity(3): 전투 풀스크린 — 네비는 MainShell 에서 숨김. 홈 인디케이터 여유 확보.
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 24)
    }

    // MARK: - 로그 텍스트/색

    private func logText(_ entry: LogEntry) -> String {
        // narrativeKey 가 있으면 인앱 언어로 해석(UpHeroNarrative.resolveLog), 없으면
        // iOS 전용 로그 키로 해석하고 최후엔 한국어 fallback. 몬스터·장비명은 콘텐츠
        // 키라 resolveLog 내부에서 locRuntime 으로 재현지화된다.
        func R(_ key: String, _ params: NarrativeParams?, _ fallback: String) -> String {
            UpHeroNarrative.resolveLog(key, params, fallback: fallback)
        }
        switch entry {
        case let .narrative(text, key, params, _):
            return key.map { R($0, params, text) } ?? text
        case let .encounter(monster, _):
            return R("ios.log.encounter", ["monster": .text(monster.name)], "\(monster.name) 출현!")
        case let .combat(attacker, damage, outcome, narrative, key, params, _):
            if let key { return R(key, params, narrative ?? "") }
            if let narrative, !narrative.isEmpty { return narrative }
            let who: NarrativeValue = .text(attacker == .hero ? AppConfig.loc("영웅") : AppConfig.loc("적"))
            let dmg: NarrativeValue = .number(Double(damage))
            switch outcome {
            case .hit:   return R("ios.log.combatHit", ["who": who, "damage": dmg], "")
            case .crit:  return R("ios.log.combatCrit", ["who": who, "damage": dmg], "")
            case .dodge: return R("ios.log.combatDodge", ["who": .text(attacker == .hero ? AppConfig.loc("적") : AppConfig.loc("영웅"))], "")
            case .miss:  return R("ios.log.combatMiss", ["who": who], "")
            }
        case let .victory(monster, xp, coins, key, params, _):
            if let key { return R(key, params, "\(monster.name) 처치") }
            return R("ios.log.victory",
                     ["monster": .text(monster.name), "xp": .number(Double(xp)), "coins": .number(Double(coins))],
                     "\(monster.name) 처치 — XP +\(xp), 코인 +\(coins)")
        case let .drop(equipment, _):
            return R("ios.log.drop", ["equipment": .text(EquipmentPool.equipmentBaseName(equipment))], "\(equipment.name) 획득!")
        case let .treasure(coins, description, key, params, _):
            if let key { return R(key, params, description) }
            return description.isEmpty
                ? R("ios.log.treasureFallback", ["coins": .number(Double(coins))], "보물 발견 — 코인 +\(coins)")
                : AppConfig.locRuntime(description)
        case let .floor(_, to, _):
            return R("ios.log.floorEnter", ["floor": .number(Double(to))], "\(to)층 진입")
        case let .boss(monster, floor, _):
            return R("ios.log.boss",
                     ["monster": .text(monster.name), "floor": .number(Double(floor))],
                     "보스 \(monster.name) 등장! (\(floor)층)")
        case let .choice(prompt, promptKey, promptParams, _, _, _, _, _, _, _):
            return promptKey.map { R($0, promptParams, prompt) } ?? prompt
        case let .sessionEnd(reason, detail, detailKey, _, _, _, _):
            if let detailKey { return R(detailKey, nil, detail ?? sessionEndText(reason)) }
            return detail ?? sessionEndText(reason)
        case let .skill(_, _, skillName, narrative, key, params, _):
            if let key { return R(key, params, narrative.isEmpty ? skillName : narrative) }
            return narrative.isEmpty ? AppConfig.locRuntime(skillName) : narrative
        case let .monsterEffect(_, _, narrative, key, params, _):
            if let key { return R(key, params, narrative ?? "") }
            return narrative ?? R("ios.log.monsterEffect", nil, "몬스터 효과 발동")
        case let .choiceResult(text, _, _, _, _, resultTextKey, resultTextFallback, _):
            return resultTextKey.map { R($0, nil, resultTextFallback ?? text) } ?? text
        }
    }

    private func logColor(_ entry: LogEntry) -> Color {
        switch entry {
        case .victory, .drop, .treasure:
            return Color.accentPrimary
        case .encounter, .boss:
            return Color.accentSecondary
        case .sessionEnd:
            return Color.textPrimary
        default:
            return Color.textSecondary
        }
    }

    private func sessionEndText(_ reason: SessionEndReason) -> String {
        switch reason {
        case .bossDefeated:  return AppConfig.loc("보스 격파 — 탐험 성공")
        case .heroDied:      return AppConfig.loc("영웅이 쓰러졌다 — 탐험 실패")
        case .timeExpired:   return AppConfig.loc("탐험 시간 소진")
        case .heroAbandoned: return AppConfig.loc("캠프로 복귀")
        case .victory:       return AppConfig.loc("탐험 성공")
        case .defeat:        return AppConfig.loc("탐험 실패")
        case .abandoned:     return AppConfig.loc("캠프로 복귀")
        }
    }

    /// 선택지 효과 요약을 구조화 데이터에서 인앱 언어로 재구성. UpHeroCombat.summarizeEffects
    /// 는 한국어 문자열이라 모달에 그대로 쓰면 샌다 — 카탈로그 보간 키로 현지화.
    private static func localizedEffectSummary(_ sd: EffectSummaryData) -> String {
        var parts: [String] = []
        if let xp = sd.xp { parts.append(AppConfig.loc("경험치 +\(xp)")) }
        if let coins = sd.coins { parts.append(AppConfig.loc("코인 +\(coins)")) }
        if let heal = sd.heal { parts.append(AppConfig.loc("체력 +\(heal)")) }
        if let damage = sd.damage { parts.append(AppConfig.loc("체력 −\(damage)")) }
        if let td = sd.timeDelta {
            if td > 0 { parts.append(AppConfig.loc("시간 +\(td)")) }
            else if td < 0 { parts.append(AppConfig.loc("시간 \(td)")) }
        }
        return parts.joined(separator: " · ")
    }

    // MARK: - 새 로그 처리 (효과 트리거)

    /// 전투 효과 dispatch — 웹 useDungeonAnimations 의 per-index dedupe 패턴 이식.
    ///
    /// 취약한 count 커서(lastProcessedLogCount + onAppear 리셋 + deprecated onChange stale
    /// capture)를 폐기하고, `seenEffectIdx` set 에 없는 index 만 효과를 발사한 뒤 삽입한다.
    /// 세션 교체(startedAt 변화) 시 set 을 현재 로그로 baseline 리셋(웹 L118-123 패리티) —
    /// 이 리셋이 startedAt 기준이라 onAppear 가 몇 번 발화하든 재-baseline 되지 않아,
    /// "매 tick 신규 entry 스킵" 버그가 구조적으로 재발할 수 없다.
    private func syncCombatEffects() {
        // store 에서 최신 세션을 직접 읽어 stale capture 원천 차단.
        guard let session = upHero.state.currentSession else { return }
        // 세션 교체 감지 — 새 세션이면 기존 로그 전체를 baseline(seen)으로 두어 과거 엔트리
        // 폭발을 막고, 이후 append 되는 신규 entry 만 효과 발사되게 한다.
        if session.startedAt != effectSessionStamp {
            effectSessionStamp = session.startedAt
            seenEffectIdx = Set(0..<session.log.count)
            heroFloats.removeAll()
            enemyFloats.removeAll()
            return
        }
        // 미처리 index(=신규 entry)만 정확히 1회 handleLogEntry. off-by-one/커서 무관.
        for i in 0..<session.log.count where !seenEffectIdx.contains(i) {
            seenEffectIdx.insert(i)
            handleLogEntry(session.log[i])
        }
    }

    private func handleLogEntry(_ entry: LogEntry) {
        switch entry {
        case let .boss(monster, floor, _):
            bossBannerData = (monster: monster, floor: floor)
            pausedForBoss = true
            // 보스 등장 — 임팩트 사운드 + 2단 타격 햅틱 (impact+반동, CoreHaptics).
            SoundPlayer.shared.play(.impactShake)
            Haptics.critHit(intensity: 1.0)
        case let .combat(attacker, damage, outcome, _, _, _, _):
            // 공격 플래시 (좌=영웅 공격, 우=적 공격)
            attackFlashSide = attacker == .hero ? .hero : .enemy
            attackFlashTrigger &+= 1
            // 스프라이트 반응 — 공격자 lunge + (명중 시) 피격자 recoil.
            let heroAtk = (attacker == .hero)
            let didHit = (outcome == .hit || outcome == .crit) && damage > 0
            reactCombat(heroIsAttacker: heroAtk, didHit: didHit)
            // 전투 사운드는 매 틱(0.7s) 발화하면 소음이라 crit 에만. 햅틱은 타격 차등.
            switch outcome {
            case .crit:
                critShakeTrigger &+= 1
                SoundPlayer.shared.play(.impactShake)
                // 크리티컬 — 임팩트+반동 2단 transient. 데미지 비례 강도(CoreHaptics),
                // 미지원 기기는 heavy(intensity) 단발로 폴백.
                Haptics.critHit(intensity: min(1.0, 0.55 + Double(damage) / 40.0 * 0.45))
                emitFloat(text: "CRIT!", variant: .critPulse, position: enemyAnchor())
                if damage > 0 {
                    emitDamageFloat(heroIsAttacker: attacker == .hero, damage: damage)
                }
            case .hit:
                if damage > 0 {
                    Haptics.play(.light)
                    emitDamageFloat(heroIsAttacker: attacker == .hero, damage: damage)
                }
            case .dodge:
                Haptics.play(.selection)
                emitFloat(text: "✦", variant: .dodgePulse,
                          position: attacker == .hero ? enemyAnchor() : heroAnchor())
            case .miss:
                emitFloat(text: "MISS", variant: .timeTag,
                          color: Color.textTertiary,
                          position: attacker == .hero ? enemyAnchor() : heroAnchor())
            }
        case let .victory(_, xp, coins, _, _, _):
            // 전투 승리 — 완료 사운드 + 성공 햅틱.
            SoundPlayer.shared.play(.complete)
            Haptics.play(.success)
            if xp > 0 {
                emitFloat(text: "+\(xp) XP", variant: .xp, position: heroAnchor())
            }
            if coins > 0 {
                emitFloat(text: "+\(coins)", variant: .coin, position: heroAnchor())
            }
        case .floor:
            floorSweepTrigger &+= 1
        case let .treasure(coins, _, _, _, _):
            if coins > 0 {
                emitFloat(text: "+\(coins)", variant: .coin, position: heroAnchor())
            }
        case let .choiceResult(text, effectSummary, summaryData, _, _, resultTextKey, resultTextFallback, _):
            // 선택지 결과 — 모달로 표시(tick pause). 2.6s 후 자동 닫힘(웹 autoMs).
            // logText 와 동일하게 resultTextKey 로 인앱 언어 해석(원문 text 는 "> 라벨 →
            // 결과" 한국어 조합이라 그대로 쓰면 전 언어에서 샌다). 요약도 구조화 데이터에서
            // 현지화 재구성(effectSummary 는 한국어 문자열).
            choiceResultText = resultTextKey.map {
                UpHeroNarrative.resolveLog($0, nil, fallback: resultTextFallback ?? text)
            } ?? text
            choiceResultSummary = summaryData.map(Self.localizedEffectSummary) ?? effectSummary
            SoundPlayer.shared.play(.select)
            Haptics.play(.selection)
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) {
                if choiceResultText == text { dismissChoiceResult() }
            }
        default:
            break
        }
    }

    private func emitFloat(text: String, variant: FloatVariant,
                           color: Color? = nil, position: CGPoint) {
        let item = FloatingNumberItem(
            text: text, variant: variant,
            color: color ?? variant.defaultColor,
            position: position
        )
        floatingItems.append(item)
    }

    /// 스프라이트 컬럼 상대 "−N" 데미지 부유 숫자 (웹 enemyDamage/heroDamage 패리티).
    /// 영웅→적: 적 컬럼(enemyFloats), 색=영웅 클래스 테마색. 적→영웅: 영웅 컬럼(heroFloats),
    /// 색=accentSecondary(GB_ENEMY). 곡선은 uphero-heal-float(900ms) = .heal variant.
    private func emitDamageFloat(heroIsAttacker: Bool, damage: Int) {
        let text = "-\(damage)"
        if heroIsAttacker {
            let themed = HeroSprite.themeColor(upHero.state.currentSession?.hero.classType)
            enemyFloats.append(FloatingNumberItem(text: text, variant: .heal,
                                                  color: themed, position: .zero))
        } else {
            heroFloats.append(FloatingNumberItem(text: text, variant: .heal,
                                                 color: Color.accentSecondary, position: .zero))
        }
    }

    /// 영웅 sprite 위치 anchor (대략적). 실제 위치는 GeometryReader 로도 가능하나 단순화.
    private func heroAnchor() -> CGPoint {
        CGPoint(x: 70, y: 170)
    }

    private func enemyAnchor() -> CGPoint {
        CGPoint(x: UIScreen.main.bounds.width - 70, y: 170)
    }
}
