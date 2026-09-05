//
//  UpHeroLevelCurveTests.swift
//  UpNextTests — Phase 2-A (Track A) 영웅 XP 곡선 / SP 파생 / XP 소스 회귀 테스트.
//
//  웹 src/types/upHeroLevelCurve.test.ts 의 1:1 미러. 아래 표는 그 파일 헤더의 정본을
//  그대로 하드코딩한 것이다 — 값이 바뀌면 두 쪽을 같이 고친다
//  (scripts/verify-equivalence.sh uphero 섹션 13-17 도).
//
//  곡선: gap(L) = L^2 + 120, total(L) = n(n+1)(2n+1)/6 + 120n (n = L-1).
//

import XCTest
@testable import UpNext

final class UpHeroLevelCurveTests: XCTestCase {

    private static let table: [(level: Int, total: Int)] = [
        (1, 0), (2, 121), (5, 510), (10, 1365), (20, 4750), (22, 5831), (30, 12035),
        (40, 25220), (45, 34650), (47, 39031), (50, 46305), (60, 77290), (100, 340230),
        (999, 331_955_259),
    ]

    // MARK: - 표

    func testConstantsMatchPlan() {
        XCTAssertEqual([UpHeroRules.heroXpGapA, UpHeroRules.heroXpGapB, UpHeroRules.heroXpGapC], [1, 0, 120])
        XCTAssertEqual(UpHeroRules.heroLevelCap, 999)
        XCTAssertEqual(UpHeroRules.heroXpCap, 331_955_259)
        XCTAssertEqual(UpHeroRules.heroXpCap, UpHeroRules.heroTotalXPForLevel(UpHeroRules.heroLevelCap))
    }

    func testTotalXPTable() {
        for row in Self.table {
            XCTAssertEqual(UpHeroRules.heroTotalXPForLevel(row.level), row.total, "Lv\(row.level)")
        }
    }

    func testGapSpots() {
        XCTAssertEqual(UpHeroRules.heroXpToNextLevel(1), 121)
        XCTAssertEqual(UpHeroRules.heroXpToNextLevel(30), 1020)
        XCTAssertEqual(UpHeroRules.heroXpToNextLevel(40), 1720)
    }

    /// 닫힌 형식 == gap 누적 합 (L = 1..300).
    func testClosedFormEqualsLoopSum() {
        var acc = 0
        for level in 1...300 {
            XCTAssertEqual(UpHeroRules.heroTotalXPForLevel(level), acc, "Lv\(level)")
            acc += UpHeroRules.heroXpToNextLevel(level)
        }
    }

    // MARK: - 역함수 / 상한 / clamp

    func testInverseProperty() {
        for level in 2...200 {
            let total = UpHeroRules.heroTotalXPForLevel(level)
            XCTAssertEqual(UpHeroRules.heroLevelFromXP(total), level)
            XCTAssertEqual(UpHeroRules.heroLevelFromXP(total - 1), level - 1)
        }
    }

    func testInverseSpots() {
        XCTAssertEqual(UpHeroRules.heroLevelFromXP(120), 1)
        XCTAssertEqual(UpHeroRules.heroLevelFromXP(121), 2)
        XCTAssertEqual(UpHeroRules.heroLevelFromXP(509), 4)
        XCTAssertEqual(UpHeroRules.heroLevelFromXP(510), 5)
        XCTAssertEqual(UpHeroRules.heroLevelFromXP(39031), 47)
    }

    func testCap() {
        XCTAssertEqual(UpHeroRules.heroLevelFromXP(1_000_000_000_000), UpHeroRules.heroLevelCap)
        XCTAssertEqual(UpHeroRules.heroLevelFromXP(UpHeroRules.heroXpCap), UpHeroRules.heroLevelCap)
    }

    /// 순수 함수는 입력을 접는다 — 음수 XP → 0, 레벨 → [1, cap].
    func testPureFunctionsClampInputs() {
        XCTAssertEqual(UpHeroRules.heroLevelFromXP(-1), 1)
        XCTAssertEqual(UpHeroRules.clampHeroXp(-5), 0)
        XCTAssertEqual(UpHeroRules.clampHeroXp(1_000_000_000_000_000), UpHeroRules.heroXpCap)
        XCTAssertEqual(UpHeroRules.heroTotalXPForLevel(1000), UpHeroRules.heroTotalXPForLevel(999))
        XCTAssertEqual(UpHeroRules.heroTotalXPForLevel(0), 0)
        XCTAssertEqual(UpHeroRules.heroTotalXPForLevel(-5), 0)
        XCTAssertEqual(UpHeroRules.heroXpToNextLevel(0), UpHeroRules.heroXpToNextLevel(1))
        XCTAssertEqual(UpHeroRules.heroXpToNextLevel(1000), UpHeroRules.heroXpToNextLevel(999))
    }

    func testXPProgress() {
        var p = UpHeroRules.heroXPProgress(totalXp: 0, level: 1)
        XCTAssertEqual(p.current, 0); XCTAssertEqual(p.needed, 121)
        p = UpHeroRules.heroXPProgress(totalXp: 39031, level: 47)
        XCTAssertEqual(p.current, 0); XCTAssertEqual(p.needed, 2329)
        p = UpHeroRules.heroXPProgress(totalXp: 5000, level: 10)
        XCTAssertEqual(p.current, 3635); XCTAssertEqual(p.needed, 220)
        XCTAssertEqual(UpHeroRules.heroXPProgress(totalXp: -100, level: 3).current, 0)
    }

    // MARK: - 스킬 포인트 총량

    func testSkillPointsTotal() {
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(1), 0)
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(29), 0)
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(30), 0)
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(31), 1)
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(35), 5)
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(45), 15)
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(999), 969)
        XCTAssertEqual(UpHeroRules.skillPointsTotalForLevel(1000), 969)
    }

    // MARK: - XP 소스

    func testBossClearXp() {
        XCTAssertEqual(UpHeroRules.bossClearXp(floor: 10, ngPlusLevel: 0), 200)
        XCTAssertEqual(UpHeroRules.bossClearXp(floor: 20, ngPlusLevel: 0), 400)
        XCTAssertEqual(UpHeroRules.bossClearXp(floor: 30, ngPlusLevel: 0), 600)
        XCTAssertEqual(UpHeroRules.bossClearXp(floor: 30, ngPlusLevel: 1), 840)
        XCTAssertEqual(UpHeroRules.bossClearXp(floor: 45, ngPlusLevel: 1), 1260)
        XCTAssertEqual(UpHeroRules.bossClearXp(floor: 1, ngPlusLevel: nil), 20)
    }

    func testFloorXp() {
        XCTAssertEqual(UpHeroRules.floorXp(floor: 1, ngPlusLevel: 0), 6)
        XCTAssertEqual(UpHeroRules.floorXp(floor: 30, ngPlusLevel: 0), 35)
        XCTAssertEqual(UpHeroRules.floorXp(floor: 45, ngPlusLevel: 1), 70)
        XCTAssertEqual(UpHeroRules.floorXp(floor: 60, ngPlusLevel: 2), 117)
        XCTAssertEqual(UpHeroRules.floorXp(floor: 10, ngPlusLevel: nil), 15)
    }

    // MARK: - resolveHeroLevel (시드 전 폴백)

    func testResolveHeroLevel() {
        XCTAssertEqual(UpHeroRules.resolveHeroLevel(heroXp: nil, gameLevel: 47, heroStartLevel: 1), 47)
        XCTAssertEqual(UpHeroRules.resolveHeroLevel(heroXp: nil, gameLevel: 43, heroStartLevel: 41), 3)
        XCTAssertEqual(UpHeroRules.resolveHeroLevel(heroXp: 0, gameLevel: 47, heroStartLevel: 1), 1)
        XCTAssertEqual(UpHeroRules.resolveHeroLevel(heroXp: 245, gameLevel: 47, heroStartLevel: 41), 3)
        XCTAssertEqual(UpHeroRules.resolveHeroLevel(heroXp: 39031, gameLevel: 47, heroStartLevel: 1), 47)
    }

    // MARK: - 페이싱 (보스 10층마다, xpMult 전)
    //
    // A 의 수입 모델: 30 층 사이클마다 power-2 잡몹 15 처치 + 보스 3 (10 층마다) + 층 진입 XP.
    // 몬스터 XP 는 MonsterPool.scaleMonster 의 현재 공식 그대로:
    //   round((10 + f×3) × power × (boss ? bossXpMult : 1) × ngMult).
    // 사이클1 = F1-30 NG+0 → Lv22, 누적 사이클2 = F31-60 NG+1 → Lv40.

    private func killXp(floor: Int, power: Int, boss: Bool, ng: Int) -> Int {
        UpHeroCombat.jsRound(
            Double(10 + floor * 3) * Double(power) * (boss ? MonsterPool.bossXpMult : 1)
                * UpHeroRules.ngPlusScaleMult(ng))
    }

    /// 사이클 안 잡몹 처치 층 (오프셋 1..30, 보스층 10/20/30 제외) — 짝수 12 + 5/15/25.
    private static let trashOffsets = [2, 4, 6, 8, 12, 14, 16, 18, 22, 24, 26, 28, 5, 15, 25]

    private func cycleIncome(startFloor: Int, ng: Int) -> Int {
        let endFloor = startFloor + 29
        var xp = 0
        for off in Self.trashOffsets { xp += killXp(floor: startFloor + off - 1, power: 2, boss: false, ng: ng) }
        for f in startFloor...endFloor where f % 10 == 0 {
            xp += killXp(floor: f, power: 3, boss: true, ng: ng) + UpHeroRules.bossClearXp(floor: f, ngPlusLevel: ng)
        }
        for f in (startFloor + 1)...endFloor { xp += UpHeroRules.floorXp(floor: f, ngPlusLevel: ng) }
        return xp
    }

    func testPacingCycle1LandsAtLv21to23() {
        let lv = UpHeroRules.heroLevelFromXP(cycleIncome(startFloor: 1, ng: 0))
        XCTAssertGreaterThanOrEqual(lv, 21)
        XCTAssertLessThanOrEqual(lv, 23)
    }

    func testPacingCumulativeCycle2LandsAtLv39to41() {
        let cum = cycleIncome(startFloor: 1, ng: 0) + cycleIncome(startFloor: 31, ng: 1)
        let lv = UpHeroRules.heroLevelFromXP(cum)
        XCTAssertGreaterThanOrEqual(lv, 39)
        XCTAssertLessThanOrEqual(lv, 41)
    }

    /// 몬스터 XP 공식이 MonsterPool 과 정말 같은지 — 시뮬 헬퍼의 자기검증 (보스 F10, power 3).
    func testKillXpHelperMatchesMonsterPool() {
        let pool = MonsterPool.templates[.fitness]!
        let template = pool.bosses[0]
        let boss = MonsterPool.scaleMonster(template, dungeonId: .fitness, floor: 10)
        XCTAssertEqual(boss.xpReward, killXp(floor: 10, power: template.power, boss: true, ng: 0))
    }
}
