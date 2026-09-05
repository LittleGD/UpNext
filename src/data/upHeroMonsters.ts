/**
 * Up Hero — 몬스터 풀.
 *
 * Phase 14 — 각 던전별 일반 몬스터 7 종 + 보스 3 종 (이전 5 종 → +2).
 *   모든 몬스터가 trait 1 개씩 부여 (stat 변조 or 지속 효과) — 몬스터별 고유
 *   체감 강화. scaleMonster 에서 trait 별 stat modifier 적용 + combat engine 이
 *   session state 로 active effect 관리.
 *
 * Phase 14 추가 룰: floor ≤ 10 구간에선 hp/atk/def 전부 ×0.75 너프 — 초반
 *   페이싱 완화. 보스도 동일 적용 (F10 미니보스).
 */

import {
  ngPlusScaleMult,
  type DungeonId,
  type Monster,
  type MonsterKind,
  type MonsterTrait,
} from "@/types/uphero";
import { rng } from "@/lib/upHeroRng";

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
  /**
   * 초보자 몬스터 여부. true 인 템플릿은 floor ≤ 3 전용으로 스폰.
   *   - floor 1-3: newbie 풀 에서만 선택 (normal 풀 배제).
   *   - floor 4-10: newbie + normal 혼합 (newbie 확률 약 40%).
   *   - floor 11+: normal 풀만.
   *  Lv 2 정도 영웅이 무리 없이 잡도록 stats scale 에 `×0.7` 추가 감산 적용.
   */
  isNewbie?: boolean;
  /**
   * Phase 14 — 몬스터 고유 특성 (trait). 1 개 또는 없음.
   *   "tough"/"fragile" 은 scaleMonster 에서 stat 변조.
   *   "swift"/"burst"/"poison"/"regen"/"shield" 는 combat engine 이 참조.
   */
  trait?: MonsterTrait;
}

const TEMPLATES: Record<DungeonId, { normal: MonsterTemplate[]; bosses: MonsterTemplate[] }> = {
  fitness: {
    normal: [
      // 초보자 전용 — 1-3층 스폰. Lv2 영웅도 손쉽게 클리어.
      { id: "fit_newbie_rabbit", name: "겁쟁이 토끼", kind: "creature", power: 1, isNewbie: true, trait: "swift" },
      { id: "fit_newbie_pebble", name: "뒹구는 돌멩이", kind: "construct", power: 1, isNewbie: true },
      { id: "fit_wolf", name: "산악 늑대", kind: "beast", power: 1, trait: "swift" },
      { id: "fit_bear", name: "돌산 곰", kind: "beast", power: 2, trait: "tough" },
      { id: "fit_goblin", name: "산악 고블린", kind: "goblin", power: 1, trait: "fragile" },
      { id: "fit_golem", name: "작은 석상", kind: "construct", power: 3, trait: "shield" },
      { id: "fit_eagle", name: "절벽 독수리", kind: "creature", power: 2, trait: "burst" },
      // Phase 14 신규 2 종
      { id: "fit_boar", name: "분노한 멧돼지", kind: "beast", power: 2, trait: "burst" },
      { id: "fit_serpent", name: "바위 살무사", kind: "creature", power: 2, trait: "poison" },
    ],
    bosses: [
      { id: "boss_mountain_wolf", name: "알파 늑대", kind: "large", power: 3, isBoss: true, trait: "burst" },
      { id: "boss_stone_golem", name: "돌의 수호자", kind: "large", power: 3, isBoss: true, trait: "shield" },
      { id: "boss_mountain_giant", name: "산악의 거인", kind: "large", power: 3, isBoss: true, trait: "tough" },
    ],
  },
  learning: {
    normal: [
      { id: "lrn_newbie_page", name: "흩날리는 낱장", kind: "book", power: 1, isNewbie: true, trait: "fragile" },
      { id: "lrn_newbie_ink", name: "작은 잉크 방울", kind: "creature", power: 1, isNewbie: true },
      { id: "lrn_book", name: "떠도는 책", kind: "book", power: 1 },
      { id: "lrn_scroll", name: "고문서 정령", kind: "spirit", power: 1, trait: "swift" },
      { id: "lrn_inkblot", name: "잉크 괴물", kind: "creature", power: 2, trait: "poison" },
      { id: "lrn_scholar", name: "고독한 학자", kind: "goblin", power: 2, trait: "burst" },
      { id: "lrn_riddle", name: "수수께끼 영혼", kind: "spirit", power: 3, trait: "regen" },
      { id: "lrn_tome", name: "금서의 정령", kind: "book", power: 2, trait: "shield" },
      { id: "lrn_quill", name: "저주받은 깃펜", kind: "creature", power: 2, trait: "burst" },
    ],
    bosses: [
      { id: "boss_book_spirit", name: "잊혀진 저자", kind: "large", power: 3, isBoss: true, trait: "regen" },
      { id: "boss_ancient_scholar", name: "옛 현자", kind: "large", power: 3, isBoss: true, trait: "burst" },
      { id: "boss_lich_of_ignorance", name: "무지의 리치", kind: "large", power: 3, isBoss: true, trait: "poison" },
    ],
  },
  mindfulness: {
    normal: [
      { id: "mnd_newbie_bubble", name: "작은 망상 거품", kind: "spirit", power: 1, isNewbie: true },
      { id: "mnd_newbie_breeze", name: "살랑 바람", kind: "spirit", power: 1, isNewbie: true, trait: "swift" },
      { id: "mnd_wisp", name: "그림자 영", kind: "spirit", power: 1, trait: "swift" },
      { id: "mnd_sprite", name: "빛 정령", kind: "spirit", power: 1, trait: "fragile" },
      { id: "mnd_echo", name: "마음의 메아리", kind: "spirit", power: 2, trait: "regen" },
      { id: "mnd_distraction", name: "산만함", kind: "creature", power: 2, trait: "burst" },
      { id: "mnd_doubt", name: "의심의 그림자", kind: "spirit", power: 3, trait: "poison" },
      { id: "mnd_mirror", name: "뒤집힌 거울상", kind: "spirit", power: 2, trait: "shield" },
      { id: "mnd_reverie", name: "몽상의 잔영", kind: "spirit", power: 2, trait: "regen" },
    ],
    bosses: [
      { id: "boss_shadow_wisp", name: "내면의 그림자", kind: "large", power: 3, isBoss: true, trait: "poison" },
      { id: "boss_silent_monk", name: "침묵의 수도승", kind: "large", power: 3, isBoss: true, trait: "shield" },
      { id: "boss_distraction_demon", name: "산만함의 마왕", kind: "large", power: 3, isBoss: true, trait: "swift" },
    ],
  },
  nutrition: {
    normal: [
      { id: "ntr_newbie_bean", name: "통통 튀는 콩", kind: "creature", power: 1, isNewbie: true, trait: "fragile" },
      { id: "ntr_newbie_carrot", name: "아기 당근", kind: "goblin", power: 1, isNewbie: true },
      { id: "ntr_sprout", name: "성난 새싹", kind: "creature", power: 1, trait: "regen" },
      { id: "ntr_corn", name: "거대 옥수수", kind: "goblin", power: 2, trait: "tough" },
      { id: "ntr_pumpkin", name: "썩은 호박", kind: "creature", power: 2, trait: "poison" },
      { id: "ntr_pepper", name: "불타는 고추", kind: "creature", power: 2, trait: "burst" },
      { id: "ntr_broccoli", name: "브로콜리 기사", kind: "goblin", power: 3, trait: "shield" },
      { id: "ntr_mushroom", name: "독버섯 포자", kind: "creature", power: 2, trait: "poison" },
      { id: "ntr_cabbage", name: "구르는 양배추", kind: "creature", power: 2, trait: "tough" },
    ],
    bosses: [
      { id: "boss_grain_sprite", name: "곡물의 왕", kind: "large", power: 3, isBoss: true, trait: "tough" },
      { id: "boss_giant_vegetable", name: "채소 거신", kind: "large", power: 3, isBoss: true, trait: "regen" },
      { id: "boss_gluttony_titan", name: "폭식의 거인", kind: "large", power: 3, isBoss: true, trait: "tough" },
    ],
  },
  social: {
    normal: [
      { id: "soc_newbie_whisper", name: "작은 속삭임", kind: "spirit", power: 1, isNewbie: true },
      { id: "soc_newbie_pickpocket", name: "서툰 소매치기", kind: "goblin", power: 1, isNewbie: true, trait: "fragile" },
      { id: "soc_thief", name: "뒷골목 도둑", kind: "goblin", power: 1, trait: "swift" },
      { id: "soc_clown", name: "떠도는 광대", kind: "goblin", power: 1, trait: "swift" },
      { id: "soc_gossip", name: "소문꾼", kind: "goblin", power: 2, trait: "poison" },
      { id: "soc_swindler", name: "사기꾼", kind: "goblin", power: 2, trait: "burst" },
      { id: "soc_outcast", name: "추방자", kind: "spirit", power: 3, trait: "regen" },
      { id: "soc_mime", name: "침묵의 마임", kind: "goblin", power: 2, trait: "shield" },
      { id: "soc_troll", name: "말참견 트롤", kind: "goblin", power: 2, trait: "tough" },
    ],
    bosses: [
      { id: "boss_street_thief", name: "도둑의 왕", kind: "large", power: 3, isBoss: true, trait: "swift" },
      { id: "boss_jester", name: "어둠의 광대", kind: "large", power: 3, isBoss: true, trait: "burst" },
      { id: "boss_loneliness_phantom", name: "외로움의 환영", kind: "large", power: 3, isBoss: true, trait: "poison" },
    ],
  },
  productivity: {
    normal: [
      { id: "prd_newbie_paperclip", name: "달그락 클립", kind: "construct", power: 1, isNewbie: true, trait: "fragile" },
      { id: "prd_newbie_stickynote", name: "나풀 포스트잇", kind: "creature", power: 1, isNewbie: true },
      { id: "prd_gear", name: "작은 톱니바퀴", kind: "construct", power: 1 },
      { id: "prd_clockbot", name: "시계 병사", kind: "construct", power: 2, trait: "shield" },
      { id: "prd_timesink", name: "시간 도둑", kind: "spirit", power: 2, trait: "swift" },
      { id: "prd_drone", name: "자동인형", kind: "construct", power: 2, trait: "tough" },
      { id: "prd_pendulum", name: "저주의 추", kind: "construct", power: 3, trait: "burst" },
      { id: "prd_ledger", name: "산더미 장부", kind: "book", power: 2, trait: "tough" },
      { id: "prd_inbox", name: "폭주 메일함", kind: "construct", power: 2, trait: "burst" },
    ],
    bosses: [
      { id: "boss_clockwork_drone", name: "시계탑 수호자", kind: "large", power: 3, isBoss: true, trait: "shield" },
      { id: "boss_time_thief", name: "시간 도적왕", kind: "large", power: 3, isBoss: true, trait: "swift" },
      { id: "boss_procrastination_lord", name: "미루기의 시간술사", kind: "large", power: 3, isBoss: true, trait: "regen" },
    ],
  },
  wellness: {
    normal: [
      { id: "wel_newbie_droplet", name: "작은 물방울", kind: "spirit", power: 1, isNewbie: true, trait: "fragile" },
      { id: "wel_newbie_petal", name: "떨어진 꽃잎", kind: "creature", power: 1, isNewbie: true },
      { id: "wel_mist", name: "안개 정령", kind: "spirit", power: 1, trait: "swift" },
      { id: "wel_slime", name: "수증기 슬라임", kind: "creature", power: 1, trait: "regen" },
      { id: "wel_naiad", name: "온천 님프", kind: "spirit", power: 2, trait: "regen" },
      { id: "wel_lotus", name: "독 연꽃", kind: "creature", power: 2, trait: "poison" },
      { id: "wel_cold", name: "한기", kind: "spirit", power: 3, trait: "burst" },
      { id: "wel_ember", name: "숯불 잔광", kind: "spirit", power: 2, trait: "burst" },
      { id: "wel_moss", name: "쉬쉬 이끼", kind: "creature", power: 2, trait: "poison" },
    ],
    bosses: [
      { id: "boss_mist_spirit", name: "짙은 안개의 영", kind: "large", power: 3, isBoss: true, trait: "regen" },
      { id: "boss_river_naiad", name: "온천의 여왕", kind: "large", power: 3, isBoss: true, trait: "regen" },
      { id: "boss_lethargy_fog", name: "무기력의 안개", kind: "large", power: 3, isBoss: true, trait: "poison" },
    ],
  },
  trending: {
    normal: [
      { id: "trd_newbie_pixel", name: "말썽꾸러기 픽셀", kind: "creature", power: 1, isNewbie: true, trait: "fragile" },
      { id: "trd_newbie_bubble", name: "채팅 말풍선", kind: "spirit", power: 1, isNewbie: true },
      { id: "trd_mini", name: "랜덤 픽셀", kind: "creature", power: 1, trait: "swift" },
      { id: "trd_meme", name: "밈 변종", kind: "goblin", power: 1, trait: "burst" },
      { id: "trd_glitch", name: "글리치", kind: "spirit", power: 2, trait: "swift" },
      { id: "trd_holo", name: "홀로그램 유령", kind: "spirit", power: 2, trait: "shield" },
      { id: "trd_viral", name: "바이럴 구체", kind: "creature", power: 3, trait: "regen" },
      { id: "trd_swipe", name: "무한 스와이프", kind: "spirit", power: 2, trait: "swift" },
      { id: "trd_algorithm", name: "알고리즘 요괴", kind: "construct", power: 2, trait: "burst" },
    ],
    bosses: [
      { id: "boss_mutant_minor", name: "작은 카멜레온", kind: "large", power: 3, isBoss: true, trait: "swift" },
      { id: "boss_mutant_mid", name: "뒤틀린 유행", kind: "large", power: 3, isBoss: true, trait: "regen" },
      { id: "boss_trend_chameleon", name: "트렌드의 카멜레온", kind: "large", power: 3, isBoss: true, trait: "burst" },
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
 * 보스층 (10 의 배수, 상한 없음) 에서는 보스 사용 (caller 가 결정).
 *
 * Phase 11c — `ngPlusLevel` 인자 추가. 0 (기본) 이면 legacy. 1+ 이면 hp/atk/def 에
 * `(1 + 0.4 × n)` 곱해서 NG+ 반복 플레이 난이도 상승. xp/coin 보상도 같은 비율로 ↑.
 * Phase 11c-balance — `hpMult` / `atkMult` 추가 (weekly affix 페널티). 기본 1.
 * Phase 16 (Track C) — Math.random → rng(). 시드 테스트 (세션 루프·밸런스
 *   시뮬레이션) 가 가능해지고 iOS (이미 RandomSource 주입) 와 호출 순서가 맞는다:
 *   [newbie 풀 roll] → [power 티어 roll] → [티어 내 인덱스 roll].
 */
export interface ScaleOptions {
  ngPlusLevel?: number;
  hpMult?: number;
  atkMult?: number;
}

/**
 * Phase 16 (Track C, 피드백 33) — 층 구간별 power 티어 가중치 (p1/p2/p3).
 *
 * 이전엔 풀에서 균등 추첨이라 F5 에서도 power 3 (ATK ×3) 이 1/7 로 나와 같은 층
 * 안의 편차가 층 20개분에 달했다 ("구간 편차"). 초반은 p1 위주, 후반으로 갈수록
 * p3 비중이 오른다. newbie 풀 (F1-10 의 100%/40% 규칙) 은 그대로.
 * 풀에 없는 티어는 버리고 남은 가중치를 재정규화한다.
 * iOS MonsterPool.powerWeightsByFloor 미러.
 */
export const POWER_WEIGHTS_BY_FLOOR: ReadonlyArray<
  Readonly<Record<1 | 2 | 3, number>>
> = [
  { 1: 70, 2: 30, 3: 0 }, // F1-10
  { 1: 50, 2: 40, 3: 10 }, // F11-20
  { 1: 35, 2: 45, 3: 20 }, // F21-30
  { 1: 25, 2: 45, 3: 30 }, // F31+
];

export function powerWeightBand(floor: number): number {
  return floor <= 10 ? 0 : floor <= 20 ? 1 : floor <= 30 ? 2 : 3;
}

/** rng 두 번 소비: 티어 → 티어 내 균등. 풀이 비면 undefined 가 아니라 풀 균등 폴백. */
function pickTemplateByFloorWeight(
  pool: MonsterTemplate[],
  floor: number,
): MonsterTemplate {
  const weights = POWER_WEIGHTS_BY_FLOOR[powerWeightBand(floor)];
  const tiers: Array<{ power: 1 | 2 | 3; items: MonsterTemplate[]; w: number }> = [];
  for (const power of [1, 2, 3] as const) {
    const items = pool.filter((t) => t.power === power);
    if (items.length === 0) continue;
    tiers.push({ power, items, w: weights[power] });
  }
  const total = tiers.reduce((sum, t) => sum + t.w, 0);
  let chosen = tiers[tiers.length - 1];
  if (total > 0) {
    let roll = rng() * total;
    for (const tier of tiers) {
      roll -= tier.w;
      if (roll < 0) {
        chosen = tier;
        break;
      }
    }
  } else {
    // 모든 가중치 0 (풀에 있는 티어가 전부 0 가중) — 풀 균등 폴백.
    rng();
    return pool[Math.floor(rng() * pool.length)];
  }
  return chosen.items[Math.floor(rng() * chosen.items.length)];
}

export function createMonsterForFloor(
  dungeonId: DungeonId,
  floor: number,
  isBoss = false,
  opts: ScaleOptions = {},
): Monster {
  const pool = TEMPLATES[dungeonId];
  if (isBoss) {
    // Phase 16 (Track C, 피드백 28) — 던전의 3 보스를 사이클마다 순서대로 재사용.
    //   F10:0 F20:1 F30:2 F40:0 F50:1 F60:2 ... (rng 소비 없음 — revealBoss 미리보기가
    //   같은 함수를 호출해도 시드가 어긋나지 않는다.)
    const bossIdx = floor < 10 ? 0 : (((Math.floor(floor / 10) - 1) % 3) + 3) % 3;
    const template = pool.bosses[bossIdx];
    return scaleMonster(template, dungeonId, floor, opts);
  }
  // 초보자 풀 / 일반 풀 분리.
  //   floor 1-3: newbie 풀만 (Lv2 영웅이 바로 돌파 가능한 수준).
  //   floor 4-10: newbie 40% / normal 60% (전환 구간).
  //   floor 11+: normal 풀만.
  const newbies = pool.normal.filter((t) => t.isNewbie);
  const normals = pool.normal.filter((t) => !t.isNewbie);
  let chosenPool: MonsterTemplate[];
  if (floor <= 3 && newbies.length > 0) {
    chosenPool = newbies;
  } else if (floor <= 10 && newbies.length > 0 && rng() < 0.4) {
    chosenPool = newbies;
  } else {
    chosenPool = normals.length > 0 ? normals : pool.normal;
  }
  const template = pickTemplateByFloorWeight(chosenPool, floor);
  return scaleMonster(template, dungeonId, floor, opts);
}

/**
 * Phase 16 (Track C, 피드백 16/33) — 보스 배율을 사이클 (0 = F1-30, 1 = F31-60, ...)
 * 별로 테이퍼. 이전 단일 상수 HP ×4 / ATK ×1.7 은 F10 보스도 35+ 라운드, F20+ 는
 * regen 과 결합해 수학적으로 잡을 수 없었다. 사이클이 오를수록 영웅 스탯 성장
 * (+1/Lv) 이 몬스터 선형 스케일 (+5 HP·+1.3 ATK/층 × power) 을 못 따라가므로
 * 뒤 사이클일수록 배율을 낮춘다. 마지막 원소가 그 이후 모든 사이클에 적용된다.
 * ngMult (NG+) 는 여전히 별도로 곱한다.
 *
 * 기준 영웅 (Track A 곡선, STR/VIT = 10+(Lv-1)+장비, maxHp 100+12(Lv-1)):
 *   F10 Lv8 rare+0 / F20 Lv16 rare+0 / F30 Lv22 rare+5 / F40 Lv29 rare+5 /
 *   F50 Lv35 rare+10 / F60 Lv40 rare+10. 장비 = round((5+0.5f)×1.5) +
 *   floor(min(enh,10)/2) + max(0, enh-10).
 * 시드 200런 (8 던전 × 25 시드, upHeroMonsters.test.ts) 승률 목표:
 *   F10/F20 ≥ 80%, F30 ≥ 55%, 뒤 사이클도 같은 기준.
 * 확정값 (2026-09-04, 시작 상수 그대로 목표 충족, 튜닝 없음):
 *   HP [1.2, 1.0, 0.9, 0.85] / ATK [0.9, 0.8, 0.75, 0.7] / BOSS_REGEN_PCT 0.01
 *   측정 승률 (8 던전 × 시드 1..25, upHeroMonsters.test.ts 와 같은 시뮬):
 *   F10 100% · F20 100% · F30 70% · F40 93% · F50 100% · F60 64% · F90 (unique+15) 80.5%
 *   F30/F60 의 손실은 poison 보스 3 종 (learning/social/wellness) 에 집중된다
 *   (F30 20%, F60 4%) — 나머지 5 던전은 100%. 사이클 평균은 목표 안이라 두되,
 *   poison DoT (floor×0.5/라운드 ×3) 가 후반에 과한지는 텔레메트리 뒤 판단.
 * iOS MonsterPool.bossHpMultByCycle / bossAtkMultByCycle 미러.
 */
export const BOSS_HP_MULT_BY_CYCLE: readonly number[] = [1.2, 1.0, 0.9, 0.85];
export const BOSS_ATK_MULT_BY_CYCLE: readonly number[] = [0.9, 0.8, 0.75, 0.7];
/** 보스 XP 배율 — 스탯이 아니라 xpReward 에만. 이전 bossHpMult(4) 가 겸했던 값. */
export const BOSS_XP_MULT = 4;

export function bossCycleIndex(floor: number): number {
  return Math.max(0, Math.floor((floor - 1) / 30));
}

function cycleMult(table: readonly number[], floor: number): number {
  return table[Math.min(table.length - 1, bossCycleIndex(floor))];
}

/**
 * Phase 16 (Track C, 피드백 33) — power 가 ATK/DEF 에 곱하는 배율. HP 는 여전히
 * ×power (1/2/3) 라 "센 놈은 오래 버틴다" 는 유지하고, 한 방 데미지 편차만
 * 3.0× → 2.2× 로 압축. 보스 (power 3) 도 같은 표를 쓴다.
 * iOS MonsterPool.powerAtkDefMult 미러.
 */
export const POWER_ATK_DEF_MULT: Readonly<Record<1 | 2 | 3, number>> = {
  1: 1,
  2: 1.6,
  3: 2.2,
};

/**
 * floor + power 기반 stats 스케일링 (+ NG+ / weekly affix / trait 보정).
 *
 * Phase 14 추가 룰:
 *   - trait "tough"   : HP ×1.5, ATK ×0.8 (탱커)
 *   - trait "fragile" : HP ×0.7, ATK ×1.4 (유리 대포)
 *   - floor ≤ 10      : hp/atk/def 전체 ×0.75 (초반 페이싱 완화)
 *
 * Phase 15 밸런스 리밸런싱 (유저 피드백 "Lv24 영웅이 Lv14 몬스터에 진다"):
 *   - ATK 성장률: floor ×1.5 → ×1.3 (영웅 STR 성장 ×1.0 과의 격차 완화)
 *   - DEF 성장률: floor ×1.0 → ×0.5 (영웅 공격이 "씨알도 안 먹히는" 문제 해결)
 *   - 영웅 측 computeHeroDamage 공식도 DR 기반으로 전환 (대칭).
 *
 * Phase 16 (Track C) 표 — 기준 영웅 대비 (trait 미반영, NG+0):
 *   | floor | 보스 hp/atk/def | 일반 p1 / p2 / p3 (hp/atk/def)               |
 *   | F5    | -               | 34/9/3  · 68/14/5  · 101/19/7 (p3 가중 0)   |
 *   | F10   | 189/27/12       |                                             |
 *   | F15   | -               | 95/25/10 · 190/39/15 · 285/54/21           |
 *   | F20   | 432/61/26       |                                             |
 *   | F25   | -               | 145/38/15 · 290/60/23 · 435/83/32          |
 *   | F30   | 612/87/37       |                                             |
 *   | F40   | 660/100/48 (cycle 1: hp ×1.0, atk ×0.8)                       |
 *   | F60   | 960/146/70                                                    |
 *   보스 xp 는 BOSS_XP_MULT(4) 로 이전과 동일, 코인 ×10 유지.
 */
export function scaleMonster(
  t: MonsterTemplate,
  dungeonId: DungeonId,
  floor: number,
  opts: ScaleOptions = {},
): Monster {
  const { ngPlusLevel = 0, hpMult = 1, atkMult = 1 } = opts;
  // Phase 16 (Track C) — 보스 배율은 사이클 테이퍼 표에서. 근거는 BOSS_HP_MULT_BY_CYCLE 주석.
  const bossHpMult = t.isBoss ? cycleMult(BOSS_HP_MULT_BY_CYCLE, floor) : 1;
  const bossAtkMult = t.isBoss ? cycleMult(BOSS_ATK_MULT_BY_CYCLE, floor) : 1;
  const bossXpMult = t.isBoss ? BOSS_XP_MULT : 1;
  const powerAtkDef = POWER_ATK_DEF_MULT[t.power];
  const ngMult = ngPlusScaleMult(ngPlusLevel);
  const base = 20 + floor * 5;
  const earlyCoinBoost = !t.isBoss && floor <= 10 ? 1.3 : 1;

  // Phase 14 trait stat modifiers.
  let traitHpMult = 1;
  let traitAtkMult = 1;
  if (t.trait === "tough") {
    traitHpMult = 1.5;
    traitAtkMult = 0.8;
  } else if (t.trait === "fragile") {
    traitHpMult = 0.7;
    traitAtkMult = 1.4;
  }

  // Phase 14 floor ≤ 10 너프 — 초반 페이싱 완화용 일괄 감산.
  const earlyNerf = floor <= 10 ? 0.75 : 1;

  const finalHp = Math.round(
    base * t.power * bossHpMult * ngMult * hpMult * traitHpMult * earlyNerf,
  );
  // Phase 15 — ATK 성장률 ×1.5 → ×1.3. 영웅 STR 성장 (level 당 +1.0) 과의 격차 완화.
  //   F14 power2: (5+14×1.3)×2 = 46 (기존 52, ≈12% 하향)
  //   F30 power3 보스: (5+30×1.3)×3×1.7 = 224 (기존 265)
  // Phase 16 (Track C) — ×power → ×POWER_ATK_DEF_MULT[power] (1 / 1.6 / 2.2).
  const finalAtk = Math.round(
    (5 + floor * 1.3) *
      powerAtkDef *
      bossAtkMult *
      ngMult *
      atkMult *
      traitAtkMult *
      earlyNerf,
  );
  // Phase 15 — DEF 성장률 ×1.0 → ×0.5. flat subtraction 공식에서 영웅 공격이 무력화되던 문제 해결.
  //   (영웅 측 computeHeroDamage 도 DR 공식으로 전환됨 — 두 변경은 세트로 설계)
  //   F14 power2: (2+7)×2 = 18 (기존 32, ≈44% 하향)
  //   F30 power3: (2+15)×3 = 51 (기존 96)
  const finalDef = Math.round((2 + floor * 0.5) * powerAtkDef * ngMult * earlyNerf);

  return {
    id: `${t.id}_f${floor}_${Date.now() % 10000}`,
    name: t.name,
    templateId: t.id,
    kind: t.kind,
    level: floor,
    hp: finalHp,
    maxHp: finalHp,
    atk: finalAtk,
    def: finalDef,
    xpReward: Math.round((10 + floor * 3) * t.power * bossXpMult * ngMult),
    coinReward: Math.round(
      (3 + floor * 2) * t.power * (t.isBoss ? 10 : 1) * ngMult * earlyCoinBoost,
    ),
    isBoss: t.isBoss,
    dungeonId,
    trait: t.trait,
  };
}
