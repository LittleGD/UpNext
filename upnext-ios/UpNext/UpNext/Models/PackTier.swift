//
//  PackTier.swift
//  UpNext 모델 — 카드팩 등급 (Phase 4 슬라이스 10).
//
//  웹 src/data/packTier.ts 포팅. 레벨업 팩의 등급을 1회 굴려, 등급별 카드 수와
//  연출을 결정한다. 팩 안의 카드는 같은 tier 우선, 부족분은 가중 랜덤 보충.
//
//  컬렉션 100% 환산 보상(COLLECTION_COMPENSATION_*)은 영웅 코인 의존이라 Phase 4.4.
//

import Foundation

enum PackTier {

    /// 컬렉션 100% 최초 달성 보너스. 웹 COLLECTION_FIRST_CLEAR_BONUS.
    /// coins(영웅 코인) 지급은 Up Hero 의존이라 Phase 4.4 — 현재는 안내 표기만(stub).
    static let firstClearBonus = (xp: 500, coins: 2000)

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

    /// 가중 랜덤 팩 등급. 웹 rollPackTier. Rarity.allCases = normal→rare→unique→legend.
    static func rollPackTier() -> Rarity {
        let total = Rarity.allCases.reduce(0) { $0 + weight($1) }
        var roll = Double.random(in: 0..<1) * Double(total)
        for tier in Rarity.allCases {
            roll -= Double(weight(tier))
            if roll <= 0 { return tier }
        }
        return .normal  // 부동소수점 안전망 — 실제 도달 불가
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
