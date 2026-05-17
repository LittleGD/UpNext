//
//  FlavorPool.swift
//  UpNext 데이터 — Up Hero 던전 이벤트/내러티브 flavor 풀.
//
//  웹 src/data/upHeroFlavor.ts + flavor/* (이벤트 ~3,400줄) 포팅.
//  이벤트 데이터는 손 포팅하지 않고 Flavor.json (Bundle resource) 로 추출,
//  여기서 디코드 (cards.ts → Cards.json 과 동일 패턴). discriminated union 디코딩은
//  UpHero.swift 의 custom Decodable.
//
//  pick 함수는 웹이 Math.random (시드 불가) 사용 → Swift 는 RandomSource 명시
//  주입 (구조 동일, 출력은 비결정론). flavor 데이터는 함수 인자로 전달 (순수).
//
//  Phase 2.4 (RPG 엔진) 오케스트레이션 데이터 레이어 산출물.
//

import Foundation

enum FlavorPool {

    /// Flavor.json 전체 구조. 웹 EVENT_POOL / UNIVERSAL_EVENTS / MYSTERY_EVENTS + narrative.
    struct FlavorData: Decodable {
        let eventPool: [String: [DungeonEvent]]   // key = DungeonId rawValue
        let universalEvents: [DungeonEvent]
        let mysteryEvents: [DungeonEvent]
        let narrativePool: [String: [String]]
        let narrativePoolIds: [String: [String]]
        let treasureDescriptions: [String]
        let treasureIds: [String]
        let restDescriptions: [String]
        let restIds: [String]
        let campAmbienceKeys: [String]
    }

    /// 명시 경로에서 flavor 데이터 로드 (검증/테스트용).
    static func loadData(from url: URL) -> FlavorData {
        do {
            let raw = try Data(contentsOf: url)
            return try JSONDecoder().decode(FlavorData.self, from: raw)
        } catch {
            fatalError("Flavor.json 디코드 실패: \(error)")
        }
    }

    /// 앱 번들의 Flavor.json — 프로덕션 (첫 접근 시 1회 로드).
    static let bundled: FlavorData = {
        guard let url = Bundle.main.url(forResource: "Flavor", withExtension: "json") else {
            fatalError("Flavor.json 번들 리소스 없음")
        }
        return loadData(from: url)
    }()

    // MARK: - pick (비결정론 — 웹 Math.random, Swift RandomSource 주입)

    /// 던전 고유 60% / 범용 40% 이벤트 pick. recentPrompts LRU 로 연속 반복 완화.
    /// 웹 `pickEvent`.
    static func pickEvent<R: RandomSource>(
        _ flavor: FlavorData, dungeonId: DungeonId,
        recentPrompts: [String] = [], rng: inout R
    ) -> DungeonEvent {
        let useDungeon = rng.chance(0.6)
        let pool = useDungeon ? (flavor.eventPool[dungeonId.rawValue] ?? []) : flavor.universalEvents
        let maxExclude = max(1, pool.count - 1)
        let excludeSet = Set(recentPrompts.suffix(maxExclude))
        let filtered = pool.filter { !excludeSet.contains($0.prompt) }
        let effective = filtered.isEmpty ? pool : filtered
        return effective[rng.int(below: effective.count)]
    }

    /// mystery "?" 전용 이벤트 pick. 웹 `pickMysteryEvent`.
    static func pickMysteryEvent<R: RandomSource>(
        _ flavor: FlavorData, recentPrompts: [String] = [], rng: inout R
    ) -> DungeonEvent {
        let pool = flavor.mysteryEvents
        let maxExclude = max(1, pool.count - 1)
        let excludeSet = Set(recentPrompts.suffix(maxExclude))
        let filtered = pool.filter { !excludeSet.contains($0.prompt) }
        let source = filtered.isEmpty ? pool : filtered
        return source[rng.int(below: source.count)]
    }

    /// 분위기 narrative i18n key + 한국어 fallback. 웹 `pickNarrativeWithKey`.
    static func pickNarrativeWithKey<R: RandomSource>(
        _ flavor: FlavorData, dungeonId: DungeonId, rng: inout R
    ) -> (key: String, text: String) {
        let pool = flavor.narrativePool[dungeonId.rawValue] ?? []
        let ids = flavor.narrativePoolIds[dungeonId.rawValue] ?? []
        let idx = rng.int(below: pool.count)
        return (ids[idx], pool[idx])
    }

    /// 분위기 narrative 한국어 fallback. 웹 `pickNarrative`.
    static func pickNarrative<R: RandomSource>(
        _ flavor: FlavorData, dungeonId: DungeonId, rng: inout R
    ) -> String {
        let pool = flavor.narrativePool[dungeonId.rawValue] ?? []
        return pool[rng.int(below: pool.count)]
    }

    /// 보물 설명 i18n key + 한국어 fallback. 웹 `pickTreasureWithKey`.
    static func pickTreasureWithKey<R: RandomSource>(
        _ flavor: FlavorData, rng: inout R
    ) -> (key: String, text: String) {
        let idx = rng.int(below: flavor.treasureDescriptions.count)
        return (flavor.treasureIds[idx], flavor.treasureDescriptions[idx])
    }

    /// 보물 설명 한국어 fallback. 웹 `pickTreasureDescription`.
    static func pickTreasureDescription<R: RandomSource>(
        _ flavor: FlavorData, rng: inout R
    ) -> String {
        flavor.treasureDescriptions[rng.int(below: flavor.treasureDescriptions.count)]
    }

    /// 휴식처 설명 i18n key + 한국어 fallback. 웹 `pickRestWithKey`.
    static func pickRestWithKey<R: RandomSource>(
        _ flavor: FlavorData, rng: inout R
    ) -> (key: String, text: String) {
        let idx = rng.int(below: flavor.restDescriptions.count)
        return (flavor.restIds[idx], flavor.restDescriptions[idx])
    }

    /// 휴식처 설명 한국어 fallback. 웹 `pickRestDescription`.
    static func pickRestDescription<R: RandomSource>(
        _ flavor: FlavorData, rng: inout R
    ) -> String {
        flavor.restDescriptions[rng.int(below: flavor.restDescriptions.count)]
    }

    /// 캠프 분위기 텍스트 key (직전 key 연속 회피). 웹 `pickCampAmbience`.
    static func pickCampAmbience<R: RandomSource>(
        _ flavor: FlavorData, exclude: String? = nil, rng: inout R
    ) -> String {
        let keys = flavor.campAmbienceKeys
        if exclude == nil || keys.count <= 1 {
            return keys[rng.int(below: keys.count)]
        }
        let filtered = keys.filter { $0 != exclude }
        return filtered[rng.int(below: filtered.count)]
    }
}
