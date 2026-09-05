//
//  UpHeroSessionLoopTests.swift
//  UpNextTests — Phase 16 (Track C) 던전 코어 루프 회귀 테스트.
//
//  웹 src/lib/upHeroSessionLoop.test.ts · sessionReward.test.ts · upHeroMonsters.test.ts
//  의 1:1 미러. 같은 Mulberry32 시드 (4242) 로 같은 단언을 한다.
//  피드백 14 (미니게임 안 뜸) / 19·26·31 (보스 스킵) / 28 (F30 이후 보스 없음) /
//  16 (regen 무적) / 30 (주간 보상) / 33 (밸런스 픽스처 + 기준 영웅 시뮬).
//

import XCTest
@testable import UpNext

final class UpHeroSessionLoopTests: XCTestCase {

    private static let defaultSeed = 4242

    /// 웹 `rollEnemyOutcome` miss 하한 테스트의 `vi.spyOn(Math.random)` 대응 — 상수 롤.
    private struct ConstRandom: RandomSource {
        let value: Double
        mutating func unit() -> Double { value }
    }

    // MARK: - 픽스처

    /// 전투가 시험 대상이 아닐 때는 죽지 않는 영웅을 쓴다. 웹 `strongHero`.
    private func strongHero(level: Int = 30) -> Hero {
        var h = UpHeroRules.computeHeroForLevel(UpHeroRules.createDefaultHero(), level: level)
        h.baseStats.str = 200
        h.baseStats.vit = 200
        h.hp = 5000
        h.maxHp = 5000
        return h
    }

    private func sessionAt(_ dungeonId: DungeonId, _ floor: Int, seed: Int = defaultSeed) -> CombatSession {
        var rng = Mulberry32(seed: seed)
        return UpHeroSession.createSession(
            dungeonId: dungeonId, hero: strongHero(), startFloor: floor,
            activeBuffs: nil, options: CreateSessionOptions(heroLevel: 30), rng: &rng)
    }

    /// choice 엔트리를 꽂고 대기 상태로 만든다. 웹 `armChoice`.
    private func armChoice(_ s: CombatSession, _ effect: ChoiceEffect) -> CombatSession {
        var out = s
        let idx = out.log.count
        out.log.append(.choice(
            prompt: "시험용 선택지", promptKey: nil, promptParams: nil,
            options: [ChoiceOption(label: "고른다", labelKey: nil, labelParams: nil,
                                   effect: effect, outcomes: nil,
                                   resultText: "골랐다", resultTextKey: nil)],
            resolvedIndex: nil, variant: nil, timeoutMs: nil, defaultOptionIndex: nil,
            isMystery: nil, timestamp: 0))
        out.status = .awaitingChoice
        out.pendingChoiceIndex = idx
        return out
    }

    private func bossIndexFor(_ floor: Int) -> Int { ((floor / 10 - 1) % 3 + 3) % 3 }

    private func lastBoss(_ s: CombatSession) -> (monster: Monster, floor: Int)? {
        if let last = s.log.last, case let .boss(m, f, _) = last { return (m, f) }
        return nil
    }

    private func hasVictoryBoss(_ s: CombatSession) -> Bool {
        s.log.contains {
            if case let .victory(m, _, _, _, _, _) = $0 { return m.isBoss == true }
            return false
        }
    }

    private func floorEntryCount(_ s: CombatSession) -> Int {
        s.log.filter { if case .floor = $0 { return true }; return false }.count
    }

    private func template(_ id: String) -> MonsterTemplate {
        MonsterPool.allTemplates.first { $0.id == id }!
    }

    // MARK: - 보스 케이던스 헬퍼

    func testIsBossFloorEveryTenNoCap() {
        XCTAssertFalse(UpHeroCombat.isBossFloor(0))
        XCTAssertFalse(UpHeroCombat.isBossFloor(9))
        for f in [10, 20, 30, 40, 60, 90, 120, 1000] { XCTAssertTrue(UpHeroCombat.isBossFloor(f), "F\(f)") }
        XCTAssertFalse(UpHeroCombat.isBossFloor(31))
    }

    func testNextBossFloorAfter() {
        XCTAssertEqual(UpHeroCombat.nextBossFloorAfter(1), 10)
        XCTAssertEqual(UpHeroCombat.nextBossFloorAfter(9), 10)
        XCTAssertEqual(UpHeroCombat.nextBossFloorAfter(10), 20)
        XCTAssertEqual(UpHeroCombat.nextBossFloorAfter(30), 40)
        XCTAssertEqual(UpHeroCombat.nextBossFloorAfter(35), 40)
        XCTAssertEqual(UpHeroCombat.nextBossFloorAfter(99), 100)
    }

    // MARK: - 미니게임 진입 / 해소 (피드백 14)

    private let minigameEffect: ChoiceEffect = .startMinigame(
        minigame: .quickSum, difficulty: 2,
        successEffects: [.reward(coins: nil, xp: 30, dropEquipmentId: nil)],
        failEffects: [.damage(amount: 10)])

    func testResolveChoiceKeepsAwaitingMinigame() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let before = armChoice(sessionAt(.learning, 5), minigameEffect)
        let timeBefore = before.time
        let s = UpHeroSession.resolveChoice(before, optionIndex: 0, rng: &rng)
        XCTAssertEqual(s.status, .awaitingMinigame)
        XCTAssertEqual(s.pendingMinigame?.minigame, .quickSum)
        // F5 → floor boost 0 → 난이도 그대로 2.
        XCTAssertEqual(s.pendingMinigame?.difficulty, 2)
        XCTAssertNil(s.pendingChoiceIndex)
        // choice 해소 시간 (TimeCost.choice = 1) 은 그대로 빠진다.
        XCTAssertEqual(s.time, timeBefore - 1)
    }

    func testResolveMinigameSuccessRewardsAndReturnsActive() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let armed = UpHeroSession.resolveChoice(
            armChoice(sessionAt(.learning, 5), minigameEffect), optionIndex: 0, rng: &rng)
        let xpBefore = armed.rewards.xp
        let s = UpHeroSession.resolveMinigame(armed, success: true, rng: &rng)
        // Phase 4-D (Track D) — 미니게임 보상도 층 기준으로 스케일된다 (F5: xp ×50/15). 웹 동일.
        guard case let .startMinigame(_, _, successEffects, _) = minigameEffect else { return XCTFail() }
        let scaled = UpHeroCombat.scaleChoiceEffectsForFloor(
            successEffects, floor: armed.currentFloor, heroMaxHp: armed.hero.maxHp,
            ngPlusLevel: armed.ngPlusLevel ?? 0)
        XCTAssertEqual(scaled, [.reward(coins: nil, xp: 100, dropEquipmentId: nil)])
        XCTAssertEqual(s.rewards.xp, xpBefore + 100)
        XCTAssertEqual(s.status, .active)
        XCTAssertNil(s.pendingMinigame)
        if case let .choiceResult(_, _, _, actionLabelKey, _, _, _, _, _)? = s.log.last {
            XCTAssertEqual(actionLabelKey, "uphero.combat.minigame.success")
        } else {
            XCTFail("choiceResult 가 마지막 엔트리여야 한다")
        }
    }

    func testResolveMinigameFailAppliesPenalty() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let armed = UpHeroSession.resolveChoice(
            armChoice(sessionAt(.learning, 5), minigameEffect), optionIndex: 0, rng: &rng)
        let hpBefore = armed.hero.hp
        let s = UpHeroSession.resolveMinigame(armed, success: false, rng: &rng)
        // Phase 4-D (Track D) — 피해는 maxHp/100 배 (Lv1 기준 비율 보존). 웹 동일.
        let expectedDamage = UpHeroCombat.jsRound(10 * max(1, Double(armed.hero.maxHp) / 100))
        XCTAssertGreaterThan(expectedDamage, 10)
        XCTAssertEqual(s.hero.hp, hpBefore - expectedDamage)
        XCTAssertEqual(s.status, .active)
    }

    func testPlainChoiceStillReturnsActive() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let s = UpHeroSession.resolveChoice(
            armChoice(sessionAt(.learning, 5), .reward(coins: nil, xp: 5, dropEquipmentId: nil)),
            optionIndex: 0, rng: &rng)
        XCTAssertEqual(s.status, .active)
        XCTAssertNil(s.pendingChoiceIndex)
    }

    func testTickDoesNothingWhileAwaitingMinigame() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let armed = UpHeroSession.resolveChoice(
            armChoice(sessionAt(.learning, 5), minigameEffect), optionIndex: 0, rng: &rng)
        let ticked = UpHeroSession.tickSession(armed, flavor: FlavorPool.bundled, rng: &rng)
        XCTAssertEqual(ticked, armed)
    }

    // MARK: - 시작층이 보스층이면 createSession 이 보스를 스폰 (피드백 19)

    func testCreateSessionSpawnsBossAtBossStartFloor() {
        for startFloor in [10, 20, 30, 40] {
            let s = sessionAt(.fitness, startFloor)
            guard let boss = lastBoss(s) else { return XCTFail("F\(startFloor): boss 엔트리 없음") }
            XCTAssertEqual(boss.floor, startFloor)
            XCTAssertEqual(s.status, .paused)
            XCTAssertEqual(boss.monster.templateId, Dungeons.all[.fitness]!.bossIds[bossIndexFor(startFloor)])
            XCTAssertEqual(boss.monster.level, startFloor)
        }
    }

    func testCreateSessionAtFloor11HasNoBoss() {
        let s = sessionAt(.fitness, 11)
        XCTAssertFalse(s.log.contains { if case .boss = $0 { return true }; return false })
        XCTAssertEqual(s.status, .active)
    }

    func testWeeklyStartFloor30UsesSamePath() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let s = UpHeroSession.createSession(
            dungeonId: .fitness, hero: strongHero(), startFloor: 30, activeBuffs: nil,
            options: CreateSessionOptions(isWeeklyVariant: true, heroLevel: 30), rng: &rng)
        XCTAssertEqual(lastBoss(s)?.floor, 30)
        XCTAssertEqual(s.status, .paused)
    }

    // MARK: - 층 전환 시 보스 스폰 — 10층마다 영원히 (피드백 28)

    private func withVictoryAt(_ dungeonId: DungeonId, _ floor: Int, rng: inout Mulberry32) -> CombatSession {
        var s = sessionAt(dungeonId, floor)
        let monster = MonsterPool.createMonsterForFloor(dungeonId: dungeonId, floor: floor, isBoss: false, rng: &rng)
        s.log.append(.victory(monster: monster, xp: 0, coins: 0, narrativeKey: nil, narrativeParams: nil, timestamp: 0))
        // 시작층이 보스층이면 createSession 이 paused 로 두므로 명시적으로 재개.
        s.status = .active
        return s
    }

    func testFloorAdvanceSpawnsBossWithCycledTemplate() {
        for (from, idx) in [(9, 0), (19, 1), (39, 0), (59, 2), (89, 2)] {
            var rng = Mulberry32(seed: Self.defaultSeed)
            let s = UpHeroSession.tickSession(withVictoryAt(.learning, from, rng: &rng), flavor: FlavorPool.bundled, rng: &rng)
            if case let .floor(f, t, _) = s.log[s.log.count - 2] {
                XCTAssertEqual(f, from); XCTAssertEqual(t, from + 1)
            } else {
                XCTFail("F\(from): floor 엔트리가 마지막 직전이어야 한다")
            }
            XCTAssertEqual(s.currentFloor, from + 1)
            guard let boss = lastBoss(s) else { return XCTFail("F\(from): boss 엔트리 없음") }
            XCTAssertEqual(boss.floor, from + 1)
            XCTAssertEqual(boss.monster.templateId, Dungeons.all[.learning]!.bossIds[idx])
            XCTAssertEqual(s.status, .paused)
        }
    }

    func testFloor30AdvancesTo31WithoutBoss() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let s = UpHeroSession.tickSession(withVictoryAt(.learning, 30, rng: &rng), flavor: FlavorPool.bundled, rng: &rng)
        XCTAssertEqual(s.currentFloor, 31)
        if case .floor = s.log.last! {} else { XCTFail("마지막 엔트리는 floor") }
        XCTAssertEqual(s.status, .active)
    }

    // MARK: - 보스 처치 후 종료 조건 — F30 만 최종 (피드백 28)

    /// 보스 encounter 를 열고 영웅 공격 엔트리로 HP 를 0 까지 깎아 둔다. 웹 `bossAtZeroHp`.
    private func bossAtZeroHp(_ dungeonId: DungeonId, _ floor: Int) -> (s: CombatSession, boss: Monster) {
        var s = sessionAt(dungeonId, floor)
        let boss = lastBoss(s)!.monster
        s.status = .active
        s.log.append(.encounter(monster: boss, timestamp: 0))
        s.log.append(.combat(attacker: .hero, damage: boss.hp, outcome: .hit,
                             narrative: nil, narrativeKey: nil, narrativeParams: nil, timestamp: 0))
        return (s, boss)
    }

    private func sessionEndReason(_ s: CombatSession) -> SessionEndReason? {
        if let last = s.log.last, case let .sessionEnd(r, _, _, _, _, _, _) = last { return r }
        return nil
    }

    func testF30BossVictoryEndsSession() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let (s, boss) = bossAtZeroHp(.fitness, 30)
        let next = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        XCTAssertTrue(next.log.contains {
            if case let .victory(m, _, _, _, _, _) = $0 { return m.templateId == boss.templateId }
            return false
        })
        XCTAssertEqual(sessionEndReason(next), .bossDefeated)
        XCTAssertEqual(next.status, .completed)
    }

    func testF60BossVictoryContinuesToF61() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let (s, _) = bossAtZeroHp(.fitness, 60)
        let afterVictory = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        XCTAssertEqual(afterVictory.status, .active)
        XCTAssertNil(sessionEndReason(afterVictory))
        XCTAssertTrue(hasVictoryBoss(afterVictory))
        // 보스는 반드시 장비를 떨군다.
        XCTAssertGreaterThanOrEqual(afterVictory.rewards.drops.count, 1)
        let moved = UpHeroSession.tickSession(afterVictory, flavor: FlavorPool.bundled, rng: &rng)
        XCTAssertEqual(moved.currentFloor, 61)
        if case let .floor(f, t, _)? = moved.log.last {
            XCTAssertEqual(f, 60); XCTAssertEqual(t, 61)
        } else {
            XCTFail("마지막 엔트리는 floor 60→61")
        }
    }

    func testF10BossVictoryContinues() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let (s, _) = bossAtZeroHp(.fitness, 10)
        let afterVictory = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        XCTAssertEqual(afterVictory.status, .active)
        XCTAssertEqual(UpHeroSession.tickSession(afterVictory, flavor: FlavorPool.bundled, rng: &rng).currentFloor, 11)
    }

    // MARK: - skipFloors 는 다음 보스층 직전까지만 (피드백 26)

    func testSkipFloorsClampsBeforeBoss() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let s = UpHeroSession.resolveChoice(armChoice(sessionAt(.fitness, 17), .skipFloors(count: 3)), optionIndex: 0, rng: &rng)
        XCTAssertEqual(s.currentFloor, 19)
        XCTAssertTrue(s.log.contains {
            if case let .floor(f, t, _) = $0 { return f == 17 && t == 19 }
            return false
        })
        XCTAssertEqual(s.status, .active)
    }

    func testSkipFloorsUnclamped() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let s = UpHeroSession.resolveChoice(armChoice(sessionAt(.fitness, 15), .skipFloors(count: 2)), optionIndex: 0, rng: &rng)
        XCTAssertEqual(s.currentFloor, 17)
    }

    func testSkipFloorsBlockedAtBossDoor() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let before = armChoice(sessionAt(.fitness, 19), .skipFloors(count: 2))
        let floorsBefore = floorEntryCount(before)
        let s = UpHeroSession.resolveChoice(before, optionIndex: 0, rng: &rng)
        XCTAssertEqual(s.currentFloor, 19)
        XCTAssertEqual(floorEntryCount(s), floorsBefore)
        XCTAssertTrue(s.log.contains {
            if case let .narrative(_, key, _, _) = $0 { return key == "uphero.combat.narrative.skipBlocked" }
            return false
        })
        XCTAssertEqual(s.status, .active)
    }

    func testSkipFloorsDoesNotCrossCycleBoundary() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let s = UpHeroSession.resolveChoice(armChoice(sessionAt(.fitness, 35), .skipFloors(count: 10)), optionIndex: 0, rng: &rng)
        XCTAssertEqual(s.currentFloor, 39)
    }

    // MARK: - regen — 보스 1%, 30% 미만 정지 (피드백 16)

    func testRegenConstants() {
        XCTAssertEqual(UpHeroCombat.monsterRegenPct, 0.05)
        XCTAssertEqual(UpHeroCombat.bossRegenPct, 0.01)
        XCTAssertEqual(UpHeroCombat.regenStopBelowHpRatio, 0.3)
    }

    func testRegenBossHealsOnePercent() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        var s = sessionAt(.wellness, 20)
        guard let boss = lastBoss(s)?.monster else { return XCTFail("boss expected") }
        XCTAssertEqual(boss.templateId, "boss_river_naiad")
        XCTAssertEqual(boss.trait, .regen)
        s.status = .active
        let opened = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        if case .encounter = opened.log.last! {} else { XCTFail("encounter expected") }
        XCTAssertEqual(opened.monsterRegenAmount,
                       max(2, UpHeroCombat.jsRound(Double(boss.hp) * UpHeroCombat.bossRegenPct)))
    }

    func testRegenStopsBelowThirtyPercent() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        var s = sessionAt(.wellness, 20)
        let boss = lastBoss(s)!.monster
        s.status = .active
        var opened = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        // 영웅 공격으로 HP 를 25% 까지 깎는다.
        let cut = Int((Double(boss.hp) * 0.75).rounded(.up))
        opened.log.append(.combat(attacker: .hero, damage: cut, outcome: .hit,
                                  narrative: nil, narrativeKey: nil, narrativeParams: nil, timestamp: 0))
        let before = opened.log.count
        let next = UpHeroSession.tickSession(opened, flavor: FlavorPool.bundled, rng: &rng)
        let newEntries = Array(next.log[before...])
        XCTAssertFalse(newEntries.contains {
            if case let .monsterEffect(effect, _, _, _, _, _) = $0 { return effect == .regen }
            return false
        })
        // 라운드 자체는 진행됐다 (영웅/적 공격 엔트리).
        XCTAssertTrue(newEntries.contains { if case .combat = $0 { return true }; return false })
    }

    func testRegenPushesAboveThirtyPercent() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        var s = sessionAt(.wellness, 20)
        s.status = .active
        let opened = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        let before = opened.log.count
        let next = UpHeroSession.tickSession(opened, flavor: FlavorPool.bundled, rng: &rng)
        let newEntries = Array(next.log[before...])
        XCTAssertTrue(newEntries.contains {
            if case let .monsterEffect(effect, _, _, _, _, _) = $0 { return effect == .regen }
            return false
        })
    }

    func testNormalRegenMonsterKeepsFivePercent() {
        var rng = Mulberry32(seed: Self.defaultSeed)
        let monster = MonsterPool.scaleMonster(template("wel_naiad"), dungeonId: .wellness, floor: 15)
        XCTAssertEqual(monster.trait, .regen)
        var s = sessionAt(.wellness, 15)
        // boss 엔트리 경로로 encounter 를 열어 initMonsterTraitState 를 태운다.
        s.log.append(.boss(monster: monster, floor: 15, timestamp: 0))
        let opened = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
        XCTAssertEqual(opened.monsterRegenAmount,
                       max(2, UpHeroCombat.jsRound(Double(monster.hp) * UpHeroCombat.monsterRegenPct)))
    }

    // MARK: - rollEnemyOutcome miss 하한 5%

    func testEnemyMissFloorFivePercent() {
        var seedRng = Mulberry32(seed: 1)
        let monster = MonsterPool.createMonsterForFloor(dungeonId: .fitness, floor: 200, isBoss: false, rng: &seedRng)
        let stats = UpHeroRules.createDefaultHero().baseStats
        var low = ConstRandom(value: 0.049)
        XCTAssertEqual(UpHeroCombat.rollEnemyOutcome(monster: monster, stats: stats, rng: &low), .miss)
        var noAgi = stats
        noAgi.agi = 0
        var high = ConstRandom(value: 0.051)
        XCTAssertNotEqual(UpHeroCombat.rollEnemyOutcome(monster: monster, stats: noAgi, rng: &high), .miss)
    }

    // MARK: - scaleMonster 픽스처 (웹 upHeroMonsters.test.ts 와 공유)

    func testScaleConstants() {
        XCTAssertEqual(MonsterPool.bossHpMultByCycle, [1.2, 1.0, 0.9, 0.85])
        XCTAssertEqual(MonsterPool.bossAtkMultByCycle, [0.9, 0.8, 0.75, 0.7])
        XCTAssertEqual(MonsterPool.bossXpMult, 4)
        XCTAssertEqual(MonsterPool.powerAtkDefMult, [1: 1, 2: 1.6, 3: 2.2])
        XCTAssertEqual(MonsterPool.powerWeightsByFloor, [
            [1: 70, 2: 30, 3: 0], [1: 50, 2: 40, 3: 10], [1: 35, 2: 45, 3: 20], [1: 25, 2: 45, 3: 30],
        ])
        XCTAssertEqual(UpHeroSession.bossDestroyGuardDropChance, 0.5)
        XCTAssertEqual(UpHeroSession.treasureDestroyGuardDropChance, 0.1)
    }

    func testBossCycleIndexAndPowerBand() {
        XCTAssertEqual(MonsterPool.bossCycleIndex(10), 0)
        XCTAssertEqual(MonsterPool.bossCycleIndex(30), 0)
        XCTAssertEqual(MonsterPool.bossCycleIndex(31), 1)
        XCTAssertEqual(MonsterPool.bossCycleIndex(60), 1)
        XCTAssertEqual(MonsterPool.bossCycleIndex(90), 2)
        XCTAssertEqual(MonsterPool.bossCycleIndex(120), 3)
        XCTAssertEqual(MonsterPool.powerWeightBand(10), 0)
        XCTAssertEqual(MonsterPool.powerWeightBand(11), 1)
        XCTAssertEqual(MonsterPool.powerWeightBand(20), 1)
        XCTAssertEqual(MonsterPool.powerWeightBand(21), 2)
        XCTAssertEqual(MonsterPool.powerWeightBand(30), 2)
        XCTAssertEqual(MonsterPool.powerWeightBand(31), 3)
    }

    private func stats(_ m: Monster) -> [Int] { [m.hp, m.atk, m.def] }

    func testScaleMonsterFixtures() {
        let naiad = MonsterPool.scaleMonster(template("boss_river_naiad"), dungeonId: .wellness, floor: 20)
        XCTAssertEqual([naiad.hp, naiad.maxHp ?? -1, naiad.atk, naiad.def, naiad.xpReward, naiad.coinReward],
                       [432, 432, 61, 26, 840, 1290])
        XCTAssertEqual(stats(MonsterPool.scaleMonster(template("boss_mountain_wolf"), dungeonId: .fitness, floor: 10)), [189, 27, 12])
        // trait shield 는 스탯을 건드리지 않는다.
        XCTAssertEqual(stats(MonsterPool.scaleMonster(template("boss_stone_golem"), dungeonId: .fitness, floor: 30)), [612, 87, 37])
        XCTAssertEqual(stats(MonsterPool.scaleMonster(template("boss_mountain_wolf"), dungeonId: .fitness, floor: 40)), [660, 100, 48])
        XCTAssertEqual(stats(MonsterPool.scaleMonster(template("boss_stone_golem"), dungeonId: .fitness, floor: 60)), [960, 146, 70])
        // 보스 NG+2 는 ngMult 가 여전히 곱해진다: 189 × 1.8 = 340.2 → 340.
        XCTAssertEqual(MonsterPool.scaleMonster(template("boss_mountain_wolf"), dungeonId: .fitness, floor: 10,
                                                opts: ScaleOptions(ngPlusLevel: 2)).hp, 340)
        XCTAssertEqual(stats(MonsterPool.scaleMonster(template("fit_eagle"), dungeonId: .fitness, floor: 15)), [190, 39, 15])
        XCTAssertEqual(stats(MonsterPool.scaleMonster(template("fit_golem"), dungeonId: .fitness, floor: 25)), [435, 83, 32])
        XCTAssertEqual(stats(MonsterPool.scaleMonster(template("fit_wolf"), dungeonId: .fitness, floor: 5)), [34, 9, 3])
    }

    // MARK: - createMonsterForFloor — 보스 사이클 인덱스 / power 가중치

    func testBossCycleTemplateIndex() {
        for (floor, idx) in [(10, 0), (20, 1), (30, 2), (40, 0), (50, 1), (60, 2), (90, 2), (100, 0)] {
            for d in Dungeons.list {
                var rng = Mulberry32(seed: 1)
                let m = MonsterPool.createMonsterForFloor(dungeonId: d.id, floor: floor, isBoss: true, rng: &rng)
                XCTAssertEqual(m.templateId, Dungeons.all[d.id]!.bossIds[idx], "\(d.id) F\(floor)")
                XCTAssertEqual(m.isBoss, true)
                XCTAssertEqual(m.level, floor)
            }
        }
    }

    func testBossCreationConsumesNoRng() {
        var a = Mulberry32(seed: 7)
        _ = MonsterPool.createMonsterForFloor(dungeonId: .fitness, floor: 40, isBoss: true, rng: &a)
        let ma = MonsterPool.createMonsterForFloor(dungeonId: .fitness, floor: 15, isBoss: false, rng: &a)
        var b = Mulberry32(seed: 7)
        let mb = MonsterPool.createMonsterForFloor(dungeonId: .fitness, floor: 15, isBoss: false, rng: &b)
        XCTAssertEqual(ma.templateId, mb.templateId)
    }

    private func powerShare(_ dungeonId: DungeonId, floor: Int, runs: Int) -> [Int: Int] {
        var counts = [1: 0, 2: 0, 3: 0]
        for seed in 1...runs {
            var rng = Mulberry32(seed: seed)
            let m = MonsterPool.createMonsterForFloor(dungeonId: dungeonId, floor: floor, isBoss: false, rng: &rng)
            counts[template(m.templateId ?? "").power, default: 0] += 1
        }
        return counts
    }

    func testPowerThreeNeverAtFloor8() {
        let c = powerShare(.fitness, floor: 8, runs: 500)
        XCTAssertEqual(c[3], 0)
        XCTAssertGreaterThan(c[1]!, c[2]!)
    }

    func testPowerThreeShareAtFloor35() {
        let c = powerShare(.fitness, floor: 35, runs: 500)
        let share = Double(c[3]!) / 500
        XCTAssertGreaterThanOrEqual(share, 0.2)
        XCTAssertLessThanOrEqual(share, 0.4)
    }

    func testFloors1To3NewbieOnly() {
        for seed in 1...50 {
            var rng = Mulberry32(seed: seed)
            let m = MonsterPool.createMonsterForFloor(dungeonId: .learning, floor: 2, isBoss: false, rng: &rng)
            XCTAssertTrue(template(m.templateId ?? "").isNewbie, "seed \(seed)")
        }
    }

    func testSameSeedSameTemplate() {
        var a = Mulberry32(seed: 99)
        var b = Mulberry32(seed: 99)
        XCTAssertEqual(
            MonsterPool.createMonsterForFloor(dungeonId: .social, floor: 22, isBoss: false, rng: &a).templateId,
            MonsterPool.createMonsterForFloor(dungeonId: .social, floor: 22, isBoss: false, rng: &b).templateId)
    }

    // MARK: - calculateDungeonProgress 보스층 롤백 (피드백 19/26/31)

    private func makeSession(_ dungeonId: DungeonId, _ floor: Int, _ log: [LogEntry],
                             weekly: Bool = false, startFloor: Int = 1) -> CombatSession {
        var rng = Mulberry32(seed: 1)
        var s = UpHeroSession.createSession(
            dungeonId: dungeonId, hero: UpHeroRules.createDefaultHero(), startFloor: 1, rng: &rng)
        s.startFloor = startFloor
        s.currentFloor = floor
        s.log = log
        s.status = .completed
        s.isWeeklyVariant = weekly ? true : nil
        return s
    }

    private func bossMonster(_ dungeonId: DungeonId, _ floor: Int) -> Monster {
        var rng = Mulberry32(seed: 1)
        return MonsterPool.createMonsterForFloor(dungeonId: dungeonId, floor: floor, isBoss: true, rng: &rng)
    }

    private func bossVictory(_ dungeonId: DungeonId, _ floor: Int) -> [LogEntry] {
        let boss = bossMonster(dungeonId, floor)
        return [.boss(monster: boss, floor: floor, timestamp: 0),
                .encounter(monster: boss, timestamp: 0),
                .victory(monster: boss, xp: 0, coins: 0, narrativeKey: nil, narrativeParams: nil, timestamp: 0)]
    }

    private func bossOnly(_ dungeonId: DungeonId, _ floor: Int) -> [LogEntry] {
        let boss = bossMonster(dungeonId, floor)
        return [.boss(monster: boss, floor: floor, timestamp: 0), .encounter(monster: boss, timestamp: 0)]
    }

    private func endEntry(_ reason: SessionEndReason) -> LogEntry {
        .sessionEnd(reason: reason, detail: nil, detailKey: nil, detailMonsterTemplateId: nil,
                    detailMonsterFallback: nil, detailFloor: nil, timestamp: 0)
    }

    private let existing = DungeonProgress(dungeonId: .fitness, floorReached: 15, bestFloorReached: 15, bossesDefeated: [10])

    func testAbandonAtF20RollsBackTo19() {
        let s = makeSession(.fitness, 20, bossOnly(.fitness, 20) + [endEntry(.heroAbandoned)])
        let bosses = SessionReward.calculateBossesDefeated(log: s.log, existing: existing.bossesDefeated)
        let p = SessionReward.calculateDungeonProgress(session: s, existing: existing, newBossesDefeated: bosses)
        XCTAssertEqual(p.floorReached, 19)
        XCTAssertEqual(p.bestFloorReached, 20)
        XCTAssertEqual(p.bossesDefeated, [10])
    }

    func testTimeExpiredAtF30RollsBackTo29() {
        let s = makeSession(.fitness, 30, bossOnly(.fitness, 30) + [endEntry(.timeExpired)])
        let p = SessionReward.calculateDungeonProgress(session: s, existing: existing, newBossesDefeated: [10, 20])
        XCTAssertEqual(p.floorReached, 29)
        XCTAssertEqual(p.bestFloorReached, 30)
    }

    func testDeathAtF31WithoutF30Boss() {
        let s = makeSession(.fitness, 31, [endEntry(.heroDied)])
        let p = SessionReward.calculateDungeonProgress(session: s, existing: existing, newBossesDefeated: [10, 20])
        XCTAssertEqual(p.floorReached, 29)
        XCTAssertEqual(p.bestFloorReached, 31)
    }

    func testDeathAtF31WithF30Boss() {
        let s = makeSession(.fitness, 31, [endEntry(.heroDied)])
        let p = SessionReward.calculateDungeonProgress(session: s, existing: existing, newBossesDefeated: [10, 20, 30])
        XCTAssertEqual(p.floorReached, 30)
    }

    func testF30BossVictoryKeeps30() {
        let log = bossVictory(.fitness, 30) + [endEntry(.bossDefeated)]
        let s = makeSession(.fitness, 30, log)
        let bosses = SessionReward.calculateBossesDefeated(log: log, existing: [10, 20])
        let p = SessionReward.calculateDungeonProgress(session: s, existing: existing, newBossesDefeated: bosses)
        XCTAssertEqual(p.floorReached, 30)
        XCTAssertEqual(p.bossesDefeated, [10, 20, 30])
    }

    func testAbandonAtNonBossFloorUnchanged() {
        let s = makeSession(.fitness, 25, [endEntry(.heroAbandoned)])
        let p = SessionReward.calculateDungeonProgress(session: s, existing: existing, newBossesDefeated: [10])
        XCTAssertEqual(p.floorReached, 25)
    }

    func testDeathToF30BossRollsBackTo29() {
        let s = makeSession(.fitness, 30, bossOnly(.fitness, 30) + [endEntry(.heroDied)])
        let p = SessionReward.calculateDungeonProgress(session: s, existing: existing, newBossesDefeated: [10, 20])
        XCTAssertEqual(p.floorReached, 29)
    }

    func testExistingFloorReachedNeverRegresses() {
        let s = makeSession(.fitness, 10, bossOnly(.fitness, 10) + [endEntry(.heroAbandoned)])
        var ex = existing
        ex.floorReached = 12
        let p = SessionReward.calculateDungeonProgress(session: s, existing: ex, newBossesDefeated: [10])
        XCTAssertEqual(p.floorReached, 12)
    }

    func testBossesDefeatedHasNoCap() {
        XCTAssertEqual(SessionReward.calculateBossesDefeated(log: bossVictory(.fitness, 40), existing: [10, 20, 30]),
                       [10, 20, 30, 40])
    }

    // MARK: - resolveStartFloor

    func testResolveStartFloorTable() {
        XCTAssertEqual(SessionReward.resolveStartFloor(nil), 1)
        let cases: [(Int, [Int], Int)] = [
            (0, [], 1), (5, [], 6), (20, [], 10), (20, [10], 20), (21, [10], 20),
            (25, [10, 20], 26), (45, [10, 20, 30], 40), (45, [10, 20, 30, 40], 46),
            (19, [10], 20), (30, [10, 20, 30], 31),
        ]
        for (reached, defeated, expected) in cases {
            let p = DungeonProgress(dungeonId: .fitness, floorReached: reached, bestFloorReached: reached, bossesDefeated: defeated)
            XCTAssertEqual(SessionReward.resolveStartFloor(p), expected, "{\(reached), \(defeated)}")
        }
    }

    // MARK: - computeWeeklyClearReward (피드백 30)

    private func weekly(_ cleared: [DungeonId]) -> WeeklyVariant {
        WeeklyVariant(week: "2026-W36", affixId: "glass_cannon", clearedDungeons: cleared, bestScore: 0, lastUploadedAt: nil)
    }

    func testWeeklyDungeonCountMatchesDungeons() {
        XCTAssertEqual(SessionReward.weeklyDungeonCount, Dungeons.list.count)
        XCTAssertEqual(SessionReward.weeklyFirstClearCoins, 600)
        XCTAssertEqual(SessionReward.weeklyFirstClearDestroyGuards, 1)
        XCTAssertEqual(SessionReward.weeklyAllClearCoins, 3000)
        XCTAssertEqual(SessionReward.weeklyAllClearDestroyGuards, 2)
        XCTAssertEqual(SessionReward.weeklyAllClearDownGuards, 3)
    }

    func testWeeklyRewardNilForNonWeekly() {
        let s = makeSession(.fitness, 30, bossVictory(.fitness, 30))
        XCTAssertNil(SessionReward.computeWeeklyClearReward(session: s, weekly: weekly([])))
    }

    func testWeeklyFirstClearReward() {
        let s = makeSession(.fitness, 30, bossVictory(.fitness, 30), weekly: true, startFloor: 30)
        XCTAssertEqual(SessionReward.computeWeeklyClearReward(session: s, weekly: weekly([])),
                       SessionReward.WeeklyClearReward(firstClear: true, allClear: false, coins: 600, destroyGuards: 1, downGuards: 0))
    }

    func testWeeklyAllClearBonusOnSevenToEight() {
        let others = Dungeons.list.map(\.id).filter { $0 != .fitness }
        XCTAssertEqual(others.count, 7)
        let s = makeSession(.fitness, 30, bossVictory(.fitness, 30), weekly: true, startFloor: 30)
        XCTAssertEqual(SessionReward.computeWeeklyClearReward(session: s, weekly: weekly(others)),
                       SessionReward.WeeklyClearReward(firstClear: true, allClear: true, coins: 3600, destroyGuards: 3, downGuards: 3))
    }

    func testWeeklyRewardNilWhenAlreadyCleared() {
        let s = makeSession(.fitness, 30, bossVictory(.fitness, 30), weekly: true, startFloor: 30)
        XCTAssertNil(SessionReward.computeWeeklyClearReward(session: s, weekly: weekly([.fitness])))
    }

    func testWeeklyRewardNilWithoutBossVictory() {
        let s = makeSession(.fitness, 30, bossOnly(.fitness, 30) + [endEntry(.heroDied)], weekly: true, startFloor: 30)
        XCTAssertNil(SessionReward.computeWeeklyClearReward(session: s, weekly: weekly([])))
    }

    func testWeeklyRewardNilWithoutWeeklyState() {
        let s = makeSession(.fitness, 30, bossVictory(.fitness, 30), weekly: true, startFloor: 30)
        XCTAssertNil(SessionReward.computeWeeklyClearReward(session: s, weekly: nil))
    }

    // MARK: - 기준 영웅 보스 시뮬레이션 (8 던전 × 25 시드)

    private struct RefRow {
        let floor: Int
        let level: Int
        let enh: Int
        let rarityMult: Double
        let minWin: Double
    }

    /// 공통 규칙 §2 기준 영웅표. rare ×1.5. 웹 `REFERENCE`.
    private static let reference: [RefRow] = [
        RefRow(floor: 10, level: 8, enh: 0, rarityMult: 1.5, minWin: 0.8),
        RefRow(floor: 20, level: 16, enh: 0, rarityMult: 1.5, minWin: 0.8),
        RefRow(floor: 30, level: 22, enh: 5, rarityMult: 1.5, minWin: 0.55),
        RefRow(floor: 40, level: 29, enh: 5, rarityMult: 1.5, minWin: 0.8),
        RefRow(floor: 50, level: 35, enh: 10, rarityMult: 1.5, minWin: 0.8),
        RefRow(floor: 60, level: 40, enh: 10, rarityMult: 1.5, minWin: 0.55),
    ]

    /// gear = round((5+0.5f)×rarity) + floor(min(enh,10)/2) + max(0, enh-10). 웹 `referenceGear`.
    private func referenceGear(floor: Int, enh: Int, rarityMult: Double) -> Int {
        UpHeroCombat.jsRound((5 + 0.5 * Double(floor)) * rarityMult) + min(enh, 10) / 2 + max(0, enh - 10)
    }

    private func referenceHero(_ row: RefRow) -> Hero {
        var h = UpHeroRules.computeHeroForLevel(UpHeroRules.createDefaultHero(), level: row.level)
        let gear = referenceGear(floor: row.floor, enh: row.enh, rarityMult: row.rarityMult)
        h.baseStats.str += gear
        h.baseStats.vit += gear
        return h
    }

    /// 보스층에서 시작해 보스 승리 / 사망까지 tick. 승리 = victory(isBoss) 엔트리. 웹 `simulateBossFight`.
    private func simulateBossFight(_ dungeonId: DungeonId, _ row: RefRow, seed: Int) -> Bool {
        var rng = Mulberry32(seed: seed)
        var s = UpHeroSession.createSession(
            dungeonId: dungeonId, hero: referenceHero(row), startFloor: row.floor,
            activeBuffs: nil, options: CreateSessionOptions(heroLevel: row.level), rng: &rng)
        s.status = .active
        for _ in 0..<2000 {
            s = UpHeroSession.tickSession(s, flavor: FlavorPool.bundled, rng: &rng)
            if hasVictoryBoss(s) { return true }
            if s.status == .completed { return false }
        }
        return false
    }

    func testReferenceHeroStats() {
        let h10 = referenceHero(Self.reference[0])
        XCTAssertEqual([h10.baseStats.str, h10.baseStats.vit, h10.maxHp], [32, 32, 184])
        let h20 = referenceHero(Self.reference[1])
        XCTAssertEqual([h20.baseStats.str, h20.maxHp], [48, 280])
        let h30 = referenceHero(Self.reference[2])
        XCTAssertEqual([h30.baseStats.str, h30.maxHp], [63, 352])
    }

    func testReferenceHeroBossWinRates() {
        var report: [String] = []
        for row in Self.reference {
            var wins = 0
            var runs = 0
            for d in Dungeons.list {
                for seed in 1...25 {
                    runs += 1
                    if simulateBossFight(d.id, row, seed: seed) { wins += 1 }
                }
            }
            XCTAssertEqual(runs, 200)
            let rate = Double(wins) / Double(runs)
            report.append("F\(row.floor) Lv\(row.level) rare+\(row.enh) = \(rate * 100)% (\(wins)/\(runs))")
            XCTAssertGreaterThanOrEqual(rate, row.minWin, "F\(row.floor): 승률 \(rate)")
        }
        print("[UpHeroSessionLoopTests] reference-hero boss win rates: " + report.joined(separator: " | "))
    }
}
