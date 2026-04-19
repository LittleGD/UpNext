/**
 * Up Hero — 몬스터 풀.
 * 던전별 일반 몬스터 5종 + 보스 3종.
 * 이모지 대신 MonsterSprite (직접 그린 8×8 dot-matrix) 를 사용.
 */

import { ngPlusScaleMult, type DungeonId, type Monster, type MonsterKind } from "@/types/uphero";

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
}

const TEMPLATES: Record<DungeonId, { normal: MonsterTemplate[]; bosses: MonsterTemplate[] }> = {
  fitness: {
    normal: [
      // 초보자 전용 — 1-3층 스폰. Lv2 영웅도 손쉽게 클리어.
      { id: "fit_newbie_rabbit", name: "겁쟁이 토끼", kind: "creature", power: 1, isNewbie: true },
      { id: "fit_newbie_pebble", name: "뒹구는 돌멩이", kind: "construct", power: 1, isNewbie: true },
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
      { id: "lrn_newbie_page", name: "흩날리는 낱장", kind: "book", power: 1, isNewbie: true },
      { id: "lrn_newbie_ink", name: "작은 잉크 방울", kind: "creature", power: 1, isNewbie: true },
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
      { id: "mnd_newbie_bubble", name: "작은 망상 거품", kind: "spirit", power: 1, isNewbie: true },
      { id: "mnd_newbie_breeze", name: "살랑 바람", kind: "spirit", power: 1, isNewbie: true },
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
      { id: "ntr_newbie_bean", name: "통통 튀는 콩", kind: "creature", power: 1, isNewbie: true },
      { id: "ntr_newbie_carrot", name: "아기 당근", kind: "goblin", power: 1, isNewbie: true },
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
      { id: "soc_newbie_whisper", name: "작은 속삭임", kind: "spirit", power: 1, isNewbie: true },
      { id: "soc_newbie_pickpocket", name: "서툰 소매치기", kind: "goblin", power: 1, isNewbie: true },
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
      { id: "prd_newbie_paperclip", name: "달그락 클립", kind: "construct", power: 1, isNewbie: true },
      { id: "prd_newbie_stickynote", name: "나풀 포스트잇", kind: "creature", power: 1, isNewbie: true },
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
      { id: "wel_newbie_droplet", name: "작은 물방울", kind: "spirit", power: 1, isNewbie: true },
      { id: "wel_newbie_petal", name: "떨어진 꽃잎", kind: "creature", power: 1, isNewbie: true },
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
      { id: "trd_newbie_pixel", name: "말썽꾸러기 픽셀", kind: "creature", power: 1, isNewbie: true },
      { id: "trd_newbie_bubble", name: "채팅 말풍선", kind: "spirit", power: 1, isNewbie: true },
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

/** floor + power 기반 stats 스케일링 (+ NG+ / weekly affix 보정) */
function scaleMonster(
  t: MonsterTemplate,
  dungeonId: DungeonId,
  floor: number,
  opts: ScaleOptions = {},
): Monster {
  const { ngPlusLevel = 0, hpMult = 1, atkMult = 1 } = opts;
  // Phase 12 bugfix — 보스 HP 와 ATK 배율을 분리. 기존 bossMult=4 가 HP/ATK 동시
  //   적용되어 Floor 10 보스 atk=240 → Lv9 영웅 crit 1-hit kill.
  //   R1: bossAtkMult 2.5 → 2.0 추가 하향 + 보스 crit ×1.4 → ×1.25 로 (computeEnemyDamage
  //   에서 분기). F10 보스 atk = (5+15)×3×2.0 = 120, Lv9 DR 0.26, crit (×1.25) = 112.
  //   Lv9 maxHp 196 에서 2.3 hit 생존 — 플레이어 vit 투자 시 3 hit 이상.
  //   NG+2 F30 보스 atk = 375 → 300 (1.8× ngMult). crit = 281, Lv30 maxHp 448
  //   에서 1.6 hit 여전히 위험하나 이전 350 대비 완화.
  const bossHpMult = t.isBoss ? 4 : 1;
  // Phase 12 R2 — NG+2 F30 에서 crit 한 방에 maxHp 의 50%+ 깎여 2 hit 사망 위험.
  //   2.0 → 1.85 로 완화. F10 atk 111 (crit 102 vs Lv9 maxHp 196 = 1.9 hit).
  //   F30 NG+2 atk 450 (crit 210 vs Lv30 maxHp 448 = 2.1 hit 생존).
  // Phase 12 R2-review — NG+2 F30 기준 crit 210 vs maxHp 448 (2.1 hit) 은
  //   vit 투자 없는 유저에게 여전히 marginal. 1.85 → 1.70 으로 추가 완화.
  //   F10 atk = (5+15)×3×1.70 = 102 (crit 92 vs Lv9 maxHp 196 = 2.1 hit).
  //   NG+2 F30 atk = 300×(1+0.4·2)×1.70 = 459 → crit 214 vs 448 = 2.1 hit 생존.
  //   (NG+ 배율이 이미 +80% 라 bossAtkMult 조정 효과는 normal vs boss 갭만 조절).
  const bossAtkMult = t.isBoss ? 1.7 : 1;
  // Phase 11c R4 — 기존 하드코딩 `1 + 0.5 * ngPlusLevel` 을 `ngPlusScaleMult` 로 교체.
  //   R4 R1 에서 `ngPlusScaleMult` 를 0.5n → 0.4n 로 변경했으나 여기서 import 되지
  //   않아 orphan 함수였음. 이제 실제로 적용됨.
  const ngMult = ngPlusScaleMult(ngPlusLevel);
  const base = 20 + floor * 5;
  // Phase 12 R2-review — 초기 floor (F1-F10) normal 몬스터 coin 보상 +30% 부스트.
  //   현재 F1 normal power1 coin = 5, F5 power2 = 26 → ticket(50)/pass(80) 구매
  //   까지 누적 시간 과다. Lv10 도달까지 최소 코인 체감 개선.
  //   보스 (×10) 와 후반 floor 는 적용 안 함 — 비율 왜곡 방지.
  const earlyCoinBoost = !t.isBoss && floor <= 10 ? 1.3 : 1;
  return {
    id: `${t.id}_f${floor}_${Date.now() % 10000}`,
    name: t.name,
    // Phase 12 i18n — 원본 template id (monster.name i18n 조회용)
    templateId: t.id,
    kind: t.kind,
    level: floor,
    hp: Math.round(base * t.power * bossHpMult * ngMult * hpMult),
    atk: Math.round((5 + floor * 1.5) * t.power * bossAtkMult * ngMult * atkMult),
    def: Math.round((2 + floor) * t.power * ngMult),
    // XP / Coin 보상은 HP 기반 (탱키한 적 더 많은 보상) — bossHpMult 유지.
    xpReward: Math.round((10 + floor * 3) * t.power * bossHpMult * ngMult),
    coinReward: Math.round(
      (3 + floor * 2) * t.power * (t.isBoss ? 10 : 1) * ngMult * earlyCoinBoost,
    ),
    isBoss: t.isBoss,
    dungeonId,
  };
}
