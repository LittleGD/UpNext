//
//  PackTierTests.swift
//  UpNextTests — 풀 카드팩 (pendingFullPacks) 계약. 웹 src/data/packTier.test.ts 미러.
//
//   - rollFullPackTier 는 normal 을 절대 돌려주지 않는다 (rare 60 / unique 30 / legend 10).
//   - rollPackTier(from: allCases) 는 기존 4단계 전부 도달 (회귀).
//   - shortfallCompensation: full 장당 160 코인, levelUp 장당 compensationBonus, bonus 0.
//   - fullPackCollectionRefundCoins == ShopPrices.cardPackFull (결제액 전액 환급).
//   - UserProgress 관용 디코드: pendingFullPacks 부재 = 0, 있으면 그 값, 인코드는 항상 키 포함.
//

import XCTest
@testable import UpNext

@MainActor
final class PackTierTests: XCTestCase {

    // MARK: - tier 굴림

    func testRollFullPackTierNeverReturnsNormal() {
        for _ in 0..<2000 {
            XCTAssertNotEqual(PackTier.rollFullPackTier(), .normal)
        }
    }

    func testRollPackTierFromAllCasesStillReachesEveryTier() {
        var seen = Set<Rarity>()
        for _ in 0..<5000 {
            seen.insert(PackTier.rollPackTier(from: Rarity.allCases))
            if seen.count == Rarity.allCases.count { break }
        }
        XCTAssertEqual(seen, Set(Rarity.allCases), "레벨업 팩 굴림이 4단계 전부에 도달해야 한다")
    }

    func testFullPackConstants() {
        XCTAssertEqual(PackTier.fullPackCardCount, 5)
        XCTAssertEqual(PackTier.fullPackTierFloor, .rare)
    }

    // MARK: - 부족분 보상

    func testShortfallCompensation() {
        let full = PackTier.shortfallCompensation(kind: .full, missing: 3)
        XCTAssertEqual(full.xp, 0)
        XCTAssertEqual(full.coins, 480)

        let levelUp = PackTier.shortfallCompensation(kind: .levelUp, missing: 2)
        XCTAssertEqual(levelUp.xp, 50)
        XCTAssertEqual(levelUp.coins, 100)

        let bonus = PackTier.shortfallCompensation(kind: .bonus, missing: 5)
        XCTAssertEqual(bonus.xp, 0)
        XCTAssertEqual(bonus.coins, 0)

        let zero = PackTier.shortfallCompensation(kind: .full, missing: 0)
        XCTAssertEqual(zero.coins, 0)
        let negative = PackTier.shortfallCompensation(kind: .full, missing: -2)
        XCTAssertEqual(negative.coins, 0)
    }

    func testFullPackRefundEqualsShopPrice() {
        XCTAssertEqual(PackTier.fullPackCollectionRefundCoins, ShopPrices.cardPackFull)
        XCTAssertEqual(PackTier.fullPackCollectionRefundCoins, 800)
    }

    // MARK: - UserProgress 관용 디코드

    private func progressJSON(extra: String) -> Data {
        // 엄격 필드 2개(totalDaysCompleted / unlockedCardIds) 만 필수 — 나머지는 관용.
        let json = """
        {"totalDaysCompleted": 3, "unlockedCardIds": ["a", "b"]\(extra)}
        """
        return Data(json.utf8)
    }

    func testUserProgressDecodeWithoutPendingFullPacksDefaultsToZero() throws {
        let p = try JSONDecoder().decode(UserProgress.self, from: progressJSON(extra: ""))
        XCTAssertEqual(p.pendingFullPacks, 0)
        XCTAssertEqual(p.pendingPacks, 0)
        XCTAssertEqual(p.pendingBonusCards, 0)
    }

    func testUserProgressDecodeReadsPendingFullPacks() throws {
        let p = try JSONDecoder().decode(UserProgress.self, from: progressJSON(extra: ", \"pendingFullPacks\": 3"))
        XCTAssertEqual(p.pendingFullPacks, 3)
    }

    func testUserProgressDecodeClampsNegativePendingFullPacks() throws {
        let p = try JSONDecoder().decode(UserProgress.self, from: progressJSON(extra: ", \"pendingFullPacks\": -4"))
        XCTAssertEqual(p.pendingFullPacks, 0)
    }

    func testUserProgressEncodeAlwaysWritesPendingFullPacks() throws {
        var p = try JSONDecoder().decode(UserProgress.self, from: progressJSON(extra: ""))
        p.pendingFullPacks = 2
        let data = try JSONEncoder().encode(p)
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(obj["pendingFullPacks"] as? Int, 2)

        // 왕복.
        let back = try JSONDecoder().decode(UserProgress.self, from: data)
        XCTAssertEqual(back.pendingFullPacks, 2)
    }
}
