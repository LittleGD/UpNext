//
//  BuffDraw.swift
//  UpNext 로직 — 던전 진입 전 버프 카드 드로우.
//
//  웹 src/lib/buffDraw.ts를 1:1 포팅.
//  보유 카드 중 무작위 N장 추출, 던전 카테고리 카드는 2배 가중.
//
//  비결정론(랜덤) — 출력은 매번 다름, 알고리즘 구조만 동일.
//  Phase 2.3 (결정론적 알고리즘 Swift 포팅) 산출물.
//

import Foundation

enum BuffDraw {

    /// 보유 카드 중 던전용 버프 카드를 랜덤 N장 뽑는다. 웹 `drawBuffCards`.
    ///
    /// - Parameters:
    ///   - owned: 사용자 보유 카드 전체 (unlockedCardIds로 필터된 카탈로그)
    ///   - dungeonId: 진입할 던전 — 같은 category 카드는 2배 확률 가중
    ///   - drawCount: 기본 6장 (보유 부족 시 자동 축소)
    static func drawBuffCards(
        owned: [ChallengeCard],
        dungeonId: DungeonId,
        drawCount: Int = 6
    ) -> [ChallengeCard] {
        if owned.isEmpty { return [] }

        // 가중 풀 — 같은 카테고리 카드는 entry 2개 (확률 2배)
        var weighted: [ChallengeCard] = []
        for card in owned {
            weighted.append(card)
            if card.category == dungeonId {
                weighted.append(card)
            }
        }

        // 셔플 후 중복 제거하며 drawCount장 수집.
        // 웹은 `.sort(() => Math.random() - 0.5)` (편향된 셔플)을 썼으나
        // Swift .shuffled()는 균등 셔플 — 비결정론 컨텍스트라 개선이어도 무해.
        let shuffled = weighted.shuffled()
        var seen = Set<String>()
        var result: [ChallengeCard] = []
        for card in shuffled {
            if seen.contains(card.id) { continue }
            seen.insert(card.id)
            result.append(card)
            if result.count >= drawCount { break }
        }
        return result
    }
}
