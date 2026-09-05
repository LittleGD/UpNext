//
//  CardCatalog.swift
//  UpNext 모델 — 카드 카탈로그 (164장 정적 데이터).
//
//  웹 src/data/cards.ts의 ALL_CARDS / STARTER_CARD_IDS를 Cards.json으로 추출(scripts/extract-cards.mjs)
//  → 앱 번들 리소스로 포함 → 런타임 디코드.
//
//  Cards.json 갱신: scripts/extract-cards.mjs 재실행 (웹 cards.ts가 진실의 원천 — Phase 2 동안).
//
//  Phase 2.2 (카드 데이터 Swift 포팅) 산출물.
//

import Foundation

enum CardCatalog {

    /// Cards.json 최상위 구조.
    private struct CatalogFile: Codable {
        let cards: [ChallengeCard]
        let starterCardIds: [String]
    }

    /// 번들에서 1회 로드 후 캐시. lazy static.
    private static let file: CatalogFile = {
        guard let url = Bundle.main.url(forResource: "Cards", withExtension: "json") else {
            assertionFailure("Cards.json이 번들에 없음, Copy Bundle Resources 확인")
            return CatalogFile(cards: [], starterCardIds: [])
        }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(CatalogFile.self, from: data)
        } catch {
            assertionFailure("Cards.json 디코드 실패: \(error)")
            return CatalogFile(cards: [], starterCardIds: [])
        }
    }()

    // MARK: - 공개 API

    /// 전체 164장.
    static var allCards: [ChallengeCard] { file.cards }

    /// 스타터 카드 ID (74장) — 신규 유저 기본 해금분.
    static var starterCardIds: [String] { file.starterCardIds }

    /// ID → 카드 O(1) 조회용 인덱스.
    private static let byId: [String: ChallengeCard] = Dictionary(
        file.cards.map { ($0.id, $0) },
        uniquingKeysWith: { first, _ in first }
    )

    /// ID로 카드 조회.
    static func card(id: String) -> ChallengeCard? { byId[id] }

    /// 여러 ID를 카드 배열로 (없는 ID는 스킵). 웹 hydrate 패턴 대응.
    static func cards(ids: [String]) -> [ChallengeCard] {
        ids.compactMap { byId[$0] }
    }

    /// 카테고리별 카드.
    static func cards(category: Category) -> [ChallengeCard] {
        file.cards.filter { $0.category == category }
    }

    /// 등급별 카드.
    static func cards(rarity: Rarity) -> [ChallengeCard] {
        file.cards.filter { $0.rarity == rarity }
    }
}
