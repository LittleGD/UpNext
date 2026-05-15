//
//  Deck.swift
//  UpNext 로직 — 카드 드로우 알고리즘.
//
//  웹 src/lib/deck.ts + src/data/rarityConfig.ts(weight 부분)를 1:1 포팅.
//
//  비결정론적 (Math.random 사용) — 테스트 벡터 동치성 불가능.
//  대신 알고리즘 구조(가중치/다양성/피티)가 동일함을 보장.
//
//  Phase 2.3 (결정론적 알고리즘 Swift 포팅) 산출물.
//

import Foundation

enum Deck {

    /// 등급별 드로우 가중치. 웹 RARITY_CONFIG.weight.
    /// normal이 가장 자주, legend가 가장 드물게 (60 : 25 : 12 : 3).
    static func drawWeight(_ rarity: Rarity) -> Int {
        switch rarity {
        case .normal: return 60
        case .rare:   return 25
        case .unique: return 12
        case .legend: return 3
        }
    }

    /// 가중 랜덤 등급 선택. 웹 getWeightedRandomRarity.
    /// Rarity.allCases는 normal→rare→unique→legend 순 — 웹 RARITY_CONFIG 객체 순서와 동일.
    static func weightedRandomRarity() -> Rarity {
        let total = Rarity.allCases.reduce(0) { $0 + drawWeight($1) }
        var random = Double.random(in: 0..<1) * Double(total)
        for rarity in Rarity.allCases {
            random -= Double(drawWeight(rarity))
            if random <= 0 { return rarity }
        }
        return .normal  // fallback
    }

    /// 일일 카드 드로우 — 6장. 웹 drawCards.
    ///
    /// 알고리즘:
    ///  1. 해금 풀에서 등급 가중 랜덤 선택
    ///  2. 4장째까지는 카테고리 중복 회피 (다양성)
    ///  3. 피티: 6장이 전부 normal이면 마지막 1장을 non-normal로 교체
    static func drawCards(unlocked: [ChallengeCard]) -> [ChallengeCard] {
        if unlocked.count <= GameConstants.drawCount {
            return unlocked.shuffled()
        }

        var drawn: [ChallengeCard] = []
        var usedIds = Set<String>()
        var usedCategories = Set<Category>()
        var attempts = 0

        while drawn.count < GameConstants.drawCount && attempts < 100 {
            attempts += 1
            let targetRarity = weightedRandomRarity()

            var candidates = unlocked.filter {
                $0.rarity == targetRarity && !usedIds.contains($0.id)
            }
            // 카테고리 다양성 — 4장째까지만 적용
            if drawn.count < 4 {
                let diverse = candidates.filter { !usedCategories.contains($0.category) }
                if !diverse.isEmpty { candidates = diverse }
            }
            if candidates.isEmpty { continue }

            let selected = candidates[Int.random(in: 0..<candidates.count)]
            drawn.append(selected)
            usedIds.insert(selected.id)
            usedCategories.insert(selected.category)
        }

        // 피티 시스템 — 전부 normal이면 마지막 1장 교체
        // (웹은 빈 배열에 drawn[-1] 할당 시 무해하지만 Swift는 크래시 → isEmpty 가드)
        if !drawn.isEmpty && !drawn.contains(where: { $0.rarity != .normal }) {
            let nonNormal = unlocked.filter {
                $0.rarity != .normal && !usedIds.contains($0.id)
            }
            if let replacement = nonNormal.randomElement() {
                drawn[drawn.count - 1] = replacement
            }
        }
        return drawn
    }

    /// 범용 풀 드로우 — count장 (카드팩 등). 웹 drawFromPool.
    static func drawFromPool(_ pool: [ChallengeCard], count: Int) -> [ChallengeCard] {
        if pool.count <= count { return pool.shuffled() }

        var result: [ChallengeCard] = []
        var usedIds = Set<String>()
        var attempts = 0

        while result.count < count && attempts < 100 {
            attempts += 1
            let targetRarity = weightedRandomRarity()
            let candidates = pool.filter {
                $0.rarity == targetRarity && !usedIds.contains($0.id)
            }
            if candidates.isEmpty { continue }

            let selected = candidates[Int.random(in: 0..<candidates.count)]
            result.append(selected)
            usedIds.insert(selected.id)
        }

        // 피티 — 전부 normal이면 마지막 1장 교체
        if !result.isEmpty && result.allSatisfy({ $0.rarity == .normal }) {
            let nonNormal = pool.filter {
                $0.rarity != .normal && !usedIds.contains($0.id)
            }
            if let replacement = nonNormal.randomElement() {
                result[result.count - 1] = replacement
            }
        }
        return result
    }
}
