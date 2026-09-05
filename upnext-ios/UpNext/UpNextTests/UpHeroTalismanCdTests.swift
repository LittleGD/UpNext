//
//  UpHeroTalismanCdTests.swift
//  UpNextTests — Phase 6-E (Track E, 피드백 21) 평정 (classSkillCdReduce) 이 스킬별 쿨다운
//  맵(`skillCooldowns`) 을 실제로 줄인다.
//
//  웹 src/lib/upHeroTalismanCd.test.ts 미러. 이전엔 표시용 스칼라 `skillCooldown` 만 줄여
//  canFireSkill / SkillBar 가 읽는 맵에는 아무 효과가 없었다. 같은 시드로 두 번 돌려 스킬이
//  처음 발동한 tick 직후의 맵 값을 비교한다.
//

import XCTest
@testable import UpNext

final class UpHeroTalismanCdTests: XCTestCase {

    /// 한 방에 죽이고 절대 죽지 않는 영웅 + novice_focus (조우마다 발동, cooldown 5).
    private func hero() -> Hero {
        var h = UpHeroRules.createDefaultHero()
        h.hp = 999_999
        h.maxHp = 999_999
        h.baseStats.str = 5000
        h.baseStats.vit = 5000
        h.baseStats.dex = 200
        h.baseStats.agi = 200
        h.learnedSkills = ["novice_focus"]
        h.autoSkillEnabled = true
        return h
    }

    private func skillFireCount(_ s: CombatSession) -> Int {
        s.log.filter {
            if case let .skill(_, skillId, _, _, _, _, _) = $0 { return skillId == "novice_focus" }
            return false
        }.count
    }

    private func canStep(_ s: CombatSession) -> Bool {
        s.status == .active || s.status == .paused || s.status == .awaitingChoice
    }

    /// 조우는 "싸운다", 그 밖의 선택지도 0번으로 — 쿨다운만 보므로 보상은 무관하다.
    private func step(_ s: CombatSession, rng: inout Mulberry32) -> CombatSession {
        if s.status == .awaitingChoice {
            return UpHeroSession.resolveChoice(s, optionIndex: 0, rng: &rng)
        }
        var cur = s
        if cur.status == .paused { cur.status = .active }
        return UpHeroSession.tickSession(cur, flavor: FlavorPool.bundled, rng: &rng)
    }

    /// 스킬이 처음 발동한 tick 직후의 세션 (없으면 nil).
    private func runUntilSkillFires(reduce: Int, seed: Int) -> CombatSession? {
        var rng = Mulberry32(seed: seed)
        var s = UpHeroSession.createSession(dungeonId: .fitness, hero: hero(), startFloor: 1, rng: &rng)
        var mods = TalismanModifiers.empty
        mods.classSkillCdReduce = reduce
        s.talismanMods = mods
        for _ in 0..<400 {
            if !canStep(s) { break }
            let before = skillFireCount(s)
            s = step(s, rng: &rng)
            if skillFireCount(s) > before { return s }
        }
        return nil
    }

    private func findSeed() throws -> Int {
        for seed in 1...40 where runUntilSkillFires(reduce: 0, seed: seed) != nil { return seed }
        throw XCTSkip("no seed fires novice_focus within 40 tries")
    }

    func testReduceZeroLeavesCooldownMinusRoundEnd() throws {
        let seed = try findSeed()
        let cooldown = try XCTUnwrap(ClassSkills.findSkillById("novice_focus")).cooldown
        let s = try XCTUnwrap(runUntilSkillFires(reduce: 0, seed: seed))
        XCTAssertEqual(s.skillCooldowns?["novice_focus"], cooldown - 1)
    }

    func testReduceOneShortensMapByExactlyOneAndNeverBelowZero() throws {
        let seed = try findSeed()
        let base = try XCTUnwrap(runUntilSkillFires(reduce: 0, seed: seed))
        let reduced = try XCTUnwrap(runUntilSkillFires(reduce: 1, seed: seed))
        XCTAssertEqual(reduced.skillCooldowns?["novice_focus"],
                       (base.skillCooldowns?["novice_focus"] ?? 0) - 1)
        // 스칼라(표시용) 도 여전히 줄어든다 (legacy 블록 유지).
        XCTAssertEqual(reduced.skillCooldown, (base.skillCooldown ?? 0) - 1)
        let huge = try XCTUnwrap(runUntilSkillFires(reduce: 99, seed: seed))
        XCTAssertEqual(huge.skillCooldowns?["novice_focus"], 0)
    }

    func testUnfiredSkillsAreUntouched() throws {
        let seed = try findSeed()
        let s = try XCTUnwrap(runUntilSkillFires(reduce: 1, seed: seed))
        // novice_focus 하나만 배웠으므로 맵에는 그 키뿐이어야 한다.
        XCTAssertEqual(Array((s.skillCooldowns ?? [:]).keys), ["novice_focus"])
    }
}
