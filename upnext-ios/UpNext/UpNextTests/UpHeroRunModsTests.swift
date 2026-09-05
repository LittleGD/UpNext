//
//  UpHeroRunModsTests.swift
//  UpNextTests — Phase 4-D (Track D, 피드백 15/35) 런 한정 빌드 회귀 테스트.
//
//  웹 src/lib/upHeroRunMods.test.ts · choiceResultTypes.test.ts 의 1:1 미러.
//  같은 수치 단언 (sessionStats str 12 / agi 22, floorRewardScale 표, revealBoss 층·pct,
//  stealth 로그 모양) + Flavor.json 이 모르는 kind 를 실어도 .nothing 으로 디코드되는
//  관용 계약.
//

import XCTest
@testable import UpNext

final class UpHeroRunModsTests: XCTestCase {

    // MARK: - 픽스처

    private func newSession(_ floor: Int = 1, seed: Int = 1) -> CombatSession {
        var rng = Mulberry32(seed: seed)
        var s = UpHeroSession.createSession(
            dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: floor, rng: &rng)
        // mystery "?" 층이 조우 분기를 가로채지 않게 비운다 (테스트는 일반 층만 본다).
        s.mysteryFloors = []
        return s
    }

    /// 합성 이벤트 하나를 세션에 꽂고 선택 대기 상태로 만든다. 웹 `armChoice`.
    private func armChoice(_ s: CombatSession, _ effects: [ChoiceEffect]) -> CombatSession {
        var out = s
        let idx = out.log.count
        out.log.append(.choice(
            prompt: "synthetic", promptKey: nil, promptParams: nil,
            options: [ChoiceOption(
                label: "go", labelKey: nil, labelParams: nil, effect: nil,
                outcomes: [ChoiceOutcome(weight: 1, resultText: "done", resultTextKey: nil, effects: effects)],
                resultText: nil, resultTextKey: nil)],
            resolvedIndex: nil, variant: nil, timeoutMs: nil, defaultOptionIndex: nil,
            isMystery: nil, timestamp: 0))
        out.status = .awaitingChoice
        out.pendingChoiceIndex = idx
        return out
    }

    private func resolve(_ s: CombatSession, seed: Int = 1) -> CombatSession {
        var rng = Mulberry32(seed: seed)
        return UpHeroSession.resolveChoice(s, optionIndex: 0, rng: &rng)
    }

    private func narratives(_ s: CombatSession, key: String) -> [NarrativeParams?] {
        s.log.compactMap { entry in
            if case let .narrative(_, k, params, _) = entry, k == key { return params }
            return nil
        }
    }

    private func lastResultData(_ s: CombatSession) -> EffectSummaryData? {
        for entry in s.log.reversed() {
            if case let .choiceResult(_, _, data, _, _, _, _, _, _) = entry { return data }
        }
        return nil
    }

    private func hasEntry(_ s: CombatSession, _ pred: (LogEntry) -> Bool) -> Bool {
        s.log.contains(where: pred)
    }

    private func num(_ p: NarrativeParams?, _ key: String) -> Double? {
        if case let .number(n)? = p?[key] { return n }
        return nil
    }
    private func text(_ p: NarrativeParams?, _ key: String) -> String? {
        if case let .text(t)? = p?[key] { return t }
        return nil
    }

    // MARK: - 버프/저주 적립

    func testRunBuffAppendsModAndNarrative() {
        let s = resolve(armChoice(newSession(), [.runBuff(stat: .str, pct: 5, floors: 5)]))
        XCTAssertEqual(s.runStatMods, [RunStatMod(stat: .str, pct: 5, floorsLeft: 5)])
        let narr = narratives(s, key: "uphero.combat.narrative.runBuff")
        XCTAssertEqual(narr.count, 1)
        XCTAssertEqual(text(narr.first ?? nil, "statId"), "str")
        XCTAssertEqual(num(narr.first ?? nil, "pct"), 5)
        XCTAssertEqual(num(narr.first ?? nil, "floors"), 5)
        var expected = EffectSummaryData()
        expected.runMods = [RunStatMod(stat: .str, pct: 5, floorsLeft: 5)]
        XCTAssertEqual(lastResultData(s), expected)
    }

    func testRunScopedBuffUsesRunNarrativeWithoutFloors() {
        let s = resolve(armChoice(newSession(), [.runBuff(stat: .str, pct: 5, floors: nil)]))
        XCTAssertEqual(s.runStatMods, [RunStatMod(stat: .str, pct: 5, floorsLeft: nil)])
        XCTAssertTrue(narratives(s, key: "uphero.combat.narrative.runBuff").isEmpty)
        let narr = narratives(s, key: "uphero.combat.narrative.runBuffRun")
        XCTAssertEqual(narr.count, 1)
        XCTAssertNil(num(narr.first ?? nil, "floors"))
        XCTAssertEqual(num(narr.first ?? nil, "pct"), 5)
        XCTAssertEqual(text(narr.first ?? nil, "statId"), "str")
    }

    func testRunCurseStoresNegativePct() {
        let s = resolve(armChoice(newSession(), [.runCurse(stat: .agi, pct: 5, floors: nil)]))
        XCTAssertEqual(s.runStatMods, [RunStatMod(stat: .agi, pct: -5, floorsLeft: nil)])
        XCTAssertEqual(narratives(s, key: "uphero.combat.narrative.runCurseRun").count, 1)
        var expected = EffectSummaryData()
        expected.runMods = [RunStatMod(stat: .agi, pct: -5, floorsLeft: nil)]
        XCTAssertEqual(lastResultData(s), expected)
    }

    func testRunModsCapDropsOldest() {
        var cur = newSession()
        for i in 1...(UpHeroCombat.RunMods.statModsCap + 1) {
            cur = resolve(armChoice(cur, [.runBuff(stat: .str, pct: i, floors: 9)]))
        }
        XCTAssertEqual(cur.runStatMods?.count, UpHeroCombat.RunMods.statModsCap)
        XCTAssertEqual(cur.runStatMods?.first?.pct, 2)
        XCTAssertEqual(cur.runStatMods?.last?.pct, UpHeroCombat.RunMods.statModsCap + 1)
    }

    // MARK: - sessionStats 2단 반올림

    func testSessionStatsStacksAfterCombatBuffWithClamp() {
        var s = newSession()
        s.hero.baseStats.str = 20
        s.hero.baseStats.agi = 10
        s.hero.baseStats.crit = 7
        s.combatBuff = CombatBuff(pct: 10, battlesLeft: 3)
        s.runStatMods = [
            RunStatMod(stat: .str, pct: 5, floorsLeft: nil),
            RunStatMod(stat: .all, pct: -50, floorsLeft: nil),
            RunStatMod(stat: .agi, pct: 200, floorsLeft: nil),
        ]
        XCTAssertEqual(UpHeroSession.runStatPct(s, .str), -45)
        XCTAssertEqual(UpHeroSession.runStatPct(s, .agi), 100)
        XCTAssertEqual(UpHeroSession.runStatPct(s, .int), -50)
        let st = UpHeroSession.sessionStats(s)
        // round(20 × 1.1) = 22 → round(22 × 0.55) = 12
        XCTAssertEqual(st.str, 12)
        // round(10 × 1.1) = 11 → +100% clamp → 22
        XCTAssertEqual(st.agi, 22)
        XCTAssertEqual(st.crit, 7)
        XCTAssertEqual(st.slotBonus, 0)
    }

    func testSessionStatsWithoutModsUnchanged() {
        var s = newSession()
        s.combatBuff = CombatBuff(pct: 10, battlesLeft: 1)
        XCTAssertEqual(UpHeroSession.sessionStats(s).str, 11)
        s.runStatMods = []
        XCTAssertEqual(UpHeroSession.sessionStats(s).str, 11)
    }

    // MARK: - advanceRunModFloors

    func testTickFloorTransitionExpiresFloorScopedMod() {
        var s = newSession()
        s.log.append(.narrative(text: "x", narrativeKey: nil, narrativeParams: nil, timestamp: 0))
        s.runStatMods = [
            RunStatMod(stat: .str, pct: 5, floorsLeft: 1),
            RunStatMod(stat: .int, pct: 5, floorsLeft: nil),
        ]
        var rng = Mulberry32(seed: 3)
        let next = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        XCTAssertEqual(next.currentFloor, 2)
        XCTAssertEqual(next.runStatMods, [RunStatMod(stat: .int, pct: 5, floorsLeft: nil)])
    }

    func testSkipFloorsAdvancesByMovedOnly() {
        var s = newSession()
        s.runStatMods = [RunStatMod(stat: .str, pct: 5, floorsLeft: 3)]
        let moved = resolve(armChoice(s, [.skipFloors(count: 2)]))
        XCTAssertEqual(moved.currentFloor, 3)
        XCTAssertEqual(moved.runStatMods, [RunStatMod(stat: .str, pct: 5, floorsLeft: 1)])

        var atNine = newSession(9)
        atNine.runStatMods = [RunStatMod(stat: .str, pct: 5, floorsLeft: 3)]
        let blocked = resolve(armChoice(atNine, [.skipFloors(count: 3)]))
        XCTAssertEqual(blocked.currentFloor, 9)
        XCTAssertEqual(blocked.runStatMods, [RunStatMod(stat: .str, pct: 5, floorsLeft: 3)])
    }

    func testAllExpiredClearsField() {
        var s = newSession()
        s.runStatMods = [RunStatMod(stat: .str, pct: 5, floorsLeft: 2)]
        UpHeroSession.advanceRunModFloors(&s, 2)
        XCTAssertNil(s.runStatMods)
    }

    // MARK: - stealth

    /// 은신 없이 조우가 나오는 첫 시드. 웹 `findEncounterSeed`.
    private func findEncounterSeed() -> Int? {
        for seed in 1...200 {
            var rng = Mulberry32(seed: seed)
            let out = UpHeroSession.tickSession(newSession(2), flavor: FlavorPool.bundled, rng: &rng)
            if case .encounter = out.log.last { return seed }
        }
        return nil
    }

    func testStealthPassesEncounterWithSameRng() throws {
        let seed = try XCTUnwrap(findEncounterSeed())
        var rngA = Mulberry32(seed: seed)
        let plain = UpHeroSession.tickSession(newSession(2), flavor: FlavorPool.bundled, rng: &rngA)
        guard case let .encounter(monster, _)? = plain.log.last else { return XCTFail("encounter 없음") }

        var stealthy = newSession(2)
        stealthy.runStealthLeft = 1
        var rngB = Mulberry32(seed: seed)
        let out = UpHeroSession.tickSession(stealthy, flavor: FlavorPool.bundled, rng: &rngB)
        guard case .narrative = out.log.last else { return XCTFail("stealthPass 서사가 마지막이 아님") }
        let pass = narratives(out, key: "uphero.combat.narrative.stealthPass")
        XCTAssertEqual(pass.count, 1)
        // 같은 rng 소비 → 같은 몬스터가 "지나친 몬스터" 로 기록된다.
        XCTAssertEqual(text(pass.first ?? nil, "monster"), monster.name)
        XCTAssertFalse(hasEntry(out) { if case .encounter = $0 { return true }; return false })
        XCTAssertEqual(out.time, plain.time + 1)
        XCTAssertNil(out.runStealthLeft)
    }

    func testBossFloorIsNeverStealthed() {
        var s = newSession(9)
        s.log.append(.narrative(text: "x", narrativeKey: nil, narrativeParams: nil, timestamp: 0))
        s.runStealthLeft = 1
        var rng = Mulberry32(seed: 5)
        let out = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        guard case .boss = out.log.last else { return XCTFail("boss 엔트리가 아님") }
        XCTAssertEqual(out.runStealthLeft, 1)
    }

    func testStealthCapsAtThree() {
        let s = resolve(armChoice(newSession(), [.stealth(encounters: 2)]))
        XCTAssertEqual(s.runStealthLeft, 2)
        let more = resolve(armChoice(s, [.stealth(encounters: 2)]))
        XCTAssertEqual(more.runStealthLeft, UpHeroCombat.RunMods.stealthCap)
    }

    // MARK: - guaranteedDrop

    private func killSession(_ floor: Int) -> CombatSession {
        var s = newSession(floor)
        var rng = Mulberry32(seed: 99)
        let monster = MonsterPool.createMonsterForFloor(dungeonId: .fitness, floor: floor, isBoss: false, rng: &rng)
        s.log.append(.encounter(monster: monster, timestamp: 0))
        s.log.append(.combat(attacker: .hero, damage: monster.hp, outcome: .hit,
                             narrative: nil, narrativeKey: nil, narrativeParams: nil, timestamp: 0))
        return s
    }

    private func dropCount(_ s: CombatSession) -> Int {
        s.log.filter { if case .drop = $0 { return true }; return false }.count
    }

    func testGuaranteedDropForcesDropAndDecrements() throws {
        var seed = 0
        for cand in 1...200 {
            var rng = Mulberry32(seed: cand)
            let out = UpHeroSession.tickSession(killSession(5), flavor: FlavorPool.bundled, rng: &rng)
            if dropCount(out) == 0 { seed = cand; break }
        }
        XCTAssertGreaterThan(seed, 0)

        var forced = killSession(5)
        forced.runGuaranteedDrops = 2
        var rngA = Mulberry32(seed: seed)
        let out = UpHeroSession.tickSession(forced, flavor: FlavorPool.bundled, rng: &rngA)
        XCTAssertEqual(dropCount(out), 1)
        XCTAssertEqual(out.rewards.drops.count, 1)
        XCTAssertEqual(out.runGuaranteedDrops, 1)

        var lastOne = killSession(5)
        lastOne.runGuaranteedDrops = 1
        var rngB = Mulberry32(seed: seed)
        let done = UpHeroSession.tickSession(lastOne, flavor: FlavorPool.bundled, rng: &rngB)
        XCTAssertEqual(dropCount(done), 1)
        XCTAssertNil(done.runGuaranteedDrops)
    }

    func testGuaranteedDropCapsAtTwo() {
        let s = resolve(armChoice(newSession(), [.guaranteedDrop(count: nil), .guaranteedDrop(count: 3)]))
        XCTAssertEqual(s.runGuaranteedDrops, UpHeroCombat.RunMods.guaranteedDropCap)
        var expected = EffectSummaryData()
        expected.guaranteedDrop = 4
        XCTAssertEqual(lastResultData(s), expected)
    }

    // MARK: - revealBoss

    func testRevealBossAtF12NamesF20BossAndAddsPct() {
        let s = resolve(armChoice(newSession(12), [.revealBoss]))
        let narr = narratives(s, key: "uphero.combat.narrative.revealBossTrait.shield")
        XCTAssertEqual(narr.count, 1)
        XCTAssertEqual(num(narr.first ?? nil, "floor"), 20)
        XCTAssertEqual(text(narr.first ?? nil, "monsterTemplateId"), "boss_stone_golem")
        XCTAssertEqual(num(narr.first ?? nil, "pct"), 5)
        XCTAssertEqual(s.runBossDmgPct, 5)
        var expected = EffectSummaryData()
        expected.bossDmgPct = 5
        XCTAssertEqual(lastResultData(s), expected)
    }

    func testRevealBossCapsAtFifteen() {
        var s = newSession(12)
        for _ in 0..<4 { s = resolve(armChoice(s, [.revealBoss])) }
        XCTAssertEqual(s.runBossDmgPct, UpHeroCombat.RunMods.bossDmgCap)
    }

    func testRevealBossAtF30NamesF40Boss() {
        let s = resolve(armChoice(newSession(30), [.revealBoss]))
        let narr = narratives(s, key: "uphero.combat.narrative.revealBossTrait.burst")
        XCTAssertEqual(narr.count, 1)
        XCTAssertEqual(num(narr.first ?? nil, "floor"), 40)
        XCTAssertEqual(text(narr.first ?? nil, "monsterTemplateId"), "boss_mountain_wolf")
        XCTAssertTrue(narratives(s, key: "uphero.combat.narrative.revealBossNone").isEmpty)
    }

    // MARK: - 보스 피해 %

    private func bossFight(pct: Int? = nil) -> CombatSession {
        var s = newSession(10)
        var rng = Mulberry32(seed: 99)
        let boss = MonsterPool.createMonsterForFloor(dungeonId: .fitness, floor: 10, isBoss: true, rng: &rng)
        s.log.append(.encounter(monster: boss, timestamp: 0))
        // 보스층 시작은 배너 연출로 paused 다 (Track C) — 전투 라운드를 보려면 재개.
        s.status = .active
        s.runBossDmgPct = pct
        return s
    }

    private func heroHit(_ s: CombatSession) -> Int? {
        for entry in s.log {
            if case let .combat(attacker, damage, _, _, _, _, _) = entry, attacker == .hero { return damage }
        }
        return nil
    }

    func testBossDamagePctScalesHeroHit() {
        var seed = 0, baseDmg = 0
        for cand in 1...100 {
            var rng = Mulberry32(seed: cand)
            if let d = heroHit(UpHeroSession.tickSession(bossFight(), flavor: FlavorPool.bundled, rng: &rng)), d > 0 {
                seed = cand; baseDmg = d; break
            }
        }
        XCTAssertGreaterThan(seed, 0)
        var rng = Mulberry32(seed: seed)
        let boosted = heroHit(UpHeroSession.tickSession(bossFight(pct: 15), flavor: FlavorPool.bundled, rng: &rng))
        XCTAssertEqual(boosted, UpHeroCombat.jsRound(Double(baseDmg) * 1.15))
    }

    func testBossDamagePctIgnoresNormalMonsters() {
        func build(_ pct: Int?) -> CombatSession {
            var s = newSession(5)
            var rng = Mulberry32(seed: 99)
            let m = MonsterPool.createMonsterForFloor(dungeonId: .fitness, floor: 5, isBoss: false, rng: &rng)
            s.log.append(.encounter(monster: m, timestamp: 0))
            // encounter 직후 일반몹은 선택지가 끼므로 combat 엔트리 하나를 넣어 전투 계속 상태로.
            s.log.append(.combat(attacker: .enemy, damage: 0, outcome: .miss,
                                 narrative: nil, narrativeKey: nil, narrativeParams: nil, timestamp: 0))
            s.runBossDmgPct = pct
            return s
        }
        var rngA = Mulberry32(seed: 7)
        let plain = heroHit(UpHeroSession.tickSession(build(nil), flavor: FlavorPool.bundled, rng: &rngA))
        var rngB = Mulberry32(seed: 7)
        let boosted = heroHit(UpHeroSession.tickSession(build(15), flavor: FlavorPool.bundled, rng: &rngB))
        XCTAssertEqual(boosted, plain)
    }

    // MARK: - summarize / scale

    func testSummarizeEffectsDataNewFields() {
        let d = UpHeroCombat.summarizeEffectsData([
            .runBuff(stat: .str, pct: 5, floors: 5),
            .runCurse(stat: .agi, pct: 5, floors: 3),
            .stealth(encounters: 1),
            .guaranteedDrop(count: nil),
            .revealBoss,
            .skipFloors(count: 2),
        ])
        var expected = EffectSummaryData()
        expected.skipFloors = 2
        expected.runMods = [RunStatMod(stat: .str, pct: 5, floorsLeft: 5),
                            RunStatMod(stat: .agi, pct: -5, floorsLeft: 3)]
        expected.stealth = 1
        expected.guaranteedDrop = 1
        expected.bossDmgPct = 5
        XCTAssertEqual(d, expected)
        var xpOnly = EffectSummaryData()
        xpOnly.xp = 10
        XCTAssertEqual(UpHeroCombat.summarizeEffectsData([.reward(coins: nil, xp: 10, dropEquipmentId: nil)]), xpOnly)
        XCTAssertEqual(UpHeroCombat.summarizeEffects([.runCurse(stat: .all, pct: 10, floors: 5)]), "전 능력치 -10%")
    }

    func testFloorRewardScaleTable() {
        func t(_ f: Int, _ ng: Int = 0) -> [Int] {
            let r = UpHeroCombat.floorRewardScale(floor: f, ngPlusLevel: ng)
            return [r.coins, r.xp]
        }
        XCTAssertEqual(t(1), [13, 26])
        XCTAssertEqual(t(5), [34, 50])
        XCTAssertEqual(t(10), [60, 80])
        XCTAssertEqual(t(15), [66, 110])
        XCTAssertEqual(t(20), [86, 140])
        XCTAssertEqual(t(25), [106, 170])
        XCTAssertEqual(t(30), [126, 200])
        XCTAssertEqual(t(30, 1), [176, 280])
        XCTAssertEqual(t(200), t(120))
        XCTAssertEqual(t(0), t(1))
        let m = UpHeroCombat.choiceRewardMult(floor: 1)
        XCTAssertEqual(m.coin, 1)
        XCTAssertEqual(m.xp, 26.0 / 15.0, accuracy: 1e-12)
    }

    func testScaleChoiceEffectsForFloor() {
        let effects: [ChoiceEffect] = [
            .reward(coins: 35, xp: 15, dropEquipmentId: nil),
            .damage(amount: 15),
            .heal(amount: 20),
            .time(delta: -3),
            .spinSlot(cost: 30),
            .fight,
            .flee(successChance: 0.5),
            .runBuff(stat: .str, pct: 5, floors: 5),
        ]
        XCTAssertEqual(UpHeroCombat.scaleChoiceEffectsForFloor(effects, floor: 20, heroMaxHp: 388), [
            .reward(coins: 60, xp: 140, dropEquipmentId: nil),
            .damage(amount: 58),
            .heal(amount: 78),
            .time(delta: -3),
            .spinSlot(cost: 30),
            .fight,
            .flee(successChance: 0.5),
            .runBuff(stat: .str, pct: 5, floors: 5),
        ])
        XCTAssertEqual(UpHeroCombat.scaleChoiceEffectsForFloor(Array(effects.prefix(2)), floor: 1, heroMaxHp: 100), [
            .reward(coins: 35, xp: 26, dropEquipmentId: nil),
            .damage(amount: 15),
        ])
        let xpOnlyEffects: [ChoiceEffect] = [.reward(coins: nil, xp: 15, dropEquipmentId: nil)]
        XCTAssertEqual(
            UpHeroCombat.scaleChoiceEffectsForFloor(xpOnlyEffects, floor: 10, heroMaxHp: 100),
            [.reward(coins: nil, xp: 80, dropEquipmentId: nil)])
        // SimpleChoiceEffect 오버로드 (resolveMinigame 경로) 도 같은 식.
        let simple: [SimpleChoiceEffect] = [.reward(coins: 35, xp: 15, dropEquipmentId: nil), .damage(amount: 15)]
        XCTAssertEqual(
            UpHeroCombat.scaleChoiceEffectsForFloor(simple, floor: 20, heroMaxHp: 388),
            [.reward(coins: 60, xp: 140, dropEquipmentId: nil), .damage(amount: 58)])
    }

    func testResolveChoiceScalesRewardAtF20() {
        let s = newSession(20)
        let before = s.rewards.xp
        let out = resolve(armChoice(s, [.reward(coins: nil, xp: 15, dropEquipmentId: nil)]))
        var expected = EffectSummaryData()
        expected.xp = 140
        XCTAssertEqual(lastResultData(out), expected)
        XCTAssertEqual(out.rewards.xp - before, 140)
    }

    // MARK: - 관용 디코드

    func testUnknownEffectKindDecodesToNothing() throws {
        let json = Data(#"[{"kind":"someFutureKind","foo":1},{"kind":"stealth","encounters":2},{"kind":"runCurse","stat":"all","pct":10,"floors":5},{"kind":"guaranteedDrop"}]"#.utf8)
        ChoiceEffectDecoding.tolerateUnknownKinds = true
        defer { ChoiceEffectDecoding.tolerateUnknownKinds = false }
        let effects = try JSONDecoder().decode([ChoiceEffect].self, from: json)
        XCTAssertEqual(effects, [
            .nothing,
            .stealth(encounters: 2),
            .runCurse(stat: .all, pct: 10, floors: 5),
            .guaranteedDrop(count: nil),
        ])
        let simple = try JSONDecoder().decode([SimpleChoiceEffect].self, from: json)
        XCTAssertEqual(simple, [
            .nothing,
            .stealth(encounters: 2),
            .runCurse(stat: .all, pct: 10, floors: 5),
            .guaranteedDrop(count: nil),
        ])
    }

    /// 번들 Flavor.json 이 새 kind 를 실제로 싣고 있고 앱 빌드가 그것을 디코드한다.
    func testBundledFlavorCarriesRunEffects() {
        var kinds = Set<String>()
        func visit(_ e: ChoiceEffect) {
            switch e {
            case .runBuff: kinds.insert("runBuff")
            case .runCurse: kinds.insert("runCurse")
            case .stealth: kinds.insert("stealth")
            default: break
            }
        }
        let pools = FlavorPool.bundled.eventPool.values.flatMap { $0 }
            + FlavorPool.bundled.universalEvents + FlavorPool.bundled.mysteryEvents
        for ev in pools {
            for opt in ev.options {
                if let e = opt.effect { visit(e) }
                for o in opt.outcomes ?? [] { o.effects.forEach(visit) }
            }
        }
        XCTAssertEqual(kinds, ["runBuff", "runCurse", "stealth"])
    }

    // MARK: - 톤/모티프 (웹 choiceResultTypes.test.ts)

    private func data(_ mut: (inout EffectSummaryData) -> Void) -> EffectSummaryData {
        var d = EffectSummaryData()
        mut(&d)
        return d
    }

    func testToneAndMotifForRunEffects() {
        let curse = data { $0.runMods = [RunStatMod(stat: .agi, pct: -5, floorsLeft: 3)] }
        XCTAssertEqual(ChoiceResultTypes.deriveTone(curse), .bane)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(curse), .curse)
        XCTAssertEqual(ChoiceResultTypes.icon(motif: .curse, tone: .bane), .moon)

        let buff = data { $0.runMods = [RunStatMod(stat: .str, pct: 5, floorsLeft: 5)] }
        XCTAssertEqual(ChoiceResultTypes.deriveTone(buff), .boon)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(buff), .buff)

        let gear = data {
            $0.guaranteedDrop = 1
            $0.runMods = [RunStatMod(stat: .all, pct: -10, floorsLeft: 5)]
        }
        XCTAssertEqual(ChoiceResultTypes.deriveTone(gear), .boon)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(gear), .gear)

        let stealth = data { $0.stealth = 1 }
        XCTAssertEqual(ChoiceResultTypes.deriveTone(stealth), .boon)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(stealth), .stealth)
        XCTAssertEqual(ChoiceResultTypes.icon(motif: .stealth, tone: .boon), .eye)

        let skip = data { $0.skipFloors = 2 }
        XCTAssertEqual(ChoiceResultTypes.deriveTone(skip), .boon)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(skip), .skip)

        let reveal = data { $0.bossDmgPct = 5 }
        XCTAssertEqual(ChoiceResultTypes.deriveTone(reveal), .boon)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(reveal), .buff)

        // 시간 -10 + 은신 1 (긴 우회) 은 이득, 시간 -2 + 저주 (급한 통과) 는 손해.
        XCTAssertEqual(ChoiceResultTypes.deriveTone(data { $0.timeDelta = -10; $0.stealth = 1 }), .boon)
        XCTAssertEqual(ChoiceResultTypes.deriveTone(data {
            $0.timeDelta = -2
            $0.runMods = [RunStatMod(stat: .dex, pct: -5, floorsLeft: 3)]
        }), .bane)

        // 기존 수치 경로는 그대로.
        XCTAssertEqual(ChoiceResultTypes.deriveTone(data { $0.damage = 10 }), .bane)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(data { $0.damage = 10 }), .damage)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(data { $0.coins = 30 }), .coin)
        XCTAssertEqual(ChoiceResultTypes.deriveTone(nil), .neutral)
        XCTAssertEqual(ChoiceResultTypes.deriveMotif(nil), .generic)
    }

    /// 효과마다 칩 하나 — 순서와 개수 (문자열은 인앱 언어 카탈로그라 언어별로 다르다).
    func testChipsOnePerEffect() {
        let d = data {
            $0.xp = 26
            $0.skipFloors = 2
            $0.runMods = [
                RunStatMod(stat: .str, pct: 5, floorsLeft: 5),
                RunStatMod(stat: .agi, pct: -5, floorsLeft: nil),
                RunStatMod(stat: .all, pct: 3, floorsLeft: 5),
            ]
            $0.stealth = 1
            $0.guaranteedDrop = 1
            $0.bossDmgPct = 5
        }
        let chips = ChoiceResultTypes.chips(d)
        XCTAssertEqual(chips.count, 8)
        XCTAssertTrue(chips[0].contains("26"))
        XCTAssertTrue(chips[1].contains("2"))
        XCTAssertTrue(chips[2].contains("5%") && chips[2].contains("+"))
        XCTAssertTrue(chips[3].contains("5%") && chips[3].contains("-"))
        XCTAssertTrue(chips[4].contains("3%"))
        XCTAssertTrue(chips[7].contains("5%"))
        // 스트립 합성 — 넷 다 비면 nil.
        XCTAssertNil(ChoiceResultTypes.runStateSummary(newSession()))
        var s = newSession()
        s.runStealthLeft = 2
        XCTAssertEqual(ChoiceResultTypes.runStateSummary(s), data { $0.stealth = 2 })
    }
}
