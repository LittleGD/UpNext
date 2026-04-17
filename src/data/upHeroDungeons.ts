/**
 * Up Hero — 8 던전 정의.
 * 각 던전은 챌린지 카테고리와 1:1 매핑.
 */

import type { Dungeon, DungeonId } from "@/types/uphero";

export const DUNGEONS: Record<DungeonId, Dungeon> = {
  fitness: {
    id: "fitness",
    name: "강철 산봉우리",
    themeColor: "#87b87a",
    affinity: "weapon",
    bossIds: ["boss_mountain_wolf", "boss_stone_golem", "boss_mountain_giant"],
  },
  learning: {
    id: "learning",
    name: "메아리 도서관",
    themeColor: "#a5c8db",
    affinity: "accessory",
    bossIds: ["boss_book_spirit", "boss_ancient_scholar", "boss_lich_of_ignorance"],
  },
  mindfulness: {
    id: "mindfulness",
    name: "영혼 사원",
    themeColor: "#c9b8e8",
    affinity: "talisman",
    bossIds: ["boss_shadow_wisp", "boss_silent_monk", "boss_distraction_demon"],
  },
  nutrition: {
    id: "nutrition",
    name: "황금 들판",
    themeColor: "#e8d88b",
    affinity: "armor",
    bossIds: ["boss_grain_sprite", "boss_giant_vegetable", "boss_gluttony_titan"],
  },
  social: {
    id: "social",
    name: "광장 시장",
    themeColor: "#e8a8a8",
    affinity: "accessory",
    bossIds: ["boss_street_thief", "boss_jester", "boss_loneliness_phantom"],
  },
  productivity: {
    id: "productivity",
    name: "시계탑",
    themeColor: "#bca88b",
    affinity: "accessory",
    bossIds: ["boss_clockwork_drone", "boss_time_thief", "boss_procrastination_lord"],
  },
  wellness: {
    id: "wellness",
    name: "온천 골짜기",
    themeColor: "#8bc9c9",
    affinity: "armor",
    bossIds: ["boss_mist_spirit", "boss_river_naiad", "boss_lethargy_fog"],
  },
  trending: {
    id: "trending",
    name: "신비 차원",
    themeColor: "#cdf564",
    affinity: "talisman",
    bossIds: ["boss_mutant_minor", "boss_mutant_mid", "boss_trend_chameleon"],
  },
};

/** 모든 던전 배열 — 순회/그리드 표시용 */
export const DUNGEON_LIST: Dungeon[] = Object.values(DUNGEONS);
