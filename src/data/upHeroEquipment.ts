/**
 * Up Hero — 장비 템플릿 풀.
 *
 * Phase 1-2 스코프:
 *  - 슬롯 4 × 등급 4 × 카테고리 8 = 128 possible, 실제로 흥미있는 ~48개 세트
 *  - 드롭 시 템플릿 에서 랜덤 선택 후 ID 생성
 *  - 추가 장비는 Phase 3+ 에서 확장
 */

import type { Equipment, EquipSlot, DungeonId } from "@/types/uphero";
import type { Rarity } from "@/types/card";

/** 장비 템플릿 — instance 생성 시 랜덤 ID 부여 */
interface EquipmentTemplate {
  baseName: string;
  type: EquipSlot;
  category: DungeonId;
  iconName: string;
  statBoost: keyof Equipment["stats"];
  flavor?: string;
  /** 등급별 스탯 배율 */
  rarityMult: Record<Rarity, number>;
}

/** 카테고리별 장비 테마 (친화 슬롯 중심으로 구성) */
const TEMPLATES: EquipmentTemplate[] = [
  // === 운동 (fitness) — 친화: 무기 ===
  {
    baseName: "자기절제의 검",
    type: "weapon",
    category: "fitness",
    iconName: "Sword",
    statBoost: "str",
    flavor: "유혹을 베는 날카로움",
    rarityMult: { normal: 1, rare: 1.6, unique: 2.2, legend: 3 },
  },
  {
    baseName: "꾸준함의 방패",
    type: "armor",
    category: "fitness",
    iconName: "Shield",
    statBoost: "vit",
    flavor: "매일의 반복을 막아내는 방패",
    rarityMult: { normal: 1, rare: 1.5, unique: 2, legend: 2.8 },
  },
  {
    baseName: "끈기의 완대",
    type: "accessory",
    category: "fitness",
    iconName: "Armor",
    statBoost: "str",
    flavor: "포기 직전의 한 번 더",
    rarityMult: { normal: 1, rare: 1.4, unique: 1.9, legend: 2.6 },
  },

  // === 학습 (learning) — 친화: 액세서리 ===
  {
    baseName: "지혜의 안경",
    type: "accessory",
    category: "learning",
    iconName: "EyeClosed",
    statBoost: "int",
    flavor: "숨은 진리를 드러내는 렌즈",
    rarityMult: { normal: 1, rare: 1.6, unique: 2.2, legend: 3 },
  },
  {
    baseName: "메모의 펜",
    type: "weapon",
    category: "learning",
    iconName: "Edit",
    statBoost: "int",
    flavor: "글자 한 줄이 적을 베는 도구",
    rarityMult: { normal: 1, rare: 1.5, unique: 2, legend: 2.8 },
  },
  {
    baseName: "책갈피의 부적",
    type: "talisman",
    category: "learning",
    iconName: "Note",
    statBoost: "dex",
    flavor: "잃어버린 페이지를 찾아주는",
    rarityMult: { normal: 1, rare: 1.4, unique: 1.9, legend: 2.6 },
  },

  // === 명상 (mindfulness) — 친화: 부적 ===
  {
    baseName: "평정의 부적",
    type: "talisman",
    category: "mindfulness",
    iconName: "Moon",
    statBoost: "agi",
    flavor: "숨 한 번으로 모든 공격을 흘려보냄",
    rarityMult: { normal: 1, rare: 1.6, unique: 2.2, legend: 3 },
  },
  {
    baseName: "선정의 염주",
    type: "accessory",
    category: "mindfulness",
    iconName: "Sun",
    statBoost: "vit",
    flavor: "마음이 구슬처럼 둥글어진다",
    rarityMult: { normal: 1, rare: 1.5, unique: 2, legend: 2.8 },
  },
  {
    baseName: "침묵의 로브",
    type: "armor",
    category: "mindfulness",
    iconName: "Hanger",
    statBoost: "int",
    flavor: "소리 없이 스며드는 천",
    rarityMult: { normal: 1, rare: 1.4, unique: 1.9, legend: 2.6 },
  },

  // === 식단 (nutrition) — 친화: 갑옷 ===
  {
    baseName: "곡물의 갑옷",
    type: "armor",
    category: "nutrition",
    iconName: "Hanger",
    statBoost: "vit",
    flavor: "황금빛 알갱이가 상처를 막는다",
    rarityMult: { normal: 1, rare: 1.6, unique: 2.2, legend: 3 },
  },
  {
    baseName: "절제의 수저",
    type: "weapon",
    category: "nutrition",
    iconName: "Fork",
    statBoost: "dex",
    flavor: "정량을 재어 공격하는 도구",
    rarityMult: { normal: 1, rare: 1.5, unique: 2, legend: 2.8 },
  },
  {
    baseName: "향기의 부적",
    type: "talisman",
    category: "nutrition",
    iconName: "Star",
    statBoost: "int",
    flavor: "향으로 적을 홀리는",
    rarityMult: { normal: 1, rare: 1.4, unique: 1.9, legend: 2.6 },
  },

  // === 소통 (social) — 친화: 액세서리 ===
  {
    baseName: "미소의 반지",
    type: "accessory",
    category: "social",
    iconName: "Heart",
    statBoost: "agi",
    flavor: "적을 웃게 만드는 힘",
    rarityMult: { normal: 1, rare: 1.6, unique: 2.2, legend: 3 },
  },
  {
    baseName: "대화의 류트",
    type: "weapon",
    category: "social",
    iconName: "Music",
    statBoost: "int",
    flavor: "노래가 적을 설득한다",
    rarityMult: { normal: 1, rare: 1.5, unique: 2, legend: 2.8 },
  },
  {
    baseName: "우정의 망토",
    type: "armor",
    category: "social",
    iconName: "Hanger",
    statBoost: "vit",
    flavor: "친구들의 온기로 보호받는",
    rarityMult: { normal: 1, rare: 1.4, unique: 1.9, legend: 2.6 },
  },

  // === 생산성 (productivity) — 친화: 액세서리 ===
  {
    baseName: "집중의 시계",
    type: "accessory",
    category: "productivity",
    iconName: "Clock",
    statBoost: "dex",
    flavor: "시간이 한 방향으로 흐른다",
    rarityMult: { normal: 1, rare: 1.6, unique: 2.2, legend: 3 },
  },
  {
    baseName: "효율의 도끼",
    type: "weapon",
    category: "productivity",
    iconName: "Tool",
    statBoost: "str",
    flavor: "한 번에 한 번만 휘두른다",
    rarityMult: { normal: 1, rare: 1.5, unique: 2, legend: 2.8 },
  },
  {
    baseName: "타임블록 부적",
    type: "talisman",
    category: "productivity",
    iconName: "Grid",
    statBoost: "agi",
    flavor: "시간을 블록으로 묶는 힘",
    rarityMult: { normal: 1, rare: 1.4, unique: 1.9, legend: 2.6 },
  },

  // === 건강 (wellness) — 친화: 갑옷 ===
  {
    baseName: "회복의 로브",
    type: "armor",
    category: "wellness",
    iconName: "Heart",
    statBoost: "vit",
    flavor: "온기가 상처를 치유한다",
    rarityMult: { normal: 1, rare: 1.6, unique: 2.2, legend: 3 },
  },
  {
    baseName: "숙면의 부적",
    type: "talisman",
    category: "wellness",
    iconName: "Moon",
    statBoost: "vit",
    flavor: "꿈이 현실을 치료한다",
    rarityMult: { normal: 1, rare: 1.5, unique: 2, legend: 2.8 },
  },
  {
    baseName: "균형의 완대",
    type: "accessory",
    category: "wellness",
    iconName: "Scale",
    statBoost: "agi",
    flavor: "양 끝이 평형을 이룬다",
    rarityMult: { normal: 1, rare: 1.4, unique: 1.9, legend: 2.6 },
  },

  // === 트렌딩 (trending) — 친화: 부적 (랜덤 효과) ===
  {
    baseName: "변화의 부적",
    type: "talisman",
    category: "trending",
    iconName: "Flash",
    statBoost: "dex",
    flavor: "매번 다른 형태로 변한다",
    rarityMult: { normal: 1, rare: 1.6, unique: 2.2, legend: 3 },
  },
  {
    baseName: "바이럴 검",
    type: "weapon",
    category: "trending",
    iconName: "Zap",
    statBoost: "agi",
    flavor: "퍼져나가는 한 방",
    rarityMult: { normal: 1, rare: 1.5, unique: 2, legend: 2.8 },
  },
  {
    baseName: "트렌드의 반지",
    type: "accessory",
    category: "trending",
    iconName: "Reload",
    statBoost: "int",
    flavor: "어제와 오늘이 다른",
    rarityMult: { normal: 1, rare: 1.4, unique: 1.9, legend: 2.6 },
  },
];

export const RARITY_PREFIX: Record<Rarity, string> = {
  normal: "",
  rare: "빛나는 ",
  unique: "전설적 ",
  legend: "신성한 ",
};

/**
 * Phase 5b.2 — Equipment.name 에서 rarity prefix 제거해 baseName 복원.
 * codex 저장 / 조회 / 강화 등에서 사용.
 */
export function getEquipmentBaseName(eq: {
  name: string;
  rarity: Rarity;
}): string {
  const prefix = RARITY_PREFIX[eq.rarity];
  if (prefix && eq.name.startsWith(prefix)) {
    return eq.name.slice(prefix.length);
  }
  return eq.name;
}

/**
 * Phase 11a — affix 시스템.
 * rare+ 드롭에 primary 와 다른 stat 1개 랜덤 부여. legend 는 2개.
 * 값: rare 2 / unique 4 / legend 6. primary 의 약 30% 수준.
 *
 * 이름 표기: `"of {key 한글}"` suffix. e.g. "빛나는 자기절제의 검 of 민첩".
 */
const AFFIX_VALUE: Record<Rarity, number> = {
  normal: 0,
  rare: 2,
  unique: 4,
  legend: 6,
};

const AFFIX_STAT_LABEL: Record<keyof import("@/types/uphero").HeroBaseStats, string> = {
  str: "힘",
  int: "지성",
  vit: "체력",
  dex: "손재주",
  agi: "민첩",
  crit: "치명",
  slotBonus: "슬롯",
};

const AFFIX_POOL: Array<keyof import("@/types/uphero").HeroBaseStats> = [
  "str",
  "int",
  "vit",
  "dex",
  "agi",
  "crit",
];

/** primary 와 같지 않은 stat 랜덤 선택. 이미 뽑힌 것도 exclude. */
function pickAffix(
  exclude: Set<string>,
): keyof import("@/types/uphero").HeroBaseStats | null {
  const available = AFFIX_POOL.filter((k) => !exclude.has(k));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/** 템플릿 + 등급 → Equipment instance */
export function createEquipmentFromTemplate(
  template: EquipmentTemplate,
  rarity: Rarity,
  dungeonFloor: number,
): Equipment {
  const mult = template.rarityMult[rarity];
  const baseStatValue = Math.round((5 + dungeonFloor * 0.5) * mult);

  // Phase 4a — unique/legend 장비에 crit 보너스 부여
  // unique: +3% crit, legend: +7% crit (확률에 추가)
  const critBonus =
    rarity === "legend" ? 7 : rarity === "unique" ? 3 : 0;

  // Phase 4b — accessory / talisman 타입이면서 unique 이상이면 slotBonus +1
  // (Lv5+ 기본 2슬롯 + 최대 +2 = 4개 슬롯까지 가능)
  const isSlotBearer =
    (template.type === "accessory" || template.type === "talisman") &&
    (rarity === "unique" || rarity === "legend");

  const stats: Partial<import("@/types/uphero").HeroBaseStats> = {
    [template.statBoost]: baseStatValue,
  };
  if (critBonus > 0) stats.crit = critBonus;
  if (isSlotBearer) stats.slotBonus = 1;

  // Phase 11a — affix 부여. rare+ 에 1개, legend 에 추가 1개 (총 2개).
  //   primary stat 과 crit (이미 unique+ 에서 부여됨) 은 exclude.
  //   affix 값은 기존 stats 에 그대로 더해짐 (중복 key 는 자동 합산).
  const primaryKey = template.statBoost as string;
  const affix1 =
    rarity === "normal"
      ? null
      : pickAffix(new Set([primaryKey, "crit", "slotBonus"]));
  const affixList: Array<keyof import("@/types/uphero").HeroBaseStats> = [];
  if (affix1) {
    stats[affix1] = (stats[affix1] ?? 0) + AFFIX_VALUE[rarity];
    affixList.push(affix1);
  }
  if (rarity === "legend") {
    const affix2 = pickAffix(
      new Set([primaryKey, "crit", "slotBonus", affix1 ?? ""]),
    );
    if (affix2) {
      stats[affix2] = (stats[affix2] ?? 0) + AFFIX_VALUE[rarity];
      affixList.push(affix2);
    }
  }

  // 이름에 affix suffix 부착 — UI 가 읽기 쉽도록 "of {한글}" 형태.
  //   legend 두 개면 "of 민첩, 힘" 처럼 comma 구분.
  const affixSuffix =
    affixList.length > 0
      ? ` of ${affixList.map((k) => AFFIX_STAT_LABEL[k]).join(", ")}`
      : "";

  return {
    id: `eq_${template.baseName.replace(/\s/g, "")}_${rarity}_${Date.now() % 100000}_${Math.floor(Math.random() * 1000)}`,
    name: `${RARITY_PREFIX[rarity]}${template.baseName}${affixSuffix}`,
    type: template.type,
    rarity,
    category: template.category,
    iconName: template.iconName,
    stats,
    flavor: template.flavor,
    ...(affixList.length === 1 ? { affix: affixList[0] } : {}),
    ...(affixList.length > 1 ? { affixes: affixList } : {}),
  };
}

/** 던전 + floor 기반 드롭 생성 */
export function rollEquipmentDrop(
  dungeonId: DungeonId,
  floor: number,
  rarity: Rarity = "normal",
  affinitySlot?: EquipSlot,
): Equipment {
  // 해당 던전 카테고리 템플릿 우선, 친화 슬롯 가중치
  const dungeonTemplates = TEMPLATES.filter((t) => t.category === dungeonId);
  const pool = dungeonTemplates.length > 0 ? dungeonTemplates : TEMPLATES;

  // 친화 슬롯 drop 확률 상승 (70% 친화, 30% 다른)
  const affinityPool = pool.filter((t) => t.type === affinitySlot);
  const chosenPool =
    affinityPool.length > 0 && Math.random() < 0.7 ? affinityPool : pool;

  const template = chosenPool[Math.floor(Math.random() * chosenPool.length)];
  return createEquipmentFromTemplate(template, rarity, floor);
}

/**
 * 랜덤 rarity 결정 — floor 에 따라 확률 변동.
 * Phase 11b — `legendDropBonus` (0-1) 로 legend 확률 추가 가산 가능 ("유행" skill).
 * Phase 11c R1 — `flatten` true 면 "혼돈의 보물" affix: 4 등급 균등 25% 분배.
 */
export function rollDropRarity(
  floor: number,
  legendDropBonus = 0,
  flatten = false,
): Rarity {
  const r = Math.random();
  if (flatten) {
    // "혼돈의 보물" — legend 25% + legendDropBonus, unique 25%, rare 25%, normal 25%.
    const legendCut = 0.25 + legendDropBonus;
    if (r < legendCut) return "legend";
    if (r < 0.5) return "unique";
    if (r < 0.75) return "rare";
    return "normal";
  }
  const tier = Math.min(Math.floor(floor / 10), 3); // 0-3 tier
  // 고층일수록 유니크/레전드 확률 ↑. legendDropBonus 는 기존 threshold 에 +.
  const legendHi = 0.02 + legendDropBonus;
  const legendMid = 0.05 + legendDropBonus;
  if (tier >= 3 && r < legendHi) return "legend";
  if (tier >= 2 && r < legendMid) return "legend";
  if (tier >= 1 && r < 0.12) return "unique";
  if (r < 0.05) return "unique";
  if (r < 0.3) return "rare";
  return "normal";
}

export { TEMPLATES as EQUIPMENT_TEMPLATES };

/**
 * Phase 5b.2 — Codex 용 flat list. type + category + iconName 정보 포함.
 * baseName 은 template 의 고유 식별자 역할도 한다 (Korean 문자열이지만 unique).
 */
export const ALL_EQUIPMENT_TEMPLATES: EquipmentTemplate[] = TEMPLATES;

/**
 * Phase 5b.2 — 인스턴스 id 에서 template baseName 복원.
 * ID 포맷: `eq_{baseName 공백 제거}_{rarity}_{timestamp}_{rand}`
 * Legacy codex entry (id 기반) 을 baseName 으로 변환할 때 사용.
 *
 * baseName 이 공백을 포함할 수 있지만 ID 에선 공백 제거되므로, template 을
 * 순회하며 stripped 이름으로 매칭.
 */
export function findTemplateByLegacyId(legacyId: string): EquipmentTemplate | null {
  // `eq_{name}_{rarity}_{ts}_{rnd}` 에서 가운데 name 부분 추출
  // rarity 는 normal/rare/unique/legend 중 하나 — 뒤에서부터 파싱.
  const match = legacyId.match(
    /^eq_(.+?)_(normal|rare|unique|legend)_\d+_\d+$/,
  );
  if (!match) return null;
  const strippedName = match[1];
  for (const t of TEMPLATES) {
    if (t.baseName.replace(/\s/g, "") === strippedName) return t;
  }
  return null;
}
