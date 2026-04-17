/**
 * Up Hero — 몬스터 풀.
 * 던전별 일반 몬스터 5종 + 보스 3종.
 * 이모지 대신 MonsterSprite (직접 그린 8×8 dot-matrix) 를 사용.
 */

import type { DungeonId, Monster, MonsterKind } from "@/types/uphero";

/** 몬스터 템플릿 — 정확한 stats 는 floor 에 따라 스케일링 */
export interface MonsterTemplate {
  id: string;
  name: string;
  /** MonsterSprite kind — 8×8 pixel 실루엣 선택 */
  kind: MonsterKind;
  /** 상대 파워 (같은 던전 내 상대값, 1-3) */
  power: 1 | 2 | 3;
  isBoss?: boolean;
  /** codex 표시용 — 원본 던전 (scaleMonster 실행 후 붙는 dungeonId 와 동일) */
  dungeonId?: DungeonId;
}

const TEMPLATES: Record<DungeonId, { normal: MonsterTemplate[]; bosses: MonsterTemplate[] }> = {
  fitness: {
    normal: [
      { id: "fit_wolf", name: "산악 늑대", kind: "beast", power: 1 },
      { id: "fit_bear", name: "돌산 곰", kind: "beast", power: 2 },
      { id: "fit_goblin", name: "산악 고블린", kind: "goblin", power: 1 },
      { id: "fit_golem", name: "작은 석상", kind: "construct", power: 3 },
      { id: "fit_eagle", name: "절벽 독수리", kind: "creature", power: 2 },
    ],
    bosses: [
      { id: "boss_mountain_wolf", name: "알파 늑대", kind: "large", power: 3, isBoss: true },
      { id: "boss_stone_golem", name: "돌의 수호자", kind: "large", power: 3, isBoss: true },
      { id: "boss_mountain_giant", name: "산악의 거인", kind: "large", power: 3, isBoss: true },
    ],
  },
  learning: {
    normal: [
      { id: "lrn_book", name: "떠도는 책", kind: "book", power: 1 },
      { id: "lrn_scroll", name: "고문서 정령", kind: "spirit", power: 1 },
      { id: "lrn_inkblot", name: "잉크 괴물", kind: "creature", power: 2 },
      { id: "lrn_scholar", name: "고독한 학자", kind: "goblin", power: 2 },
      { id: "lrn_riddle", name: "수수께끼 영혼", kind: "spirit", power: 3 },
    ],
    bosses: [
      { id: "boss_book_spirit", name: "잊혀진 저자", kind: "large", power: 3, isBoss: true },
      { id: "boss_ancient_scholar", name: "옛 현자", kind: "large", power: 3, isBoss: true },
      { id: "boss_lich_of_ignorance", name: "무지의 리치", kind: "large", power: 3, isBoss: true },
    ],
  },
  mindfulness: {
    normal: [
      { id: "mnd_wisp", name: "그림자 영", kind: "spirit", power: 1 },
      { id: "mnd_sprite", name: "빛 정령", kind: "spirit", power: 1 },
      { id: "mnd_echo", name: "마음의 메아리", kind: "spirit", power: 2 },
      { id: "mnd_distraction", name: "산만함", kind: "creature", power: 2 },
      { id: "mnd_doubt", name: "의심의 그림자", kind: "spirit", power: 3 },
    ],
    bosses: [
      { id: "boss_shadow_wisp", name: "내면의 그림자", kind: "large", power: 3, isBoss: true },
      { id: "boss_silent_monk", name: "침묵의 수도승", kind: "large", power: 3, isBoss: true },
      { id: "boss_distraction_demon", name: "산만함의 마왕", kind: "large", power: 3, isBoss: true },
    ],
  },
  nutrition: {
    normal: [
      { id: "ntr_sprout", name: "성난 새싹", kind: "creature", power: 1 },
      { id: "ntr_corn", name: "거대 옥수수", kind: "goblin", power: 2 },
      { id: "ntr_pumpkin", name: "썩은 호박", kind: "creature", power: 2 },
      { id: "ntr_pepper", name: "불타는 고추", kind: "creature", power: 2 },
      { id: "ntr_broccoli", name: "브로콜리 기사", kind: "goblin", power: 3 },
    ],
    bosses: [
      { id: "boss_grain_sprite", name: "곡물의 왕", kind: "large", power: 3, isBoss: true },
      { id: "boss_giant_vegetable", name: "채소 거신", kind: "large", power: 3, isBoss: true },
      { id: "boss_gluttony_titan", name: "폭식의 거인", kind: "large", power: 3, isBoss: true },
    ],
  },
  social: {
    normal: [
      { id: "soc_thief", name: "뒷골목 도둑", kind: "goblin", power: 1 },
      { id: "soc_clown", name: "떠도는 광대", kind: "goblin", power: 1 },
      { id: "soc_gossip", name: "소문꾼", kind: "goblin", power: 2 },
      { id: "soc_swindler", name: "사기꾼", kind: "goblin", power: 2 },
      { id: "soc_outcast", name: "추방자", kind: "spirit", power: 3 },
    ],
    bosses: [
      { id: "boss_street_thief", name: "도둑의 왕", kind: "large", power: 3, isBoss: true },
      { id: "boss_jester", name: "어둠의 광대", kind: "large", power: 3, isBoss: true },
      { id: "boss_loneliness_phantom", name: "외로움의 환영", kind: "large", power: 3, isBoss: true },
    ],
  },
  productivity: {
    normal: [
      { id: "prd_gear", name: "작은 톱니바퀴", kind: "construct", power: 1 },
      { id: "prd_clockbot", name: "시계 병사", kind: "construct", power: 2 },
      { id: "prd_timesink", name: "시간 도둑", kind: "spirit", power: 2 },
      { id: "prd_drone", name: "자동인형", kind: "construct", power: 2 },
      { id: "prd_pendulum", name: "저주의 추", kind: "construct", power: 3 },
    ],
    bosses: [
      { id: "boss_clockwork_drone", name: "시계탑 수호자", kind: "large", power: 3, isBoss: true },
      { id: "boss_time_thief", name: "시간 도적왕", kind: "large", power: 3, isBoss: true },
      { id: "boss_procrastination_lord", name: "미루기의 시간술사", kind: "large", power: 3, isBoss: true },
    ],
  },
  wellness: {
    normal: [
      { id: "wel_mist", name: "안개 정령", kind: "spirit", power: 1 },
      { id: "wel_slime", name: "수증기 슬라임", kind: "creature", power: 1 },
      { id: "wel_naiad", name: "온천 님프", kind: "spirit", power: 2 },
      { id: "wel_lotus", name: "독 연꽃", kind: "creature", power: 2 },
      { id: "wel_cold", name: "한기", kind: "spirit", power: 3 },
    ],
    bosses: [
      { id: "boss_mist_spirit", name: "짙은 안개의 영", kind: "large", power: 3, isBoss: true },
      { id: "boss_river_naiad", name: "온천의 여왕", kind: "large", power: 3, isBoss: true },
      { id: "boss_lethargy_fog", name: "무기력의 안개", kind: "large", power: 3, isBoss: true },
    ],
  },
  trending: {
    normal: [
      { id: "trd_mini", name: "랜덤 픽셀", kind: "creature", power: 1 },
      { id: "trd_meme", name: "밈 변종", kind: "goblin", power: 1 },
      { id: "trd_glitch", name: "글리치", kind: "spirit", power: 2 },
      { id: "trd_holo", name: "홀로그램 유령", kind: "spirit", power: 2 },
      { id: "trd_viral", name: "바이럴 구체", kind: "creature", power: 3 },
    ],
    bosses: [
      { id: "boss_mutant_minor", name: "작은 카멜레온", kind: "large", power: 3, isBoss: true },
      { id: "boss_mutant_mid", name: "뒤틀린 유행", kind: "large", power: 3, isBoss: true },
      { id: "boss_trend_chameleon", name: "트렌드의 카멜레온", kind: "large", power: 3, isBoss: true },
    ],
  },
};

/** Phase 4c-feature: Codex 용 flat list. 던전 정보 붙여서 export. */
export const ALL_MONSTER_TEMPLATES: MonsterTemplate[] = (() => {
  const out: MonsterTemplate[] = [];
  for (const [dungeonId, pool] of Object.entries(TEMPLATES) as Array<
    [DungeonId, (typeof TEMPLATES)[DungeonId]]
  >) {
    for (const t of pool.normal) out.push({ ...t, dungeonId });
    for (const t of pool.bosses) out.push({ ...t, dungeonId });
  }
  return out;
})();

/**
 * 던전/floor 에 맞는 몬스터 랜덤 선택 후 stats 스케일링.
 * floor 10/20/30 에서는 보스 사용 (caller 가 결정).
 */
export function createMonsterForFloor(
  dungeonId: DungeonId,
  floor: number,
  isBoss = false,
): Monster {
  const pool = TEMPLATES[dungeonId];
  if (isBoss) {
    // 10F / 20F / 30F 에 각각 다른 보스
    const bossIdx = Math.min(Math.floor((floor - 1) / 10), 2);
    const template = pool.bosses[bossIdx];
    return scaleMonster(template, dungeonId, floor);
  }
  const template = pool.normal[Math.floor(Math.random() * pool.normal.length)];
  return scaleMonster(template, dungeonId, floor);
}

/** floor + power 기반 stats 스케일링 */
function scaleMonster(t: MonsterTemplate, dungeonId: DungeonId, floor: number): Monster {
  const bossMult = t.isBoss ? 4 : 1;
  const base = 20 + floor * 5;
  return {
    id: `${t.id}_f${floor}_${Date.now() % 10000}`,
    name: t.name,
    kind: t.kind,
    level: floor,
    hp: Math.round(base * t.power * bossMult),
    atk: Math.round((5 + floor * 1.5) * t.power * bossMult),
    def: Math.round((2 + floor) * t.power),
    xpReward: Math.round((10 + floor * 3) * t.power * bossMult),
    coinReward: Math.round((3 + floor * 2) * t.power * (t.isBoss ? 10 : 1)),
    isBoss: t.isBoss,
    dungeonId,
  };
}
