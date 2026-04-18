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

/** 클래스 타입 — 30레벨 이후 가장 많이 한 카테고리로 분화 (Phase 5c) */
export type ClassType =
  | "warrior" // 운동
  | "mage" // 학습
  | "monk" // 명상
  | "druid" // 식단
  | "bard" // 소통
  | "chronomancer" // 생산성
  | "priest" // 건강
  | "illusionist"; // 트렌딩

/**
 * Phase 5c.1 — 8 dungeon → 8 class 매핑 (암묵 규약을 명시화).
 * 주요 완료 카테고리를 기반으로 Lv 30 도달 시 자동 분화.
 */
export const CLASS_BY_DUNGEON: Record<DungeonId, ClassType> = {
  fitness: "warrior",
  learning: "mage",
  mindfulness: "monk",
  nutrition: "druid",
  social: "bard",
  productivity: "chronomancer",
  wellness: "priest",
  trending: "illusionist",
};

/** 역방향 — class 에서 원래 카테고리 찾기 (UI 에서 class 아이콘 선택용) */
export const DUNGEON_BY_CLASS: Record<ClassType, DungeonId> = {
  warrior: "fitness",
  mage: "learning",
  monk: "mindfulness",
  druid: "nutrition",
  bard: "social",
  chronomancer: "productivity",
  priest: "wellness",
  illusionist: "trending",
};

/** Class 한국어 이름 + 패시브 설명 (Phase 5c.2 참조) */
export const CLASS_META: Record<
  ClassType,
  { name: string; passive: string; icon: string }
> = {
  warrior: { name: "전사", passive: "전투 round 당 HP +2 회복", icon: "Sword" },
  mage: { name: "마법사", passive: "모든 XP 획득 +20%", icon: "BookOpen" },
  monk: { name: "수도승", passive: "회피 확률 +10%", icon: "Moon" },
  druid: { name: "드루이드", passive: "회복 효과 +30%", icon: "Coffee" },
  bard: { name: "음유시인", passive: "코인 획득 +25%", icon: "Message" },
  chronomancer: {
    name: "시간술사",
    passive: "탐험 시간 소모 -25%",
    icon: "Clock",
  },
  priest: { name: "사제", passive: "세션 시작 HP +50", icon: "Heart" },
  illusionist: {
    name: "환영술사",
    passive: "치명타 확률 +8%",
    icon: "Sparkle",
  },
};

/**
 * Phase 6 polish — class 별 sprite/UI 테마 색.
 * DUNGEONS[DUNGEON_BY_CLASS[classType]].themeColor 와 동일한 값을 미리
 * 정리해 두어 쉽게 참조 (circular import 방지).
 */
export const CLASS_THEME_COLOR: Record<ClassType, string> = {
  warrior: "#87b87a", // fitness — 연녹
  mage: "#a5c8db", // learning — 연파랑
  monk: "#c9b8e8", // mindfulness — 연보라
  druid: "#e8d88b", // nutrition — 연노랑
  bard: "#e8a8a8", // social — 연분홍
  chronomancer: "#bca88b", // productivity — 베이지/갈색
  priest: "#8bc9c9", // wellness — 민트
  illusionist: "#cdf564", // trending — 네온
};

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
  /**
   * Phase 6b — 액티브 스킬 자동 발동 on/off. 기본 true.
   * false 면 cooldown 차도 스킬 안 터짐 (상세 플레이 관찰 용도).
   */
  autoSkillEnabled?: boolean;
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
  /**
   * Phase 7 — 이 Equipment 가 사진 부적 (photo-bound talisman) 인 경우
   * 원본 photo 의 id. 있으면 UI 가 iconName 대신 IndexedDB 썸네일을 렌더.
   * type 은 항상 "talisman". 바인딩 의식 후 고정.
   */
  photoId?: string;
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
  | { kind: "nothing" }
  /** 탐험 시간 조정 — 음수 = 소모, 양수 = 회복 */
  | { kind: "time"; delta: number }
  /** 일반 몬스터 encounter 에서 "싸운다" — 즉시 전투 round 시작 */
  | { kind: "fight" }
  /**
   * 일반 몬스터 encounter 에서 "도망간다" — agi/level 기반 확률 성공.
   * 성공 시 전투 없이 다음 floor. 실패 시 전투 시작 + 한 턴 반격 허용.
   */
  | { kind: "flee"; successChance: number };

/**
 * Choice entry 구분자.
 * - "event" (기본): 기존 분기 이벤트 (수상한 상인, 샘 등)
 * - "encounter": 일반 몬스터 조우 시 싸운다/도망/이벤트 선택
 */
export type ChoiceVariant = "event" | "encounter";

export interface ChoiceOption {
  label: string;
  /**
   * 단일 효과 (legacy) — outcomes 가 없을 때 fallback 으로 적용.
   * 기존 데이터 호환 및 단순 옵션 (fight/flee/nothing) 에서 사용.
   */
  effect?: ChoiceEffect;
  /**
   * 여러 outcome 중 가중치 기반 확률 분기 — outcomes 가 있으면 effect 대신 사용.
   * 유저에게는 label 만 보이고 어떤 outcome 이 골라질지 미리 알려주지 않는다.
   */
  outcomes?: ChoiceOutcome[];
  /** 선택 후 결과 narrative (legacy fallback — outcomes 에는 각 outcome 별 resultText) */
  resultText?: string;
}

/**
 * Choice 옵션의 확률적 결과 — 같은 선택지여도 내부에서 weight 로 뽑혀
 * 완전히 다른 상황으로 전개될 수 있다. Phase 4c.3.
 */
export interface ChoiceOutcome {
  /** 상대 가중치 (합산되어 normalize). 예: [70, 20, 10] = 성공 70%, 실패 20%, 대박 10% */
  weight: number;
  /** 이 outcome 이 골라졌을 때 로그에 남길 narrative */
  resultText: string;
  /** 순차 적용할 효과 (여러 개 가능 — 예: 시간 -5 + damage 10 + coin 30) */
  effects: ChoiceEffect[];
}

/** 전투 결과 — Phase 3: miss (공격자 실수) / dodge (방어자 회피) 구분 */
export type CombatOutcome = "hit" | "crit" | "dodge" | "miss";

/**
 * 세션 종료 사유 — 결과 모달과 로그에서 구체적으로 표시.
 * Phase 4c.1 — 기존 "victory" / "defeat" / "abandoned" 는 legacy fallback 으로 계속 허용.
 */
export type SessionEndReason =
  | "bossDefeated" // 최종 보스 처치 (미니/중간/최종 모두 이 reason 으로 묶되 detail 로 구분)
  | "heroDied" // HP 0 — detail 에 몬스터 이름
  | "timeExpired" // 탐험 시간 소진
  | "heroAbandoned" // 사용자 자발 복귀
  // legacy — 기존 localStorage 세션 호환용
  | "victory"
  | "defeat"
  | "abandoned";

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
      /** "event" (기본) 또는 "encounter" (몬스터 조우 시 싸운다/도망) */
      variant?: ChoiceVariant;
      /** 자동 선택까지 남은 시간 (ms) — encounter 는 5000. timeout 시 defaultOptionIndex 자동 resolve */
      timeoutMs?: number;
      /** timeout 시 자동 선택될 option index (encounter 는 "싸운다" = 0) */
      defaultOptionIndex?: number;
      timestamp: number;
    }
  | {
      type: "sessionEnd";
      reason: SessionEndReason;
      /** 사유 상세 (예: 쓰러진 몬스터 이름, 처치한 보스 이름) — 결과 모달에서 표시 */
      detail?: string;
      timestamp: number;
    }
  | {
      /** Phase 6b — 액티브 스킬 발동 로그 */
      type: "skill";
      /** 발동한 class (icon / color 결정용) */
      classType: ClassType;
      /** 스킬 이름 (예: "강타", "성스러운 빛") */
      skillName: string;
      /** 발동 narrative (예: "영웅이 강타를 준비한다 — 다음 공격 2배") */
      narrative: string;
      timestamp: number;
    };

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
  /** Phase 4b — 던전 진입 전 선택한 카드 버프 (전투/드롭/보상에 적용됨) */
  activeBuffs?: CardBuff[];
  /**
   * Phase 4c.1 — 탐험 시간 리소스.
   * 매 이벤트/전투 라운드/층 이동마다 소모. 0 이 되면 timeExpired 로 세션 종료.
   * 이벤트 결과에 따라 ±N (시간 절약 outcome, 시간 낭비 outcome).
   * 단위는 추상적 "시간" — 실시간 분/초 아님.
   */
  time: number;
  /** 시작 시 최대 시간 — UI bar 계산용. healStart 처럼 나중 timeBoost buff 로 확장 가능 */
  maxTime: number;
  /**
   * Phase 6b — 액티브 스킬 남은 쿨다운 (round 단위).
   * 0 이면 fire 가능. 세션 시작 시 0. round 종료마다 -1 (min 0).
   */
  skillCooldown?: number;
  /**
   * Phase 6b — 다음 영웅 공격 damage 배율 (warrior 강타 등).
   * 1 이상 — 공격 발생 후 reset (1 로 돌아감).
   */
  nextHeroDamageMult?: number;
  /**
   * Phase 6b — 영웅 dodge 강제 100% 유지할 남은 round 수 (monk 선정).
   * round 종료마다 -1.
   */
  forcedDodgeRounds?: number;
  /**
   * Phase 6b — 적 공격 강제 miss 유지 남은 횟수 (illusionist 환영).
   * 적이 공격 발생 때마다 -1.
   */
  forcedEnemyMisses?: number;
  /**
   * Phase 6b — 다음 victory 에 적용할 coin 배율 (bard 노래).
   * 1 이상 — 첫 victory 후 reset.
   */
  nextCoinMult?: number;
  startedAt: number;
}

/**
 * Phase 4b — 던전 진입 전 버프 drawing 상태.
 * 사용자가 던전 선택 → 6장 카드 drawn → N장 선택 대기.
 * confirmDungeon 시 탐험권 소모 + 세션 시작. cancel 시 null.
 */
export interface PendingDungeonPrep {
  dungeonId: DungeonId;
  /** draw 된 카드 id 목록 (ChallengeCard.id 참조) */
  drawnCardIds: string[];
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
  /** Phase 4b — 버프 drawing 중 (confirm 대기) */
  pendingDungeon: PendingDungeonPrep | null;
  codex: Codex;
  cosmetics: Cosmetics;
  /** 오프라인 누적 계산용 */
  lastIdleAccrualAt: number;
  /**
   * Phase 5a.3 — 저장 스키마 버전.
   * initialize 에서 이 값이 CURRENT_SCHEMA_VERSION 보다 낮으면 migration 을
   * 실행하고 새 버전으로 갱신한다. undefined 이면 legacy 로 간주 (Phase 4c 이전).
   */
  schemaVersion?: number;
  /**
   * Phase 5b.1 — 마지막 initialize 에서 계산된 idle reward.
   * UI 에서 토스트로 표시 후 acknowledgeIdleReward() 로 null 클리어.
   * transient — persist 되지 않음.
   */
  idleReward: IdleRewardSnapshot | null;
  /**
   * Phase 5c.1 — 방금 할당된 classType (ClassAwakenModal 표시용).
   * UI 에서 modal 닫을 때 acknowledgeClassAwaken() 로 null 클리어.
   * transient — persist 되지 않음 (hero.classType 으로 영구 기록됨).
   */
  pendingClassAwaken: ClassType | null;
  isLoaded: boolean;
}

/** Phase 5b.1 — idle accrual 결과를 UI 에 전달하는 snapshot */
export interface IdleRewardSnapshot {
  xp: number;
  coins: number;
  elapsedMin: number;
  rawElapsedMin: number;
}

/**
 * 챌린지 rarity → 탐험권 수량 매핑.
 *
 * Phase 4c-balance: legend 5 → 3. 레전드 챌린지 2장만 뚫어도 cap 20 근처까지
 * 차서 "꾸준 사용 유도" 의도가 무력화됐음. 3 으로 낮추면 레전드 7장 필요 →
 * cap 경고가 의미 있는 신호가 된다.
 */
export const PASS_GRANT_BY_RARITY: Record<Rarity, number> = {
  normal: 1,
  rare: 2,
  unique: 3,
  legend: 3,
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
    autoSkillEnabled: true,
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

/**
 * Phase 5a — 영웅 레벨별 base stat 자동 성장.
 *
 * 공식: hero.baseStats (Lv1 reference) 에 `(level - 1)` 만큼 선형 가산.
 * 매 레벨마다 5 주요 스탯 각 +1, HP +10.
 *
 * 정상 path — 기본 생성 hero (str/int/vit/dex/agi = 10, HP 100):
 * - Lv 1  : 각 10, HP 100
 * - Lv 10 : 각 19, HP 190
 * - Lv 30 : 각 39, HP 390  (class 분화 경계)
 * - Lv 50 : 각 59, HP 590
 *
 * baseStats 는 Lv1 reference point — 기본 생성 이후 수정될 일 없음.
 * 미래 "영구 bonus" (업적 보상 등) 로 올라갈 수는 있음.
 *
 * crit / slotBonus 는 레벨 성장에 영향 없음 (장비/버프 전용).
 * hp 는 기존 hp/maxHp 비율을 보존 — 풀피면 새 maxHp 풀피, 반피면 반피.
 *
 * 이 함수는 pure — 원본 hero 를 mutate 하지 않음.
 */
export function computeHeroForLevel(hero: Hero, level: number): Hero {
  const lvl = Math.max(1, level);
  const delta = lvl - 1;
  const base = hero.baseStats;
  const baseStats: HeroBaseStats = {
    str: base.str + delta,
    int: base.int + delta,
    vit: base.vit + delta,
    dex: base.dex + delta,
    agi: base.agi + delta,
    crit: base.crit,
    slotBonus: base.slotBonus,
  };
  // maxHp 는 Lv1 기본 (100) + level delta × 10 으로 항상 constant 재계산.
  // 호출이 누적되지 않도록 hero.maxHp 를 base 로 쓰지 않음 (idempotent).
  const newMaxHp = 100 + delta * 10;
  // 기존 hp 비율 유지 (부상 상태면 새 maxHp 에서도 같은 비율)
  const hpRatio = hero.maxHp > 0 ? hero.hp / hero.maxHp : 1;
  const newHp = Math.round(newMaxHp * hpRatio);
  return {
    ...hero,
    baseStats,
    maxHp: newMaxHp,
    hp: newHp,
  };
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
