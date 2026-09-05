//
//  UpHeroEnhanceTests.swift
//  UpNextTests — 강화 실패 3분기(소실/하락/유지) 재조정 + 방지권 2종.
//
//  검증 대상:
//   1. 레벨 기반 실패 결과 (구 `enhancePreserveByRarity` 고정값 퇴역).
//      currentLevel 0..2 는 소실·하락 둘 다 0 — 여기서 "+1 → +2 에서 70% 확률로
//      소실" 이라는 유저 피드백의 원인이 사라진다.
//   2. 방지권 2종 필드가 로컬 영속 / 클라우드 와이어 왕복을 모두 통과하는지.
//      (CodingKeys 누락은 조용한 데이터 손실이라 컴파일로는 안 잡힌다.)
//   3. 웹 `enhanceOutcomeRates` / `enhanceSuccessRate` / `enhanceCost` 와의 수치 일치.
//   4. Phase 5-B — 상위 밴드 (+11..+20) 표, 시도당 방지권 소모 매트릭스, 밴드 스탯 성장
//      왕복, 칭호/연출 밴드, 사진 부적 상한 10 + 스킬 재계산.
//

import XCTest
@testable import UpNext

@MainActor
final class UpHeroEnhanceTests: XCTestCase {

    // MARK: - 안전 구간 (유저 피드백의 직접 대상)

    /// +0→+1 부터 +2→+3 까지는 어떤 등급이든 실패해도 소실·하락이 없다.
    func testSafeZoneHasNoDestroyOrDowngrade() {
        for rarity in Rarity.allCases {
            for level in 0...UpHeroRules.enhanceSafeMaxLevel {
                let r = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
                XCTAssertEqual(r.destroy, 0, "\(rarity) +\(level) 소실은 0 이어야 한다")
                XCTAssertEqual(r.down, 0, "\(rarity) +\(level) 하락은 0 이어야 한다")
                XCTAssertEqual(r.keep, 1, "\(rarity) +\(level) 는 실패해도 100% 유지")
                XCTAssertTrue(UpHeroRules.isEnhanceSafeLevel(rarity: rarity, currentLevel: level))
            }
        }
        XCTAssertEqual(UpHeroRules.enhanceSafeMaxLevel, 2)   // 웹 ENHANCE_SAFE_MAX_LEVEL
    }

    /// 구 규칙 회귀 가드 — +1 에서 실패했을 때 보존 확률이 0.3 이면 되돌아간 것이다.
    func testLowLevelIsNotOldFixedRate() {
        XCTAssertEqual(UpHeroRules.enhancePreserveRate(rarity: .normal, currentLevel: 1), 1.0)
        XCTAssertEqual(UpHeroRules.enhancePreserveRate(rarity: .legend, currentLevel: 1), 1.0)
    }

    /// 음수 레벨(손상된 저장본)도 안전 구간으로 취급 — 클램프 확인.
    func testNegativeLevelClampsToSafeZone() {
        let r = UpHeroRules.enhanceOutcomeRates(rarity: .legend, currentLevel: -3)
        XCTAssertEqual(r.keep, 1)
    }

    /// 안전 구간 바로 다음 레벨부터 소실·하락이 붙고, 레벨이 오를수록 단조 증가한다.
    func testRiskAppearsAfterSafeZoneAndGrows() {
        let firstRisky = UpHeroRules.enhanceSafeMaxLevel + 1
        for rarity in Rarity.allCases {
            XCTAssertTrue(UpHeroRules.canEnhanceDestroy(rarity: rarity, currentLevel: firstRisky))
            XCTAssertTrue(UpHeroRules.canEnhanceDowngrade(rarity: rarity, currentLevel: firstRisky))
            for level in firstRisky..<9 {
                let cur = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
                let next = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level + 1)
                XCTAssertGreaterThan(next.destroy, cur.destroy,
                                     "\(rarity) +\(level) → 소실 위험이 커져야 한다")
                XCTAssertGreaterThan(next.down, cur.down,
                                     "\(rarity) +\(level) → 하락 위험이 커져야 한다")
            }
        }
    }

    /// 3분기 확률의 합은 항상 1 이다 (UI 가 keep 을 여집합으로 그려도 어긋나지 않게).
    func testOutcomeRatesAlwaysSumToOne() {
        for rarity in Rarity.allCases {
            for level in 0...(UpHeroRules.maxEnhanceLevel - 1) {
                let r = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
                XCTAssertEqual(r.destroy + r.down + r.keep, 1.0, accuracy: 0.000001,
                               "\(rarity) +\(level)")
                XCTAssertGreaterThanOrEqual(r.keep, 0)
            }
        }
    }

    /// 상한을 넘는 레벨은 마지막 구간(+19) 값으로 고정 (배열 인덱스 초과 크래시 방지).
    func testLevelBeyondTableClampsToLast() {
        let last = UpHeroRules.enhanceOutcomeRates(rarity: .normal, currentLevel: 19)
        XCTAssertEqual(UpHeroRules.enhanceOutcomeRates(rarity: .normal, currentLevel: 99), last)
        XCTAssertEqual(UpHeroRules.enhanceDestroyOnFail.count, 20)
        XCTAssertEqual(UpHeroRules.enhanceDownOnFail.count, 20)
    }

    /// 등급이 높을수록 **소실**에 유리하다 (legend 는 시도 비용이 ×4 라 손실이 극단적).
    /// 하락에는 등급 보정이 없다 — 되돌릴 수 있는 손실까지 깎으면 상위 등급이 무손실이 된다.
    func testHigherRarityLosesItemLessOften() {
        let lv = 9
        let normal = UpHeroRules.enhanceDestroyRate(rarity: .normal, currentLevel: lv)
        let rare = UpHeroRules.enhanceDestroyRate(rarity: .rare, currentLevel: lv)
        let unique = UpHeroRules.enhanceDestroyRate(rarity: .unique, currentLevel: lv)
        let legend = UpHeroRules.enhanceDestroyRate(rarity: .legend, currentLevel: lv)
        XCTAssertEqual(normal, rare)                  // 웹 배율 normal=rare=1
        XCTAssertGreaterThan(rare, unique)
        XCTAssertGreaterThan(unique, legend)
        // 구 규칙(레벨 무관 legend 소실 50%)보다 최악 구간에서도 확실히 낫다.
        XCTAssertLessThan(legend, 0.5)

        for rarity in Rarity.allCases {
            XCTAssertEqual(UpHeroRules.enhanceDowngradeRate(rarity: rarity, currentLevel: lv),
                           UpHeroRules.enhanceDowngradeRate(rarity: .normal, currentLevel: lv),
                           "하락에는 등급 보정이 없어야 한다")
        }
    }

    /// 웹 `ENHANCE_DESTROY_RARITY_MULT` 와 표 값의 곱이 그대로 나와야 한다.
    /// 한쪽만 고치면 웹↔iOS 확률이 어긋난다.
    func testRatesMatchWebTables() {
        let expectedMult: [Rarity: Double] = [
            .normal: 1.0, .rare: 1.0, .unique: 0.85, .legend: 0.7,
        ]
        for (rarity, mult) in expectedMult {
            XCTAssertEqual(UpHeroRules.enhanceDestroyRarityMult[rarity], mult)
        }
        // +9→+10 : destroy 표 0.26, down 표 0.45.
        XCTAssertEqual(UpHeroRules.enhanceDestroyRate(rarity: .legend, currentLevel: 9),
                       0.26 * 0.7, accuracy: 0.000001)
        XCTAssertEqual(UpHeroRules.enhanceDowngradeRate(rarity: .legend, currentLevel: 9),
                       0.45, accuracy: 0.000001)
        // +3→+4 : 위험이 처음 붙는 계단. 소실 1%, 하락 10%.
        XCTAssertEqual(UpHeroRules.enhanceDestroyRate(rarity: .normal, currentLevel: 3),
                       0.01, accuracy: 0.000001)
        XCTAssertEqual(UpHeroRules.enhanceDowngradeRate(rarity: .normal, currentLevel: 3),
                       0.10, accuracy: 0.000001)
    }

    /// 하락 확률은 소실이 먹고 남은 확률 공간을 넘지 못한다 (합이 1 을 넘지 않게).
    func testDowngradeNeverOverflowsRemainingSpace() {
        for rarity in Rarity.allCases {
            for level in 0...(UpHeroRules.maxEnhanceLevel - 1) {
                let r = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
                XCTAssertLessThanOrEqual(r.destroy + r.down, 1.0)
            }
        }
    }

    // MARK: - 웹 공식 일치 (개편에서 건드리지 않은 상수들)

    /// 웹 `enhanceSuccessRate` 스팟 값 (uphero.test.ts 와 같은 기준점).
    func testSuccessRateMatchesWeb() {
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .normal, currentLevel: 0), 0.95, accuracy: 0.0001)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .rare, currentLevel: 0), 0.90, accuracy: 0.0001)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .unique, currentLevel: 0), 0.75, accuracy: 0.0001)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 0), 0.75, accuracy: 0.0001)
        // legend +9 = 75 - 63 = 12%
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 9), 0.12, accuracy: 0.0001)
        // Phase 5-B — 표 범위를 넘는 레벨은 +19 로 고정되고 바닥은 1% 다 / 상한 100%
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 99),
                       UpHeroRules.enhanceHighMinSuccess, accuracy: 1e-12)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 99),
                       UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 19), accuracy: 1e-12)
        XCTAssertEqual(UpHeroRules.enhanceHighMinSuccess, 0.01)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 0, failStreak: 100), 1.0, accuracy: 0.0001)
        // soft pity — legend +4%p / fail
        XCTAssertEqual(
            UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 5, failStreak: 3)
                - UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 5),
            0.12, accuracy: 0.0001)
    }

    /// 웹 `enhanceCost` — base 30 × (1 + level×0.5) × rarityMult × 밴드 배율, 반올림.
    func testCostMatchesWeb() {
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .normal, currentLevel: 0), 30)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .legend, currentLevel: 0), 120)
        // 30 × 2.5 × 2.5 = 187.5 → 188 (웹 Math.round 와 같은 half-up)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .unique, currentLevel: 3), 188)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .normal, currentLevel: -5),
                       UpHeroRules.enhanceCost(rarity: .normal, currentLevel: 0))
        // Phase 5-B — 0..9 는 바이트 동일, 10..14 ×1.5, 15..19 ×2 (마지막 인자).
        let base: [Rarity: [Int]] = [
            .normal: [30, 45, 60, 75, 90, 105, 120, 135, 150, 165],
            .rare: [45, 68, 90, 113, 135, 158, 180, 203, 225, 248],
            .unique: [75, 113, 150, 188, 225, 263, 300, 338, 375, 413],
            .legend: [120, 180, 240, 300, 360, 420, 480, 540, 600, 660],
        ]
        let high: [Rarity: [Int]] = [
            .normal: [270, 293, 315, 338, 360, 510, 540, 570, 600, 630],
            .rare: [405, 439, 473, 506, 540, 765, 810, 855, 900, 945],
            .unique: [675, 731, 788, 844, 900, 1275, 1350, 1425, 1500, 1575],
            .legend: [1080, 1170, 1260, 1350, 1440, 2040, 2160, 2280, 2400, 2520],
        ]
        for rarity in Rarity.allCases {
            for lv in 0..<10 {
                XCTAssertEqual(UpHeroRules.enhanceCost(rarity: rarity, currentLevel: lv), base[rarity]![lv])
                XCTAssertEqual(UpHeroRules.enhanceCost(rarity: rarity, currentLevel: 10 + lv), high[rarity]![lv])
            }
        }
        XCTAssertEqual(UpHeroRules.enhanceCostBandMult(currentLevel: 9), 1)
        XCTAssertEqual(UpHeroRules.enhanceCostBandMult(currentLevel: 10), 1.5)
        XCTAssertEqual(UpHeroRules.enhanceCostBandMult(currentLevel: 14), 1.5)
        XCTAssertEqual(UpHeroRules.enhanceCostBandMult(currentLevel: 15), 2)
        XCTAssertEqual(UpHeroRules.enhanceCostBandMult(currentLevel: 19), 2)
        // 스팟 값 (웹 uphero.test.ts 와 같은 픽스처)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .normal, currentLevel: 10), 270)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .rare, currentLevel: 11), 439)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .unique, currentLevel: 13), 844)
        XCTAssertEqual(UpHeroRules.enhanceCost(rarity: .legend, currentLevel: 19), 2520)
    }

    // MARK: - Phase 5-B — 상위 밴드 표 (웹 uphero.test.ts 스냅샷)

    /// 성공률 표 스냅샷 0..19 × 4 등급 (0..9 는 바이트 동일). 웹 ENHANCE_HIGH_SUCCESS_BY_LEVEL.
    func testSuccessTableSnapshot() {
        XCTAssertEqual(UpHeroRules.maxEnhanceLevel, 20)
        XCTAssertEqual(UpHeroRules.enhanceHighBandStart, 10)
        let table: [Rarity: [Int]] = [
            .normal: [95, 92, 89, 86, 83, 80, 77, 74, 71, 68, 50, 40, 31, 24, 18, 13, 9, 5, 3, 1],
            .rare: [90, 86, 82, 78, 74, 70, 66, 62, 58, 54, 40, 32, 25, 19, 14, 10, 7, 4, 2, 1],
            .unique: [75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 24, 20, 16, 12, 9, 7, 5, 3, 2, 1],
            .legend: [75, 68, 61, 54, 47, 40, 33, 26, 19, 12, 12, 10, 8, 6, 5, 4, 3, 2, 2, 1],
        ]
        for rarity in Rarity.allCases {
            for lv in 0..<UpHeroRules.maxEnhanceLevel {
                XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: rarity, currentLevel: lv),
                               Double(table[rarity]![lv]) / 100, accuracy: 1e-10,
                               "\(rarity) +\(lv)")
            }
            XCTAssertEqual(UpHeroRules.enhanceHighSuccessByLevel[rarity],
                           Array(table[rarity]![UpHeroRules.enhanceHighBandStart...]))
        }
    }

    /// 상위 밴드 pity 는 등급 보너스를 **대체** 한다 (normal/rare/unique 2%p, legend 3%p).
    func testHighBandPityReplacesRarityBonus() {
        XCTAssertEqual(UpHeroRules.enhanceHighPityPerFail,
                       [.normal: 0.02, .rare: 0.02, .unique: 0.02, .legend: 0.03])
        // legend +19: 1% + 5 × 3%p = 16%
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 19, failStreak: 5),
                       0.16, accuracy: 1e-10)
        // normal +19: 1% + 49 × 2%p = 99%, 50 회면 100% 포화
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .normal, currentLevel: 19, failStreak: 49),
                       0.99, accuracy: 1e-10)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .normal, currentLevel: 19, failStreak: 50), 1)
        // unique +10: 24% + 3 × 2%p (밴드 밖 0.02 와 같은 값이지만 더하지 않는다)
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .unique, currentLevel: 10, failStreak: 3),
                       0.3, accuracy: 1e-10)
        // 밴드 밖 (0..9) 은 예전 pity 그대로: legend +9 streak 5 = 12% + 20%p
        XCTAssertEqual(UpHeroRules.enhanceSuccessRate(rarity: .legend, currentLevel: 9, failStreak: 5),
                       0.32, accuracy: 1e-10)
    }

    /// 중간 밴드 10..14 는 모든 등급에서 소실 0 / 하락 1 / 유지 0.
    func testMidBandIsDownOnly() {
        for rarity in Rarity.allCases {
            for lv in UpHeroRules.enhanceHighBandStart..<UpHeroRules.enhanceTitleAwakenedLevel {
                let r = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: lv)
                XCTAssertEqual(r, EnhanceOutcomeRates(destroy: 0, down: 1, keep: 0), "\(rarity) +\(lv)")
                XCTAssertFalse(UpHeroRules.canEnhanceDestroy(rarity: rarity, currentLevel: lv))
                XCTAssertTrue(UpHeroRules.canEnhanceDowngrade(rarity: rarity, currentLevel: lv))
                XCTAssertFalse(UpHeroRules.isEnhanceSafeLevel(rarity: rarity, currentLevel: lv))
            }
        }
    }

    /// 상위 밴드 15..19 는 소실이 단조 상승하고 normal/rare 의 유지는 정확히 0 (스냅).
    func testTopBandDestroyRisesAndKeepSnapsToZero() {
        for rarity in Rarity.allCases {
            for lv in UpHeroRules.enhanceTitleAwakenedLevel..<(UpHeroRules.maxEnhanceLevel - 1) {
                XCTAssertGreaterThan(
                    UpHeroRules.enhanceDestroyRate(rarity: rarity, currentLevel: lv + 1),
                    UpHeroRules.enhanceDestroyRate(rarity: rarity, currentLevel: lv))
            }
        }
        for lv in UpHeroRules.enhanceTitleAwakenedLevel..<UpHeroRules.maxEnhanceLevel {
            // 1 - 0.7 - 0.3 은 double 에서 5e-17 인데 스냅으로 정확히 0 이어야 한다.
            XCTAssertEqual(UpHeroRules.enhanceOutcomeRates(rarity: .normal, currentLevel: lv).keep, 0)
            XCTAssertEqual(UpHeroRules.enhanceOutcomeRates(rarity: .rare, currentLevel: lv).keep, 0)
        }
        let l19 = UpHeroRules.enhanceOutcomeRates(rarity: .legend, currentLevel: 19)
        XCTAssertEqual(l19.destroy, 0.49, accuracy: 1e-10)
        XCTAssertEqual(l19.down, 0.3, accuracy: 1e-10)
        XCTAssertEqual(l19.keep, 0.21, accuracy: 1e-10)
        XCTAssertEqual(UpHeroRules.enhanceOutcomeRates(rarity: .unique, currentLevel: 15).destroy,
                       0.255, accuracy: 1e-10)
        XCTAssertEqual(UpHeroRules.enhanceOutcomeRates(rarity: .normal, currentLevel: 15),
                       EnhanceOutcomeRates(destroy: 0.3, down: 0.7, keep: 0))
        XCTAssertEqual(Array(UpHeroRules.enhanceDestroyOnFail[0..<10]),
                       [0, 0, 0, 0.01, 0.02, 0.05, 0.09, 0.14, 0.2, 0.26])
        XCTAssertEqual(Array(UpHeroRules.enhanceDestroyOnFail[10...]),
                       [0, 0, 0, 0, 0, 0.3, 0.4, 0.5, 0.6, 0.7])
    }

    /// 칭호 / 연출 밴드 경계 (웹 getEnhanceTitle / enhanceRitualBand).
    func testTitleAndRitualBandThresholds() {
        XCTAssertNil(UpHeroRules.enhanceTitle(level: 0))
        XCTAssertNil(UpHeroRules.enhanceTitle(level: 14))
        XCTAssertEqual(UpHeroRules.enhanceTitle(level: 15), .awakened)
        XCTAssertEqual(UpHeroRules.enhanceTitle(level: 19), .awakened)
        XCTAssertEqual(UpHeroRules.enhanceTitle(level: 20), .transcended)
        XCTAssertEqual(UpHeroRules.enhanceRitualBand(targetLevel: 1), 0)
        XCTAssertEqual(UpHeroRules.enhanceRitualBand(targetLevel: 10), 0)
        XCTAssertEqual(UpHeroRules.enhanceRitualBand(targetLevel: 11), 1)
        XCTAssertEqual(UpHeroRules.enhanceRitualBand(targetLevel: 15), 1)
        XCTAssertEqual(UpHeroRules.enhanceRitualBand(targetLevel: 16), 2)
        XCTAssertEqual(UpHeroRules.enhanceRitualBand(targetLevel: 20), 2)
    }

    /// 스탯 성장 1..20 정방향 {str:10,dex:3} → {str:25,dex:8}, 역방향은 정확히 원본.
    func testStatGrowthRoundTrip() {
        let original: [StatKey: Int] = [.str: 10, .dex: 3]
        var stats = original
        var snapshots = [stats]
        for level in 1...20 {
            stats = UpHeroRules.applyEnhanceStatGrowth(stats, newLevel: level)
            snapshots.append(stats)
        }
        XCTAssertEqual(stats, [.str: 25, .dex: 8])
        for level in stride(from: 20, through: 1, by: -1) {
            stats = UpHeroRules.revertEnhanceStatGrowth(stats, lostLevel: level)
            XCTAssertEqual(stats, snapshots[level - 1], "+\(level) 역")
        }
        XCTAssertEqual(stats, original)
        // 마일스톤: +15 secondary +2, +20 +3, 그 외는 primary 만
        XCTAssertEqual(UpHeroRules.applyEnhanceStatGrowth([.str: 20, .dex: 4], newLevel: 15), [.str: 21, .dex: 6])
        XCTAssertEqual(UpHeroRules.applyEnhanceStatGrowth([.str: 30, .dex: 5], newLevel: 20), [.str: 31, .dex: 8])
        XCTAssertEqual(UpHeroRules.applyEnhanceStatGrowth([.str: 20, .dex: 4], newLevel: 14), [.str: 21, .dex: 4])
        XCTAssertEqual(UpHeroRules.applyEnhanceStatGrowth([.str: 5, .dex: 2], newLevel: 9), [.str: 5, .dex: 2])
        XCTAssertEqual(UpHeroRules.applyEnhanceStatGrowth([.str: 5, .dex: 2], newLevel: 10), [.str: 6, .dex: 2])
        // 단일 스탯 장비는 마일스톤 보너스도 primary 로
        XCTAssertEqual(UpHeroRules.applyEnhanceStatGrowth([.str: 5], newLevel: 15), [.str: 8])
        XCTAssertEqual(UpHeroRules.revertEnhanceStatGrowth([.str: 8], lostLevel: 15), [.str: 5])
        XCTAssertEqual(UpHeroRules.applyEnhanceStatGrowth([.crit: 7], newLevel: 20), [.crit: 11])
        // 0 아래로 내리지 않는다
        XCTAssertEqual(UpHeroRules.revertEnhanceStatGrowth([.str: 0, .dex: 1], lostLevel: 15), [.str: 0, .dex: 0])
        // 누적 primary 증가량
        XCTAssertEqual(UpHeroRules.enhancePrimaryGrowthTotal(level: 0), 0)
        XCTAssertEqual(UpHeroRules.enhancePrimaryGrowthTotal(level: 3), 1)
        XCTAssertEqual(UpHeroRules.enhancePrimaryGrowthTotal(level: 10), 5)
        XCTAssertEqual(UpHeroRules.enhancePrimaryGrowthTotal(level: 15), 10)
        XCTAssertEqual(UpHeroRules.enhancePrimaryGrowthTotal(level: 20), 15)
    }

    /// legend 픽스처 {str:45,crit:7,int:6,vit:6} → secondary 는 int (crit 제외, 동률은 순서).
    func testSecondaryStatKeyExcludesCrit() {
        let stats: [StatKey: Int] = [.str: 45, .crit: 7, .int: 6, .vit: 6]
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey(stats), .str)
        XCTAssertEqual(UpHeroRules.pickSecondaryStatKey(stats, primary: .str), .int)
        XCTAssertEqual(UpHeroRules.applyEnhanceStatGrowth(stats, newLevel: 15),
                       [.str: 46, .crit: 7, .int: 8, .vit: 6])
    }

    /// 상점가·상한은 웹 `SHOP_PRICES.downGuard` / `ENHANCE_GUARD_MAX` 와 같아야 한다.
    func testGuardPriceAndCapMatchWeb() {
        XCTAssertEqual(ShopPrices.downGuard, 150)
        XCTAssertEqual(UpHeroRules.enhanceGuardMax, 99)
    }

    /// 웹 `stripEnhanceSuffix` 정규식(`/\s+\+\d*$/`) 동치.
    func testStripEnhanceSuffix() {
        XCTAssertEqual(UpHeroRules.stripEnhanceSuffix("자기절제의 검 +3"), "자기절제의 검")
        XCTAssertEqual(UpHeroRules.stripEnhanceSuffix("꾸준함의 방패 +"), "꾸준함의 방패")
        XCTAssertEqual(UpHeroRules.stripEnhanceSuffix("평범한 검"), "평범한 검")
        // 중간의 + 는 건드리지 않는다.
        XCTAssertEqual(UpHeroRules.stripEnhanceSuffix("검 +3 조각"), "검 +3 조각")
    }

    /// 웹 `pickPrimaryStatKey` — 최대값 키, 동률은 선언 순서(str→…→slotBonus).
    /// 하락 경로가 성공 경로의 역연산이 되려면 같은 키를 돌려줘야 한다.
    func testPickPrimaryStatKey() {
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey([.str: 4, .crit: 1]), .str)
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey([.crit: 9, .str: 4]), .crit)
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey([.agi: 3, .int: 3]), .int)  // 동률 → 선언 순서
        XCTAssertNil(UpHeroRules.pickPrimaryStatKey([:]))
    }

    /// 성공(짝수 레벨 primary +1) → 하락(같은 키 -1) 왕복이 닫히는지.
    /// 스토어 두 분기가 같은 규칙을 쓰는지 확인하는 대리 검증이다.
    func testStatBumpRoundTripsThroughPrimaryKey() {
        let stats: [StatKey: Int] = [.str: 4, .crit: 1]
        let primary = UpHeroRules.pickPrimaryStatKey(stats)
        XCTAssertEqual(primary, .str)
        var bumped = stats
        bumped[.str] = (bumped[.str] ?? 0) + 1
        // 성공 직후에도 같은 키가 최대값이라 역연산이 같은 키를 고른다.
        XCTAssertEqual(UpHeroRules.pickPrimaryStatKey(bumped), .str)
    }

    // MARK: - 방지권 왕복 (CodingKeys 누락 방지)

    /// 로컬 영속 스냅샷 왕복 — 앱 재시작에서 방지권이 사라지지 않는지.
    func testGuardsSurviveLocalPersistence() throws {
        var state = UpHeroStore.makeDefaultState()
        state.destroyGuards = 7
        state.downGuards = 3
        let data = try JSONEncoder().encode(PersistedUpHeroState(state))
        let restored = try JSONDecoder().decode(PersistedUpHeroState.self, from: data).toState()
        XCTAssertEqual(restored.destroyGuards, 7)
        XCTAssertEqual(restored.downGuards, 3)
    }

    /// 클라우드 와이어 왕복 — 웹↔iOS 에서 개수가 조용히 사라지지 않는지.
    /// 와이어 키는 "destroyGuards" / "downGuards" (웹과 바이트 동일).
    func testGuardsRoundTripThroughCloudWire() throws {
        var state = UpHeroStore.makeDefaultState()
        state.coins = 10
        state.destroyGuards = 4
        state.downGuards = 2

        let payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        XCTAssertEqual(payload["destroyGuards"] as? Int, 4, "와이어 키가 빠졌다")
        XCTAssertEqual(payload["downGuards"] as? Int, 2, "와이어 키가 빠졌다")

        let data = try JSONEncoder().encode(CloudUpHeroState(state))
        let decoded = try JSONDecoder().decode(CloudUpHeroState.self, from: data)
        XCTAssertEqual(decoded.destroyGuards, 4)
        XCTAssertEqual(decoded.downGuards, 2)
        XCTAssertEqual(decoded.toState().destroyGuards, 4)
        XCTAssertEqual(decoded.toState().downGuards, 2)
    }

    /// 0 도 항상 실린다 — 키를 빼면 setDoc(merge) 가 클라우드에 남은 예전 개수를 되살려
    /// 다 쓴 방지권이 기기를 옮길 때마다 부활한다.
    func testZeroGuardsStillEncoded() throws {
        let state = UpHeroStore.makeDefaultState()
        let payload = try XCTUnwrap(CloudUpHeroState(state).firestoreValue())
        XCTAssertEqual(payload["destroyGuards"] as? Int, 0)
        XCTAssertEqual(payload["downGuards"] as? Int, 0)
    }

    /// 구 저장본(키 없음)은 0, 손상된 값은 클램프, legacy `protectCharms` 는
    /// 소실방지권으로 읽어준다 (단일 보호 소모품 시절 저장본 호환 — 웹과 같은 폴백).
    func testMissingBrokenAndLegacyGuardValues() throws {
        let legacy = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"coins": 5}"#.utf8))
        XCTAssertEqual(legacy.destroyGuards, 0)
        XCTAssertEqual(legacy.downGuards, 0)

        let oldKey = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"protectCharms": 3}"#.utf8))
        XCTAssertEqual(oldKey.destroyGuards, 3, "legacy protectCharms 가 증발했다")

        // 새 키가 있으면 legacy 는 무시된다.
        let both = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"protectCharms": 3, "destroyGuards": 9}"#.utf8))
        XCTAssertEqual(both.destroyGuards, 9)

        let overflow = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"destroyGuards": 99999, "downGuards": 12345}"#.utf8))
        XCTAssertEqual(overflow.destroyGuards, UpHeroRules.enhanceGuardMax)
        XCTAssertEqual(overflow.downGuards, UpHeroRules.enhanceGuardMax)

        let negative = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"destroyGuards": -4, "downGuards": -1}"#.utf8))
        XCTAssertEqual(negative.destroyGuards, 0)
        XCTAssertEqual(negative.downGuards, 0)

        let garbage = try JSONDecoder().decode(
            CloudUpHeroState.self, from: Data(#"{"destroyGuards": "많이"}"#.utf8))
        XCTAssertEqual(garbage.destroyGuards, 0)
    }

    /// 방지권 보유는 그 자체로 플레이 흔적이다 (코인을 쓰거나 던전을 돌아야 생긴다).
    /// 빠지면 방지권만 가진 계정이 클라우드 복원에서 빈 값으로 덮인다.
    func testGuardsCountAsFootprint() {
        let empty = UpHeroStore.makeDefaultState()
        XCTAssertFalse(empty.hasUpHeroFootprint)

        var withDestroy = empty
        withDestroy.destroyGuards = 1
        XCTAssertTrue(withDestroy.hasUpHeroFootprint)
        XCTAssertTrue(CloudUpHeroState(withDestroy).hasFootprint)

        var withDown = empty
        withDown.downGuards = 1
        XCTAssertTrue(withDown.hasUpHeroFootprint)
        XCTAssertTrue(CloudUpHeroState(withDown).hasFootprint)
    }

    // MARK: - 상점 구매 / 지급

    /// 스토어 인스턴스를 테스트 종료 후에도 살려 둔다. @MainActor ObservableObject 를
    /// 유닛 테스트 안에서 해제하면 Swift 런타임의 MainActor deinit back-deploy 경로가
    /// libmalloc 에서 abort 한다 (이 리포지토리의 Xcode/시뮬레이터 조합에서 재현).
    /// 스토어 자체 문제가 아니라 테스트 호스트에서의 해제 타이밍 문제라, 참조를 붙들어
    /// 해제를 피한다.
    private static var sharedStore: UpHeroStore?

    @MainActor
    private func makeStore() -> UpHeroStore {
        if let s = Self.sharedStore { return s }
        let s = UpHeroStore()
        Self.sharedStore = s
        return s
    }

    /// 하락방지권만 상점 품목이다 — 소실방지권은 팔지 않는다(드롭 전용).
    func testPurchaseDownGuard() {
        let store = makeStore()
        store.resetAllData()

        XCTAssertEqual(store.purchaseDownGuard(), .noCoin)
        XCTAssertEqual(store.state.downGuards ?? 0, 0)

        store.addCoins(ShopPrices.downGuard * 2)
        XCTAssertEqual(store.purchaseDownGuard(), .ok)
        XCTAssertEqual(store.state.downGuards, 1)
        XCTAssertEqual(store.state.coins, ShopPrices.downGuard)

        XCTAssertEqual(store.purchaseDownGuard(), .ok)
        XCTAssertEqual(store.state.downGuards, 2)
        XCTAssertEqual(store.state.coins, 0)
        // 구매로는 소실방지권이 늘지 않는다.
        XCTAssertEqual(store.state.destroyGuards ?? 0, 0)

        store.resetAllData()
    }

    /// 드롭 지급 입구 — 상한을 넘는 만큼은 버리고 실제로 늘어난 수만 돌려준다.
    func testGrantEnhanceGuardsClampsAtCap() {
        let store = makeStore()
        store.resetAllData()

        let first = store.grantEnhanceGuards(destroy: 2, down: 1)
        XCTAssertEqual(first.destroy, 2)
        XCTAssertEqual(first.down, 1)
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 1)

        // 음수는 무시.
        let none = store.grantEnhanceGuards(destroy: -5)
        XCTAssertEqual(none.destroy, 0)
        XCTAssertEqual(store.state.destroyGuards, 2)

        // 상한 초과분은 버린다.
        let capped = store.grantEnhanceGuards(destroy: 500)
        XCTAssertEqual(capped.destroy, UpHeroRules.enhanceGuardMax - 2)
        XCTAssertEqual(store.state.destroyGuards, UpHeroRules.enhanceGuardMax)

        store.resetAllData()
    }

    // MARK: - Phase 5-B — 시도당 방지권 소모 매트릭스 (소모 == armed)

    /// 난수를 손으로 집는 소스 — 성공 롤 → 결과 롤 순서로 소비된다 (웹 queueRolls).
    private struct ScriptedRandom: RandomSource {
        var values: [Double]
        mutating func unit() -> Double { values.isEmpty ? 0.5 : values.removeFirst() }
    }

    private static let rollFail = 0.9999
    private static let rollDestroy = 0.0001   // 소실 구간 (rates.destroy > 0 일 때)
    private static let rollKeep = 0.9999      // 유지 구간

    private func makeItem(
        id: String = "it-1", rarity: Rarity = .rare, level: Int,
        stats: [StatKey: Int] = [.str: 5, .dex: 2], photoId: String? = nil
    ) -> Equipment {
        Equipment(
            id: id, name: level > 0 ? "쇠검 +\(level)" : "쇠검", baseId: "iron_sword",
            type: photoId == nil ? .weapon : .talisman, rarity: rarity, category: .fitness,
            iconName: "sword", stats: stats, photoId: photoId, enhanceLevel: level,
            enhanceFailStreak: 0)
    }

    private func seed(_ store: UpHeroStore, item: Equipment, destroy: Int = 2, down: Int = 2) {
        store.resetAllData()
        store.debugSetState { s in
            s.inventory = [item]
            s.coins = 100_000
            s.destroyGuards = destroy
            s.downGuards = down
        }
    }

    private func downRoll(_ rarity: Rarity, _ level: Int) -> Double {
        let r = UpHeroRules.enhanceOutcomeRates(rarity: rarity, currentLevel: level)
        XCTAssertGreaterThan(r.down, 0)
        return r.destroy + r.down / 2
    }

    /// rare +6 (소실 5%·하락 25%) 둘 다 걸기 — 성공/유지/막힌 소실/막힌 하락 전부 {1,1}.
    func testBothArmedSpendOneEachRegardlessOfOutcome() {
        let store = makeStore()
        let both = EnhanceGuardArm(destroy: true, down: true)
        let spentBoth = EnhanceGuardSpend(destroy: 1, down: 1)
        let cases: [(String, [Double])] = [
            ("success", [0.0001]),
            ("keep", [Self.rollFail, Self.rollKeep]),
            ("guarded-destroy", [Self.rollFail, Self.rollDestroy]),
            ("guarded-down", [Self.rollFail, downRoll(.rare, 6)]),
        ]
        for (name, rolls) in cases {
            seed(store, item: makeItem(level: 6))
            var rng = ScriptedRandom(values: rolls)
            let r = store.enhanceItem("it-1", guards: both, rng: &rng)
            XCTAssertEqual(r.spent, spentBoth, name)
            XCTAssertEqual(store.state.destroyGuards, 1, name)
            XCTAssertEqual(store.state.downGuards, 1, name)
            XCTAssertEqual(store.state.inventory.count, 1, name)
            switch (name, r) {
            case ("success", .success(let item, let prev, _)):
                XCTAssertEqual(prev, 6); XCTAssertEqual(item.enhanceLevel, 7)
                XCTAssertEqual(item.stats, [.str: 5, .dex: 2])   // +7 은 홀수 — 성장 없음
            case ("keep", .keep(let item, _)):
                XCTAssertEqual(item.enhanceLevel, 6); XCTAssertEqual(item.enhanceFailStreak, 1)
            case ("guarded-destroy", .guarded(let item, let kind, _)):
                XCTAssertEqual(kind, .destroy); XCTAssertEqual(item.enhanceLevel, 6)
            case ("guarded-down", .guarded(let item, let kind, _)):
                XCTAssertEqual(kind, .down); XCTAssertEqual(item.enhanceLevel, 6)
            default:
                XCTFail("\(name): 예상 밖 결과 \(r)")
            }
        }
        store.resetAllData()
    }

    /// 하락방지권만 걸고 소실 → 소실된다, 하락방지권은 그래도 나간다 {0,1}.
    /// 소실방지권만 걸고 하락 → 내려간다, 소실방지권만 나간다 {1,0}.
    func testPartialArmSpendsOnlyArmedWard() {
        let store = makeStore()
        seed(store, item: makeItem(level: 6))
        var rng = ScriptedRandom(values: [Self.rollFail, Self.rollDestroy])
        let destroyed = store.enhanceItem(
            "it-1", guards: EnhanceGuardArm(destroy: false, down: true), rng: &rng)
        guard case .destroyed(_, let spentD) = destroyed else { return XCTFail("\(destroyed)") }
        XCTAssertEqual(spentD, EnhanceGuardSpend(destroy: 0, down: 1))
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 1)
        XCTAssertTrue(store.state.inventory.isEmpty)

        seed(store, item: makeItem(level: 6))
        rng = ScriptedRandom(values: [Self.rollFail, downRoll(.rare, 6)])
        let down = store.enhanceItem(
            "it-1", guards: EnhanceGuardArm(destroy: true, down: false), rng: &rng)
        guard case .down(let item, let prev, let spentU) = down else { return XCTFail("\(down)") }
        XCTAssertEqual(prev, 6)
        XCTAssertEqual(item.enhanceLevel, 5)
        XCTAssertEqual(item.name, "쇠검 +5")
        XCTAssertEqual(item.stats, [.str: 4, .dex: 2])   // +6 의 primary +1 이 되돌아간다
        XCTAssertEqual(spentU, EnhanceGuardSpend(destroy: 1, down: 0))
        XCTAssertEqual(store.state.destroyGuards, 1)
        XCTAssertEqual(store.state.downGuards, 2)
        store.resetAllData()
    }

    /// rare +12 (소실 0 / 하락 100%) — 결과는 성공 또는 막힌 하락뿐, 소실방지권은 절대 안 나간다.
    func testMidBandNeverSpendsDestroyWard() {
        let store = makeStore()
        let both = EnhanceGuardArm(destroy: true, down: true)
        seed(store, item: makeItem(level: 12))
        var rng = ScriptedRandom(values: [Self.rollFail, 0])
        let failed = store.enhanceItem("it-1", guards: both, rng: &rng)
        guard case .guarded(let kept, let kind, let spent) = failed else { return XCTFail("\(failed)") }
        XCTAssertEqual(kind, .down)
        XCTAssertEqual(kept.enhanceLevel, 12)
        XCTAssertEqual(spent, EnhanceGuardSpend(destroy: 0, down: 1))
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 1)

        rng = ScriptedRandom(values: [0.0001])
        let ok = store.enhanceItem("it-1", guards: both, rng: &rng)
        guard case .success(let item, _, let spent2) = ok else { return XCTFail("\(ok)") }
        XCTAssertEqual(item.enhanceLevel, 13)
        XCTAssertEqual(spent2, EnhanceGuardSpend(destroy: 0, down: 1))
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 0)
        store.resetAllData()
    }

    /// 보유 0 / 안전 구간 / 코인 부족 / 걸지 않음 — 아무것도 나가지 않는다 {0,0}.
    func testNothingSpentWhenNotArmable() {
        let store = makeStore()
        let both = EnhanceGuardArm(destroy: true, down: true)

        // 보유 0 — 소실이 그대로 나고 개수는 음수로 내려가지 않는다.
        seed(store, item: makeItem(level: 6), destroy: 0, down: 0)
        var rng = ScriptedRandom(values: [Self.rollFail, Self.rollDestroy])
        let destroyed = store.enhanceItem("it-1", guards: both, rng: &rng)
        guard case .destroyed(_, let s1) = destroyed else { return XCTFail("\(destroyed)") }
        XCTAssertEqual(s1, .zero)
        XCTAssertEqual(store.state.destroyGuards, 0)
        XCTAssertEqual(store.state.downGuards, 0)

        // 안전 구간 (+1) — 걸어도 arm 되지 않는다.
        seed(store, item: makeItem(level: 1))
        rng = ScriptedRandom(values: [Self.rollFail, 0])
        let kept = store.enhanceItem("it-1", guards: both, rng: &rng)
        guard case .keep(_, let s2) = kept else { return XCTFail("\(kept)") }
        XCTAssertEqual(s2, .zero)
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 2)

        // 코인 부족 — 시도 자체가 성립하지 않는다.
        seed(store, item: makeItem(level: 6))
        store.debugSetState { $0.coins = 0 }
        rng = ScriptedRandom(values: [Self.rollFail, Self.rollDestroy])
        let short = store.enhanceItem("it-1", guards: both, rng: &rng)
        guard case .coinShort(let need) = short else { return XCTFail("\(short)") }
        XCTAssertEqual(need, UpHeroRules.enhanceCost(rarity: .rare, currentLevel: 6))
        XCTAssertEqual(short.spent, .zero)
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 2)
        XCTAssertEqual(store.state.inventory.first?.enhanceLevel, 6)

        // 걸지 않으면 (기본값 둘 다 OFF) 나가지 않는다.
        seed(store, item: makeItem(level: 6))
        rng = ScriptedRandom(values: [Self.rollFail, Self.rollKeep])
        let plain = store.enhanceItem("it-1", rng: &rng)
        XCTAssertEqual(plain.spent, .zero)
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 2)
        store.resetAllData()
    }

    /// 통계 불변식 — 확률을 실제로 굴려도 '소모 총량 == armed 시도 수' (웹 upHeroGuardConsumption).
    func testSpentEqualsArmedAttemptsStatistically() {
        let store = makeStore()
        let both = EnhanceGuardArm(destroy: true, down: true)
        let n = 400
        var destroySpent = 0
        var downSpent = 0
        for _ in 0..<n {
            seed(store, item: makeItem(level: 8), destroy: 5, down: 5)
            let r = store.enhanceItem("it-1", guards: both)
            destroySpent += 5 - (store.state.destroyGuards ?? 0)
            downSpent += 5 - (store.state.downGuards ?? 0)
            XCTAssertEqual(r.spent, EnhanceGuardSpend(destroy: 1, down: 1))
            switch r {
            case .success, .keep, .guarded: break
            default: XCTFail("둘 다 걸었는데 막히지 않았다: \(r)")
            }
        }
        XCTAssertEqual(destroySpent, n)
        XCTAssertEqual(downSpent, n)
        store.resetAllData()
    }

    // MARK: - Phase 5-B — 상위 밴드 성장 / 상한 / 사진 부적

    /// +14 → +15: primary +1 & secondary +2, 이름 " +15"; 하락 15 → 14 는 정확한 역.
    func testMilestone15GrowthAndReverse() {
        let store = makeStore()
        let original: [StatKey: Int] = [.str: 20, .dex: 4]
        seed(store, item: makeItem(level: 14, stats: original))
        var rng = ScriptedRandom(values: [0.0000001])
        let up = store.enhanceItem("it-1", rng: &rng)
        guard case .success(let item, let prev, _) = up else { return XCTFail("\(up)") }
        XCTAssertEqual(prev, 14)
        XCTAssertEqual(item.enhanceLevel, 15)
        XCTAssertEqual(item.name, "쇠검 +15")
        XCTAssertEqual(item.stats, [.str: 21, .dex: 6])
        XCTAssertEqual(store.state.coins, 100_000 - UpHeroRules.enhanceCost(rarity: .rare, currentLevel: 14))

        rng = ScriptedRandom(values: [Self.rollFail, downRoll(.rare, 15)])
        let down = store.enhanceItem("it-1", rng: &rng)
        guard case .down(let back, let prev2, _) = down else { return XCTFail("\(down)") }
        XCTAssertEqual(prev2, 15)
        XCTAssertEqual(back.enhanceLevel, 14)
        XCTAssertEqual(back.name, "쇠검 +14")
        XCTAssertEqual(back.stats, original)
        store.resetAllData()
    }

    /// +19 → +20: primary +1 & secondary +3, 그 뒤는 maxed (코인·방지권 그대로).
    func testMilestone20ThenMaxed() {
        let store = makeStore()
        seed(store, item: makeItem(level: 19, stats: [.str: 30, .dex: 5]))
        var rng = ScriptedRandom(values: [0.0000001])
        let up = store.enhanceItem("it-1", rng: &rng)
        guard case .success(let item, _, _) = up else { return XCTFail("\(up)") }
        XCTAssertEqual(item.enhanceLevel, 20)
        XCTAssertEqual(item.name, "쇠검 +20")
        XCTAssertEqual(item.stats, [.str: 31, .dex: 8])

        let coins = store.state.coins
        rng = ScriptedRandom(values: [0.0000001])
        let again = store.enhanceItem(
            "it-1", guards: EnhanceGuardArm(destroy: true, down: true), rng: &rng)
        guard case .maxed = again else { return XCTFail("\(again)") }
        XCTAssertEqual(store.state.coins, coins)
        XCTAssertEqual(store.state.destroyGuards, 2)
        XCTAssertEqual(store.state.downGuards, 2)
        store.resetAllData()
    }

    /// 사진 부적(photoId) 은 enhanceItem 으로 와도 +5 에 스킬 1개, +10 은 maxed.
    func testPhotoTalismanCapAndSkillRecompute() {
        let store = makeStore()
        seed(store, item: makeItem(id: "ph-1", level: 4, stats: [.vit: 3], photoId: "photo-1"))
        var rng = ScriptedRandom(values: [0.0000001])
        let up = store.enhanceItem("ph-1", rng: &rng)
        guard case .success(let item, let prev, _) = up else { return XCTFail("\(up)") }
        XCTAssertEqual(prev, 4)
        XCTAssertEqual(item.enhanceLevel, 5)
        XCTAssertEqual(item.talismanSkills?.count, 1)
        XCTAssertEqual(item.talismanSkills,
                       TalismanSkills.computeTalismanSkillIds(category: .fitness, enhanceLevel: 5))

        seed(store, item: makeItem(id: "ph-1", level: 10, stats: [.vit: 3], photoId: "photo-1"))
        rng = ScriptedRandom(values: [0.0000001])
        let maxed = store.enhanceItem("ph-1", rng: &rng)
        guard case .maxed = maxed else { return XCTFail("\(maxed)") }
        XCTAssertEqual(store.state.inventory.first?.enhanceLevel, 10)
        XCTAssertEqual(PhotoTalisman.maxEnhanceLevel, 10)
        store.resetAllData()
    }
}
