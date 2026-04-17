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
  PASS_GRANT_BY_RARITY,
  PASS_CAP_PER_CATEGORY,
  SHOP_PRICES,
  SELL_PRICE,
  type UpHeroState,
  type DungeonId,
  type Equipment,
  type EquipSlot,
  type CombatSession,
} from "@/types/uphero";
import type { Rarity } from "@/types/card";
import {
  createSession as buildSession,
  tickSession as stepSession,
  resolveChoice as applyChoice,
  abandonSession as abandon,
} from "@/lib/upHeroCombat";
import { useGameStore } from "./useGameStore";

const STORAGE_KEY = "uphero";

interface UpHeroActions {
  initialize(): void;

  // 탐험권
  grantExpeditionPass(dungeonId: DungeonId, rarity: Rarity): void;

  // 던전 세션
  enterDungeon(dungeonId: DungeonId): boolean; // false = 탐험권 부족
  tickSession(): void;
  resolveChoice(optionIndex: number): void;
  resumeSession(): void; // 보스 연출 종료 후 호출 — status "paused" → "active"
  abandonSession(): void;
  acknowledgeSessionEnd(): void; // 결산 modal 닫은 후 currentSession = null 로

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
}

type UpHeroStore = UpHeroState & UpHeroActions;

/** 저장할 state 추출 — 함수는 제외 */
function pickPersisted(s: UpHeroState): Partial<UpHeroState> {
  const { hero, inventory, coins, passes, dungeons, currentSession, codex, cosmetics, lastIdleAccrualAt } = s;
  return { hero, inventory, coins, passes, dungeons, currentSession, codex, cosmetics, lastIdleAccrualAt };
}

export const useUpHeroStore = create<UpHeroStore>((set, get) => ({
  hero: createDefaultHero(),
  inventory: [],
  coins: 0,
  passes: {},
  dungeons: {},
  currentSession: null,
  codex: { monsters: [], equipment: [], bosses: [] },
  cosmetics: {},
  lastIdleAccrualAt: Date.now(),
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
    set({
      hero: mergedHero,
      inventory: saved?.inventory ?? [],
      coins: saved?.coins ?? 0,
      passes: saved?.passes ?? {},
      dungeons: saved?.dungeons ?? {},
      currentSession: saved?.currentSession ?? null,
      codex: saved?.codex ?? { monsters: [], equipment: [], bosses: [] },
      cosmetics: saved?.cosmetics ?? {},
      lastIdleAccrualAt: saved?.lastIdleAccrualAt ?? Date.now(),
      isLoaded: true,
    });
  },

  grantExpeditionPass(dungeonId, rarity) {
    const grant = PASS_GRANT_BY_RARITY[rarity];
    const current = get().passes[dungeonId] ?? 0;
    const next = Math.min(PASS_CAP_PER_CATEGORY, current + grant);
    const passes = { ...get().passes, [dungeonId]: next };
    set({ passes });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...get(), passes }));
  },

  enterDungeon(dungeonId) {
    const state = get();
    const passes = state.passes[dungeonId] ?? 0;
    if (passes < 1) return false;
    // 진입 — 탐험권 1 소모
    const updatedPasses = { ...state.passes, [dungeonId]: passes - 1 };
    // 던전 진행 상황 — 저장된 floorReached + 1 에서 시작 (최초는 1)
    const progress = state.dungeons[dungeonId];
    const startFloor = (progress?.floorReached ?? 0) + 1;
    const session = buildSession(dungeonId, state.hero, startFloor);
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

    // 보상 → hero progress 에 반영
    // coins: 직접 store 에 추가
    // xp: useGameStore.progress.xp 에 추가 (게임스토어가 source of truth)
    // drops: inventory 에 추가
    // floorReached: 던전 진행에 최대값 기록

    const newCoins = state.coins + session.rewards.coins;

    // dungeons.floorReached 갱신
    const curProgress = state.dungeons[session.dungeonId];
    const reached = Math.max(curProgress?.floorReached ?? 0, session.currentFloor);
    const bossesDefeated = curProgress?.bossesDefeated ?? [];
    // 보스 처치 기록 (10/20/30F 에서 victory)
    const bossFloors = [10, 20, 30];
    const newBossesDefeated = [...new Set([...bossesDefeated, ...bossFloors.filter((f) => f <= session.currentFloor && !bossesDefeated.includes(f))])];

    const dungeons = {
      ...state.dungeons,
      [session.dungeonId]: {
        dungeonId: session.dungeonId,
        floorReached: reached,
        bossesDefeated: newBossesDefeated,
      },
    };

    // inventory 추가
    const newInventory = [...state.inventory, ...session.rewards.drops];

    // codex 업데이트 (발견 기록)
    const codexMonstersSet = new Set(state.codex.monsters);
    const codexBossesSet = new Set(state.codex.bosses);
    const codexEqSet = new Set(state.codex.equipment);
    for (const entry of session.log) {
      if (entry.type === "encounter") {
        if (entry.monster.isBoss) codexBossesSet.add(entry.monster.id);
        else codexMonstersSet.add(entry.monster.id);
      }
      if (entry.type === "drop") codexEqSet.add(entry.equipment.id);
    }
    const codex = {
      monsters: [...codexMonstersSet],
      bosses: [...codexBossesSet],
      equipment: [...codexEqSet],
    };

    // useGameStore.progress.xp 직접 mutation — zustand 권장 안함이지만 간단성 위해
    const gameStore = useGameStore.getState();
    const newProgress = {
      ...gameStore.progress,
      xp: gameStore.progress.xp + session.rewards.xp,
    };
    useGameStore.setState({ progress: newProgress });
    // 게임스토어는 자체 save 가 없으므로 storage 직접
    saveToStorage("progress", newProgress);

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
}));
