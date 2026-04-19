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
 * floor 10/20/30 에서는 보스 사용 (caller 가 결정).
 *
 * Phase 11c — `ngPlusLevel` 인자 추가. 0 (기본) 이면 legacy. 1+ 이면 hp/atk/def 에
 * `(1 + 0.5 × n)` 곱해서 NG+ 반복 플레이 난이도 상승. xp/coin 보상도 같은 비율로 ↑.
 * Phase 11c-balance — `hpMult` / `atkMult` 추가 (weekly affix 페널티). 기본 1.
 */
export interface ScaleOptions {
  ngPlusLevel?: number;
  hpMult?: number;
  atkMult?: number;
}

export function createMonsterForFloor(
  dungeonId: DungeonId,
  floor: number,
  isBoss = false,
  opts: ScaleOptions = {},
): Monster {
  const pool = TEMPLATES[dungeonId];
  if (isBoss) {
    // 10F / 20F / 30F 에 각각 다른 보스
    const bossIdx = Math.min(Math.floor((floor - 1) / 10), 2);
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
  } else if (floor <= 10 && newbies.length > 0 && Math.random() < 0.4) {
    chosenPool = newbies;
  } else {
    chosenPool = normals.length > 0 ? normals : pool.normal;
  }
  const template = chosenPool[Math.floor(Math.random() * chosenPool.length)];
  return scaleMonster(template, dungeonId, floor, opts);
}

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
 *   모두 power / NG+ / trait / earlyNerf 스케일은 유지 — 고난도 루트의 도전성 보전.
 */
function scaleMonster(
  t: MonsterTemplate,
  dungeonId: DungeonId,
  floor: number,
  opts: ScaleOptions = {},
): Monster {
  const { ngPlusLevel = 0, hpMult = 1, atkMult = 1 } = opts;
  const bossHpMult = t.isBoss ? 4 : 1;
  const bossAtkMult = t.isBoss ? 1.7 : 1;
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
  const finalAtk = Math.round(
    (5 + floor * 1.3) *
      t.power *
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
  const finalDef = Math.round((2 + floor * 0.5) * t.power * ngMult * earlyNerf);

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
    xpReward: Math.round((10 + floor * 3) * t.power * bossHpMult * ngMult),
    coinReward: Math.round(
      (3 + floor * 2) * t.power * (t.isBoss ? 10 : 1) * ngMult * earlyCoinBoost,
    ),
    isBoss: t.isBoss,
    dungeonId,
    trait: t.trait,
  };
}
