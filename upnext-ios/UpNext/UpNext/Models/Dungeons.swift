//
//  Dungeons.swift
//  UpNext 데이터 — Up Hero 8 던전 정의.
//
//  웹 src/data/upHeroDungeons.ts (68줄) 1:1 포팅.
//  Phase 2.4 (RPG 엔진) 오케스트레이션 데이터 레이어 산출물.
//

import Foundation

enum Dungeons {
    /// 모든 던전 — 웹 `DUNGEONS` 객체의 선언 순서. 웹 `DUNGEON_LIST`.
    static let list: [Dungeon] = [
        Dungeon(id: .fitness, name: "강철 산봉우리", themeColor: "#87b87a", affinity: .weapon,
                bossIds: ["boss_mountain_wolf", "boss_stone_golem", "boss_mountain_giant"]),
        Dungeon(id: .learning, name: "메아리 도서관", themeColor: "#a5c8db", affinity: .accessory,
                bossIds: ["boss_book_spirit", "boss_ancient_scholar", "boss_lich_of_ignorance"]),
        Dungeon(id: .mindfulness, name: "영혼 사원", themeColor: "#c9b8e8", affinity: .talisman,
                bossIds: ["boss_shadow_wisp", "boss_silent_monk", "boss_distraction_demon"]),
        Dungeon(id: .nutrition, name: "황금 들판", themeColor: "#e8d88b", affinity: .armor,
                bossIds: ["boss_grain_sprite", "boss_giant_vegetable", "boss_gluttony_titan"]),
        Dungeon(id: .social, name: "광장 시장", themeColor: "#e8a8a8", affinity: .accessory,
                bossIds: ["boss_street_thief", "boss_jester", "boss_loneliness_phantom"]),
        Dungeon(id: .productivity, name: "시계탑", themeColor: "#bca88b", affinity: .accessory,
                bossIds: ["boss_clockwork_drone", "boss_time_thief", "boss_procrastination_lord"]),
        Dungeon(id: .wellness, name: "온천 골짜기", themeColor: "#8bc9c9", affinity: .armor,
                bossIds: ["boss_mist_spirit", "boss_river_naiad", "boss_lethargy_fog"]),
        Dungeon(id: .trending, name: "신비 차원", themeColor: "#cdf564", affinity: .talisman,
                bossIds: ["boss_mutant_minor", "boss_mutant_mid", "boss_trend_chameleon"]),
    ]

    /// DungeonId → Dungeon. 웹 `DUNGEONS`.
    static let all: [DungeonId: Dungeon] =
        Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) })
}
