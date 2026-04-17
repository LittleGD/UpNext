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
  type UpHeroState,
  type DungeonId,
  type ClassType,
  type Equipment,
  type EquipSlot,
  type CombatSession,
  type CardBuff,
} from "@/types/uphero";
import type { Category } from "@/types/card";
import type { Rarity } from "@/types/card";
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
import { getCardBuff } from "@/data/cardBuffs";
import { ALL_CARDS } from "@/data/cards";
import { ALL_MONSTER_TEMPLATES } from "@/data/upHeroMonsters";
import {
  ALL_EQUIPMENT_TEMPLATES,
  findTemplateByLegacyId,
} from "@/data/upHeroEquipment";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { useGameStore } from "./useGameStore";

/**
 * Phase 5a.3 / 5b.2 — 저장 스키마 현재 버전.
 *
 * v1: codex.monsters/bosses 를 monster.name 기반으로 전환 (legacy 는 instance ID)
 * v2: codex.equipment 를 template baseName 기반으로 전환 (legacy 는 instance ID)
 */
const CURRENT_SCHEMA_VERSION = 2;

/**
 * Phase 4c-fix: Codex legacy ID → name migration.
 *
 * 이전 버전은 `${templateId}_f{floor}_{timestamp}` 포맷 인스턴스 ID 를
 * codex 에 저장했음. 같은 템플릿을 여러 번 만나면 다른 entry 로 누적됨.
 * 현재는 template.name 기반으로 저장. initialize 때 한 번만 변환 + dedup
 * (schemaVersion gating).
 */
function migrateCodexMonsters(entries: string[]): string[] {
  const result = new Set<string>();
  for (const entry of entries) {
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
function migrateCodexEquipment(entries: string[]): string[] {
  const result = new Set<string>();
  for (const entry of entries) {
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
   * Phase 4c-feature — 장비 강화.
   * 같은 type + 같은 rarity 두 장비 합성 → 한 등급 높은 새 장비.
   * 코인 소모: normal 30 / rare 60 / unique 120. legend 는 합성 불가 (cap).
   * 새 아이템 stats: 두 원본의 각 스탯 max + 2. 카테고리는 첫 입력 상속.
   * 반환값으로 성공/실패 + 결과 아이템 알려줌 — UI 에서 reveal 연출 가능.
   */
  enhanceItem(
    id1: string,
    id2: string,
  ): { ok: boolean; newItem?: Equipment; error?: string };
}

type UpHeroStore = UpHeroState & UpHeroActions;

/** 저장할 state 추출 — 함수는 제외. pendingDungeon 은 transient (persist 안 함) */
function pickPersisted(s: UpHeroState): Partial<UpHeroState> {
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
    const rawIdleReward = calculateIdleReward(now - lastIdleAt, curLevel);
    const heroClass = mergedHero.classType;
    const idleReward = rawIdleReward
      ? {
          ...rawIdleReward,
          xp: Math.round(rawIdleReward.xp * classXpMult(heroClass)),
          coins: Math.round(rawIdleReward.coins * classCoinMult(heroClass)),
        }
      : null;

    // 지급 — useGameStore.xp 증가 + coins 증가 (Up Hero store).
    let coins = saved?.coins ?? 0;
    if (idleReward) {
      const newProgress = {
        ...gameStore.progress,
        xp: (gameStore.progress.xp ?? 0) + idleReward.xp,
      };
      useGameStore.setState({ progress: newProgress });
      saveToStorage("progress", newProgress);
      coins = coins + idleReward.coins;
    }

    // Phase 5c-fix #2: lastIdleAccrualAt 는 reward 가 실제로 지급됐을 때만
    // now 로 갱신. 5분 미만 reload 시에는 기존 timestamp 유지 → 누적 보전.
    // (이전: reward 유무 무관 now 로 갱신 → 잦은 reload 시 누적 손실 발생)
    const newLastIdleAt = idleReward ? now : lastIdleAt;

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
    if (curLevel >= 30 && mergedHero.classType === null) {
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
    const updatedPasses = { ...state.passes, [dungeonId]: passes - 1 };
    const progress = state.dungeons[dungeonId];
    const startFloor = (progress?.floorReached ?? 0) + 1;
    const level = useGameStore.getState().progress.level ?? 1;
    const leveledHero = computeHeroForLevel(state.hero, level);
    const session: CombatSession = buildSession(
      dungeonId,
      leveledHero,
      startFloor,
      buffs,
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
    // Phase 5a.1: level 기반 성장 반영
    const level = useGameStore.getState().progress.level ?? 1;
    const leveledHero = computeHeroForLevel(state.hero, level);
    const session = buildSession(dungeonId, leveledHero, startFloor);
    const newState = {
      passes: updatedPasses,
      currentSession: session,
    };
    set(newState);
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, ...newState }));
    return true;
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
    const newBossesDefeated = calculateBossesDefeated(
      session.log,
      curProgress?.bossesDefeated ?? [],
    );

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
    const gameStore = useGameStore.getState();
    const newProgress = {
      ...gameStore.progress,
      xp: gameStore.progress.xp + session.rewards.xp,
    };
    useGameStore.setState({ progress: newProgress });
    saveToStorage("progress", newProgress);

    // state commit + persist
    const newCoins = state.coins + session.rewards.coins;
    const newInventory = [...state.inventory, ...keptDrops];
    const newState = {
      coins: newCoins,
      inventory: newInventory,
      dungeons,
      codex,
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

  enhanceItem(id1, id2) {
    const state = get();
    if (id1 === id2) return { ok: false, error: "같은 아이템 두 번 선택 불가" };
    const a = state.inventory.find((i) => i.id === id1);
    const b = state.inventory.find((i) => i.id === id2);
    if (!a || !b) return { ok: false, error: "인벤토리에 없는 아이템" };
    if (a.type !== b.type) return { ok: false, error: "같은 슬롯끼리만 합성 가능" };
    if (a.rarity !== b.rarity) return { ok: false, error: "같은 등급끼리만 합성 가능" };
    if (a.rarity === "legend") return { ok: false, error: "전설은 최고 등급" };

    // 코인 비용 — rarity 단계별
    const RARITY_COST: Record<Rarity, number> = {
      normal: SHOP_PRICES.enhance,
      rare: SHOP_PRICES.enhance * 2,
      unique: SHOP_PRICES.enhance * 4,
      legend: Number.POSITIVE_INFINITY,
    };
    const cost = RARITY_COST[a.rarity];
    if (state.coins < cost) return { ok: false, error: `코인 부족 (${cost} 필요)` };

    // 다음 등급 계산
    const NEXT_RARITY: Record<Rarity, Rarity> = {
      normal: "rare",
      rare: "unique",
      unique: "legend",
      legend: "legend",
    };
    const newRarity = NEXT_RARITY[a.rarity];

    // 새 stats: 각 키의 max + 2 (최소한 더 나아진다 보장)
    const newStats: Equipment["stats"] = {};
    const keys = new Set<keyof Equipment["stats"]>([
      ...Object.keys(a.stats),
      ...Object.keys(b.stats),
    ] as Array<keyof Equipment["stats"]>);
    for (const key of keys) {
      const va = a.stats[key] ?? 0;
      const vb = b.stats[key] ?? 0;
      newStats[key] = Math.max(va, vb) + 2;
    }

    // Phase 4c-fix: 양쪽 effects 를 모두 물려받는다 (이전에는 a.effects 만
    // 복사해서 b 의 특수 효과가 사라졌음). 동일 문자열은 dedup.
    const mergedEffects = [
      ...(a.effects ?? []),
      ...(b.effects ?? []),
    ];
    const uniqueEffects = [...new Set(mergedEffects)];

    // Phase 5a.5: 카테고리 계승 — 현재는 첫 재료 (a) 의 category 승계.
    // 실전에서는 drop 이 dungeon 별로 고정이라 같은 카테고리 끼리 합치기
    // 대부분. 다른 카테고리 조합은 수동 인벤토리 조작 시에만 발생하는 엣지.
    // 이 경우에도 a.category 를 유지해 friction 없이 동작 (affinity 혜택은
    // a.category 기준으로 계속 받음).
    const inheritedCategory = a.category;

    const newItem: Equipment = {
      id: `enh_${a.type}_${newRarity}_${Date.now() % 100000}_${Math.floor(Math.random() * 1000)}`,
      name: `${a.name} +`,
      type: a.type,
      rarity: newRarity,
      category: inheritedCategory,
      iconName: a.iconName,
      stats: newStats,
      effects: uniqueEffects.length > 0 ? uniqueEffects : undefined,
      flavor: `강화로 벼려낸 ${a.name}`,
    };

    const newInventory = [
      ...state.inventory.filter((i) => i.id !== id1 && i.id !== id2),
      newItem,
    ];
    const newCoins = state.coins - cost;

    set({ inventory: newInventory, coins: newCoins });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, inventory: newInventory, coins: newCoins }),
    );
    return { ok: true, newItem };
  },
}));
