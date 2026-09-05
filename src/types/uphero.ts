/**
 * Up Hero (갓생 영웅) — 방치형 RPG 타입 정의.
 *
 * 핵심 설계:
 *  - 챌린지 완료 → 탐험권 획득 (자동 전투 트리거 X)
 *  - 사용자가 능동적으로 던전 진입 → 탐험권 1장 소모
 *  - 던전 내부: 빠른 자동 전투 + 분기점/이벤트 에서는 사용자 선택
 *  - 영웅 레벨 = useGameStore.progress.level (별도 추적 X)
 */

import type { Language } from "./game";

import type { Category, Rarity } from "./card";
/**
 * 굴림틀(rune drum) 결과 타입. 확률 테이블의 단일 출처는 `@/lib/upHeroSlot` 이라
 * 여기서는 **타입만** 빌려온다. `import type` 은 컴파일에서 완전히 지워지므로
 * upHeroSlot ↔ types/uphero 사이에 런타임 순환 import 는 생기지 않는다
 * (upHeroSlot 도 `Rarity` 를 type-only 로만 가져간다).
 */
import type { SlotOutcomeId, SlotSymbol } from "@/lib/upHeroSlot";

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
  /**
   * Phase 13a — 장비 baseId. EQUIPMENT_TEMPLATES 의 baseId 와 매핑되며,
   * `equipmentNameById(baseId, name, language)` 헬퍼로 다국어 표시.
   * legacy 저장본은 undefined → name (한국어) 그대로 fallback.
   */
  baseId?: string;
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
  /**
   * 격자 가방 좌표 (Backpack Hero 스타일, `src/lib/upHeroBag.ts`).
   *   bagX 0..4, bagY 0..7 (row 0 = 십자, 아래로 자람), bagRot 0..3 (v1 은 weapon 만 0/1 이 다름).
   *   세 키가 모두 없으면 미배치(정리 대기 트레이). 착용 아이템(`hero.equipped`)은 좌표를 갖지 않는다
   *   (equipItem 이 지운다). 레거시 저장본은 undefined → 로드 시 `packAllIfNonePlaced` 가 first-fit.
   *   미배치 전환은 키 **삭제**로만 한다 (undefined 대입은 Firestore 페이로드에서 throw).
   *   정규화 계약(무효 → 삭제, floor 정수)은 `normalizeEquipmentPlacement` 하나만 쓴다.
   *   클라우드 와이어 키도 그대로 `bagX/bagY/bagRot`. iOS `UpHeroCloudSchema.CloudEquipment.K` 화이트리스트에
   *   같은 철자로 있어야 왕복에서 탈락하지 않는다 — 웹·iOS 를 **함께** 배포할 것.
   */
  bagX?: number;
  bagY?: number;
  bagRot?: number;
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

/**
 * Phase 14 — 몬스터 trait 시스템. 각 몬스터에 0~1 개의 특성 부여.
 *
 *   stat 변조형 (scaleMonster 내에서 적용):
 *     - "tough"  : HP +50%, ATK -20% (탱커)
 *     - "fragile": HP -30%, ATK +40% (유리 대포)
 *
 *   judgment 변조형 (rollEnemyOutcome 내):
 *     - "swift"  : 공격 적중 후 30% 회피처럼 작동 — hero miss 확률 +8%
 *     - "burst"  : crit 확률 +12%
 *
 *   지속 효과 (session state 로 관리):
 *     - "poison" : 피격 시 영웅에게 3 round 독 DoT 부여 (round 당 monster.level×0.5)
 *     - "regen"  : 매 round 시작 시 자신 최대 HP 5% 회복
 *
 *   shield:
 *     - "shield" : 처음 2 회 피격 시 받는 피해 -50%
 */
export type MonsterTrait =
  | "tough"
  | "fragile"
  | "swift"
  | "burst"
  | "poison"
  | "regen"
  | "shield";

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
  /** Phase 14 — scaleMonster 에서 확정된 최대 HP (regen cap 용) */
  maxHp?: number;
  atk: number;
  def: number;
  xpReward: number;
  coinReward: number;
  isBoss?: boolean;
  dungeonId: DungeonId;
  /** Phase 14 — 몬스터 고유 특성 (trait). 0~1 개. */
  trait?: MonsterTrait;
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
  /** 재진입 시작 기준 — 사망 시 30 단위 체크포인트로 floor down. 보스/탈출 시 도달 그대로. */
  floorReached: number;
  /** 역대 최고 도달 floor — 사망/체크포인트 미달과 무관하게 절대 후퇴 안 함. UI "최고 기록" 표시용. */
  bestFloorReached: number;
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
   * 굴림틀 이벤트에서 "코인을 넣고 돌린다".
   *
   * 결과는 이 효과를 적용하는 **순간 서버(전투 로직) 에서 확정** 되고 지급까지
   * 끝난다. 드럼 애니메이션은 이미 확정된 결과를 재생할 뿐이라 연출을 건너뛰거나
   * 앱이 죽어도 보상이 어긋나지 않는다. 확률 테이블은 `@/lib/upHeroSlot`.
   *
   * `cost` 코인이 이번 탐험에서 번 코인(`rewards.coins`)에서 빠진다. 지갑이
   * 아니라 런 수입에서 걷는 이유는 upHeroSlot 상단 주석 참조.
   */
  | { kind: "spinSlot"; cost: number }
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

/** Phase 12e — 인터랙티브 미니게임 id. 각 컴포넌트는 components/uphero/minigames/ 하위.
 *   Phase 15 WarioWare — 던전별 3 개 이상 보장용 8 종 추가 (1 동사 1 인풋, 5-10s). */
export type MinigameId =
  | "pipe_connect"
  | "pair_match"
  | "sequence_memo"
  // Phase 15 WarioWare-style micro-games
  | "tap_burst"
  | "dodge_drops"
  | "sort_items"
  | "quick_sum"
  | "spot_diff"
  | "breath_hold"
  | "trace_path"
  | "reaction_tap";

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
   * Phase 13 review — combat audit: label 에 `{pct}` 같은 token 이 있는
   *   경우 주입할 runtime params. 없으면 labelKey 조회 결과 그대로 표시.
   */
  labelParams?: Record<string, string | number>;
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

/**
 * Phase 13c — narrative i18n params.
 *   combat / skill / narrative / treasure 등의 LogEntry 는 `narrative` (한국어
 *   fallback) 과 함께 선택적으로 `narrativeKey` + `narrativeParams` 를 가질 수
 *   있다. CombatLog 가 key 를 우선 사용해 현재 언어로 풀어낸다.
 *   params 의 monsterTemplateId / skillId 같은 특수 키는 컴포넌트가 별도
 *   resolver (monsterNameById / skillName) 로 변환 후 template 에 주입한다.
 */
export type NarrativeParams = Record<string, string | number>;

/** 전투 로그 엔트리 — discriminated union */
export type LogEntry =
  | {
      type: "narrative";
      text: string;
      /** Phase 13c — i18n key + params (선택). 있으면 우선 사용. */
      narrativeKey?: string;
      narrativeParams?: NarrativeParams;
      timestamp: number;
    }
  | { type: "encounter"; monster: Monster; timestamp: number }
  | {
      type: "combat";
      attacker: "hero" | "enemy";
      damage: number;
      /** Phase 3 신규 — miss/dodge/crit/hit 판정 */
      outcome: CombatOutcome;
      /** 생성된 narrative 문장 (있으면 렌더에서 우선 표시) */
      narrative?: string;
      /** Phase 13c — i18n key + params (선택). 있으면 우선 사용. */
      narrativeKey?: string;
      narrativeParams?: NarrativeParams;
      timestamp: number;
    }
  | {
      type: "victory";
      monster: Monster;
      xp: number;
      coins: number;
      /** Phase 13c — 로그 / announce 에서 쓸 i18n 보조. */
      narrativeKey?: string;
      narrativeParams?: NarrativeParams;
      timestamp: number;
    }
  | { type: "drop"; equipment: Equipment; timestamp: number }
  | {
      type: "treasure";
      coins: number;
      description: string;
      /** Phase 13c — i18n key + params (선택). 있으면 description 대신 사용. */
      narrativeKey?: string;
      narrativeParams?: NarrativeParams;
      timestamp: number;
    }
  | { type: "floor"; from: number; to: number; timestamp: number }
  | { type: "boss"; monster: Monster; floor: number; timestamp: number }
  | {
      type: "choice";
      prompt: string;
      /** Phase 12 i18n — prompt 의 i18n key (선택). */
      promptKey?: string;
      /**
       * Phase 13 review — combat audit: encounter prompt 처럼 `{monster}` 토큰이
       *   있는 key 에 주입할 params. monsterTemplateId 가 있으면 ChoicePanel 에서
       *   현재 언어 monster name 으로 resolve 후 `{monster}` 에 주입.
       */
      promptParams?: NarrativeParams;
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
      /**
       * Phase 13a — 다국어 detail. detailKey 가 있으면 컴포넌트가 t(detailKey, detailParams)
       * 로 표시. detailMonsterTemplateId 는 monster name 을 i18n 으로 풀어내기 위한 보조.
       * legacy 세이브는 detail (한국어 string) fallback.
       */
      detailKey?: string;
      detailMonsterTemplateId?: string;
      detailMonsterFallback?: string;
      /**
       * Phase 13 review — combat audit: abandoned 사유의 `F{floor}` 주입.
       * SessionResultModal 이 t(detailKey, { floor }) 로 다국어 풀이.
       */
      detailFloor?: number;
      timestamp: number;
    }
  | {
      /** Phase 6b — 액티브 스킬 발동 로그 */
      type: "skill";
      /**
       * 발동한 class (icon / color 결정용).
       *   Phase 14 — 전직 전 영웅의 튜토리얼성 novice 스킬을 위해 `"novice"` 확장.
       *   UI 는 현재 classType 을 직접 렌더하지 않고 skillId 로 i18n 조회.
       */
      classType: ClassType | "novice";
      /**
       * Phase 12 i18n — 스킬 id (다국어 표시 키 조회용).
       *   legacy entry 는 id 없음 → skillName 그대로 표시 (한국어 fallback).
       */
      skillId?: string;
      /** 스킬 이름 (예: "강타", "성스러운 빛") — legacy 용 한국어 fallback */
      skillName: string;
      /** 발동 narrative (예: "영웅이 강타를 준비한다 — 다음 공격 2배") */
      narrative: string;
      /** Phase 13c — narrative i18n key + params (선택). */
      narrativeKey?: string;
      narrativeParams?: NarrativeParams;
      timestamp: number;
    }
  | {
      /**
       * Phase 14 — 몬스터 trait 에 의한 지속 효과 tick. CombatLog 는 텍스트로
       *   표시. computeMonsterHp 는 effect === "regen" 시 amount 만큼 monster HP
       *   증가시킴 (maxHp cap 은 scaleMonster 의 maxHp 로 별도 계산).
       */
      type: "monsterEffect";
      effect: "regen" | "poisonTick" | "shieldBlock";
      amount: number;
      narrative?: string;
      narrativeKey?: string;
      narrativeParams?: NarrativeParams;
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
      /**
       * Phase 13b — 다국어 effectSummary. 컴포넌트가 있으면 우선 사용, 없으면
       * effectSummary string fallback. legacy save 호환.
       */
      effectSummaryData?: {
        xp?: number;
        coins?: number;
        heal?: number;
        damage?: number;
        timeDelta?: number;
      };
      /**
       * Phase 13b — 다국어 narrative 빌딩 보조. text 는 한국어 fallback.
       * 컴포넌트는 actionKey/resultKey 가 있으면 t() 로 풀어서 빌드.
       */
      actionLabelKey?: string;
      actionLabelFallback?: string;
      resultTextKey?: string;
      resultTextFallback?: string;
      /**
       * 굴림틀 결과. 있으면 DungeonView 가 일반 결과 모달 대신 드럼 연출
       * (`SlotMachineModal`) 을 띄운다. `symbols` 는 이미 확정된 결과를 그대로
       * 옮긴 세 룬이라 컴포넌트는 다시 굴리지 않는다 — 표시 전용.
       */
      slot?: {
        outcome: SlotOutcomeId;
        symbols: [SlotSymbol, SlotSymbol, SlotSymbol];
        /** 굴림에 들어간 코인. 결과 화면이 순손익을 정직하게 보여주기 위해 남긴다. */
        cost: number;
        /** 이 굴림으로 받은 소실방지권 장수 (0 이면 없음). */
        destroyGuards?: number;
        /** 이 굴림으로 받은 하락방지권 장수 (0 이면 없음). */
        downGuards?: number;
        /** 이 굴림으로 붙은 전투 버프 (없으면 undefined). */
        buff?: { pct: number; battles: number };
      };
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
  rewards: {
    xp: number;
    coins: number;
    drops: Equipment[];
    /**
     * 이 탐험에서 얻은 소실방지권 장수. 보스 처치 드롭 / 보물상자 / 굴림틀에서
     * 쌓이고 세션 정산(`completeSession`) 때 `UpHeroState.destroyGuards` 로
     * 합산된다. 필드가 없는 legacy 세이브는 0 으로 읽힌다.
     */
    destroyGuards?: number;
    /** 이 탐험에서 얻은 하락방지권 장수. 정산 때 `UpHeroState.downGuards` 로 합산. */
    downGuards?: number;
  };
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
   * 굴림틀 보상 "다음 N 전투 동안 능력치 +pct%".
   *
   * 스탯에 곱하는 지점은 `upHeroCombat.sessionStats()` **한 곳뿐** 이다. 다른
   * 곳에서 또 곱하면 이중 적용되니 새 소비자를 붙일 땐 반드시 그 헬퍼를 쓸 것.
   * `battlesLeft` 는 몬스터 처치(victory) 마다 1 줄고 0 이 되면 필드째 지워진다.
   *
   * 세션 스코프인 이유: 버프는 굴림틀 이벤트 직후 같은 탐험 안에서 소진되는 게
   * 정상 경로다. 탐험을 넘겨 물려주려면 `UpHeroState` 로 승격하고 sync 스키마
   * (웹 CloudUpHeroState + iOS UpHeroCloudSchema CodingKeys 양쪽) 를 함께 넓혀야 한다.
   */
  combatBuff?: { pct: number; battlesLeft: number };
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
   * 영웅 레벨 스냅샷 (세션 시작 시점).
   *   rollHeroOutcome / rollEnemyOutcome 에서 초보자 버프 판정에 사용.
   *   Lv < 5 + floor ≤ 10 조건 시 crit/회피/적 miss 가 살짝 올라가고
   *   적 crit 이 낮아져 "너무 쉽게 죽는" 첫 경험을 완화. Lv 5+ 되는 순간부터는
   *   자동 해제 (튜토리얼 쿠션).
   */
  heroLevel?: number;
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
   * Phase 14 monster trait — 영웅이 받는 독 DoT.
   *   rounds 양수면 매 round 시작 시 s.hero.hp -= dmgPerRound (min 1).
   *   monster trait=poison 에서 피격 시 set. 이미 걸려있으면 rounds refresh.
   */
  heroPoisonRounds?: { rounds: number; dmgPerRound: number };
  /**
   * Phase 14 monster trait — 몬스터 round 당 회복량.
   *   trait=regen 인 몬스터 encounter 시 set. 0 또는 undefined 면 비활성.
   *   combat round 시작 전 monster HP 에 가산 (maxHp cap).
   */
  monsterRegenAmount?: number;
  /**
   * Phase 14 monster trait — 몬스터 shield 남은 횟수.
   *   trait=shield 인 몬스터 encounter 시 2 로 set.
   *   영웅 피격 시 damage -50% + counter -= 1.
   */
  monsterShieldHits?: number;
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
   * Phase 14 security — 직전 앱 활성 시 기록한 wall-clock (ms).
   * 매 hydrate 마다 갱신. 다음 hydrate 시 now < lastSeenAt 이면 시계 되감기로
   * 판정하여 idle reward 지급을 skip (grinding 방지).
   * undefined: legacy state — clock guard 무해 pass.
   */
  lastSeenAt?: number;
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
   * coinPouchClaimed: 오늘 데일리 코인 주머니 수령 여부 (기본 false).
   * slotSpins: 오늘 굴림틀을 돌린 횟수 (`SLOT_DAILY_SPIN_CAP` 상한). 세션이 아니라
   *   여기 두어 하루에 탐험을 몇 번 하든 합산된다. 필드가 없는 레거시 저장본은 0.
   *   굴림 상한·pity 스트릭(`slotBlankStreak`) 둘 다 세션(`CombatSession`) 밖에 산다 —
   *   스토어가 스냅샷을 전투 레이어에 넘기고 결과 엔트리를 보고 갱신한다.
   *   클라우드 와이어 키도 그대로 `slotSpins` (정수 0..100, 항상 인코드).
   *   iOS `UpHeroCloudSchema` CodingKeys 와 철자를 맞출 것.
   * 다른 daily reset 이 추가되면 여기에 필드 누적.
   */
  shopDaily?: {
    date: string;
    passesBought: number;
    coinPouchClaimed?: boolean;
    slotSpins?: number;
  };
  /**
   * Phase 11c — F30 보스 처치 시 +1. 다음 세션부터 난이도 × (1 + 0.5 × n)
   * 로 상향되며 legend drop 확률도 상승. 0 / undefined = 미해금.
   */
  ngPlusLevel?: number;
  /**
   * Phase 15 — 소실방지권 보유 개수. **상점에서 팔지 않는다.**
   * 보스 처치 드롭 · 던전 이벤트(보물상자류) · 슬롯머신 보상으로만 들어온다.
   *
   * 필드가 없는 기존 저장본은 0 으로 읽힌다 (undefined = 미보유). 개수는 항상
   * 0 이상 정수이며 ENHANCE_GUARD_MAX 로 상한을 둔다.
   *
   * 소모 계약: 강화에 실패했고, 그 실패가 **소실로 판정된 순간에만** 1 감소한다.
   * 성공했거나, 실패했지만 유지/하락으로 끝났으면 소모하지 않는다.
   *
   * 클라우드 왕복 와이어 키도 그대로 `destroyGuards` 다. iOS 는 CodingKeys
   * 화이트리스트라 이름이 한 글자만 어긋나도 왕복에서 조용히 탈락한다 —
   * iOS `UpHeroCloudSchema` 의 같은 키와 철자를 반드시 맞출 것.
   */
  destroyGuards?: number;
  /**
   * Phase 15 — 하락방지권 보유 개수. **상점 판매 품목**이다
   * (SHOP_PRICES.downGuard). 소실방지권과 달리 코인으로 살 수 있다.
   *
   * 소모 계약: 실패가 **하락으로 판정된 순간에만** 1 감소한다.
   * 와이어 키 `downGuards`.
   */
  downGuards?: number;
  /**
   * Phase 15 — 슬롯머신 보상 "다음 N 전투 동안 능력치 +X%" 의 잔여 상태.
   *   pct:        상승률, 퍼센트 포인트 (10 = +10%). 0 이하면 버프 없음과 같다.
   *               세션 층위(`CombatSession.combatBuff`)와 **같은 단위**다 —
   *               두 층위를 오갈 때 변환하지 않는다.
   *   battlesLeft: 남은 전투 수. 전투 시작마다 1 감소, 0 이면 만료.
   * 만료됐거나 없으면 undefined 다 — battlesLeft 0 짜리 껍데기를 남기지 않는다.
   * 와이어 키 `combatBuff` (중첩 맵).
   */
  combatBuff?: { pct: number; battlesLeft: number };
  /**
   * 굴림틀 연속 꽝 스트릭 (pity 카운터). **탐험을 넘어 영속**한다.
   *
   * `SLOT_PITY_THRESHOLD - 1` (= 4) 에 닿으면 다음 굴림은 꽝을 뺀 표로 굴려
   * 반드시 보상이 나오고, 보상이 나오면 0 으로 돌아간다. 갱신 지점은
   * `useUpHeroStore.resolveChoice` 한 곳 — 세션(`CombatSession`)은 이 값을 갖지
   * 않고 롤 입력으로만 받는다.
   *
   * 필드가 없는 레거시 저장본은 0 이다. 정수 [0, SLOT_BLANK_STREAK_MAX] 로
   * 접는다 (`normalizeSlotBlankStreak`). 와이어 키 `slotBlankStreak` — 0 이어도
   * 키를 항상 싣는다: 보상 뒤 0 리셋이 merge 에서 빠지면 옛 스트릭이 되살아나
   * 받을 자격이 없는 pity 가 발동한다. iOS `UpHeroCloudSchema` CodingKeys 에
   * 같은 철자로 있어야 왕복에서 탈락하지 않는다.
   */
  slotBlankStreak?: number;
  /**
   * 격자 가방 — 상점에서 산 행 수 (0..4). 보드 행 = 4 + bagRowsBought (`bagRows`).
   *   레벨과 무관하며 상점 `purchaseBagRow` 만 올린다. 필드가 없는 저장본은 0.
   *   판독은 `normalizeBagRowsBought` 하나만 쓴다 (floor, 0..4 로 접음).
   *   와이어 키도 그대로 `bagRowsBought`, 0 이어도 항상 싣는다 (merge 에서 빠지면 옛 값이
   *   되살아나도 무해하지만 규칙을 하나로). iOS `UpHeroCloudSchema` CodingKeys 동시 갱신.
   */
  bagRowsBought?: number;
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
   * 아지트 첫 진입 튜토리얼 노출 여부.
   *   false/undefined → CampPlaceholder home view 에서 CampTutorialOverlay 표시.
   *   true → 다시 보지 않음. 유저가 Skip/완료 하면 markCampTutorialSeen 으로 true 고정.
   *   Persist 되어 재설치 전까지 유지.
   */
  hasSeenCampTutorial?: boolean;
  /**
   * 시작 선물(WELCOME_GRANT_COINS) 수령 여부.
   *   false/undefined → 아직 미지급. initialize 에서 pendingWelcomeGrant 로 예약된다.
   *   true → 다시 지급하지 않음.
   *   기존 유저도 플래그가 없으므로 "미지급" 으로 간주되어 1회 받는다 (의도된 동작).
   *   Persist 대상.
   */
  welcomeGrantClaimed?: boolean;
  /**
   * 시작 선물 오버레이 표시용 예약 금액 (아직 지급 전).
   *   initialize 에서 welcomeGrantClaimed 가 아니면 WELCOME_GRANT_COINS 로 set.
   *   유저가 오버레이의 "받기" 를 누르면 claimWelcomeGrant() 가 실제 지급 + 플래그 확정.
   *   transient — persist 되지 않는다. 오버레이가 아직 마운트되지 않은 화면에서
   *   플래그만 소모되어 연출을 놓치는 일이 없도록 "예약 → 수령" 2단계로 나눴다.
   */
  pendingWelcomeGrant: number | null;
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
  /**
   * Bug 2026-04 — 전직 선택 UI (ClassChoiceModal) 표시용.
   *   recommended 는 주요 완료 카테고리 기반 자동 추천 (기존 로직). 유저가
   *   추천을 받아들이거나 8개 클래스 중 직접 고를 수 있다.
   *   confirmClassChoice(classType) 호출 시 null 로 clear + pendingClassAwaken
   *   으로 바톤 전달되어 기존 연출 재사용.
   *   transient — persist 되지 않음.
   */
  pendingClassChoice: { recommended: ClassType } | null;
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
  /**
   * 리롤 1회 가격. 하루 1회 상한은 그대로 두고 "무료 → 유료" 로 전환하면서
   * 50 → 100 으로 상향. 코인 결제 대신 리워드 광고 시청 경로도 병존한다
   * (광고가 유일한 경로가 되면 안 되므로 코인 경로는 항상 유지).
   */
  reroll: 100,
  /**
   * 오늘의 기운 1회. 광고를 재생할 수 없는 환경(브라우저·TWA·EEA 동의 거부·미승인
   * 지역·오프라인)의 대체 경로다. iOS `ShopPrices.fortune` 과 같은 값을 쓴다.
   *
   * 왜 리롤(100)보다 크게 낮은가: 이건 일회성 구매가 아니라 **매일 반복되는 비용**이다.
   * 코인 경로를 쓰는 사람은 "오늘만 광고가 안 뜨는" 사람이 아니라 구조적으로 못 받는
   * 사람이라 매일 부과된다. 순수 코스메틱이라 가격표상으로도 enhance(30) 티어가 맞다 —
   * 리롤은 결과를 바꾸는 기능이고, 오늘의 기운은 결정론적이라 리롤 개념 자체가 없다.
   */
  fortune: 30,
  /**
   * 기운 3종(재물·관계·건강)의 두 번째·세 번째 리딩. 첫 리딩은 언제나 무료다.
   *
   * fortune(30) 위에 하루 두 번 더 얹히므로 한 단계 낮은 fastForward(20) 티어에 둔다.
   * 셋을 모두 여는 날의 총액이 70 이라 데일리 코인 주머니(20~160, 평균 ~90) 아래에
   * 머문다 — 총액이 평균 수령액을 넘으면 "탈출구"가 아니라 새로운 벽이 된다.
   */
  auraReading: 20,
  /** Phase 11a — 탐험권 1장 가격 (던전 무관 고정). */
  expeditionPass: 80,
  /**
   * Phase 15 — 하락방지권 1장. 강화 실패가 **하락**으로 판정된 순간에만
   * 소모되어 강화 단계를 지킨다.
   *
   * 왜 150 인가: 탐험권(80)과 보너스 카드팩(200) 사이, 위험 구간의 강화 1회 시도
   * 보다 싼 자리다. 보험료가 한 번의 시도보다 싸야 "위험할 때 켠다" 는 판단이
   * 성립한다. 이 기능이 나온 계기가 "지나치게 어렵다" 는 피드백이므로 가격이
   * 두 번째 벽이 되면 안 된다.
   *
   * **소실방지권(destroyGuards)은 여기 없다.** 상점에서 팔지 않고 보스 처치·던전
   * 이벤트·슬롯머신으로만 나온다 — 돈으로 사는 순간 고강 구간의 긴장이 사라진다.
   *
   * iOS `ShopPrices.downGuard` 와 같은 값이어야 한다.
   */
  downGuard: 150,
} as const;

/**
 * 시작 선물 — 최초 1회만 지급되는 환영 코인.
 * 첫 리롤(SHOP_PRICES.reroll) 을 바로 한 번 써볼 수 있는 금액으로 맞췄다.
 * 지급 여부는 UpHeroState.welcomeGrantClaimed 로 영속 기록.
 */
export const WELCOME_GRANT_COINS = 100;

/** Phase 11a — 상점에서 하루에 살 수 있는 탐험권 cap. */
// Phase 12a → 4 → 8. 챌린지로 얻기 어려운 날엔 상점 구매로 더 길게 플레이 가능하게.
export const DAILY_PASS_PURCHASE_CAP = 8;

/**
 * 데일리 코인 주머니 — 상점에서 하루 1회 무료로 수령.
 * 수령 시 [MIN, MAX] 균등 분포에서 랜덤 롤링.
 */
export const COIN_POUCH_MIN = 20;
export const COIN_POUCH_MAX = 160;

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

// Phase 11c R2 — 이전 `ENHANCE_PRESERVE_ON_FAIL` 상수 제거.
// Phase 15 — 그 후계인 `ENHANCE_PRESERVE_BY_RARITY`(레벨 무관 고정 보존률) 도 퇴역.
//   레벨 기반 `enhancePreserveRate(rarity, currentLevel, hasProtect)` 로 대체됐다.
//   아래 ENHANCE_DESTROY_ON_FAIL_BY_LEVEL 주석에 근거를 남겼다.

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

/* ── Phase 15 — 실패를 소실 / 하락 / 유지 3분기로 재설계 ────────────────────
 *
 * 무엇이 문제였나: 직전 모델 `ENHANCE_PRESERVE_BY_RARITY` 는 레벨과 무관하게
 * 보존률이 고정(normal/rare 30%, unique 40%, legend 50%)이었다. 즉 +1 → +2
 * 실패에서도 70% 확률로 아이템이 사라졌다. 성장의 첫 계단부터 벽이 서 있었다.
 *
 * 장르 관행: 강화는 "저강 구간은 안전, 고강 구간부터 위험" 이 표준이다.
 * 메이플 스타포스는 0~14성 파괴 0%, 리니지2 는 +3 까지 안전, 던파는 +12 부터
 * 파괴가 붙는다. 그리고 그 사이 구간을 채우는 것이 **등급 하락**이다 — 아이템이
 * 사라지지는 않지만 한 단계 내려가므로, 손실감은 주되 판을 엎지는 않는다.
 *
 * 새 모델 (MAX_ENHANCE_LEVEL=10 에 맞춰 축약):
 *   실패했을 때 아래 셋 중 하나로 갈린다.
 *     destroy : ENHANCE_DESTROY_ON_FAIL_BY_LEVEL[L] × ENHANCE_DESTROY_RARITY_MULT[rarity]
 *     down    : ENHANCE_DOWN_ON_FAIL_BY_LEVEL[L]
 *     keep    : 나머지
 *   currentLevel 0..2 (= +0→+1 부터 +2→+3) 는 destroy·down 둘 다 정확히 0 이라
 *   실패해도 100% 유지된다. "거의 없다" 가 아니라 0 으로 못박는다 — 그래야 UI 가
 *   이 구간을 "안전" 이라고 정직하게 말할 수 있다.
 *
 * 성공률·감쇠·pity·비용 상수는 이 개편에서 건드리지 않았다. 바뀐 것은 실패의
 * 결과뿐이다.
 *
 * 아래 두 표는 **실패했을 때** 의 조건부 확률이다. 시도당 확률은 (1 - 성공률) ×
 * 이 값이라 훨씬 낮다. 예: normal +5 는 실패율 20% × 소실 5% = 시도당 1.0%.
 * index = currentLevel (0..9). +9→+10 이 마지막 시도라 index 9 까지만 쓴다.
 */
export const ENHANCE_DESTROY_ON_FAIL_BY_LEVEL: readonly number[] = [
  0, 0, 0, // +0→+3: 완전 안전 구간.
  0.01, // +3→+4
  0.02, // +4→+5
  0.05, // +5→+6
  0.09, // +6→+7
  0.14, // +7→+8
  0.2, // +8→+9
  0.26, // +9→+10
];

/**
 * 실패 시 **등급 하락**(+L → +L-1) 확률. 소실과 배타적이며, 소실 판정이 먼저다.
 * 하락은 등급 보정을 두지 않는다 — 비용이 비싼 legend 를 봐주는 것은 "사라지는"
 * 쪽에서 이미 하고 있고(ENHANCE_DESTROY_RARITY_MULT), 되돌릴 수 있는 손실까지
 * 등급별로 깎으면 상위 등급이 사실상 무손실이 된다.
 */
export const ENHANCE_DOWN_ON_FAIL_BY_LEVEL: readonly number[] = [
  0, 0, 0, // +0→+3: 완전 안전 구간.
  0.1, // +3→+4
  0.15, // +4→+5
  0.25, // +5→+6
  0.3, // +6→+7
  0.35, // +7→+8
  0.4, // +8→+9
  0.45, // +9→+10
];

/**
 * 안전 구간의 마지막 currentLevel (inclusive). 이 값 이하에서는 소실·하락이 모두 0.
 * UI 가 "위험 문구·방지권 토글을 노출할지" 판단할 때도 이 경계를 쓴다 — 필요 없는
 * 구간에서 방지권을 권하면 기만이다.
 */
export const ENHANCE_SAFE_MAX_LEVEL = 2;

/**
 * 등급별 소실 확률 배율 (0.7 = 원래 소실 확률의 70%).
 *
 * 왜 가산이 아니라 곱인가: 뺄셈으로 깎으면 상위 등급이 특정 레벨에서 소실 확률
 * 0 으로 주저앉아 "고강 구간엔 위험이 있다" 는 곡선의 형태가 무너진다. 곱으로
 * 깎으면 등급 간 순서와 단조 증가가 모두 유지된다.
 *
 * 등급이 높을수록 깎아주는 이유는 비용이다. ENHANCE_COST_RARITY_MULT 가 legend 를
 * ×4 로 매기므로 같은 소실 확률이면 legend 쪽 손실만 극단적으로 커진다.
 */
export const ENHANCE_DESTROY_RARITY_MULT: Record<Rarity, number> = {
  normal: 1,
  rare: 1,
  unique: 0.85,
  legend: 0.7,
};

/** 강화 실패 시의 3분기 조건부 확률. 셋을 더하면 항상 1 이다. */
export interface EnhanceOutcomeRates {
  /** 아이템이 사라질 확률 */
  destroy: number;
  /** 강화 단계가 1 내려갈 확률 */
  down: number;
  /** 아무 일도 없을 확률 */
  keep: number;
}

/**
 * **실패 시** 3분기 확률의 단일 출처. UI 표기와 스토어 판정이 같은 값을 쓰도록
 * 두 곳 모두 이 함수만 호출한다. 방지권은 여기 반영하지 않는다 — 방지권은 확률을
 * 바꾸는 게 아니라 "나온 결과를 바꾸는" 장치이고, 소모 판정도 스토어가 한다.
 *
 * @param currentLevel 강화를 시도하는 시점의 레벨. +3 → +4 시도면 3.
 */
export function enhanceOutcomeRates(
  rarity: Rarity,
  currentLevel: number,
): EnhanceOutcomeRates {
  const level = Math.max(0, Math.floor(currentLevel));
  if (level <= ENHANCE_SAFE_MAX_LEVEL) return { destroy: 0, down: 0, keep: 1 };
  // 표 범위를 넘어선 레벨(방어적)은 마지막 값으로 고정.
  const idx = Math.min(level, ENHANCE_DESTROY_ON_FAIL_BY_LEVEL.length - 1);
  const mult = ENHANCE_DESTROY_RARITY_MULT[rarity] ?? 1;
  const destroy = clamp01((ENHANCE_DESTROY_ON_FAIL_BY_LEVEL[idx] ?? 0) * mult);
  // 소실 판정이 먼저이므로 하락은 남은 확률 공간을 넘지 못한다.
  const down = Math.min(clamp01(ENHANCE_DOWN_ON_FAIL_BY_LEVEL[idx] ?? 0), 1 - destroy);
  return { destroy, down, keep: Math.max(0, 1 - destroy - down) };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * 강화 **실패 시** 아이템이 그대로 남을 확률 (0-1). = 3분기의 keep.
 * 하락은 "남았다" 로 치지 않는다 — 하락도 손실이라 유저에게 유지와 같은 칸에
 * 묶어 보여주면 기만이 된다.
 */
export function enhancePreserveRate(rarity: Rarity, currentLevel: number): number {
  return enhanceOutcomeRates(rarity, currentLevel).keep;
}

/** 강화 실패 시 소실 확률 (0-1). 방지권을 무시한 "원래 위험" 이다. */
export function enhanceDestroyRate(rarity: Rarity, currentLevel: number): number {
  return enhanceOutcomeRates(rarity, currentLevel).destroy;
}

/** 강화 실패 시 하락 확률 (0-1). */
export function enhanceDowngradeRate(rarity: Rarity, currentLevel: number): number {
  return enhanceOutcomeRates(rarity, currentLevel).down;
}

/** 이 레벨에서 소실이 가능한가. UI 가 소실방지권 토글 노출을 판단하는 단일 기준. */
export function canEnhanceDestroy(rarity: Rarity, currentLevel: number): boolean {
  return enhanceDestroyRate(rarity, currentLevel) > 0;
}

/** 이 레벨에서 하락이 가능한가. UI 가 하락방지권 토글 노출을 판단하는 단일 기준. */
export function canEnhanceDowngrade(rarity: Rarity, currentLevel: number): boolean {
  return enhanceDowngradeRate(rarity, currentLevel) > 0;
}

/**
 * 완전 안전 구간인가 (실패해도 소실·하락이 둘 다 0).
 * UI 는 이 값이 true 면 위험 문구·방지권 토글을 **아예 그리지 않는다**.
 */
export function isEnhanceSafeLevel(rarity: Rarity, currentLevel: number): boolean {
  const rates = enhanceOutcomeRates(rarity, currentLevel);
  return rates.destroy === 0 && rates.down === 0;
}

/** 방지권 1종당 보유 가능한 최대 개수. UI overflow / 저장본 이상치 방어. */
export const ENHANCE_GUARD_MAX = 99;

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

/**
 * 영웅 이름 풀 — 언어별로 다른 이름 집합. 첫 생성 시 현재 설정된 언어에 맞춰
 *   자연스러운 이름으로 배정. 이후 유저가 직접 리네임 가능.
 */
export const HERO_NAME_POOLS: Record<Language, readonly string[]> = {
  ko: [
    "레오", "미라", "타로", "카이", "루나", "노아", "제드", "리나",
    "이든", "하루", "알토", "메이", "에코", "쿠로", "리온", "아사",
    "세라", "노엘", "오루", "피오", "시온", "유리", "데이", "벨",
  ],
  en: [
    "Leo", "Nora", "Finn", "Luna", "Kai", "Mira", "Aden", "Ivy",
    "Rune", "Rowan", "Lyra", "Zed", "Echo", "Sage", "Wren", "Talon",
    "Remy", "Juno", "Ash", "Niko", "Rae", "Vale", "Theo", "Nia",
  ],
  ja: [
    "ハル", "レン", "ユウ", "アキ", "リン", "ミオ", "ソラ", "カイ",
    "ノア", "アオイ", "ユイ", "サナ", "リク", "コウ", "マイ", "シン",
    "アサ", "リオ", "ナギ", "ルカ", "ハク", "ヒナ", "ツキ", "セイ",
  ],
  zh: [
    "云舒", "墨白", "星河", "青山", "子轩", "若风", "雨晴", "知夏",
    "清辞", "明远", "子墨", "云深", "梦蝶", "思齐", "清歌", "青衣",
    "如意", "长安", "天一", "云清", "疏影", "暮云", "慕白", "若涵",
  ],
};

/** Legacy export — 하위 호환용. 신규 코드는 `HERO_NAME_POOLS` 사용. */
export const HERO_NAME_POOL = HERO_NAME_POOLS.ko;

/** 이름 풀에서 랜덤 영웅 이름 1개 반환. language 미지정 / unknown 시 ko 폴백.
 *  런타임 방어: localStorage 에 legacy 값이 들어있어 Language 유니온 밖 string 이
 *  전달되더라도 TypeError (undefined.length) 로 영웅 초기화를 터뜨리지 않도록. */
export function rollHeroName(language?: Language): string {
  const pool =
    (language && HERO_NAME_POOLS[language]) || HERO_NAME_POOLS.ko;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 기본 Hero 생성. language 미지정 시 ko 폴백. */
export function createDefaultHero(language?: Language): Hero {
  return {
    name: rollHeroName(language),
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
