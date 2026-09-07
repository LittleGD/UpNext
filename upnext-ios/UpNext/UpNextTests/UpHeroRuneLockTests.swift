//
//  UpHeroRuneLockTests.swift
//  UpNextTests — 룬 자물쇠(rune lock) 판정 + 등급 보너스 (UpHeroSlot.swift).
//
//  2026-09 애플 2.3.6 대응으로 굴림틀이 룬 상자로 바뀌면서 생긴 **유일한 수치 규칙**이다.
//  확률 테이블은 손대지 않았고(그건 UpHeroSlotTests 가 잡는다), 뽑힌 보상 위에 걸쇠
//  정확도가 코인 액수만 곱한다. 아래 기대값은 웹 정본(`src/lib/upHeroSlot.ts`)에서
//  실측한 것이고 동치성 스위트(scripts/equiv/uphero-combat.swift 21번 섹션)와 같은 숫자다.
//

import XCTest
@testable import UpNext

final class UpHeroRuneLockTests: XCTestCase {

    // MARK: - 배율

    func testBonusMultipliers() {
        XCTAssertEqual(UpHeroSlot.runeLockBonus[.plain], 1)
        XCTAssertEqual(UpHeroSlot.runeLockBonus[.good], 1.15)
        XCTAssertEqual(UpHeroSlot.runeLockBonus[.perfect], 1.3)
        XCTAssertEqual(UpHeroSlot.runeLockBonusPercent(.plain), 0)
        XCTAssertEqual(UpHeroSlot.runeLockBonusPercent(.good), 15)
        XCTAssertEqual(UpHeroSlot.runeLockBonusPercent(.perfect), 30)
    }

    /// 코인 결과 3종 × 세 등급. 288 은 287.5 의 위쪽 반올림(JS Math.round 규칙),
    /// 805 는 804.9999… 부동소수를 같은 규칙으로 올린 값이다.
    func testCoinRewardsScaleExactly() {
        let expected: [SlotOutcomeId: [RuneLockTier: Int]] = [
            .coinSmall:   [.plain: 100, .good: 115, .perfect: 130],
            .coinMid:     [.plain: 250, .good: 288, .perfect: 325],
            .coinJackpot: [.plain: 700, .good: 805, .perfect: 910],
        ]
        for (outcome, byTier) in expected {
            for (tier, amount) in byTier {
                let out = UpHeroSlot.applyRuneLockBonus(UpHeroSlot.grant(outcome), tier: tier)
                guard case let .coins(got) = out else {
                    return XCTFail("\(outcome) \(tier) 가 코인이 아니다: \(out)")
                }
                XCTAssertEqual(got, amount, "\(outcome.rawValue) \(tier.rawValue)")
            }
        }
    }

    /// 방지권·장비·버프·꽝은 **개수까지** 불변이다. 방지권 1장을 1.3장으로 만들 수 없고,
    /// 버프 퍼센트가 조작 정확도에 묶이면 전투 밸런스가 흔들린다.
    func testNonCoinRewardsAreUntouched() {
        let ids: [SlotOutcomeId] = [.blank, .rankProtect, .destroyProtect, .itemBox, .battleBuff]
        for id in ids {
            let base = UpHeroSlot.grant(id)
            for tier in RuneLockTier.allCases {
                XCTAssertEqual(
                    UpHeroSlot.applyRuneLockBonus(base, tier: tier), base,
                    "\(id.rawValue) 가 \(tier.rawValue) 에서 바뀌었다")
            }
        }
    }

    // MARK: - 걸쇠 판정

    /// 목표 중심 세 곳 × 경계 안팎 오프셋. 경계값(±0.05 / ±0.13) 자체는 부동소수 오차가
    /// 붙는 자리라 안팎으로 1‰ 씩 비켜 찍는다. 웹 fixture 와 같은 격자다.
    func testTierGridMatchesWeb() {
        let offsets: [Double] = [-0.3, -0.131, -0.129, -0.051, -0.049, 0,
                                 0.049, 0.051, 0.129, 0.131, 0.3]
        let expected: [RuneLockTier] = [.plain, .plain, .good, .good, .perfect, .perfect,
                                        .perfect, .good, .good, .plain, .plain]
        for center in [0.19, 0.5, 0.81] {
            let row = offsets.map {
                UpHeroSlot.runeLockTier(marker: center + $0, center: center)
            }
            XCTAssertEqual(row, expected, "center=\(center)")
        }
    }

    /// 트랙 밖으로 벗어난 표식도 등급이 나온다 — 실패 상태는 없다.
    func testOutOfRangeMarkerIsPlainNotFailure() {
        XCTAssertEqual(UpHeroSlot.runeLockTier(marker: 0, center: 0.81), .plain)
        XCTAssertEqual(UpHeroSlot.runeLockTier(marker: 1, center: 0.19), .plain)
    }

    /// 목표대 반폭 상수 — UI 가 그리는 폭과 판정이 같은 출처를 읽는다.
    func testHalfWidths() {
        XCTAssertEqual(UpHeroSlot.runeLockInnerHalf, 0.05)
        XCTAssertEqual(UpHeroSlot.runeLockOuterHalf, 0.13)
        XCTAssertLessThan(UpHeroSlot.runeLockInnerHalf, UpHeroSlot.runeLockOuterHalf)
    }
}
