/**
 * Up Hero (갓생 영웅) — 방치형 RPG 타입 정의.
 *
 * 핵심 설계:
 *  - 챌린지 완료 → 탐험권 획득 (자동 전투 트리거 X)
 *  - 사용자가 능동적으로 던전 진입 → 탐험권 1장 소모
 *  - 던전 내부: 빠른 자동 전투 + 분기점/이벤트 에서는 사용자 선택
 *  - 영웅 레벨 = useGameStore.progress.level (별도 추적 X)
 */

import type { Category, Rarity } from "./card";

/** 던전 ID = 챌린지 카테고리 (8개 1:1 매핑) */
export type DungeonId = Category;

/** 장비 슬롯 */
export type EquipSlot = "weapon" | "armor" | "accessory" | "talisman";

/** 영웅 기본 스탯 */
export interface HeroBaseStats {
  str: number;
  int: number;
  vit: number;
  dex: number;
  agi: number;
  /** 크리 보너스 스탯 (%) — 장비로만 획득, hero base = 0 */
  crit: number;
  /** 버프 슬롯 보너스 — unique/legend accessory/talisman 에서만, hero base = 0 */
  slotBonus: number;
}

/** 클래스 타입 — 30레벨 이후 가장 많이 한 카테고리로 분화 (Phase 5+) */
export type ClassType =
  | "warrior" // 운동
  | "mage" // 학습
  | "monk" // 명상
  | "druid" // 식단
  | "bard" // 소통
  | "chronomancer" // 생산성
  | "priest" // 건강
  | "illusionist"; // 트렌딩

/** 영웅 */
export interface Hero {
  /** 영웅 이름 — 랜덤 풀에서 배정, 추후 사용자 변경 가능 */
  name: string;
  // level/xp 는 useGameStore.progress 와 동기 (여기 별도 추적 X)
  hp: number;
  maxHp: number;
  baseStats: HeroBaseStats;
  equipped: Partial<Record<EquipSlot, Equipment>>;
  classType: ClassType | null;
  appearanceVariant: number; // 0-2 (Lv별 외형)
}

/** 장비 카드 (기존 ChallengeCard 프레임/RarityTexture 재활용) */
export interface Equipment {
  id: string;
  name: string; // i18n key 또는 직접 문자열
  type: EquipSlot;
  rarity: Rarity;
  category: DungeonId; // 출처 카테고리
  iconName: string; // PixelIcon 이름
  stats: Partial<HeroBaseStats>;
  /** 특수 효과 설명 (i18n key 또는 문자열) */
  effects?: string[];
  /** 플레버 텍스트 */
  flavor?: string;
}

/** 탐험권 보유량 — 카테고리별 */
export type ExpeditionPasses = Partial<Record<DungeonId, number>>;

/** 몬스터 실루엣 타입 — MonsterSprite 컴포넌트의 kind 과 매칭 */
export type MonsterKind =
  | "beast"
  | "goblin"
  | "spirit"
  | "construct"
  | "book"
  | "creature"
  | "large";

/** 몬스터 */
export interface Monster {
  id: string;
  name: string;
  /** 픽셀 sprite 타입 — 이모지 대신 직접 그린 dot-matrix SVG */
  kind: MonsterKind;
  level: number;
  hp: number;
  atk: number;
  def: number;
  xpReward: number;
  coinReward: number;
  isBoss?: boolean;
  dungeonId: DungeonId;
}

/** 던전 정의 */
export interface Dungeon {
  id: DungeonId;
  name: string; // i18n key
  /** 던전 테마 색/분위기 (Game Boy 팔레트 변주) */
  themeColor: string; // CSS color
  /** 친화 장비 슬롯 — 이 던전에서 드롭 시 살짝 더 강함 */
  affinity: EquipSlot;
  /** 주요 보스 (미니보스 10F, 중간 20F, 최종 30F) */
  bossIds: [string, string, string];
}

/** 던전 진행 상황 — 영속 저장 */
export interface DungeonProgress {
  dungeonId: DungeonId;
  floorReached: number;
  bossesDefeated: number[]; // [10, 20, 30] 중 처치한 floor
}

/** 이벤트 선택지 효과 */
export type ChoiceEffect =
  | { kind: "reward"; coins?: number; xp?: number; dropEquipmentId?: string }
  | { kind: "damage"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "skipFloors"; count: number }
  | { kind: "revealBoss" }
  | { kind: "nothing" };

export interface ChoiceOption {
  label: string;
  effect: ChoiceEffect;
  /** 선택 후 결과 narrative */
  resultText?: string;
}

/** 전투 결과 — Phase 3: miss (공격자 실수) / dodge (방어자 회피) 구분 */
export type CombatOutcome = "hit" | "crit" | "dodge" | "miss";

/** 전투 로그 엔트리 — discriminated union */
export type LogEntry =
  | { type: "narrative"; text: string; timestamp: number }
  | { type: "encounter"; monster: Monster; timestamp: number }
  | {
      type: "combat";
      attacker: "hero" | "enemy";
      damage: number;
      /** Phase 3 신규 — miss/dodge/crit/hit 판정 */
      outcome: CombatOutcome;
      /** 생성된 narrative 문장 (있으면 렌더에서 우선 표시) */
      narrative?: string;
      timestamp: number;
    }
  | { type: "victory"; monster: Monster; xp: number; coins: number; timestamp: number }
  | { type: "drop"; equipment: Equipment; timestamp: number }
  | { type: "treasure"; coins: number; description: string; timestamp: number }
  | { type: "floor"; from: number; to: number; timestamp: number }
  | { type: "boss"; monster: Monster; floor: number; timestamp: number }
  | {
      type: "choice";
      prompt: string;
      options: ChoiceOption[];
      /** 사용자가 선택 완료 시 resolvedIndex set */
      resolvedIndex?: number;
      timestamp: number;
    }
  | { type: "sessionEnd"; reason: "victory" | "defeat" | "abandoned"; timestamp: number };

export type CombatSessionStatus = "active" | "paused" | "awaitingChoice" | "completed";

/** 전투 세션 — 현재 진행 중인 던전 탐험 */
export interface CombatSession {
  dungeonId: DungeonId;
  startFloor: number;
  currentFloor: number;
  log: LogEntry[];
  /** 세션 시작 시점 영웅 스냅샷 (장비 변경 영향 없게) */
  hero: Hero;
  rewards: { xp: number; coins: number; drops: Equipment[] };
  status: CombatSessionStatus;
  /** awaitingChoice 시 대기 중 choice 의 log index */
  pendingChoiceIndex?: number;
  /** tick 속도 배율 */
  speed: 1 | 2 | 4;
  startedAt: number;
}

/** 도감 — 발견한 몬스터/장비/보스 ID 모음 */
export interface Codex {
  monsters: string[];
  equipment: string[];
  bosses: string[];
}

/** 꾸미기 옵션 (Phase 4+) */
export interface Cosmetics {
  tentColor?: string;
  campfire?: string;
}

/** Up Hero 전체 상태 */
export interface UpHeroState {
  hero: Hero;
  inventory: Equipment[];
  coins: number;
  passes: ExpeditionPasses;
  dungeons: Partial<Record<DungeonId, DungeonProgress>>;
  currentSession: CombatSession | null;
  codex: Codex;
  cosmetics: Cosmetics;
  /** 오프라인 누적 계산용 */
  lastIdleAccrualAt: number;
  isLoaded: boolean;
}

/** 챌린지 rarity → 탐험권 수량 매핑 */
export const PASS_GRANT_BY_RARITY: Record<Rarity, number> = {
  normal: 1,
  rare: 2,
  unique: 3,
  legend: 5,
};

/** 탐험권 카테고리별 최대 보유량 */
export const PASS_CAP_PER_CATEGORY = 20;

/** 갓생 코인 상점 가격 */
export const SHOP_PRICES = {
  ticket: 50,
  cardPackSmall: 200, // 1장
  cardPackFull: 800, // 5장 (level-up pack)
  enhance: 30,
  fastForward: 20,
  reroll: 50,
} as const;

/** 장비 판매 환급 (Phase 4a) */
export const SELL_PRICE: Record<Rarity, number> = {
  normal: 5,
  rare: 15,
  unique: 50,
  legend: 200,
};

/** 영웅 외형 variant 결정 (레벨 기반) */
export function getHeroAppearanceVariant(level: number): number {
  if (level >= 30) return 2;
  if (level >= 10) return 1;
  return 0;
}

/** 영웅 이름 풀 — 첫 생성 시 랜덤 배정 (추후 리네임 기능) */
export const HERO_NAME_POOL = [
  "레오", "미라", "타로", "카이", "루나", "노아", "제드", "리나",
  "이든", "하루", "알토", "메이", "에코", "쿠로", "리온", "아사",
  "세라", "노엘", "오루", "피오", "시온", "유리", "데이", "벨",
] as const;

/** 이름 풀에서 랜덤 영웅 이름 1개 반환 */
export function rollHeroName(): string {
  return HERO_NAME_POOL[Math.floor(Math.random() * HERO_NAME_POOL.length)];
}

/** 기본 Hero 생성 */
export function createDefaultHero(): Hero {
  return {
    name: rollHeroName(),
    hp: 100,
    maxHp: 100,
    baseStats: { str: 10, int: 10, vit: 10, dex: 10, agi: 10, crit: 0, slotBonus: 0 },
    equipped: {},
    classType: null,
    appearanceVariant: 0,
  };
}

/** 영웅의 실제 스탯 = base + 장착 장비 합산 */
export function computeEffectiveStats(hero: Hero): HeroBaseStats {
  const stats: HeroBaseStats = { ...hero.baseStats };
  for (const eq of Object.values(hero.equipped)) {
    if (!eq) continue;
    for (const [k, v] of Object.entries(eq.stats)) {
      if (v != null) stats[k as keyof HeroBaseStats] += v;
    }
  }
  return stats;
}

// ─────────────────────────────────────────────────────────
// Phase 4b — 챌린지 카드 버프 시스템
// ─────────────────────────────────────────────────────────

/** 특수 효과 종류 — rare+ 에서만 허용 */
export type SpecialEffect =
  | "dropRate"         // 장비 드롭 확률 ↑
  | "monsterFrequency" // 몬스터 조우 빈도 ↓ (음수 %)
  | "coinBoost"        // 코인 획득 ↑
  | "xpBoost"          // XP 획득 ↑
  | "critBonus"        // 크리 확률 ↑ (%)
  | "healStart";       // 세션 시작 HP 보너스

/** 버프 효과 — 3 종류의 discriminated union */
export type BuffEffect =
  | { kind: "stat"; stats: Partial<HeroBaseStats> } // 모든 rarity
  | { kind: "special"; type: SpecialEffect; value: number } // rare+
  | { kind: "affinity"; category: DungeonId; multiplier: number }; // unique+

/** 카드 뒷면 버프 — ChallengeCard.buff 에 저장 */
export interface CardBuff {
  /** 1-3개 효과 조합 */
  effects: BuffEffect[];
  /** 카드 뒷면 표시용 요약 (한국어, Phase 10+ i18n) */
  description: string;
}

/**
 * 버프 선택 가능 슬롯 수 계산.
 *   base = Lv 1-4: 1개, Lv 5+: 2개
 *   + accessory.slotBonus (unique+1, legend+1)
 *   + talisman.slotBonus (unique+1, legend+1)
 *   cap = 4
 */
export function getBuffSlotCount(hero: Hero, level: number): number {
  const base = level >= 5 ? 2 : 1;
  const accessoryBonus = hero.equipped.accessory?.stats.slotBonus ?? 0;
  const talismanBonus = hero.equipped.talisman?.stats.slotBonus ?? 0;
  return Math.min(4, base + accessoryBonus + talismanBonus);
}
