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
  /**
   * Phase 12d — 해금된 클래스 스킬 id 목록 (스킬트리).
   *   T1 은 class 분화 시 자동 해금. T2/T3/T4 는 skillPoints 로 수동 해금.
   *   예: ["warrior_smash_t1", "warrior_berserk_t2"]
   */
  learnedSkills?: string[];
  /**
   * Phase 12d — 남은 스킬 포인트. 레벨업 (Lv31+) 마다 +1.
   *   T2 해금에 1, T3 에 1, T4 에 2 포인트 필요.
   */
  skillPoints?: number;
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
  /**
   * Phase 11a — 강화 레벨. 0 = 미강화, 최대 10.
   * `undefined` 는 legacy 저장본으로 0 과 동일하게 취급.
   * 이름 표기: `${baseName} +${enhanceLevel}` (N≥1).
   * stats 는 enhanceItem 호출 시 각 key 에 누적 가산 (미미한 +0.5 반올림 수준).
   */
  enhanceLevel?: number;
  /**
   * Phase 11c R4 — 연속 강화 실패 streak. 성공 시 0, 실패 시 +1.
   *   legend/unique 에서 pity 성공률 보너스 계산에 사용 (enhanceSuccessRate).
   *   legend: streak 당 +4%p, unique: +2%p. 이 item 에만 축적 (다른 item 은 독립).
   */
  enhanceFailStreak?: number;
  /**
   * Phase 11a — 2차 affix stat key (rare+ 드롭에 부여).
   * primary stat 과 별개로 stats 객체에도 반영됨 — 이 필드는 "어떤 key 가 affix
   * 였는지" 라벨 용도 (UI 에서 prefix 분리 표기 등). legend 은 `affixes` 배열이 2 개.
   */
  affix?: keyof HeroBaseStats;
  /** Phase 11a — legend 전용 3차 affix (2개 부여) */
  affixes?: Array<keyof HeroBaseStats>;
  /**
   * Phase 11b — 사진 부적 +5 / +10 에서 부여되는 passive skill id 들.
   * `src/lib/talismanSkills.ts` 의 TalismanSkill.id 와 매칭.
   * 일반 드롭 장비에는 없음 (사진 부적 전용).
   */
  talismanSkills?: string[];
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
  /**
   * Phase 12 i18n — 원본 MonsterTemplate id. monster.name 은 session 생성
   *   시점의 (한국어) 고정 문자열이라 다국어 표시 시 신뢰할 수 없음. 이
   *   field 로 `t("uphero.monster." + templateId)` 조회해 현재 언어 반영.
   *   legacy save (이 field 없음) 은 monster.name 그대로 폴백.
   */
  templateId?: string;
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
  | { kind: "flee"; successChance: number }
  /**
   * Phase 12e — 인터랙티브 미니게임 시작. 결과 (성공/실패) 에 따라 successEffects
   *   / failEffects 가 적용됨. 모달 동안 session 은 `awaitingMinigame` status.
   *   effects 는 startMinigame 자체를 제외한 기본 ChoiceEffect 만 허용 (재귀 방지).
   */
  | {
      kind: "startMinigame";
      minigame: MinigameId;
      difficulty: 1 | 2 | 3;
      /** 성공 시 적용될 보상 (reward/heal/time 등) */
      successEffects: SimpleChoiceEffect[];
      /** 실패 시 적용될 페널티 (damage/time 등) */
      failEffects: SimpleChoiceEffect[];
    };

/** Phase 12e — 인터랙티브 미니게임 id. 각 컴포넌트는 components/uphero/minigames/ 하위. */
export type MinigameId = "pipe_connect" | "pair_match" | "sequence_memo";

/**
 * Phase 12e — 미니게임 결과에 적용 가능한 단순 effects. startMinigame / fight /
 *   flee 같은 구조 효과는 제외해 재귀 방지.
 */
export type SimpleChoiceEffect =
  | { kind: "reward"; coins?: number; xp?: number; dropEquipmentId?: string }
  | { kind: "damage"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "time"; delta: number }
  | { kind: "skipFloors"; count: number }
  | { kind: "revealBoss" }
  | { kind: "nothing" };

/**
 * Choice entry 구분자.
 * - "event" (기본): 기존 분기 이벤트 (수상한 상인, 샘 등)
 * - "encounter": 일반 몬스터 조우 시 싸운다/도망/이벤트 선택
 */
export type ChoiceVariant = "event" | "encounter";

export interface ChoiceOption {
  label: string;
  /**
   * Phase 12 i18n framework — label 의 i18n key (선택). 설정되면 현재 언어
   *   에서 조회해 label 대신 사용. 미설정 시 `label` 그대로.
   */
  labelKey?: string;
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
  /** Phase 12 i18n — resultText 의 i18n key (선택). */
  resultTextKey?: string;
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
  /** Phase 12 i18n — resultText 의 i18n key (선택). */
  resultTextKey?: string;
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
      /** Phase 12 i18n — prompt 의 i18n key (선택). */
      promptKey?: string;
      options: ChoiceOption[];
      /** 사용자가 선택 완료 시 resolvedIndex set */
      resolvedIndex?: number;
      /** "event" (기본) 또는 "encounter" (몬스터 조우 시 싸운다/도망) */
      variant?: ChoiceVariant;
      /** 자동 선택까지 남은 시간 (ms) — encounter 는 5000. timeout 시 defaultOptionIndex 자동 resolve */
      timeoutMs?: number;
      /** timeout 시 자동 선택될 option index (encounter 는 "싸운다" = 0) */
      defaultOptionIndex?: number;
      /**
       * Phase 12 — "?" mystery event 여부. true 면 amplifyChoiceOptions 로 증폭된
       *   effects 가 적용된 상태. UI (ChoicePanel / CombatLog) 는 이 플래그를 읽어
       *   시각적 차별화 (배지/보더/글로우) 를 적용.
       */
      isMystery?: boolean;
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
      /**
       * Phase 12 i18n — 스킬 id (다국어 표시 키 조회용).
       *   legacy entry 는 id 없음 → skillName 그대로 표시 (한국어 fallback).
       */
      skillId?: string;
      /** 스킬 이름 (예: "강타", "성스러운 빛") — legacy 용 한국어 fallback */
      skillName: string;
      /** 발동 narrative (예: "영웅이 강타를 준비한다 — 다음 공격 2배") */
      narrative: string;
      timestamp: number;
    }
  | {
      /**
       * Phase 11c R1 — event choice 해소 결과. DungeonView 의 ChoiceResultModal
       *   trigger 를 narrative prefix 매칭 (`"> "`) 대신 명시적 variant 로 치환.
       *   CombatLog 는 이 entry 를 narrative 처럼 렌더 (text 그대로).
       */
      type: "choiceResult";
      /** `> {label} → {resultText}` 형식의 full narrative */
      text: string;
      /**
       * Phase 11c R4 — 효과 요약 (예: "XP +50, 시간 -3"). 유저에게 narrative 와
       *   별개로 구체 수치를 보여주기 위해 effects 를 스캔해 포맷팅. 없을 수도 있음
       *   (effects 가 비거나 summary 없는 legacy outcome).
       */
      effectSummary?: string;
      timestamp: number;
    };

export type CombatSessionStatus =
  | "active"
  | "paused"
  | "awaitingChoice"
  | "awaitingMinigame"
  | "completed";

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
   * Phase 12d — 클래스별 자원 (warrior 분노, mage 마나 등). 0-100.
   *   세션 시작 시 0. 이벤트 (공격/피격/dodge/heal 등) 시 CLASS_RESOURCE.gain 만큼 획득.
   *   스킬 발동 시 소모 (ClassSkill.resourceCost).
   */
  classResource?: number;
  /**
   * Phase 12d — 스킬별 개별 쿨다운. skillId → 남은 round.
   *   기존 `skillCooldown` 은 T1 용이었지만 이제 여러 스킬 동시 보유 → Map.
   */
  skillCooldowns?: Record<string, number>;
  /**
   * Phase 12d — 영웅 공격 배율 지속 효과 (warrior 광폭화, bard 용기가 등).
   *   rounds 양수면 다음 N round 동안 bonusMult 적용, 매 round -1.
   */
  heroAtkBonusRounds?: { rounds: number; mult: number };
  /**
   * Phase 12d — 적 행동 금지 (mage 빙결, chrono 정지, illusionist 환혹).
   *   양수면 N round 동안 enemy outcome 강제 miss.
   */
  enemyStunnedRounds?: number;
  /**
   * Phase 12d — 영웅 피해 감소 (priest 정화).
   *   rounds 동안 피격 시 damage × (1 - reduction).
   */
  heroDmgReductionRounds?: { rounds: number; reduction: number };
  /**
   * Phase 12d — 반드시 crit 되는 남은 공격 횟수 (bard 대서사시).
   */
  guaranteedCritAttacks?: number;
  /**
   * Phase 12d — 무적 (illusionist 환몽 T4). 적 공격 모두 무효.
   */
  heroInvulnerableRounds?: number;
  /**
   * Phase 12d — 1 회 죽음 무효 (priest 부활 T4). death 시 HP 50% 복원.
   */
  revivePending?: boolean;
  /**
   * Phase 12e — 진행 중인 미니게임 상태. session.status === "awaitingMinigame" 시 set.
   *   결과 resolveMinigame(success) 호출 시 effects 적용 + status=active.
   */
  pendingMinigame?: {
    minigame: MinigameId;
    difficulty: 1 | 2 | 3;
    successEffects: SimpleChoiceEffect[];
    failEffects: SimpleChoiceEffect[];
  };
  /**
   * Phase 12 R1 — 최근 본 choice event prompt LRU (max 3). pickEvent 에서 같은 것이
   *   연속 뽑히지 않도록 배제. 같은 세션에서 "수상한 상인" 이 3번 연속 나오던 현상 완화.
   */
  recentEventPrompts?: string[];
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
  /**
   * Phase 11b — 영웅이 착용한 부적들의 passive skill 을 세션 시작 시 합산한
   * modifier 버킷. combat / time / drop 각 지점에서 참조.
   * 구조: TalismanModifiers (`src/lib/talismanSkills.ts`).
   * 부적 skill 이 하나도 없으면 undefined (기본값으로 간주).
   */
  talismanMods?: import("@/lib/talismanSkills").TalismanModifiers;
  /**
   * Phase 11b — "군중의 총애" (soc+10) 효과 — 세션 중 보너스 랜덤 drop 1회.
   * true 면 아직 미사용, false/undefined 면 이미 발동됨 또는 skill 없음.
   */
  extraDropAvailable?: boolean;
  /**
   * Phase 11b — "무념" (mnd+10) round 누적 agi 보너스 현재값.
   * round 종료마다 +agiRoundAccum 씩 증가, agiRoundCap 에서 saturate.
   */
  talismanAgiStack?: number;
  /**
   * Phase 11b-fix — round 순번 카운터 (1부터 증가).
   * "대지의 축복" (2 round 마다 regen) 판정용으로만 사용. 항상 +1 씩 증가하고
   *   cap 없음 — 이전에는 agiStack 과 겸용되어 cap 도달 시 판정이 왜곡되던 버그.
   */
  roundCounter?: number;
  /**
   * Phase 11c — NG+ 레벨. 세션 시작 시점의 ngPlusLevel 스냅샷.
   *   createMonsterForFloor / rollDropRarity 에서 난이도/드롭 보정에 사용.
   *   UI 헤더 badge 용.
   */
  ngPlusLevel?: number;
  /**
   * Phase 11c — 이 세션이 "주간 악몽 던전" 모드인지.
   *   true 면 weekly affix 적용 + 종료 시 점수 계산/Firestore 업로드.
   *   false/undefined 면 일반 탐험 (legacy flow 동일).
   */
  isWeeklyVariant?: boolean;
  /**
   * Phase 11c — 이 세션에 적용된 weekly affix id.
   *   combat.ts 의 affix 별 분기 (rollHeroOutcome, createMonsterForFloor 등) 에서 참조.
   */
  weeklyAffixId?: string;
  /**
   * Phase 11c — 주간 affix 로 설정된 monster 공격력 배율 (기본 1).
   *   createMonsterForFloor 의 atk scale 에 곱. 예: "적 광란" 1.25, "강철 의지" 1.35.
   */
  monsterAtkMult?: number;
  /**
   * Phase 11c — 주간 affix 로 설정된 monster HP 배율 (기본 1).
   *   createMonsterForFloor 의 hp scale 에 곱. 예: "관대한 휴식" 1.2.
   */
  monsterHpMult?: number;
  /**
   * Phase 11c — 주간 affix 로 설정된 XP 보상 배율 (기본 1).
   *   victory 지급 시 기존 xpMult 체인에 곱. 예: "풍요의 수확" 0.75 (XP -25%).
   */
  xpMult?: number;
  /**
   * Phase 11c R1 — "깨지기 쉬운 세계" affix runtime. 몬스터 crit 확률에 가산.
   *   기본 0, affix 적용 시 0.15. rollEnemyOutcome 에서 참조.
   */
  monsterCritBonus?: number;
  /**
   * Phase 11c R1 — "혼돈의 보물" affix runtime. true 면 rollDropRarity 가
   *   4 등급 균등 확률 (25% 씩) 으로 뽑음. 고등급 확률 ↑ but 저등급도 자주.
   */
  flattenDropRarity?: boolean;
  /**
   * Phase 11c R1 — "긴 행군" affix runtime. 휴식처 확률 가산 (treasure branch).
   *   기본 0, affix 적용 시 0.30 → rest 기본 35% + 30% = 65%.
   */
  restChanceBonus?: number;
  /**
   * Phase 12 — "?" mystery event floor 목록. 첫 보스 (F10) 이후부터 생성.
   *   각 30-층 cycle 의 보스 사이 구간 (F11-F19, F21-F29, 그리고 NG+ 의 F31-F39
   *   등) 에서 랜덤 1 개 floor 선정. 유저가 해당 floor 도달 시 일반 이벤트보다
   *   강한 amplified choice 이벤트 발생. 발동 후 리스트에서 제거.
   *
   *   생성 전략:
   *   - 세션 시작 시: 현재 cycle 의 remaining mystery 를 seed
   *   - tickSession 에서 cycle 전환 시: 새 cycle 의 mystery 를 generate
   */
  mysteryFloors?: number[];
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
   * Phase 9d — 영웅 게임을 처음 시작한 시점의 챌린지 레벨 (seed).
   * 영웅 Lv = max(1, gameLevel - heroStartLevel + 1).
   * - undefined: legacy (= 1 로 간주, 기존 유저 보존)
   * - 신규 유저: initialize 에서 현재 챌린지 레벨로 seed.
   */
  heroStartLevel?: number;
  /**
   * Phase 11a — 갓생 상점의 하루 단위 구매 카운터.
   * date 는 getTodayString() (새벽 1시 기준) 포맷.
   * passesBought: 오늘 산 탐험권 개수 (DAILY_PASS_PURCHASE_CAP=2 까지).
   * 다른 daily reset 이 추가되면 여기에 필드 누적.
   */
  shopDaily?: {
    date: string;
    passesBought: number;
  };
  /**
   * Phase 11c — F30 보스 처치 시 +1. 다음 세션부터 난이도 × (1 + 0.5 × n)
   * 로 상향되며 legend drop 확률도 상승. 0 / undefined = 미해금.
   */
  ngPlusLevel?: number;
  /**
   * Phase 11c — 주간 악몽 던전 진행 상태.
   * week: ISO week id (예: "2026-W16"). 바뀌면 자동 리셋.
   * affixId: 이번 주 랜덤 pick 된 affix. 모든 유저 동일 (seed = week).
   * clearedDungeons: 이번 주 F30 변이 던전을 클리어한 dungeonId 목록.
   * bestScore: 이번 주 최고 점수 (UI/리더보드 업로드용).
   * lastUploadedAt: Firestore 리더보드 마지막 업로드 timestamp.
   */
  weeklyVariant?: {
    week: string;
    affixId: string;
    clearedDungeons: DungeonId[];
    bestScore: number;
    lastUploadedAt?: number;
  };
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
  /** Phase 11a — 탐험권 1장 가격 (던전 무관 고정). */
  expeditionPass: 80,
} as const;

/** Phase 11a — 상점에서 하루에 살 수 있는 탐험권 cap. */
// Phase 12a — 하루 4장까지 (기존 2장 → 4장). 유저 피드백: 챌린지 클리어
//   전에 상점에서 능동적 구매도 더 유연해야 한다.
export const DAILY_PASS_PURCHASE_CAP = 4;

/**
 * Phase 11c — NG+ 난이도 스케일.
 * monster hp/atk/def 와 drop rarity 보정에 사용.
 *   ngPlusLevel=0 → 1.0 (기본)
 *   ngPlusLevel=1 → 1.4
 *   ngPlusLevel=2 → 1.8 ...
 *
 * Phase 11c R4 — 스케일 0.5n → 0.4n 하향. NG+2+ 에서 보스 atk 가 1200+ 로 올라
 *   vit DR cap 과 결합해 1-hit kill 나오던 문제 완화. 동시에 computeEnemyDamage 의
 *   vit DR 공식도 `vit/(vit+40)` cap 0.6 → `vit/(vit+30)` cap 0.7 로 상향
 *   (upHeroCombat.ts 참고). 두 변화는 짝.
 */
export function ngPlusScaleMult(ngPlusLevel: number | undefined): number {
  return 1 + 0.4 * Math.max(0, ngPlusLevel ?? 0);
}

/** Phase 11c — NG+ legend drop bonus (0.01 = +1%p). NG+ 1 당 +2%p. */
export function ngPlusLegendBonus(ngPlusLevel: number | undefined): number {
  return Math.max(0, ngPlusLevel ?? 0) * 0.02;
}

/**
 * Phase 11c — ISO week id 계산 ("2026-W16" 형식).
 * 매주 월요일 00:00 (KST) 기준으로 새 주 번호. useGameStore 의 getTodayString()
 * 처럼 새벽 1시 보정은 하지 않음 — weekly 는 coarser 단위라 60분 shift 불필요.
 *
 * 참고: ISO 8601 week numbering. 한 해의 첫 번째 목요일이 포함된 주가 Week 1.
 */
export function getISOWeekId(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // 목요일 기준으로 shift
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Phase 11c — 주간 악몽 점수 공식.
 *   base = floorsCleared × 100
 *   완주 (F30 클리어) 보너스: +2000
 *   time bonus: remainingTime × 2
 *   level bonus: max(1, heroLevel)² × 2
 *
 * Phase 11c R4 — levelBonus 를 heroLevel × 5 (선형) → heroLevel² × 2 (2차) 로 변경.
 *   기존: Lv30 = 150 pt 로 완주 +2000 의 7.5% — 고레벨 참여 인센티브 미미.
 *   신규: Lv1 = 2, Lv10 = 200, Lv30 = 1800, Lv50 = 5000. 완주 bonus 와 비슷한 체급이
 *   되어 "고레벨이 중간층까지만 가도 스코어 경쟁력" 구조 확립.
 */
export function computeWeeklyScore(
  floorsCleared: number,
  remainingTime: number,
  heroLevel: number,
): number {
  const base = Math.max(0, floorsCleared) * 100;
  const completionBonus = floorsCleared >= 30 ? 2000 : 0;
  const timeBonus = Math.max(0, remainingTime) * 2;
  const lv = Math.max(1, heroLevel);
  const levelBonus = lv * lv * 2;
  return base + completionBonus + timeBonus + levelBonus;
}

/* ══════════════════════════════════════════════════════════════════════
 * Phase 11a — 강화 (enhanceItem) 시스템 상수
 *
 * 단일 아이템 + 코인 → 확률적 +1 level 시도. 최대 +10.
 * 성공률: base - enhanceLevel × decay (등급별 decay 다름).
 * ══════════════════════════════════════════════════════════════════════ */

/** 강화 가능 최대 레벨 (inclusive). */
export const MAX_ENHANCE_LEVEL = 10;

// Phase 11c R2 — 이전 `ENHANCE_PRESERVE_ON_FAIL` 상수 제거. 전면 `ENHANCE_PRESERVE_BY_RARITY`
// 사용 (rarity 별 차등 보존: normal/rare 30%, unique 40%, legend 50%).

/**
 * 등급별 base 성공률 (+0 → +1). 백분율 0-100.
 * Phase 11c R1 fix: legend 60 → 75. 이전 값으로는 +0→+10 누적 성공률 ≈ 0.0001%
 * (백만 번에 1회) 로 legend +10 이 수학적 도달 불가능했음. 목표로 설정 가능한
 * 수치로 상향.
 */
export const ENHANCE_BASE_SUCCESS: Record<Rarity, number> = {
  normal: 95,
  rare: 90,
  unique: 75,
  legend: 75,
};

/**
 * 등급별 level 당 감쇠율. 백분율 포인트.
 * Phase 11c R1 fix: 전체적으로 완화. legend +0→+10 누적 ≈ 75×68×61×54×47×40×33×26×19×12 (%)
 * = 약 0.03%. 여전히 희귀하지만 500-1000 시도로 가능.
 */
export const ENHANCE_DECAY_PER_LEVEL: Record<Rarity, number> = {
  normal: 3,
  rare: 4,
  unique: 5,
  legend: 7,
};

/**
 * Phase 11c R1 fix — legend 만 보존 확률 상향 (30% → 50%).
 * legend 는 코인 비용도 훨씬 비싸 (×4 rarityMult) 실패 시 손실이 극단적.
 * normal/rare/unique 는 기존 30% 유지.
 */
/**
 * Phase 11c R4 — Soft pity. 연속 실패 streak 당 pp 보너스. legend/unique 에만 적용.
 *   legend base 12% (+9→+10) → fail 5회 후 32%, 10회 후 52%, 15회 후 72%.
 *   평균 수렴 시도 수: 33,000회 → 약 55회 수준으로 현실화.
 *   성공 시 streak = 0, 실패 (보존 or 소실) 시 streak += 1.
 */
// Phase 11c R4 R3 — 내부 전용 (enhanceSuccessRate 에서만 참조). export 제거.
const ENHANCE_PITY_BONUS_PER_FAIL: Record<Rarity, number> = {
  normal: 0,
  rare: 0,
  unique: 0.02, // +2%p / fail
  legend: 0.04, // +4%p / fail
};

export const ENHANCE_PRESERVE_BY_RARITY: Record<Rarity, number> = {
  normal: 0.3,
  rare: 0.3,
  unique: 0.4,
  legend: 0.5,
};

/** 등급별 비용 배율 (base coin × level 증분 × 이 값). */
export const ENHANCE_COST_RARITY_MULT: Record<Rarity, number> = {
  normal: 1,
  rare: 1.5,
  unique: 2.5,
  legend: 4,
};

/**
 * 현재 level → 다음 level 시도의 성공률 (0-1 범위).
 * targetLevel = currentLevel + 1.
 */
export function enhanceSuccessRate(
  rarity: Rarity,
  currentLevel: number,
  failStreak: number = 0,
): number {
  const base = ENHANCE_BASE_SUCCESS[rarity];
  const decay = ENHANCE_DECAY_PER_LEVEL[rarity];
  // +0 → +1 시도는 level=0 으로 base 그대로, +9 → +10 은 level=9 로 decay × 9 차감.
  const raw = base - Math.max(0, currentLevel) * decay;
  const rawRate = Math.max(0.05, Math.min(1, raw / 100));
  // Phase 11c R4 — Soft pity 가산. failStreak × 등급별 pp. 최대 100% 까지 cap.
  const pityBonus = Math.max(0, failStreak) * ENHANCE_PITY_BONUS_PER_FAIL[rarity];
  return Math.min(1, rawRate + pityBonus);
}

/**
 * 강화 시도 코인 비용 계산. base 30 + level 당 50% 증가 + rarity mult.
 *   e.g., unique +3 → 30 × (1 + 3 × 0.5) × 2.5 = 30 × 2.5 × 2.5 = 187.5 → 188.
 */
export function enhanceCost(rarity: Rarity, currentLevel: number): number {
  const base = SHOP_PRICES.enhance;
  const levelMult = 1 + Math.max(0, currentLevel) * 0.5;
  const rarityMult = ENHANCE_COST_RARITY_MULT[rarity];
  return Math.round(base * levelMult * rarityMult);
}

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

/**
 * Phase 9d — 영웅 전용 레벨 계산.
 *
 * 배경: 챌린지 레벨 (useGameStore.progress.level) 을 그대로 영웅 레벨로 쓰면,
 * Up Hero 가 나중에 release 된 후 이미 챌린지만 해서 Lv 41 인 유저는 영웅도
 * 즉시 Lv 41 로 시작 → "새 콘텐츠 키우는 맛" 이 사라진다.
 *
 * 해결: 영웅을 처음 시작한 시점의 챌린지 레벨 (heroStartLevel) 을 기록하고,
 * 영웅 레벨은 "그 이후의 성장" 만 반영.
 *
 *   effectiveHeroLevel = max(1, gameLevel - heroStartLevel + 1)
 *
 * - 신규 영웅 유저 (챌린지 Lv 41) 가 오늘 영웅 시작 → heroStartLevel=41 → 영웅 Lv 1
 * - 다음 날 챌린지로 Lv 42 달성 → 영웅 Lv 2 (함께 성장)
 * - 이미 영웅 진행하던 기존 유저 → migration 으로 heroStartLevel=1 (legacy 보존)
 *
 * 영웅 Lv 기반 요소 — appearanceVariant, base stat 성장, class 분화 (Lv30+),
 *   idle accrual 스케일 등 — 전부 이 effective 값 사용.
 */
export function getEffectiveHeroLevel(
  gameLevel: number,
  heroStartLevel: number | undefined,
): number {
  const startLvl = heroStartLevel ?? 1;
  return Math.max(1, gameLevel - startLvl + 1);
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
 *
 * Phase 12c — 클래스 전직 후 CLASS_STAT_GROWTH bias 반영.
 */

/**
 * Phase 12d — 클래스별 고유 자원 시스템.
 *   각 클래스가 다른 자원을 쓰며 획득 트리거가 다름 → 플레이 패턴 차별화.
 *   스킬 발동 시 자원 소모 (스킬 데이터의 resourceCost 필드).
 *
 *   max 는 모든 클래스 100 (동일 척도). 초기값 0.
 */
export type ResourceEvent =
  | "attack"       // 영웅 공격 (hit/crit)
  | "hit"          // 영웅 피격
  | "dodge"        // 영웅 dodge 성공
  | "crit"         // 영웅 crit 성공
  | "heal"         // heal 효과 발동
  | "victory"      // 일반 몬스터 처치
  | "floor"        // 층 이동
  | "choice"       // 이벤트 선택 해결
  | "roundStart";  // 전투 round 시작

export interface ClassResourceSpec {
  /** 표시 이름 (예: "분노", "마나") */
  name: string;
  /** 2-3 자 약어 (UI bar 표기용) */
  short: string;
  /** 자원 bar 색상 */
  color: string;
  /** 각 이벤트별 gain 량 (기본 0) */
  gain: Partial<Record<ResourceEvent, number>>;
}

export const CLASS_RESOURCE: Record<ClassType, ClassResourceSpec> = {
  warrior: {
    name: "분노",
    short: "RAGE",
    color: "#e88b7a",
    gain: { attack: 15, hit: 10, crit: 20 },
  },
  mage: {
    name: "마나",
    short: "MANA",
    color: "#8bb9e8",
    // Phase 12 R1 — round 당 마나 축적 속도 상향 (10 → 14) + attack 시 +3.
    //   기존 보스전 7 round 동안 70 + 15(victory 후) 로 T4 (90) 못 쓰던 문제 완화.
    //   이제 7 round = 98 + attack 보너스 → T4 발동 가능.
    gain: { roundStart: 14, attack: 3, victory: 15 },
  },
  monk: {
    name: "기",
    short: "CHI",
    color: "#cdb887",
    gain: { hit: 20, attack: 5, dodge: 15 },
  },
  druid: {
    name: "자연력",
    short: "NAT",
    color: "#87c87a",
    gain: { roundStart: 5, heal: 15, floor: 10 },
  },
  bard: {
    name: "영감",
    short: "INSP",
    color: "#e8c76b",
    // Phase 12 R1 — bard 이벤트 선택 시 +5 (대화/협상 플레이버 반영).
    gain: { victory: 15, attack: 8, choice: 5 },
  },
  chronomancer: {
    name: "시간 파편",
    short: "TIME",
    color: "#a5c8db",
    // Phase 12 R1 — 전투 중 지속력 강화: roundStart 5 → 8, attack +3.
    gain: { floor: 15, choice: 10, roundStart: 8, attack: 3 },
  },
  priest: {
    name: "신앙",
    short: "FAITH",
    color: "#e8e0cd",
    // Phase 12 R1 — 전투 중 축적이 너무 느려 T4 (100) 는 세션당 1-2회였음.
    //   hit (피격) 시 +8 추가 — 보스전에서 꾸준히 쌓임. 20 round 전투 기준 160+ 축적.
    gain: { heal: 15, dodge: 10, hit: 8, victory: 10 },
  },
  illusionist: {
    name: "환기",
    short: "ESNC",
    color: "#c88be8",
    // Phase 12 R1 — illusionist 이벤트 선택 시 +5 (속임수 플레이버).
    gain: { dodge: 25, crit: 15, attack: 5, choice: 5 },
  },
};

export const CLASS_RESOURCE_MAX = 100;

/**
 * Phase 12c — 클래스별 레벨당 성장 편향 테이블.
 *   각 value 는 기본 성장률 1.0 에 더해지는 offset. 합이 +0.5 ~ +1.0 수준
 *   (모든 클래스 총 stat 은 대략 비슷하나 분포가 다름).
 *
 *   예: warrior Lv42 str = 10 + 41 × (1.0 + 0.4) = 67.4. Lv42 mage str = 10 + 41 × (1.0 - 0.3) = 38.7.
 *
 *   일반 (null class) 은 1.0 + 0 bias.
 */
export const CLASS_STAT_GROWTH: Record<ClassType, Partial<Record<StatKey, number>>> = {
  warrior: { str: 0.4, vit: 0.3, int: -0.2, agi: -0.1 },
  mage: { int: 0.5, crit: 0.2, str: -0.3, vit: -0.1 },
  monk: { dex: 0.2, agi: 0.2, vit: 0.2, crit: 0.2, str: 0.1 },
  druid: { vit: 0.3, int: 0.2, agi: 0.1 },
  bard: { dex: 0.3, agi: 0.3, int: 0.2, crit: 0.1 },
  chronomancer: { dex: 0.4, int: 0.3, agi: 0.1 },
  priest: { int: 0.4, vit: 0.3, crit: 0.1 },
  illusionist: { crit: 0.3, int: 0.2, dex: 0.2, agi: 0.1, str: 0.1 },
};

export function computeHeroForLevel(hero: Hero, level: number): Hero {
  const lvl = Math.max(1, level);
  const delta = lvl - 1;
  const base = hero.baseStats;
  // Phase 12c — 클래스별 성장 편향. 전직 후 (classType 있을 때) 만 적용.
  //   기본 성장 1.0 + bias (CLASS_STAT_GROWTH). bias 가 있는 stat 은 가산/감산.
  const bias = hero.classType ? CLASS_STAT_GROWTH[hero.classType] : {};
  const growth = (key: StatKey) => 1.0 + (bias[key] ?? 0);
  const baseStats: HeroBaseStats = {
    str: Math.round(base.str + delta * growth("str")),
    int: Math.round(base.int + delta * growth("int")),
    vit: Math.round(base.vit + delta * growth("vit")),
    dex: Math.round(base.dex + delta * growth("dex")),
    agi: Math.round(base.agi + delta * growth("agi")),
    // crit 은 base 유지 + 클래스 편향이 있으면 flat 가산 (mage/monk/bard/illusionist/priest).
    crit: Math.round(base.crit + delta * (bias.crit ?? 0)),
    slotBonus: base.slotBonus,
  };
  // maxHp 는 Lv1 기본 (100) + level delta × 12 로 항상 constant 재계산.
  // 호출이 누적되지 않도록 hero.maxHp 를 base 로 쓰지 않음 (idempotent).
  // Phase 11c R4 R2 — `×10 → ×12`. NG+ 스케일링에서 Lv30 maxHp 390 이 보스 crit
  //   한 방에 1-hit 나던 문제 완화. Lv30: 100+29×12 = 448. Lv50: 688.
  const newMaxHp = 100 + delta * 12;
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

/**
 * Phase 12b — 육각형 HexStatChart 의 각 축 max 기준값 동적 계산.
 *
 * 각 스탯의 실제 max 는 (기본 base 10) + (레벨 × 성장률). 성장률은 클래스별
 * 편향을 반영 (Phase 12c 와 연동) — primary 1.2 / secondary 1.0 / off-stat 0.8.
 * crit 은 level 무관 고정 max (장비/버프로만 증가, 평균 상한 50).
 *
 * `ref` 는 radar chart 의 0-1 비율 기준. 실제 stat 값 / ref 가 1 초과하면
 * 꼭짓점 바깥으로 튀어나옴 (overflow 시각화).
 */
export type StatKey = "str" | "int" | "vit" | "dex" | "agi" | "crit";

export function computeStatMax(
  level: number,
  classType: ClassType | null,
): Record<StatKey, number> {
  const lvl = Math.max(1, level);
  const delta = lvl - 1;
  // Phase 12c — CLASS_STAT_GROWTH 를 단일 source of truth 로 사용 (HexStatChart
  //   max 와 실제 stat 성장이 일치). bias 없는 클래스는 기본 1.0 성장.
  const bias = classType ? CLASS_STAT_GROWTH[classType] : {};
  const growth = (key: StatKey) => 1.0 + (bias[key] ?? 0);
  return {
    str: Math.round(10 + delta * growth("str")),
    int: Math.round(10 + delta * growth("int")),
    vit: Math.round(10 + delta * growth("vit")),
    dex: Math.round(10 + delta * growth("dex")),
    agi: Math.round(10 + delta * growth("agi")),
    // crit 은 base 50 (장비 전용 상한 느낌) + delta × bias.crit.
    crit: Math.round(50 + delta * (bias.crit ?? 0)),
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
