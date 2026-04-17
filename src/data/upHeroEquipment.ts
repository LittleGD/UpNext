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

const RARITY_PREFIX: Record<Rarity, string> = {
  normal: "",
  rare: "빛나는 ",
  unique: "전설적 ",
  legend: "신성한 ",
};

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

  return {
    id: `eq_${template.baseName.replace(/\s/g, "")}_${rarity}_${Date.now() % 100000}_${Math.floor(Math.random() * 1000)}`,
    name: `${RARITY_PREFIX[rarity]}${template.baseName}`,
    type: template.type,
    rarity,
    category: template.category,
    iconName: template.iconName,
    stats,
    flavor: template.flavor,
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

/** 랜덤 rarity 결정 — floor 에 따라 확률 변동 */
export function rollDropRarity(floor: number): Rarity {
  const r = Math.random();
  const tier = Math.min(Math.floor(floor / 10), 3); // 0-3 tier
  // 고층일수록 유니크/레전드 확률 ↑
  if (tier >= 3 && r < 0.02) return "legend";
  if (tier >= 2 && r < 0.05) return "legend";
  if (tier >= 1 && r < 0.12) return "unique";
  if (r < 0.05) return "unique";
  if (r < 0.3) return "rare";
  return "normal";
}

export { TEMPLATES as EQUIPMENT_TEMPLATES };
