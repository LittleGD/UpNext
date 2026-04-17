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
  type CardBuff,
} from "@/types/uphero";
import type { Rarity } from "@/types/card";
import {
  createSession as buildSession,
  tickSession as stepSession,
  resolveChoice as applyChoice,
  abandonSession as abandon,
} from "@/lib/upHeroCombat";
import { drawBuffCards } from "@/lib/buffDraw";
import { getCardBuff } from "@/data/cardBuffs";
import { ALL_CARDS } from "@/data/cards";
import { useGameStore } from "./useGameStore";

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
  pendingDungeon: null,
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
      pendingDungeon: null, // transient, 재시작 시 항상 null
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
    const updatedPasses = { ...state.passes, [dungeonId]: passes - 1 };
    const progress = state.dungeons[dungeonId];
    const startFloor = (progress?.floorReached ?? 0) + 1;
    const session: CombatSession = buildSession(
      dungeonId,
      state.hero,
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

    // 종료 사유 확인 — heroDied 면 페널티 적용
    const lastEntry = session.log[session.log.length - 1];
    const reason =
      lastEntry?.type === "sessionEnd" ? lastEntry.reason : undefined;
    const heroDied = reason === "heroDied" || reason === "defeat";

    // === Phase 4c-balance: 사망 페널티 ===
    // 영웅이 전투나 선택지에서 쓰러지면 획득한 drops 의 절반을 잃는다.
    // (floor(N/2) 만큼만 인벤토리에 들어감. 코인·XP 는 유지 — 완전 손실은 과함)
    // 보스 처치 / 시간 소진 / 자발 복귀는 전량 유지.
    const keptDrops = heroDied
      ? session.rewards.drops.slice(0, Math.floor(session.rewards.drops.length / 2))
      : session.rewards.drops;

    const newCoins = state.coins + session.rewards.coins;

    // dungeons.floorReached 갱신
    const curProgress = state.dungeons[session.dungeonId];
    const reached = Math.max(curProgress?.floorReached ?? 0, session.currentFloor);
    const bossesDefeated = curProgress?.bossesDefeated ?? [];
    // 보스 처치 기록 — bossDefeated reason 일 때만 (heroDied 면 보스 못 잡은 것)
    const bossFloors = [10, 20, 30];
    const isBossVictory = reason === "bossDefeated" || reason === "victory";
    const newBossesDefeated = isBossVictory
      ? [
          ...new Set([
            ...bossesDefeated,
            ...bossFloors.filter(
              (f) => f <= session.currentFloor && !bossesDefeated.includes(f),
            ),
          ]),
        ]
      : bossesDefeated;

    const dungeons = {
      ...state.dungeons,
      [session.dungeonId]: {
        dungeonId: session.dungeonId,
        floorReached: reached,
        bossesDefeated: newBossesDefeated,
      },
    };

    // inventory 추가 (사망 시 절반만)
    const newInventory = [...state.inventory, ...keptDrops];

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

    const newItem: Equipment = {
      id: `enh_${a.type}_${newRarity}_${Date.now() % 100000}_${Math.floor(Math.random() * 1000)}`,
      name: `${a.name} +`,
      type: a.type,
      rarity: newRarity,
      category: a.category,
      iconName: a.iconName,
      stats: newStats,
      effects: a.effects,
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
