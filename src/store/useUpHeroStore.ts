/**
 * Up Hero store — zustand.
 *
 * 영속 데이터 (localStorage "uphero"): hero, inventory, coins, passes, dungeons, codex, cosmetics.
 * currentSession 도 저장 (resume 용).
 * level/xp 는 useGameStore 가 source of truth — 여기선 진행 중 session 에만 snapshot.
 */

import { create } from "zustand";
import { saveToStorage, loadFromStorage } from "@/lib/storage";
import {
  createDefaultHero,
  computeHeroForLevel,
  CLASS_BY_DUNGEON,
  PASS_GRANT_BY_RARITY,
  PASS_CAP_PER_CATEGORY,
  SHOP_PRICES,
  SELL_PRICE,
  MAX_ENHANCE_LEVEL,
  ENHANCE_PRESERVE_BY_RARITY,
  DAILY_PASS_PURCHASE_CAP,
  enhanceSuccessRate,
  enhanceCost,
  getISOWeekId,
  computeWeeklyScore,
  type UpHeroState,
  type DungeonId,
  type ClassType,
  type Equipment,
  type EquipSlot,
  type CombatSession,
  type CardBuff,
  type HeroBaseStats,
} from "@/types/uphero";
import { pickWeeklyAffix } from "@/data/weeklyAffixes";
import type { Category } from "@/types/card";
import type { Rarity } from "@/types/card";
import { getLevelFromXP } from "@/types/game";
import {
  createSession as buildSession,
  tickSession as stepSession,
  resolveChoice as applyChoice,
  abandonSession as abandon,
} from "@/lib/upHeroCombat";
import { drawBuffCards } from "@/lib/buffDraw";
import {
  calculateKeptDrops,
  calculateBossesDefeated,
  calculateCodexDelta,
  calculateDungeonProgress,
} from "@/lib/sessionReward";
import { calculateIdleReward } from "@/lib/idleAccrual";
import { classXpMult, classCoinMult } from "@/lib/upHeroCombat";
import {
  PHOTO_TALISMAN_RITUAL_COST,
  buildPhotoTalisman,
  findBoundTalisman,
  isPhotoBound,
  rebuildTalismanWithLevel,
  rebindPhotoTalismanCost,
  rollPhotoRarity,
} from "@/lib/photoTalisman";
import { useGrowthStore } from "./useGrowthStore";
import { getCardBuff } from "@/data/cardBuffs";
import { ALL_CARDS } from "@/data/cards";
import { ALL_MONSTER_TEMPLATES } from "@/data/upHeroMonsters";
import {
  ALL_EQUIPMENT_TEMPLATES,
  findTemplateByLegacyId,
} from "@/data/upHeroEquipment";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { useGameStore, getTodayString } from "./useGameStore";

/**
 * Phase 5a.3 / 5b.2 / 9d / 11a / 11c — 저장 스키마 현재 버전.
 *
 * v1: codex.monsters/bosses 를 monster.name 기반으로 전환 (legacy 는 instance ID)
 * v2: codex.equipment 를 template baseName 기반으로 전환 (legacy 는 instance ID)
 * v3: heroStartLevel seed — 영웅 레벨을 챌린지 레벨과 분리.
 * v4: shopDaily seed — 상점 하루 탐험권 구매 cap.
 * v5: ngPlusLevel seed (0) + weeklyVariant 는 initialize 에서 이번 주 id 로 갱신.
 *     기존 유저도 F30 처음 처치 시점부터 NG+ 자연 해금.
 */
const CURRENT_SCHEMA_VERSION = 5;

/**
 * Phase 4c-fix: Codex legacy ID → name migration.
 *
 * 이전 버전은 `${templateId}_f{floor}_{timestamp}` 포맷 인스턴스 ID 를
 * codex 에 저장했음. 같은 템플릿을 여러 번 만나면 다른 entry 로 누적됨.
 * 현재는 template.name 기반으로 저장. initialize 때 한 번만 변환 + dedup
 * (schemaVersion gating).
 */
function migrateCodexMonsters(entries: unknown): string[] {
  // Phase 11c R4 보안 — input 이 항상 string[] 인 게 아닐 수 있음 (devtools 조작
  //   또는 corrupted storage). typeof 사전 필터로 .match throw 방지.
  if (!Array.isArray(entries)) return [];
  const result = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    // Legacy 인스턴스 ID 포맷: "prefix_with_underscores_f{N}_{M}" (all ascii).
    // Korean name entries 는 이 패턴에 매칭되지 않으므로 그대로 통과.
    const legacyMatch = entry.match(/^([a-z][a-z_]*?)_f\d+_\d+$/);
    if (!legacyMatch) {
      result.add(entry);
      continue;
    }
    const templateId = legacyMatch[1];
    const template = ALL_MONSTER_TEMPLATES.find((t) => t.id === templateId);
    if (template) result.add(template.name);
    // 템플릿 매칭 실패 (구 데이터 또는 삭제된 템플릿) → 버림 (복원 불가)
  }
  return [...result];
}

/**
 * Phase 5b.2 — Codex equipment legacy instance ID → template baseName 변환.
 *
 * 이전 버전은 드롭할 때마다 생긴 고유 ID (`eq_{name}_{rarity}_{ts}_{rnd}`) 를
 * codex.equipment 에 저장. 같은 템플릿을 여러 번 드롭받으면 누적돼 불필요.
 * 이제 baseName 기반 (한 템플릿 = 한 entry).
 *
 * 기존 baseName 처럼 보이는 entry (이미 Korean) 는 그대로 통과.
 */
function migrateCodexEquipment(entries: unknown): string[] {
  // Phase 11c R4 보안 — array + string 필터 (corrupted input 방지).
  if (!Array.isArray(entries)) return [];
  const result = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    // Legacy instance id 포맷 감지 — eq_ 로 시작
    if (!entry.startsWith("eq_")) {
      result.add(entry);
      continue;
    }
    const template = findTemplateByLegacyId(entry);
    if (template) result.add(template.baseName);
    // 매칭 실패 → 버림
  }
  return [...result];
}

const STORAGE_KEY = "uphero";

interface UpHeroActions {
  initialize(): void;

  // 탐험권
  grantExpeditionPass(dungeonId: DungeonId, rarity: Rarity): void;

  // 던전 세션
  /**
   * 던전 진입 준비 — 보유 카드 중 6장 draw 후 pendingDungeon set.
   * 탐험권 소모는 confirmDungeon 에서. 보유 카드 없으면 자동 skip.
   * @returns "ready" (drawn cards set), "no-pass" (탐험권 부족), "no-cards" (보유 카드 0, skip)
   */
  prepareBuffDraw(dungeonId: DungeonId): "ready" | "no-pass" | "no-cards";
  /** 선택한 card ids 로 세션 시작 + 탐험권 1 소모 */
  confirmDungeon(selectedCardIds: string[]): void;
  /** pendingDungeon 취소 */
  cancelBuffDraw(): void;
  /**
   * 구 API — 직접 진입 (버프 draw 스킵). 보유 카드 0 일 때 내부적으로 사용 +
   * 외부 테스트용 fallback. 기본 플로우는 prepareBuffDraw → confirmDungeon.
   */
  enterDungeon(dungeonId: DungeonId): boolean; // false = 탐험권 부족
  tickSession(): void;
  resolveChoice(optionIndex: number): void;
  resumeSession(): void; // 보스 연출 종료 후 호출 — status "paused" → "active"
  abandonSession(): void;
  acknowledgeSessionEnd(): void; // 결산 modal 닫은 후 currentSession = null 로

  /** Phase 5b.1 — idle reward 토스트 닫을 때 호출. idleReward 를 null 로 클리어. */
  acknowledgeIdleReward(): void;

  /**
   * Phase 5c.1 — Class 분화.
   * useGameStore.progress.categoryCompletions 기반으로 가장 많이 완료한
   * 카테고리 → class 할당. 이미 분화된 영웅이면 no-op.
   * 반환: 새로 할당된 classType (또는 이미 할당됨/조건 미충족이면 null)
   */
  assignClass(): ClassType | null;

  /** Phase 5c.1 — ClassAwakenModal 닫을 때 호출. pendingClassAwaken null 로. */
  acknowledgeClassAwaken(): void;

  /** Phase 6b — 자동 스킬 발동 on/off 토글. 기본 true. */
  toggleAutoSkill(): void;

  /**
   * Phase 7 — 사진 부적 바인딩 의식.
   * 코인 차감 + 랜덤 rarity roll + inventory 에 Equipment 추가.
   * 반환값으로 결과 혹은 실패 사유 전달.
   *
   * Phase 11b — 이미 bound 된 photoId 면 `rebindPhotoTalisman` 을 쓸 것.
   *   이 action 은 초기 바인딩 전용 (이미 bound 면 error 반환 유지).
   */
  bindPhotoAsTalisman(photoId: string): {
    ok: boolean;
    newItem?: Equipment;
    error?: string;
  };

  /**
   * Phase 11b — 이미 바인딩된 사진의 부적을 +1 강화하는 "재의식".
   * 코인 80 소모 (동일 비용), rarity/stats 대체로 유지하되 enhanceLevel +1.
   * +5, +10 도달 시 category 기반 passive skill 자동 부여.
   * 최대 +10, 초과 시 `maxed` 반환.
   */
  rebindPhotoTalisman(photoId: string): {
    ok: boolean;
    newItem?: Equipment;
    error?: string;
    reason?: "not-found" | "not-bound" | "maxed" | "coin";
  };

  /**
   * Phase 11c — 주간 악몽 던전 진입. F30 을 최소 한 번 클리어한 유저만 가능.
   * - 선택한 dungeonId 의 F30 변이 (이번 주 affix 적용) 로 바로 진입.
   * - 탐험권 소모 없음 (주간 특전). 이미 이번 주 해당 던전 클리어했으면 재도전 가능 (점수 경신).
   * - startFloor 는 항상 F30 (단일 보스 battle 로 짧게).
   *   TODO 향후: F21-30 루트 선택지 추가 가능.
   * @returns "ok" / "not-unlocked" (F30 미클리어) / "no-weekly" (주간 데이터 없음)
   */
  enterWeeklyVariant(dungeonId: DungeonId): "ok" | "not-unlocked" | "no-weekly";

  // 장비
  equipItem(itemId: string, slot: EquipSlot): void;
  unequipItem(slot: EquipSlot): void;
  /** 판매 — inventory 제거 + 등급별 코인 환급 */
  sellItem(itemId: string): number; // 환급 코인 반환
  /** 버리기 — inventory 제거, 환급 없음 */
  discardItem(itemId: string): void;

  // 갓생 코인 sink
  purchaseTicket(): boolean;
  purchaseCardPack(size: "small" | "full"): boolean;

  /**
   * Phase 11a — 상점에서 탐험권 구매.
   * 고정 가격 SHOP_PRICES.expeditionPass, 하루 최대 DAILY_PASS_PURCHASE_CAP 장.
   * @returns
   *   - "ok"        — 구매 성공 (passes 증가 + coin 차감 + shopDaily 갱신)
   *   - "no-coin"   — 코인 부족
   *   - "daily-cap" — 오늘 이미 2장 구매 완료
   *   - "pass-cap"  — 해당 던전 passes 가 PASS_CAP_PER_CATEGORY (20) 도달
   */
  purchasePass(dungeonId: DungeonId): "ok" | "no-coin" | "daily-cap" | "pass-cap";

  /**
   * Phase 11a — 장비 +N 강화 (기존 2→1 합성 대체).
   * 단일 아이템 + 코인 → 확률적으로 enhanceLevel +1. 최대 +10.
   * 실패 시 ENHANCE_PRESERVE_BY_RARITY[rarity] 확률로 아이템 보존, 그 외엔 소실.
   * 성공률 / 코인 비용 공식은 types/uphero.ts 의 enhanceSuccessRate / enhanceCost 참고.
   *
   * UI 는 이 반환값 기반으로 Ritual overlay + Result modal 분기.
   */
  enhanceItem(id: string): EnhanceResult;
}

/** Phase 11a — 강화 결과 discriminated union. UI 는 이 타입 기반 3-way 분기. */
export type EnhanceResult =
  | { ok: true; reason: "success"; newItem: Equipment; prevLevel: number }
  | { ok: false; reason: "keep"; item: Equipment }
  | { ok: false; reason: "destroyed"; lostItemName: string }
  | { ok: false; reason: "coin"; cost: number }
  | { ok: false; reason: "maxed" }
  | { ok: false; reason: "not-found" };

type UpHeroStore = UpHeroState & UpHeroActions;

/**
 * 저장할 state 추출 — 함수는 제외. pendingDungeon 은 transient (persist 안 함).
 *
 * Phase 11c R1 — export 하여 DevLeaderboardPanel 같은 dev tool 에서 store persist
 *   포맷을 그대로 재사용 가능. 하드코딩된 schemaVersion / 누락 필드 drift 방지.
 */
export function pickPersisted(s: UpHeroState): Partial<UpHeroState> {
  const {
    hero,
    inventory,
    coins,
    passes,
    dungeons,
    currentSession,
    codex,
    cosmetics,
    lastIdleAccrualAt,
    heroStartLevel,
    shopDaily,
    ngPlusLevel,
    weeklyVariant,
    schemaVersion,
  } = s;
  return {
    hero,
    inventory,
    coins,
    passes,
    dungeons,
    currentSession,
    codex,
    cosmetics,
    lastIdleAccrualAt,
    heroStartLevel,
    shopDaily,
    ngPlusLevel,
    weeklyVariant,
    schemaVersion,
  };
}

export const useUpHeroStore = create<UpHeroStore>((set, get) => ({
  hero: createDefaultHero(),
  inventory: [],
  coins: 0,
  passes: {},
  dungeons: {},
  currentSession: null,
  pendingDungeon: null,
  codex: { monsters: [], equipment: [], bosses: [] },
  cosmetics: {},
  lastIdleAccrualAt: Date.now(),
  // Phase 9d — 초기값 undefined. initialize 에서 seed.
  heroStartLevel: undefined,
  // Phase 11a — 초기값 undefined. initialize 에서 오늘 날짜로 seed.
  shopDaily: undefined,
  // Phase 11c — 초기 0 (미해금). F30 보스 처치 시 +1.
  ngPlusLevel: 0,
  // Phase 11c — 초기 undefined. initialize 에서 이번 주 id 로 seed/갱신.
  weeklyVariant: undefined,
  idleReward: null,
  pendingClassAwaken: null,
  isLoaded: false,

  initialize() {
    if (get().isLoaded) return;
    const saved = loadFromStorage<Partial<UpHeroState>>(STORAGE_KEY);
    // 이전 버전 Hero 에 name/baseStats.crit 등 신규 필드가 없을 수 있어 default 와 deep merge.
    // baseStats 는 nested 객체라 별도 spread 로 crit 필드 포함시킨다.
    const defaults = createDefaultHero();
    const mergedHero = saved?.hero
      ? {
          ...defaults,
          ...saved.hero,
          baseStats: { ...defaults.baseStats, ...(saved.hero.baseStats ?? {}) },
        }
      : defaults;
    // Phase 5a.3 / 5b.2 — schemaVersion gating: migration 은 첫 1회만 실행.
    // - v1 (Phase 5a): monsters/bosses legacy ID → template name
    // - v2 (Phase 5b.2): equipment legacy ID → template baseName
    // 저장된 버전이 CURRENT 보다 낮으면 해당 이상의 migration 을 실행.
    const savedVersion = saved?.schemaVersion ?? 0;
    const needsMigration = savedVersion < CURRENT_SCHEMA_VERSION;
    const rawCodex = saved?.codex ?? { monsters: [], equipment: [], bosses: [] };

    const monsters =
      savedVersion < 1
        ? migrateCodexMonsters(rawCodex.monsters ?? [])
        : (rawCodex.monsters ?? []);
    const bosses =
      savedVersion < 1
        ? migrateCodexMonsters(rawCodex.bosses ?? [])
        : (rawCodex.bosses ?? []);
    const equipment =
      savedVersion < 2
        ? migrateCodexEquipment(rawCodex.equipment ?? [])
        : (rawCodex.equipment ?? []);
    const codex = { monsters, bosses, equipment };

    // Phase 5b.1 — idle accrual: 마지막 실행 이후 경과 시간 ≥5분이면 보상.
    // useGameStore 의 level 을 참조해야 하므로 여기서 계산.
    // 사용자에겐 UI 토스트로 표시, state 에는 idleReward 로 보관 (transient).
    // Phase 5c-fix #3: mage (xp +20%) / bard (coin +25%) 패시브를
    // idle reward 에도 적용. calculator 는 class 무관 pure 유지, caller 가 곱.
    const now = Date.now();
    const lastIdleAt = saved?.lastIdleAccrualAt ?? now;
    const gameStore = useGameStore.getState();
    const curLevel = gameStore.progress.level ?? 1;

    // Phase 9d — heroStartLevel seed / migration.
    //   - saved 에 이미 heroStartLevel 있으면 그대로 사용 (반복 초기화 포함).
    //   - 없으면 "기존 유저 vs 신규 유저" 판별 후 결정:
    //     · hasPlayedUpHero: inventory/codex/session/dungeons 에 흔적이 있음
    //       → legacy 유저. 기존 진행도 보존 위해 heroStartLevel=1 (영웅 Lv = 챌린지 Lv).
    //     · 그 외 (이번 진입이 Up Hero 첫 경험) → heroStartLevel=curLevel.
    //       신규 영웅 게임 유저는 챌린지 Lv 가 높아도 영웅 Lv 1 부터 키움.
    let heroStartLevel = saved?.heroStartLevel;
    if (heroStartLevel === undefined) {
      // Phase 9d-fix — 판별에 coins / passes / cosmetics 도 포함.
      //   기존 유저가 던전 진입 없이 상점에서 티켓/코인만 만지거나 passes 를 받아
      //   둔 상태면 inventory/codex 는 비어있지만 "영웅 맥락은 있음". 이 경우까지
      //   heroStartLevel=1 로 처리해야 갑자기 영웅 Lv 41 → Lv 1 로 떨어지는 regression
      //   을 방지.
      const hasPassesRecord = Object.values(saved?.passes ?? {}).some(
        (v) => (v ?? 0) > 0,
      );
      const hasPlayedUpHero =
        (saved?.inventory?.length ?? 0) > 0 ||
        (saved?.codex?.monsters?.length ?? 0) > 0 ||
        (saved?.codex?.bosses?.length ?? 0) > 0 ||
        (saved?.codex?.equipment?.length ?? 0) > 0 ||
        saved?.currentSession != null ||
        Object.keys(saved?.dungeons ?? {}).length > 0 ||
        hasPassesRecord ||
        (saved?.coins ?? 0) > 0 ||
        Object.keys(saved?.cosmetics ?? {}).length > 0;
      heroStartLevel = hasPlayedUpHero ? 1 : curLevel;
    }
    // 영웅 레벨 — 이후 로직 (idle 스케일 등) 에서 사용
    const heroLevel = Math.max(1, curLevel - heroStartLevel + 1);

    // idle accrual 도 heroLevel 기준으로 — 챌린지 Lv 41 에 영웅 Lv 1 유저가
    // Lv 41 수준의 idle reward 를 받으면 "영웅 Lv 1 인데 거대 보상" 이 부자연.
    const rawIdleReward = calculateIdleReward(now - lastIdleAt, heroLevel);
    const heroClass = mergedHero.classType;
    const idleReward = rawIdleReward
      ? {
          ...rawIdleReward,
          xp: Math.round(rawIdleReward.xp * classXpMult(heroClass)),
          coins: Math.round(rawIdleReward.coins * classCoinMult(heroClass)),
        }
      : null;

    // 지급 — useGameStore.xp 증가 + coins 증가 (Up Hero store).
    // Phase 9d-fix — xp 만 더하고 level 을 재계산 안 하면 Header / BottomNav 가
    //   stale level 을 표시한다. getLevelFromXP 로 즉시 재계산 + Header 의 레벨업
    //   애니메이션 trigger 도 작동.
    let coins = saved?.coins ?? 0;
    if (idleReward) {
      const newXp = (gameStore.progress.xp ?? 0) + idleReward.xp;
      const newLevel = getLevelFromXP(newXp);
      const newProgress = {
        ...gameStore.progress,
        xp: newXp,
        level: newLevel,
      };
      useGameStore.setState({ progress: newProgress });
      saveToStorage("progress", newProgress);
      coins = coins + idleReward.coins;
    }

    // Phase 5c-fix #2: lastIdleAccrualAt 는 reward 가 실제로 지급됐을 때만
    // now 로 갱신. 5분 미만 reload 시에는 기존 timestamp 유지 → 누적 보전.
    // (이전: reward 유무 무관 now 로 갱신 → 잦은 reload 시 누적 손실 발생)
    const newLastIdleAt = idleReward ? now : lastIdleAt;

    // Phase 11a — shopDaily seed. date 가 오늘과 다르면 passesBought=0 리셋.
    const today = getTodayString();
    const prevShopDaily = saved?.shopDaily;
    const shopDaily =
      prevShopDaily && prevShopDaily.date === today
        ? prevShopDaily
        : { date: today, passesBought: 0 };

    // Phase 11c — weeklyVariant seed. 이번 주 id 와 saved.week 비교해 자동 리셋.
    //   매주 월요일 첫 진입 시 새 affix pick + clearedDungeons 비움.
    const currentWeek = getISOWeekId();
    const prevWeekly = saved?.weeklyVariant;
    const weeklyVariant =
      prevWeekly && prevWeekly.week === currentWeek
        ? prevWeekly
        : {
            week: currentWeek,
            affixId: pickWeeklyAffix(currentWeek).id,
            clearedDungeons: [] as DungeonId[],
            bestScore: 0,
          };

    set({
      hero: mergedHero,
      inventory: saved?.inventory ?? [],
      coins,
      passes: saved?.passes ?? {},
      dungeons: saved?.dungeons ?? {},
      currentSession: saved?.currentSession ?? null,
      pendingDungeon: null, // transient, 재시작 시 항상 null
      codex,
      cosmetics: saved?.cosmetics ?? {},
      lastIdleAccrualAt: newLastIdleAt,
      heroStartLevel,
      shopDaily,
      ngPlusLevel: saved?.ngPlusLevel ?? 0,
      weeklyVariant,
      idleReward,
      pendingClassAwaken: null, // transient
      schemaVersion: CURRENT_SCHEMA_VERSION,
      isLoaded: true,
    });

    // migration 이 실제로 실행됐거나 idle reward 가 지급됐으면 즉시 persist.
    // (schemaVersion / coins / lastIdleAccrualAt 모두 영속화 대상.)
    if (needsMigration || idleReward) {
      saveToStorage(STORAGE_KEY, pickPersisted(get()));
    }

    // Phase 5c.1 safety — 이미 Lv30+ 인데 classType 이 null 인 영웅
    // (이 기능 출시 전 Lv30 도달한 유저) 은 여기서 자동 분화 시도.
    // assignClass 는 categoryCompletions 있어야 반환 non-null.
    // Phase 9d — 챌린지 레벨이 아닌 영웅 레벨 기준 (heroLevel >= 30).
    //   신규 영웅 유저는 heroStartLevel 부터 30 단계 성장해야 class 분화.
    if (heroLevel >= 30 && mergedHero.classType === null) {
      get().assignClass();
    }
  },

  acknowledgeIdleReward() {
    if (!get().idleReward) return;
    set({ idleReward: null });
    // persist 할 필요 없음 — idleReward 는 transient.
  },

  assignClass() {
    const state = get();
    if (state.hero.classType) return null; // 이미 분화됨

    // Phase 5c-fix #6: DUNGEON_LIST 의 canonical 순서로 순회해 tie 에서
    // 결정적 결과 보장. 이전엔 Object.entries 순서 의존 → 같은 완료 수
    // 일 때 어느 class 가 뽑히는지 불확실. 이제 fitness > learning >
    // mindfulness > nutrition > social > productivity > wellness > trending
    // 순으로 우선.
    const progress = useGameStore.getState().progress;
    const completions = progress.categoryCompletions ?? ({} as Record<Category, number>);
    let bestCategory: DungeonId | null = null;
    let bestCount = 0;
    for (const dungeon of DUNGEON_LIST) {
      const count = completions[dungeon.id as Category] ?? 0;
      if (count > bestCount) {
        bestCategory = dungeon.id;
        bestCount = count;
      }
    }
    // 완료 기록 전혀 없으면 nothing — 모든 카테고리 0
    if (!bestCategory || bestCount === 0) return null;

    const classType = CLASS_BY_DUNGEON[bestCategory];
    if (!classType) return null;

    const newHero = { ...state.hero, classType };
    set({ hero: newHero, pendingClassAwaken: classType });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hero: newHero }));
    return classType;
  },

  acknowledgeClassAwaken() {
    if (!get().pendingClassAwaken) return;
    set({ pendingClassAwaken: null });
  },

  toggleAutoSkill() {
    const state = get();
    // undefined (legacy) 도 true 로 간주 → 첫 토글 시 false
    const current = state.hero.autoSkillEnabled ?? true;
    const newHero = { ...state.hero, autoSkillEnabled: !current };
    set({ hero: newHero });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hero: newHero }));
  },

  bindPhotoAsTalisman(photoId) {
    const state = get();
    const photo = useGrowthStore
      .getState()
      .photoMetas.find((p) => p.id === photoId);
    if (!photo) return { ok: false, error: "사진을 찾을 수 없어요" };
    if (isPhotoBound(photoId, state.inventory, state.hero.equipped)) {
      return { ok: false, error: "이미 부적으로 만들어진 사진" };
    }
    if (state.coins < PHOTO_TALISMAN_RITUAL_COST) {
      return {
        ok: false,
        error: `코인 부족 (${PHOTO_TALISMAN_RITUAL_COST} 필요)`,
      };
    }
    const rarity = rollPhotoRarity();
    const newItem = buildPhotoTalisman(photo, rarity);
    const newInventory = [...state.inventory, newItem];
    const newCoins = state.coins - PHOTO_TALISMAN_RITUAL_COST;
    set({ inventory: newInventory, coins: newCoins });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, inventory: newInventory, coins: newCoins }),
    );
    return { ok: true, newItem };
  },

  rebindPhotoTalisman(photoId) {
    // Phase 11b — 이미 bound 된 photo 를 대상으로 "재의식" → enhanceLevel +1.
    //   rarity 유지, stat 미미 상승, +5/+10 에 skill 부여.
    //   장착 중인 부적도 rebind 가능 (equipped 슬롯 안에서 in-place 교체).
    // Phase 11c R4 — cost 가 level 스케일 (80 × (1 + curLevel × 0.3)).
    //   +9→+10 은 296 coin. 총합 +0→+10 ≈ 1,880 coin.
    const state = get();
    const found = findBoundTalisman(photoId, state.inventory, state.hero.equipped);
    if (!found) {
      return {
        ok: false,
        reason: "not-bound",
        error: "먼저 최초 바인딩이 필요해요",
      };
    }
    const current = found.item;
    const curLevel = current.enhanceLevel ?? 0;
    if (curLevel >= MAX_ENHANCE_LEVEL) {
      return { ok: false, reason: "maxed", error: "이미 +10 최대 강화" };
    }

    const cost = rebindPhotoTalismanCost(curLevel);
    if (state.coins < cost) {
      return {
        ok: false,
        reason: "coin",
        error: `코인 부족 (${cost} 필요)`,
      };
    }

    const newLevel = curLevel + 1;
    const newItem = rebuildTalismanWithLevel(current, newLevel);
    const newCoins = state.coins - cost;

    // inventory 또는 equipped 슬롯에서 in-place 교체.
    let newInventory = state.inventory;
    let newHero = state.hero;
    if (found.location === "inventory") {
      newInventory = state.inventory.map((i) =>
        i.id === current.id ? newItem : i,
      );
    } else {
      // equipped 슬롯 중 해당 id 를 찾아 교체.
      const slotEntry = (Object.entries(state.hero.equipped) as Array<
        [EquipSlot, Equipment | undefined]
      >).find(([, eq]) => eq && eq.id === current.id);
      if (slotEntry) {
        const [slot] = slotEntry;
        newHero = {
          ...state.hero,
          equipped: { ...state.hero.equipped, [slot]: newItem },
        };
      }
    }

    set({ inventory: newInventory, hero: newHero, coins: newCoins });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({
        ...state,
        inventory: newInventory,
        hero: newHero,
        coins: newCoins,
      }),
    );
    return { ok: true, newItem };
  },

  grantExpeditionPass(dungeonId, rarity) {
    const grant = PASS_GRANT_BY_RARITY[rarity];
    const current = get().passes[dungeonId] ?? 0;
    const next = Math.min(PASS_CAP_PER_CATEGORY, current + grant);
    const passes = { ...get().passes, [dungeonId]: next };
    set({ passes });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...get(), passes }));
  },

  prepareBuffDraw(dungeonId) {
    const state = get();
    const passes = state.passes[dungeonId] ?? 0;
    if (passes < 1) return "no-pass";
    // 보유 카드 가져오기 — useGameStore.progress.unlockedCardIds
    const gameState = useGameStore.getState();
    const unlockedIds = gameState.progress.unlockedCardIds ?? [];
    const ownedCards = ALL_CARDS.filter((c) => unlockedIds.includes(c.id));
    if (ownedCards.length === 0) {
      // 보유 카드 0 → 버프 draw 스킵, 바로 진입
      return "no-cards";
    }
    // 6장 draw (보유 카드 부족 시 available 만큼)
    const drawn = drawBuffCards(ownedCards, dungeonId, 6);
    set({
      pendingDungeon: {
        dungeonId,
        drawnCardIds: drawn.map((c) => c.id),
      },
    });
    return "ready";
  },

  confirmDungeon(selectedCardIds) {
    const state = get();
    if (!state.pendingDungeon) return;
    const { dungeonId } = state.pendingDungeon;
    const passes = state.passes[dungeonId] ?? 0;
    if (passes < 1) {
      // 중간에 탐험권 잃은 상황 — 취소
      set({ pendingDungeon: null });
      return;
    }
    // 선택한 카드 → buffs 변환
    const cardById = new Map(ALL_CARDS.map((c) => [c.id, c]));
    const buffs: CardBuff[] = selectedCardIds
      .map((id) => cardById.get(id))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .map((c) => getCardBuff(c));

    // 탐험권 -1 + 세션 시작
    // buildSession(createSession) 가 activeBuffs 를 받아 hero snapshot 에
    // stat / affinity / healStart / critBonus 를 반영한다. 따라서 buffs 는
    // 반드시 네 번째 인자로 넘겨줘야 실제 전투에 효과가 적용된다.
    // Phase 5a.1: level 에 따라 base stat 이 자동 성장한 hero 를 전달.
    // Phase 9d: 챌린지 레벨이 아닌 영웅 레벨 (gameLevel - heroStartLevel + 1) 사용.
    const updatedPasses = { ...state.passes, [dungeonId]: passes - 1 };
    const progress = state.dungeons[dungeonId];
    const startFloor = (progress?.floorReached ?? 0) + 1;
    const gameLevel = useGameStore.getState().progress.level ?? 1;
    const heroLvl = Math.max(1, gameLevel - (state.heroStartLevel ?? 1) + 1);
    const leveledHero = computeHeroForLevel(state.hero, heroLvl);
    const session: CombatSession = buildSession(
      dungeonId,
      leveledHero,
      startFloor,
      buffs,
      // Phase 11c — NG+ 스냅샷 전달. weekly variant 는 별도 action 으로만 진입.
      { ngPlusLevel: state.ngPlusLevel ?? 0 },
    );
    const newState = {
      passes: updatedPasses,
      currentSession: session,
      pendingDungeon: null,
    };
    set(newState);
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, ...newState }));
  },

  cancelBuffDraw() {
    set({ pendingDungeon: null });
  },

  enterDungeon(dungeonId) {
    // 구 API — 버프 draw 스킵 직진입. 보유 카드 0 케이스나 테스트용.
    const state = get();
    const passes = state.passes[dungeonId] ?? 0;
    if (passes < 1) return false;
    const updatedPasses = { ...state.passes, [dungeonId]: passes - 1 };
    const progress = state.dungeons[dungeonId];
    const startFloor = (progress?.floorReached ?? 0) + 1;
    // Phase 5a.1: level 기반 성장 반영. Phase 9d: 영웅 레벨 사용.
    const gameLevel = useGameStore.getState().progress.level ?? 1;
    const heroLvl = Math.max(1, gameLevel - (state.heroStartLevel ?? 1) + 1);
    const leveledHero = computeHeroForLevel(state.hero, heroLvl);
    const session = buildSession(dungeonId, leveledHero, startFloor, undefined, {
      ngPlusLevel: state.ngPlusLevel ?? 0,
    });
    const newState = {
      passes: updatedPasses,
      currentSession: session,
    };
    set(newState);
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, ...newState }));
    return true;
  },

  enterWeeklyVariant(dungeonId) {
    // Phase 11c — 주간 악몽 던전 세션 시작.
    //   F30 을 일반 모드에서 한 번 이상 클리어해야 해금 (ngPlusLevel 1+ 이면 자동).
    //   탐험권 소모 없음. startFloor 고정 F30 (단판 보스전).
    //   affix 는 state.weeklyVariant.affixId 에서 가져와 buildSession 에 전달.
    const state = get();
    if (!state.weeklyVariant) return "no-weekly";
    // F30 미클리어 + ngPlusLevel 0 이면 아직 미해금
    const f30EverCleared =
      (state.ngPlusLevel ?? 0) > 0 ||
      Object.values(state.dungeons).some((d) =>
        d?.bossesDefeated?.includes(30),
      );
    if (!f30EverCleared) return "not-unlocked";

    const gameLevel = useGameStore.getState().progress.level ?? 1;
    const heroLvl = Math.max(1, gameLevel - (state.heroStartLevel ?? 1) + 1);
    const leveledHero = computeHeroForLevel(state.hero, heroLvl);

    // 주간 던전은 F30 고정 시작 (짧은 도전 run). ngPlusLevel 은 영향 X —
    // weekly affix 자체가 별도 난이도 소스.
    const session = buildSession(dungeonId, leveledHero, 30, undefined, {
      ngPlusLevel: 0,
      isWeeklyVariant: true,
      weeklyAffixId: state.weeklyVariant.affixId,
    });
    set({ currentSession: session });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, currentSession: session }),
    );
    return "ok";
  },

  tickSession() {
    const state = get();
    if (!state.currentSession) return;
    if (state.currentSession.status !== "active") return;
    const next = stepSession(state.currentSession);
    set({ currentSession: next });
    // 세션 진행 중 자주 저장되면 부담 — 상태 전환 (pause/awaitingChoice/completed) 시에만 persist
    if (next.status !== "active") {
      saveToStorage(STORAGE_KEY, pickPersisted({ ...state, currentSession: next }));
    }
  },

  resolveChoice(optionIndex) {
    const state = get();
    if (!state.currentSession) return;
    // Phase 11c R4 bugfix — status guard. 유저의 double-tap / encounter timeout
    //   auto-resolve 와 수동 선택이 같은 ms 에 겹칠 때 resolveChoice 가 2번 호출되면
    //   effect 가 중복 적용되던 버그. applyChoice 내부에도 check 있지만 store level
    //   early-return 이 안전함.
    if (state.currentSession.status !== "awaitingChoice") return;
    const next = applyChoice(state.currentSession, optionIndex);
    set({ currentSession: next });
  },

  resumeSession() {
    const state = get();
    if (!state.currentSession) return;
    if (state.currentSession.status !== "paused") return;
    set({
      currentSession: { ...state.currentSession, status: "active" },
    });
  },

  abandonSession() {
    const state = get();
    if (!state.currentSession) return;
    const next = abandon(state.currentSession);
    set({ currentSession: next });
  },

  acknowledgeSessionEnd() {
    const state = get();
    const session = state.currentSession;
    if (!session || session.status !== "completed") return;

    // Phase 5a.2 — 5개 side-effect 를 pure helper 로 분리 (sessionReward.ts).
    // 각 helper 는 state-in → state-out, 외부 store mutation 없음.

    // 1. 사망 페널티 계산 → drops 절반 (또는 전량)
    const keptDrops = calculateKeptDrops(session);

    // 2. 보스 처치 기록 — log 기반 실제 승리 entry 스캔
    const curProgress = state.dungeons[session.dungeonId];
    const prevBossesDefeated = curProgress?.bossesDefeated ?? [];
    const newBossesDefeated = calculateBossesDefeated(
      session.log,
      prevBossesDefeated,
    );

    // Phase 11c — NG+ trigger: F30 보스를 이번 세션에 **처음으로** 처치했으면 +1.
    //   이미 과거에 F30 처치한 유저는 변동 없음 (최초 1회만 ngPlusLevel += 1).
    //   weekly variant 세션에선 NG+ 증가 안 시킴 (별도 모드).
    let newNgPlusLevel = state.ngPlusLevel;
    const clearedF30NewlyThisSession =
      newBossesDefeated.includes(30) && !prevBossesDefeated.includes(30);
    if (clearedF30NewlyThisSession && !session.isWeeklyVariant) {
      newNgPlusLevel = (state.ngPlusLevel ?? 0) + 1;
    }

    // 3. 던전 진행 상황 갱신
    const dungeons = {
      ...state.dungeons,
      [session.dungeonId]: calculateDungeonProgress(
        session,
        curProgress,
        newBossesDefeated,
      ),
    };

    // 4. codex (monster/boss/equipment 발견 기록)
    const codex = calculateCodexDelta(session.log, state.codex);

    // 5. 외부 store (useGameStore) 로 XP 반영 — cross-store 는 여기 남김.
    //    Phase 9d-fix — xp 누적 후 getLevelFromXP 로 level 도 재계산.
    //    누락되면 Header 가 stale level 을 유지하고 영웅 레벨 (= gameLevel -
    //    heroStartLevel + 1) 이 밀림.
    const gameStore = useGameStore.getState();
    const newXp = gameStore.progress.xp + session.rewards.xp;
    const newLevel = getLevelFromXP(newXp);
    const newProgress = {
      ...gameStore.progress,
      xp: newXp,
      level: newLevel,
    };
    useGameStore.setState({ progress: newProgress });
    saveToStorage("progress", newProgress);

    // Phase 11c — weekly variant 세션이었으면 clearedDungeons / bestScore 업데이트.
    //   F30 까지 도달 안 했어도 점수는 산출 (floorsCleared 기반).
    //   최고 점수 경신 시 Firestore 업로드 (로그인 유저만, 비동기).
    let newWeeklyVariant = state.weeklyVariant;
    if (session.isWeeklyVariant && state.weeklyVariant) {
      // Phase 11c R2 — weekly 는 F30 start 라 `currentFloor - startFloor + 1 = 1` 이 되며,
      //   보스 미처치 실패에도 floorsCleared=1 점수가 들어감. 실제 "클리어" 로 간주하려면
      //   F30 보스 처치가 있어야 함. 실패 시 floorsCleared = 0.
      //
      // Phase 11c R3 — weekly clearedF30 는 `prevBossesDefeated` 와 비교 X.
      //   유저가 normal 모드에서 이미 F30 클리어 후 weekly 에 도전하면 prev 에 30 있음
      //   → `clearedF30 = false` 로 score 항상 0. weekly 는 session log 의 F30 보스
      //   victory 존재 여부로 판정.
      const reachedFloors = Math.max(0, session.currentFloor - session.startFloor);
      const clearedF30InSession = session.log.some(
        (e) => e.type === "victory" && e.monster.isBoss && e.monster.level === 30,
      );
      // clearedF30 (이번 세션 자체에서 F30 보스 처치했는지) + 기존 변수명 유지.
      const clearedF30 = clearedF30InSession;
      const floorsCleared = clearedF30 ? reachedFloors + 1 : reachedFloors;
      const gameLv = useGameStore.getState().progress.level ?? 1;
      const heroLv = Math.max(1, gameLv - (state.heroStartLevel ?? 1) + 1);
      const score = computeWeeklyScore(floorsCleared, session.time, heroLv);
      const isNewBest = score > state.weeklyVariant.bestScore;
      newWeeklyVariant = {
        ...state.weeklyVariant,
        clearedDungeons: clearedF30
          ? [...new Set([...state.weeklyVariant.clearedDungeons, session.dungeonId])]
          : state.weeklyVariant.clearedDungeons,
        bestScore: Math.max(state.weeklyVariant.bestScore, score),
        // lastUploadedAt 은 Firestore 업로드 확정 후 set (아래 microtask).
      };

      // Phase 11c R1 — 업로드는 state commit 뒤로 이동 (atomic). 그리고 capture 된
      //   local `newWeeklyVariant` 를 참조 (기존 `state.weeklyVariant!` 는 stale 가능).
      //   fire-and-forget but state 가 먼저 반영되도록 순서 고정.
      // Phase 11c R3 — 이전엔 위에서 lastUploadedAt 을 `isNewBest` 로만 판단해 set.
      //   익명 유저 / Firebase 미구성 경우 업로드 실패해도 timestamp 가 찍혀 misleading.
      //   이제 upload result === "ok" 일 때만 lastUploadedAt 갱신 (post-commit).
      if (isNewBest) {
        const capturedVariantWeek = newWeeklyVariant.week;
        queueMicrotask(() => {
          import("@/lib/weeklyLeaderboard").then(async (mod) => {
            const displayName = await mod.getDisplayName();
            const result = await mod.uploadWeeklyScore(capturedVariantWeek, {
              displayName,
              score,
              floorsCleared,
              heroLevel: heroLv,
              classType: session.hero.classType,
              clearedAt: Date.now(),
            });
            if (result === "ok") {
              // state 가 이미 commit 됐으므로 get() 으로 최신 참조.
              const cur = get();
              if (cur.weeklyVariant?.week === capturedVariantWeek) {
                const updated = { ...cur.weeklyVariant, lastUploadedAt: Date.now() };
                set({ weeklyVariant: updated });
                saveToStorage(STORAGE_KEY, pickPersisted({ ...cur, weeklyVariant: updated }));
              }
            }
          });
        });
      }
    }

    // state commit + persist — 업로드 microtask 보다 먼저 실행 보장.
    const newCoins = state.coins + session.rewards.coins;
    const newInventory = [...state.inventory, ...keptDrops];
    const newState = {
      coins: newCoins,
      inventory: newInventory,
      dungeons,
      codex,
      ngPlusLevel: newNgPlusLevel,
      weeklyVariant: newWeeklyVariant,
      currentSession: null,
    };
    set(newState);
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, ...newState }));
  },

  equipItem(itemId, slot) {
    const state = get();
    const item = state.inventory.find((i) => i.id === itemId);
    if (!item || item.type !== slot) return;
    const heroEquipped = { ...state.hero.equipped, [slot]: item };
    const hero = { ...state.hero, equipped: heroEquipped };
    // 인벤토리에서 해당 아이템 제거 (장착 slot 으로 이동)
    // 기존 장착 아이템 있으면 인벤토리로 반환
    const existing = state.hero.equipped[slot];
    const newInventory = state.inventory.filter((i) => i.id !== itemId);
    if (existing) newInventory.push(existing);
    set({ hero, inventory: newInventory });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hero, inventory: newInventory }));
  },

  unequipItem(slot) {
    const state = get();
    const item = state.hero.equipped[slot];
    if (!item) return;
    const heroEquipped = { ...state.hero.equipped };
    delete heroEquipped[slot];
    const hero = { ...state.hero, equipped: heroEquipped };
    const newInventory = [...state.inventory, item];
    set({ hero, inventory: newInventory });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hero, inventory: newInventory }));
  },

  sellItem(itemId) {
    const state = get();
    const item = state.inventory.find((i) => i.id === itemId);
    if (!item) return 0;
    const refund = SELL_PRICE[item.rarity];
    const newInventory = state.inventory.filter((i) => i.id !== itemId);
    const newCoins = state.coins + refund;
    set({ inventory: newInventory, coins: newCoins });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, inventory: newInventory, coins: newCoins }),
    );
    return refund;
  },

  discardItem(itemId) {
    const state = get();
    const item = state.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const newInventory = state.inventory.filter((i) => i.id !== itemId);
    set({ inventory: newInventory });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, inventory: newInventory }),
    );
  },

  purchaseTicket() {
    const state = get();
    if (state.coins < SHOP_PRICES.ticket) return false;
    const gameStore = useGameStore.getState();
    const MAX_TICKETS = 10;
    if ((gameStore.progress.tickets ?? 0) >= MAX_TICKETS) return false;

    const newCoins = state.coins - SHOP_PRICES.ticket;
    const newTickets = Math.min(MAX_TICKETS, (gameStore.progress.tickets ?? 0) + 1);
    const newProgress = { ...gameStore.progress, tickets: newTickets };
    useGameStore.setState({ progress: newProgress });
    saveToStorage("progress", newProgress);

    set({ coins: newCoins });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, coins: newCoins }));
    return true;
  },

  purchaseCardPack(size) {
    const state = get();
    const price = size === "full" ? SHOP_PRICES.cardPackFull : SHOP_PRICES.cardPackSmall;
    if (state.coins < price) return false;
    const newCoins = state.coins - price;

    const gameStore = useGameStore.getState();
    const newProgress = { ...gameStore.progress };
    if (size === "full") {
      newProgress.pendingPacks = (newProgress.pendingPacks ?? 0) + 1;
    } else {
      newProgress.pendingBonusCards = (newProgress.pendingBonusCards ?? 0) + 1;
    }
    useGameStore.setState({ progress: newProgress, isOpeningPack: true });
    saveToStorage("progress", newProgress);

    set({ coins: newCoins });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, coins: newCoins }));
    return true;
  },

  purchasePass(dungeonId) {
    // Phase 11a — 갓생 상점에서 탐험권 1장 구매. 고정 80 코인, 하루 2장 cap.
    const state = get();
    const price = SHOP_PRICES.expeditionPass;
    if (state.coins < price) return "no-coin";

    // daily reset 체크 — date 가 바뀌었으면 shopDaily.passesBought 0 으로 리셋해서
    //   새 cap 기준으로 판정.
    const today = getTodayString();
    const daily =
      state.shopDaily && state.shopDaily.date === today
        ? state.shopDaily
        : { date: today, passesBought: 0 };
    if (daily.passesBought >= DAILY_PASS_PURCHASE_CAP) return "daily-cap";

    // 던전별 cap (PASS_CAP_PER_CATEGORY=20) 체크
    const currentPasses = state.passes[dungeonId] ?? 0;
    if (currentPasses >= PASS_CAP_PER_CATEGORY) return "pass-cap";

    const newPasses = { ...state.passes, [dungeonId]: currentPasses + 1 };
    const newCoins = state.coins - price;
    const newShopDaily = { date: today, passesBought: daily.passesBought + 1 };

    set({ coins: newCoins, passes: newPasses, shopDaily: newShopDaily });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({
        ...state,
        coins: newCoins,
        passes: newPasses,
        shopDaily: newShopDaily,
      }),
    );
    return "ok";
  },

  enhanceItem(id) {
    // Phase 11a 재작성 — 단일 아이템 + 코인 → 확률적 +1 level 시도.
    //
    // 흐름:
    //   1. 아이템 & 비용 검증
    //   2. Math.random() < successRate 체크
    //   3. 성공: enhanceLevel+1, stats 미미 증가 (+0.5 반올림/키), 이름 suffix 갱신
    //   4. 실패-보존 (30%): 아이템 그대로 유지
    //   5. 실패-소실 (70%): inventory 에서 제거
    //   6. 코인은 성공/실패 무관 차감 (시도 자체의 비용)
    //
    // stats 상승 규칙: primary stat 키 한정 +1 (level 이 짝수일 때),
    // 그 외 기존 키는 +0 (매우 미미). 총 +10 달성 시 primary stat +5 증가.
    const state = get();
    // Phase 11c R4 — 장착 중 아이템도 강화 가능. inventory → equipped slot 순 탐색.
    //   성공/실패 시 원래 위치 (inventory 혹은 equipped slot) 에 맞게 반영.
    const invItem = state.inventory.find((i) => i.id === id);
    let equippedSlot: EquipSlot | null = null;
    let equippedItem: Equipment | null = null;
    if (!invItem) {
      for (const slot of ["weapon", "armor", "accessory", "talisman"] as EquipSlot[]) {
        const e = state.hero.equipped[slot];
        if (e?.id === id) {
          equippedSlot = slot;
          equippedItem = e;
          break;
        }
      }
    }
    const item = invItem ?? equippedItem;
    if (!item) return { ok: false, reason: "not-found" };

    const curLevel = item.enhanceLevel ?? 0;
    if (curLevel >= MAX_ENHANCE_LEVEL) return { ok: false, reason: "maxed" };

    const cost = enhanceCost(item.rarity, curLevel);
    if (state.coins < cost) return { ok: false, reason: "coin", cost };

    // Phase 11c R4 — pity 적용. 누적된 failStreak 가 성공률 가산.
    //   legend +4%p / fail, unique +2%p / fail. normal/rare 는 미적용.
    const curStreak = item.enhanceFailStreak ?? 0;
    const rate = enhanceSuccessRate(item.rarity, curLevel, curStreak);
    const roll = Math.random();
    const success = roll < rate;

    // 위치별 item 을 새 item 으로 교체하는 헬퍼.
    const replaceItem = (newItem: Equipment) => {
      if (equippedSlot) {
        const newEquipped = { ...state.hero.equipped, [equippedSlot]: newItem };
        return { inventory: state.inventory, hero: { ...state.hero, equipped: newEquipped } };
      }
      return {
        inventory: state.inventory.map((i) => (i.id === id ? newItem : i)),
        hero: state.hero,
      };
    };
    const removeItem = () => {
      if (equippedSlot) {
        const newEquipped = { ...state.hero.equipped };
        delete newEquipped[equippedSlot];
        return { inventory: state.inventory, hero: { ...state.hero, equipped: newEquipped } };
      }
      return {
        inventory: state.inventory.filter((i) => i.id !== id),
        hero: state.hero,
      };
    };

    if (success) {
      const newLevel = curLevel + 1;
      // stats 미미 상승 — primary stat 키에만 짝수 level 에서 +1 (총 10 단계 중 5 회).
      //   즉 +2, +4, +6, +8, +10 에서 primary +1 누적. "스킬이 주 보상" 원칙 유지.
      const newStats: Equipment["stats"] = { ...item.stats };
      if (newLevel % 2 === 0) {
        const primaryKey = pickPrimaryStatKey(item.stats);
        if (primaryKey) {
          newStats[primaryKey] = (newStats[primaryKey] ?? 0) + 1;
        }
      }
      // 이름에 +N suffix. 기존 "+" 가 legacy 합성 표기로 남아있을 수 있어 strip 후 재부여.
      const baseName = stripEnhanceSuffix(item.name);
      const newName = newLevel >= 1 ? `${baseName} +${newLevel}` : baseName;
      const newItem: Equipment = {
        ...item,
        name: newName,
        stats: newStats,
        enhanceLevel: newLevel,
        // Phase 11c R4 — 성공 시 streak 리셋. pity 보너스 초기화.
        enhanceFailStreak: 0,
      };
      const { inventory: newInventory, hero: newHero } = replaceItem(newItem);
      const newCoins = state.coins - cost;
      set({ inventory: newInventory, hero: newHero, coins: newCoins });
      saveToStorage(
        STORAGE_KEY,
        pickPersisted({ ...state, inventory: newInventory, hero: newHero, coins: newCoins }),
      );
      return { ok: true, reason: "success", newItem, prevLevel: curLevel };
    }

    // 실패 — 코인은 어쨌든 차감. 보존 확률은 rarity 별 다름.
    const preserved = Math.random() < ENHANCE_PRESERVE_BY_RARITY[item.rarity];
    const newCoins = state.coins - cost;
    if (preserved) {
      // 아이템 그대로 + failStreak +1 (다음 시도에 pity 보너스 적용).
      const newItem: Equipment = {
        ...item,
        enhanceFailStreak: curStreak + 1,
      };
      const { inventory: newInventory, hero: newHero } = replaceItem(newItem);
      set({ coins: newCoins, inventory: newInventory, hero: newHero });
      saveToStorage(
        STORAGE_KEY,
        pickPersisted({ ...state, coins: newCoins, inventory: newInventory, hero: newHero }),
      );
      return { ok: false, reason: "keep", item: newItem };
    }
    // 소실 — inventory 혹은 equipped slot 에서 제거.
    const { inventory: newInventory, hero: newHero } = removeItem();
    const lostName = item.name;
    set({ inventory: newInventory, hero: newHero, coins: newCoins });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, inventory: newInventory, hero: newHero, coins: newCoins }),
    );
    return { ok: false, reason: "destroyed", lostItemName: lostName };
  },
}));

/* ═══════════════════════════════════════════════════════════════════════
 * Phase 11a — enhanceItem 헬퍼
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * 장비의 "primary stat key" 를 찾는다. 드롭 템플릿의 statBoost 가 primary 이지만
 * Equipment 타입에는 statBoost 가 저장 안 돼 있어 stats 객체에서 최대값 key 로 추정.
 * 동률 시 defined order (str/int/vit/dex/agi/crit/slotBonus) 로 tie-break.
 */
function pickPrimaryStatKey(
  stats: Equipment["stats"],
): keyof HeroBaseStats | null {
  const order: Array<keyof HeroBaseStats> = [
    "str",
    "int",
    "vit",
    "dex",
    "agi",
    "crit",
    "slotBonus",
  ];
  let best: keyof HeroBaseStats | null = null;
  let bestVal = -Infinity;
  for (const key of order) {
    const v = stats[key];
    if (v == null) continue;
    if (v > bestVal) {
      best = key;
      bestVal = v;
    }
  }
  return best;
}

/**
 * 이름에서 " +N" 또는 legacy " +" suffix 제거. enhanceItem 성공 시 매번 재부여.
 *   "자기절제의 검 +3" → "자기절제의 검"
 *   "꾸준함의 방패 +"  → "꾸준함의 방패" (legacy 합성 표기)
 */
function stripEnhanceSuffix(name: string): string {
  return name.replace(/\s+\+\d*$/, "");
}
