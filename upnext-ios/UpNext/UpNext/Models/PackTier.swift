//
//  PackTier.swift
//  UpNext 모델 — 카드팩 등급 (Phase 4 슬라이스 10).
//
//  웹 src/data/packTier.ts 포팅. 레벨업 팩의 등급을 1회 굴려, 등급별 카드 수와
//  연출을 결정한다. 팩 안의 카드는 같은 tier 우선, 부족분은 가중 랜덤 보충.
//
//  컬렉션 100% 환산 보상(COLLECTION_COMPENSATION_*)은 영웅 코인 의존이라 Phase 4.4.
//
//  팩 종류(PackKind) — GameStore.openCardPack 큐 소진 순서 full > bonus > levelUp.
//   - full   : 상점 풀 카드팩. 항상 fullPackCardCount(5) 장, tier 는 normal 제외 재정규화
//              (rare 60% / unique 30% / legend 10%). 웹 rollFullPackTier.
//   - bonus  : 풀클리어 보너스 카드 1장 (normal).
//   - levelUp: 레벨업 팩. rollPackTier (50/30/15/5) → 2/3/4/5 장.
//  부족분 보상(shortfallCompensation) — 웹 PACK_SHORTFALL_COMPENSATION / shortfallCompensation.
//

import Foundation

/// 웹 PackKind.
enum PackKind: String {
    case full, bonus, levelUp
}

enum PackTier {

    /// 풀 카드팩 고정 장수. 웹 FULL_PACK_CARD_COUNT.
    static let fullPackCardCount = 5

    /// 풀 카드팩 tier 하한 (normal 제외). 웹 FULL_PACK_TIER_FLOOR.
    static let fullPackTierFloor: Rarity = .rare

    /// 컬렉션 100% 최초 달성 보너스. 웹 COLLECTION_FIRST_CLEAR_BONUS.
    static let firstClearBonus = (xp: 500, coins: 2000)

    /// 컬렉션 완료 후 보너스 카드 1장 대신 받는 환산 보상.
    static let compensationBonus = (xp: 25, coins: 50)

    /// 컬렉션 완료 후 레벨업 팩 대신 받는 등급별 환산 보상.
    static func compensation(for tier: Rarity) -> (xp: Int, coins: Int) {
        switch tier {
        case .normal: return (50, 100)
        case .rare:   return (100, 200)
        case .unique: return (200, 400)
        case .legend: return (500, 1000)
        }
    }

    static func rollCompensationForLevels(_ levelsGained: Int) -> (xp: Int, coins: Int) {
        guard levelsGained > 0 else { return (0, 0) }
        var xp = 0
        var coins = 0
        for _ in 0..<levelsGained {
            let reward = compensation(for: rollPackTier())
            xp += reward.xp
            coins += reward.coins
        }
        return (xp, coins)
    }

    /// 등급별 팩 굴림 가중치. 웹 PACK_TIER_WEIGHT (50:30:15:5).
    static func weight(_ tier: Rarity) -> Int {
        switch tier {
        case .normal: return 50
        case .rare:   return 30
        case .unique: return 15
        case .legend: return 5
        }
    }

    /// 등급별 팩 카드 수. 웹 PACK_TIER_COUNT.
    static func count(_ tier: Rarity) -> Int {
        switch tier {
        case .normal: return 2
        case .rare:   return 3
        case .unique: return 4
        case .legend: return 5
        }
    }

    /// 주어진 tier 목록 안에서 가중 굴림 — 총합으로 재정규화. 웹 rollPackTierFrom.
    /// 경계: roll = r * total 에서 순서대로 빼며 `<= 0` 에서 멈춤 (r = 0 → 첫 tier).
    static func rollPackTier(from tiers: [Rarity]) -> Rarity {
        let total = tiers.reduce(0) { $0 + weight($1) }
        var roll = Double.random(in: 0..<1) * Double(total)
        for tier in tiers {
            roll -= Double(weight(tier))
            if roll <= 0 { return tier }
        }
        return tiers.first ?? .normal  // 부동소수점 안전망 — 실제 도달 불가
    }

    /// 가중 랜덤 팩 등급. 웹 rollPackTier. Rarity.allCases = normal→rare→unique→legend.
    static func rollPackTier() -> Rarity {
        rollPackTier(from: Rarity.allCases)
    }

    /// 상점 풀 카드팩 등급 — rare 60% / unique 30% / legend 10%. 웹 rollFullPackTier.
    static func rollFullPackTier() -> Rarity {
        let all = Rarity.allCases
        let start = all.firstIndex(of: fullPackTierFloor) ?? 0
        return rollPackTier(from: Array(all[start...]))
    }

    /// 팩 부족분(잠긴 카드 < 기대 장수) 보상. 웹 shortfallCompensation.
    ///  - full   : 장당 160 코인 = ShopPrices.cardPackFull(800) / fullPackCardCount(5).
    ///  - levelUp: 장당 compensationBonus (25 XP + 50 코인).
    ///  - bonus  : 없음 (빈 풀은 100% 분기).
    static func shortfallCompensation(kind: PackKind, missing: Int) -> (xp: Int, coins: Int) {
        let m = max(0, missing)
        switch kind {
        case .full:    return (0, 160 * m)
        case .levelUp: return (compensationBonus.xp * m, compensationBonus.coins * m)
        case .bonus:   return (0, 0)
        }
    }

    /// 컬렉션 100% 상태의 남은 풀팩 1개당 환급 코인 (= 800). 웹 FULL_PACK_COLLECTION_REFUND_COINS.
    static var fullPackCollectionRefundCoins: Int {
        fullPackCardCount * shortfallCompensation(kind: .full, missing: 1).coins
    }

    /// 팩 등급에 맞춰 count장 드로우 — tier 카드 우선, 부족분은 drawFromPool. 웹 drawTierPack.
    static func drawTierPack(_ pool: [ChallengeCard], tier: Rarity, count: Int) -> [ChallengeCard] {
        if pool.isEmpty { return [] }
        let fromTier = Array(pool.filter { $0.rarity == tier }.shuffled().prefix(count))
        if fromTier.count >= count { return fromTier }
        let usedIds = Set(fromTier.map(\.id))
        let remaining = pool.filter { !usedIds.contains($0.id) }
        return fromTier + Deck.drawFromPool(remaining, count: count - fromTier.count)
    }
}
