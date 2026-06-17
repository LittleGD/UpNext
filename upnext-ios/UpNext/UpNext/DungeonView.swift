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
    @State private var lastProcessedLogCount: Int = 0
    @State private var floatingItems: [FloatingNumberItem] = []
    /// 보스 배너가 표시 중인 동안엔 tick 일시정지 — 등장 연출 중 다음 round 가 겹치지 않게.
    @State private var pausedForBoss: Bool = false
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
                    .onChange(of: session.log.count) { newCount in
                        processNewLogs(session, oldCount: lastProcessedLogCount, newCount: newCount)
                        lastProcessedLogCount = newCount
                    }
                    .onAppear { lastProcessedLogCount = session.log.count }

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
            }
        }
        .animation(.easeInOut(duration: 0.2), value: bossBannerData != nil)
        .animation(.easeInOut(duration: 0.2), value: choiceResultText != nil)
        .onReceive(tick) { _ in
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
                Button { dismissChoiceResult() } label: {
                    Text("계속")
                        .typography(.body)
                        .foregroundStyle(Color.bgPrimary)
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
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
            footer(session)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                    Text(enemy.name)
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
            HStack(alignment: .firstTextBaseline) {
                Text(Dungeons.all[session.dungeonId]?.name ?? "던전")
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                Spacer()
                Text("\(session.currentFloor)층")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
            }
            statBar("HP", session.hero.hp, session.hero.maxHp, Color.accentPrimary)
            statBar("탐험 시간", session.time, session.maxTime, Color.accentCyan)
            // 클래스 자원 게이지(분노/마나/기 등) — 전직 영웅만. 웹 ClassResourceBar.
            // 스킬 발동에 쓰이는 자원이 보이지 않던 갭(rpg 리뷰) 해소. 표시 전용.
            if let cls = session.hero.classType,
               let spec = UpHeroRules.classResource[cls] {
                statBar(spec.name, session.classResource ?? 0,
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
                    Button { upHero.resolveChoice(i) } label: {
                        Text(option.label)
                            .typography(.body)
                            .foregroundStyle(Color.textPrimary)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 50)
                            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        } else {
            abandonButton
        }
    }

    private var abandonButton: some View {
        Button { upHero.abandonSession() } label: {
            Text("탐험 포기")
                .typography(.body)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .foregroundStyle(Color.textSecondary)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .padding(16)
    }

    // MARK: - 로그 텍스트/색

    private func logText(_ entry: LogEntry) -> String {
        switch entry {
        case let .narrative(text, _, _, _):
            return text
        case let .encounter(monster, _):
            return "\(monster.name) 출현!"
        case let .combat(attacker, damage, outcome, narrative, _, _, _):
            if let narrative, !narrative.isEmpty { return narrative }
            let who = attacker == .hero ? "영웅" : "적"
            switch outcome {
            case .hit:   return "\(who)의 공격 — \(damage) 피해"
            case .crit:  return "\(who)의 치명타! — \(damage) 피해"
            case .dodge: return "\(attacker == .hero ? "적" : "영웅")이 회피"
            case .miss:  return "\(who)의 공격이 빗나갔다"
            }
        case let .victory(monster, xp, coins, _, _, _):
            return "\(monster.name) 처치 — XP +\(xp), 코인 +\(coins)"
        case let .drop(equipment, _):
            return "\(equipment.name) 획득!"
        case let .treasure(coins, description, _, _, _):
            return description.isEmpty ? "보물 발견 — 코인 +\(coins)" : description
        case let .floor(_, to, _):
            return "\(to)층 진입"
        case let .boss(monster, floor, _):
            return "보스 \(monster.name) 등장! (\(floor)층)"
        case let .choice(prompt, _, _, _, _, _, _, _, _, _):
            return prompt
        case let .sessionEnd(reason, detail, _, _, _, _, _):
            return detail ?? sessionEndText(reason)
        case let .skill(_, _, skillName, narrative, _, _, _):
            return narrative.isEmpty ? skillName : narrative
        case let .monsterEffect(_, _, narrative, _, _, _):
            return narrative ?? "몬스터 효과 발동"
        case let .choiceResult(text, _, _, _, _, _, _, _):
            return text
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
        case .bossDefeated:  return "보스 격파 — 탐험 성공"
        case .heroDied:      return "영웅이 쓰러졌다 — 탐험 실패"
        case .timeExpired:   return "탐험 시간 소진"
        case .heroAbandoned: return "캠프로 복귀"
        case .victory:       return "탐험 성공"
        case .defeat:        return "탐험 실패"
        case .abandoned:     return "캠프로 복귀"
        }
    }

    // MARK: - 새 로그 처리 (효과 트리거)

    /// session.log.count 가 바뀔 때 호출. old..<new 범위의 새 엔트리들을 보고 효과 발사.
    private func processNewLogs(_ session: CombatSession, oldCount: Int, newCount: Int) {
        guard newCount > oldCount else { return }
        for i in oldCount..<newCount {
            guard i >= 0 && i < session.log.count else { continue }
            let entry = session.log[i]
            handleLogEntry(entry)
        }
    }

    private func handleLogEntry(_ entry: LogEntry) {
        switch entry {
        case let .boss(monster, floor, _):
            bossBannerData = (monster: monster, floor: floor)
            pausedForBoss = true
            // 보스 등장 — 임팩트 사운드 + 강한 햅틱 (웹 play("impactShake") 패리티).
            SoundPlayer.shared.play(.impactShake)
            Haptics.play(.heavy)
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
                Haptics.play(.heavy)
                emitFloat(text: "CRIT!", variant: .critPulse, position: enemyAnchor())
                if damage > 0 {
                    emitFloat(text: "-\(damage)", variant: .hpRegen,
                              color: Color.accentSecondary,
                              position: attacker == .hero ? enemyAnchor() : heroAnchor())
                }
            case .hit:
                if damage > 0 {
                    Haptics.play(.light)
                    emitFloat(text: "-\(damage)", variant: .hpRegen,
                              color: Color.accentSecondary,
                              position: attacker == .hero ? enemyAnchor() : heroAnchor())
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
        case let .choiceResult(text, effectSummary, _, _, _, _, _, _):
            // 선택지 결과 — 모달로 표시(tick pause). 2.6s 후 자동 닫힘(웹 autoMs).
            choiceResultText = text
            choiceResultSummary = effectSummary
            SoundPlayer.shared.play(.select)
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

    /// 영웅 sprite 위치 anchor (대략적). 실제 위치는 GeometryReader 로도 가능하나 단순화.
    private func heroAnchor() -> CGPoint {
        CGPoint(x: 70, y: 170)
    }

    private func enemyAnchor() -> CGPoint {
        CGPoint(x: UIScreen.main.bounds.width - 70, y: 170)
    }
}
