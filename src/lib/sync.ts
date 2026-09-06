"use client";

import { isFirebaseConfigured, getFirebase } from "@/lib/firebase";
import { ALL_CARDS } from "@/data/cards";
import { normalizeRetentionState, stripUndefined } from "@/lib/retention";
import { normalizeSlotBlankStreak, normalizeSlotSpins } from "@/lib/upHeroSlot";
import {
  normalizeBagRowsBought,
  normalizeEquipmentPlacement,
} from "@/lib/upHeroBag";
import {
  createDefaultHero,
  DUNGEON_BY_CLASS,
  ENHANCE_GUARD_MAX,
  clampHeroXp,
} from "@/types/uphero";
import type { DailyState, UserProgress } from "@/types/game";
import type { ChallengeCard } from "@/types/card";
import type { RetentionState } from "@/types/retention";
import type {
  ClassType,
  DungeonId,
  DungeonProgress,
  EquipSlot,
  Equipment,
  Hero,
  HeroBaseStats,
  UpHeroState,
} from "@/types/uphero";
import type { Unsubscribe } from "firebase/firestore";

// 카드 ID → ChallengeCard 매핑
function hydrateCards(ids: string[]): ChallengeCard[] {
  return ids
    .map((id) => ALL_CARDS.find((c) => c.id === id))
    .filter((c): c is ChallengeCard => c !== undefined);
}

// ChallengeCard[] → ID 배열
function dehydrateCards(cards: ChallengeCard[]): string[] {
  return cards.map((c) => c.id);
}

// Firestore 데이터 → DailyState (카드 ID 배열 → 풀 객체 복원)
export function hydrateDaily(data: Record<string, unknown>): DailyState {
  return {
    // 인라인 폴백은 getTodayString()/retentionTodayString() 과 동일 로직 (데이 경계
    // 변경 시 3곳 동시 수정). 절대시간 1시간 감산 — iOS AppClock 과 동일, DST 안전.
    date: (data.date as string) || (() => { const d = new Date(Date.now() - 3600_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })(),
    drawnCards: hydrateCards((data.drawnCardIds as string[]) || []),
    selectedCards: hydrateCards((data.selectedCardIds as string[]) || []),
    completedIds: (data.completedIds as string[]) || [],
    isDrawComplete: (data.isDrawComplete as boolean) || false,
    isSelectionComplete: (data.isSelectionComplete as boolean) || false,
    rerollUsed: (data.rerollUsed as boolean) || false,
    // 추가 챌린지 시스템
    challengePhase: (data.challengePhase as "daily" | "extra" | "super") || "daily",
    extraDrawnCards: hydrateCards((data.extraDrawnCardIds as string[]) || []),
    extraSelectedCards: hydrateCards((data.extraSelectedCardIds as string[]) || []),
    extraCompletedIds: (data.extraCompletedIds as string[]) || [],
    extraDrawComplete: (data.extraDrawComplete as boolean) || false,
    extraSelectionComplete: (data.extraSelectionComplete as boolean) || false,
    superDrawnCards: hydrateCards((data.superDrawnCardIds as string[]) || []),
    superSelectedCards: hydrateCards((data.superSelectedCardIds as string[]) || []),
    superCompletedIds: (data.superCompletedIds as string[]) || [],
    superDrawComplete: (data.superDrawComplete as boolean) || false,
    superSelectionComplete: (data.superSelectionComplete as boolean) || false,
    // 실패 패널티
    hasPenalty: (data.hasPenalty as boolean) || false,
    penaltyCardId: (data.penaltyCardId as string) || null,
    // 추가 챌린지 넛지 (1일 1회 스케줄 여부)
    extraNudgeScheduled: (data.extraNudgeScheduled as boolean) || false,
  };
}

// DailyState → Firestore 저장 형식 (카드 ID만)
export function dehydrateDaily(daily: DailyState): Record<string, unknown> {
  return {
    date: daily.date,
    drawnCardIds: dehydrateCards(daily.drawnCards),
    selectedCardIds: dehydrateCards(daily.selectedCards),
    completedIds: daily.completedIds,
    isDrawComplete: daily.isDrawComplete,
    isSelectionComplete: daily.isSelectionComplete,
    rerollUsed: daily.rerollUsed,
    // 추가 챌린지 시스템
    challengePhase: daily.challengePhase,
    extraDrawnCardIds: dehydrateCards(daily.extraDrawnCards),
    extraSelectedCardIds: dehydrateCards(daily.extraSelectedCards),
    extraCompletedIds: daily.extraCompletedIds,
    extraDrawComplete: daily.extraDrawComplete,
    extraSelectionComplete: daily.extraSelectionComplete,
    superDrawnCardIds: dehydrateCards(daily.superDrawnCards),
    superSelectedCardIds: dehydrateCards(daily.superSelectedCards),
    superCompletedIds: daily.superCompletedIds,
    superDrawComplete: daily.superDrawComplete,
    superSelectionComplete: daily.superSelectionComplete,
    // 실패 패널티
    hasPenalty: daily.hasPenalty,
    penaltyCardId: daily.penaltyCardId,
    // 추가 챌린지 넛지 (1일 1회 스케줄 여부)
    extraNudgeScheduled: daily.extraNudgeScheduled,
  };
}

// --- Up Hero (갓생 영웅) 클라우드 스키마 ---

/**
 * 클라우드에 싣는 Up Hero 페이로드 — 로컬 persist 스키마(useUpHeroStore 의
 * pickPersisted)에서 currentSession 만 뺀 형태.
 *
 * currentSession 을 빼는 이유: 진행 중 던전 로그가 SESSION_LOG_PERSIST_CAP(400)
 * 줄까지 쌓여 Firestore 문서 1MB 한도와 모바일 대역폭을 위협한다. 세션은 기기 로컬
 * 상태로 두고(다른 기기에서 이어할 이유도 없다), 결산이 끝나면 코인/인벤/도감으로
 * 남으므로 동기화 손실도 없다.
 */
export type CloudUpHeroState = Partial<
  Pick<
    UpHeroState,
    | "hero"
    | "inventory"
    // Phase 6-E (Track E) — 가방 상한 초과분. 와이어 키 = "overflowDrops" (Equipment[],
    //   inventory 와 같은 디코드, [] 허용, 항상 인코딩, footprint 포함).
    //   iOS UpHeroCloudSchema CodingKeys 에 같은 철자로 있어야 한다.
    | "overflowDrops"
    | "coins"
    | "passes"
    | "dungeons"
    | "codex"
    | "cosmetics"
    | "lastIdleAccrualAt"
    | "lastSeenAt"
    | "heroStartLevel"
    // Phase 2-A (Track A) — 영웅 XP 풀. 와이어 키 = "heroXp" (정수 [0, HERO_XP_CAP]).
    //   없으면 로컬 유지(절대 지어내지 않는다), 시드된 뒤엔 0 이어도 항상 인코딩.
    //   iOS UpHeroCloudSchema CodingKeys 에 같은 철자로 있어야 한다.
    | "heroXp"
    | "shopDaily"
    | "ngPlusLevel"
    // Phase 15 — 방지권 2종 + 슬롯머신 전투 버프.
    //   와이어 키 = "destroyGuards" / "downGuards" / "combatBuff".
    //   iOS 는 CodingKeys 화이트리스트라 같은 키 이름을 반드시 함께 추가해야 한다.
    | "destroyGuards"
    | "downGuards"
    | "combatBuff"
    // 굴림틀 pity 스트릭. 와이어 키 = "slotBlankStreak" (정수 0..1000).
    | "slotBlankStreak"
    // 격자 가방 확장 — 와이어 키 = "bagRowsBought" (정수 0..4), 0 이어도 항상 인코드.
    //   상점에서만 오르는 영구 자산이라 기기를 옮겨도 그대로 따라와야 한다.
    | "bagRowsBought"
    | "weeklyVariant"
    | "schemaVersion"
    | "hasSeenCampTutorial"
    | "welcomeGrantClaimed"
  >
>;

/** 장비 슬롯 전체 — 디코드 검증 + 클라우드 인코딩의 빈 슬롯 지우기에 순회용. */
const EQUIP_SLOTS: EquipSlot[] = ["weapon", "armor", "accessory", "talisman"];

// 관용 디코드 프리미티브 — retention.ts 와 같은 계약 (타입 불일치는 throw 대신 undefined).
// 정수로 한정하지 않는다: 강화 stat 가산이 0.5 단위로 남을 수 있다.
function asFinite(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asText(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

// 도감/스킬 목록은 원소 단위로 걸러낸다 — 하나 깨졌다고 수십 개 기록을 통째로 버리지 않는다.
function asTextArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
}

function asFiniteArray(v: unknown): number[] | undefined {
  return Array.isArray(v)
    ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x))
    : undefined;
}

/** stat 맵 — 숫자 아닌 값은 버린다. NaN 하나가 전투/스탯 계산 전체로 번지는 걸 막는다. */
function normalizeStats(raw: unknown): Partial<HeroBaseStats> {
  const r = asRecord(raw);
  if (!r) return {};
  const out: Partial<HeroBaseStats> = {};
  for (const [key, value] of Object.entries(r)) {
    const n = asFinite(value);
    if (n !== undefined) out[key as keyof HeroBaseStats] = n;
  }
  return out;
}

/**
 * Equipment 1개 디코드. 식별에 필요한 최소 필드만 검증하고 나머지 필드는 원본을 보존한다.
 * 화이트리스트로 재조립하면 Equipment 에 나중에 추가되는 필드(photoId, enhanceLevel
 * 처럼 계속 늘어난다)가 클라우드 왕복에서 조용히 사라진다.
 * @returns 필수 필드가 깨졌으면 null — 호출측이 그 원소만 버린다.
 */
function normalizeEquipment(raw: unknown): Equipment | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = asText(r.id);
  const type = asText(r.type);
  if (id === undefined || type === undefined) return null;
  if (!EQUIP_SLOTS.includes(type as EquipSlot)) return null;
  const item = { ...r } as unknown as Equipment;
  // Firestore 는 값이 지워진 옵셔널 필드를 명시적 null 로 실어 보낸다. null 을 그대로
  // 두면 `photoId: null` 같은 값이 "있다" 로 읽혀 게임 로직이 밟는다. 키를 **삭제**해야
  // 한다 — undefined 를 대입하면 다음 업로드 페이로드에서 Firestore 가 throw 한다.
  const rec = item as unknown as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (rec[key] === null) delete rec[key];
  }
  item.name = asText(r.name) ?? id;
  item.stats = normalizeStats(r.stats);
  // 숫자로 신뢰하는 필드는 iOS CloudEquipment(lenientInt)와 같이 강제한다.
  // 깨진 값(예: "abc")을 그대로 두면 sellPrice 가 NaN 을 내고 coins 에 NaN 이 저장된다.
  const enhanceLevel = asFinite(r.enhanceLevel);
  if (enhanceLevel === undefined) delete item.enhanceLevel;
  else item.enhanceLevel = enhanceLevel;
  const dropFloor = asFinite(r.dropFloor);
  if (dropFloor === undefined) delete item.dropFloor;
  else item.dropFloor = dropFloor;
  // 격자 가방 좌표 계약 (upHeroBag 단일 출처, iOS CloudEquipment 와 같은 규칙).
  // 여기서 팩(백필)은 하지 않는다 — 클라우드 디코드는 iOS 와 바이트 동일해야 하고,
  // 좌표가 없는 저장본의 복구는 스토어 로드 경로(initialize / _setFromCloud)가 맡는다.
  return normalizeEquipmentPlacement(item);
}

/** Equipment 배열 디코드 — 배열이 아니면 [], 깨진 원소만 버린다. */
function normalizeEquipmentList(raw: unknown): Equipment[] {
  return Array.isArray(raw)
    ? raw
        .map((item) => normalizeEquipment(item))
        .filter((item): item is Equipment => item !== null)
    : [];
}

/**
 * Hero 관용 디코드 — 알 수 없는 필드는 보존하고, 게임 로직이 숫자/열거형으로 신뢰하는
 * 필드만 기본값으로 교정한다 (useUpHeroStore.initialize 의 defaults deep merge 와 같은 계약).
 */
function normalizeHero(raw: unknown): Hero {
  const defaults = createDefaultHero();
  const r = asRecord(raw);
  if (!r) return defaults;
  const hero = { ...defaults, ...r } as Hero;
  hero.name = asText(r.name) ?? defaults.name;
  hero.hp = asFinite(r.hp) ?? defaults.hp;
  hero.maxHp = asFinite(r.maxHp) ?? defaults.maxHp;
  hero.appearanceVariant = asFinite(r.appearanceVariant) ?? defaults.appearanceVariant;
  hero.classType =
    typeof r.classType === "string" && r.classType in DUNGEON_BY_CLASS
      ? (r.classType as ClassType)
      : null;
  hero.baseStats = { ...defaults.baseStats, ...normalizeStats(r.baseStats) };
  // 빈 슬롯은 키 자체를 생략한다 (클라우드 인코딩이 실어 보내는 명시적 null 도 여기서 걸러짐).
  const equippedRaw = asRecord(r.equipped) ?? {};
  const equipped: Hero["equipped"] = {};
  for (const slot of EQUIP_SLOTS) {
    const item = normalizeEquipment(equippedRaw[slot]);
    if (item) equipped[slot] = item;
  }
  hero.equipped = equipped;
  // 옵셔널 — 키가 있는데 깨진 경우만 교정한다 (없으면 그대로 생략).
  if ("autoSkillEnabled" in r) hero.autoSkillEnabled = asBool(r.autoSkillEnabled) ?? true;
  if ("learnedSkills" in r) hero.learnedSkills = asTextArray(r.learnedSkills) ?? [];
  if ("skillPoints" in r) hero.skillPoints = asFinite(r.skillPoints) ?? 0;
  return hero;
}

function normalizeDungeons(raw: unknown): Partial<Record<DungeonId, DungeonProgress>> {
  const r = asRecord(raw);
  if (!r) return {};
  const out: Partial<Record<DungeonId, DungeonProgress>> = {};
  for (const [id, value] of Object.entries(r)) {
    const p = asRecord(value);
    if (!p) continue;
    const floorReached = asFinite(p.floorReached) ?? 0;
    out[id as DungeonId] = {
      ...(p as unknown as DungeonProgress),
      dungeonId: (asText(p.dungeonId) ?? id) as DungeonId,
      floorReached,
      // initialize 의 backfill 과 동일 — 없으면 floorReached 로 채운다.
      bestFloorReached: asFinite(p.bestFloorReached) ?? floorReached,
      bossesDefeated: asFiniteArray(p.bossesDefeated) ?? [],
    };
  }
  return out;
}

function normalizeCodex(raw: unknown): UpHeroState["codex"] {
  const r = asRecord(raw) ?? {};
  return {
    monsters: asTextArray(r.monsters) ?? [],
    equipment: asTextArray(r.equipment) ?? [],
    bosses: asTextArray(r.bosses) ?? [],
  };
}

function normalizePasses(raw: unknown): UpHeroState["passes"] {
  const r = asRecord(raw);
  if (!r) return {};
  const out: UpHeroState["passes"] = {};
  for (const [id, value] of Object.entries(r)) {
    const n = asFinite(value);
    // 0 도 키를 남긴다: setDoc(merge) 는 중첩 맵을 키 단위로 병합하므로 키를 빼면
    // 클라우드에 남아 있던 예전 잔고가 되살아난다.
    if (n === undefined) continue;
    out[id as DungeonId] = Math.max(0, Math.floor(n));
  }
  return out;
}

function normalizeCosmetics(raw: unknown): UpHeroState["cosmetics"] {
  const r = asRecord(raw);
  if (!r) return {};
  const out: UpHeroState["cosmetics"] = {};
  const tentColor = asText(r.tentColor);
  if (tentColor !== undefined) out.tentColor = tentColor;
  const campfire = asText(r.campfire);
  if (campfire !== undefined) out.campfire = campfire;
  return out;
}

// 날짜가 없으면 의미 없는 카운터 — 키를 생략해 initialize 가 오늘 날짜로 다시 seed 하게 둔다.
function normalizeShopDaily(raw: unknown): UpHeroState["shopDaily"] {
  const r = asRecord(raw);
  const date = r ? asText(r.date) : undefined;
  if (!r || date === undefined) return undefined;
  const shopDaily: NonNullable<UpHeroState["shopDaily"]> = {
    date,
    passesBought: Math.max(0, Math.floor(asFinite(r.passesBought) ?? 0)),
  };
  const coinPouchClaimed = asBool(r.coinPouchClaimed);
  if (coinPouchClaimed !== undefined) shopDaily.coinPouchClaimed = coinPouchClaimed;
  // 오늘 굴림틀 횟수. 와이어 키 = "slotSpins" (정수 0..100). 키가 없는 옛 문서는 0.
  //   항상 채운다 — 인코드도 항상 실으므로(아래 encodeUpHeroForCloud) 왕복 뒤 모양이 같다.
  shopDaily.slotSpins = normalizeSlotSpins(r.slotSpins);
  return shopDaily;
}

/**
 * Phase 15 — 방지권 개수를 [0, ENHANCE_GUARD_MAX] 정수로 교정.
 * useUpHeroStore.clampGuards 와 같은 계약이다 (한쪽만 고치지 말 것).
 */
function clampGuardCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(ENHANCE_GUARD_MAX, Math.floor(n)));
}

/**
 * Phase 15 — 슬롯머신 전투 버프.
 *
 * 만료됐거나 값이 깨졌으면 **키를 생략하지 않고** {pct:0, battlesLeft:0} 을 싣는다.
 * setDoc(merge) 는 중첩 맵을 키 단위로 병합하므로, 키를 빼면 클라우드에 남아 있던
 * 예전 버프가 그대로 살아 기기를 옮길 때마다 부활한다 (hero.equipped 빈 슬롯을
 * null 로 지우는 것과 같은 이유). 0 껍데기는 읽는 쪽(useUpHeroStore)이 undefined
 * 로 접는다.
 */
function normalizeCombatBuff(raw: unknown): { pct: number; battlesLeft: number } {
  const r = asRecord(raw);
  const pct = r ? (asFinite(r.pct) ?? 0) : 0;
  const left = r ? Math.floor(asFinite(r.battlesLeft) ?? 0) : 0;
  if (pct <= 0 || left <= 0) return { pct: 0, battlesLeft: 0 };
  // 상한은 스토어와 같은 값 — 손상된 값이 전투 밸런스를 뒤집지 않게.
  // pct 는 퍼센트 포인트다 (10 = +10%). 상한 100 = 배율 2배.
  return { pct: Math.min(100, pct), battlesLeft: Math.min(20, left) };
}

// week/affixId 가 깨졌으면 키를 생략 — initialize 가 이번 주 affix 를 새로 뽑는다.
function normalizeWeeklyVariant(raw: unknown): UpHeroState["weeklyVariant"] {
  const r = asRecord(raw);
  const week = r ? asText(r.week) : undefined;
  const affixId = r ? asText(r.affixId) : undefined;
  if (!r || week === undefined || affixId === undefined) return undefined;
  const variant: NonNullable<UpHeroState["weeklyVariant"]> = {
    week,
    affixId,
    clearedDungeons: (asTextArray(r.clearedDungeons) ?? []) as DungeonId[],
    bestScore: Math.max(0, asFinite(r.bestScore) ?? 0),
  };
  const lastUploadedAt = asFinite(r.lastUploadedAt);
  if (lastUploadedAt !== undefined) variant.lastUploadedAt = lastUploadedAt;
  return variant;
}

/**
 * "이 스냅샷에 Up Hero 를 만진 흔적이 있는가" 판정.
 * useUpHeroStore.initialize 의 hasPlayedUpHero 와 같은 기준(인벤/도감/세션/던전/
 * 탐험권/코인/꾸미기)이다. 두 곳에서 쓴다:
 *  - 업로드 게이트: 빈 상태를 올려 클라우드의 코인·인벤을 0/[] 로 덮지 않게
 *    (retention 의 lastCheckInDate 게이트와 같은 방어선)
 *  - 복원 게이트: 흔적 없는 클라우드 값을 채택해 로컬 seed 를 망가뜨리지 않게
 */
export function hasUpHeroFootprint(raw: unknown): boolean {
  const r = asRecord(raw);
  if (!r) return false;
  if (Array.isArray(r.inventory) && r.inventory.length > 0) return true;
  // 넘친 전리품도 플레이 흔적이다 — 정산을 거쳐야만 생긴다.
  if (Array.isArray(r.overflowDrops) && r.overflowDrops.length > 0) return true;
  const codex = asRecord(r.codex);
  if (codex) {
    for (const key of ["monsters", "bosses", "equipment"]) {
      const list = codex[key];
      if (Array.isArray(list) && list.length > 0) return true;
    }
  }
  // currentSession 은 클라우드 페이로드엔 없지만 로컬 저장본 판정에는 쓰인다.
  if (r.currentSession != null) return true;
  const dungeons = asRecord(r.dungeons);
  if (dungeons && Object.keys(dungeons).length > 0) return true;
  const passes = asRecord(r.passes);
  if (passes && Object.values(passes).some((n) => (asFinite(n) ?? 0) > 0)) return true;
  if ((asFinite(r.coins) ?? 0) > 0) return true;
  // 방지권은 드롭이나 코인으로만 생긴다 — 보유 자체가 플레이 흔적이다.
  if ((asFinite(r.destroyGuards) ?? 0) > 0) return true;
  if ((asFinite(r.downGuards) ?? 0) > 0) return true;
  // 가방 확장은 코인을 써야만 는다 — 갓 설치한 기기에서는 절대 0 이 아닐 수 없다.
  if (normalizeBagRowsBought(r.bagRowsBought) > 0) return true;
  const cosmetics = asRecord(r.cosmetics);
  if (cosmetics && Object.keys(cosmetics).length > 0) return true;
  return false;
}

/**
 * 클라우드/로컬 Up Hero 스냅샷을 관용적으로 디코드 (normalizeRetentionState 와 같은 계약).
 * 필드 하나가 깨져도 나머지는 살리고 깨진 필드만 기본값으로 채운다 — 손상 하나로
 * 코인·영웅·인벤토리 전체를 버리는 일이 없어야 한다.
 *
 * 클라우드로 나가는 쓰기도 이 함수를 통과시킨다: 로컬/원격이 같은 와이어 포맷을 쓰고,
 * 오염된 로컬 저장본이 그대로 업로드되지 않으며, currentSession 은 읽지 않으므로
 * 통과만으로 제거된다.
 */
export function normalizeUpHeroState(raw: unknown): CloudUpHeroState {
  const r = asRecord(raw) ?? {};
  const state: CloudUpHeroState = {
    hero: normalizeHero(r.hero),
    inventory: normalizeEquipmentList(r.inventory),
    // Phase 6-E — inventory 와 같은 디코드. 키가 없거나 배열이 아니면 [].
    overflowDrops: normalizeEquipmentList(r.overflowDrops),
    coins: Math.max(0, Math.floor(asFinite(r.coins) ?? 0)),
    passes: normalizePasses(r.passes),
    dungeons: normalizeDungeons(r.dungeons),
    codex: normalizeCodex(r.codex),
    cosmetics: normalizeCosmetics(r.cosmetics),
    // 값이 깨졌으면 now — 과거 timestamp 를 지어내 거대한 idle reward 를 만들지 않는다.
    lastIdleAccrualAt: asFinite(r.lastIdleAccrualAt) ?? Date.now(),
    ngPlusLevel: Math.max(0, Math.floor(asFinite(r.ngPlusLevel) ?? 0)),
    // Phase 15 — 방지권 2종. coins 와 같은 이유로 키를 항상 남긴다: 0 에서 키를
    //   빼면 setDoc(merge) 가 클라우드에 남은 예전 개수를 되살려, 다 쓴 방지권이
    //   기기를 옮길 때마다 부활한다.
    //   음수·소수·상한 초과는 여기서 잘라낸다 (useUpHeroStore.clampGuards 와 같은 계약).
    //   레거시 `protectCharms`(단일 보호 소모품 시절 키)는 소실방지권으로 읽어준다 —
    //   그 시절 저장본이 남아 있어도 보유가 0 으로 증발하지 않게 한다.
    destroyGuards: clampGuardCount(
      asFinite(r.destroyGuards) ?? asFinite(r.protectCharms) ?? 0,
    ),
    downGuards: clampGuardCount(asFinite(r.downGuards) ?? 0),
    combatBuff: normalizeCombatBuff(r.combatBuff),
    // 굴림틀 pity 스트릭 — 키를 항상 남긴다. 보상 뒤 0 리셋이 merge 에서 빠지면
    //   클라우드의 옛 스트릭이 되살아나 받을 자격이 없는 pity 가 발동한다.
    //   레거시(키 없음)·손상 값은 0, 정수 [0, SLOT_BLANK_STREAK_MAX] 로 접는다.
    slotBlankStreak: normalizeSlotBlankStreak(r.slotBlankStreak),
    // 가방 확장 — slotBlankStreak 와 같은 이유로 0 에서도 키를 남긴다. 로그아웃/초기화로
    //   0 이 된 상태에서 키가 빠지면 merge 가 클라우드의 옛 행 수를 되살린다.
    //   레거시(키 없음)·손상 값은 0, 정수 [0, BAG_ROWS_BUYABLE] 로 접는다.
    bagRowsBought: normalizeBagRowsBought(r.bagRowsBought),
    hasSeenCampTutorial: asBool(r.hasSeenCampTutorial) ?? false,
    welcomeGrantClaimed: asBool(r.welcomeGrantClaimed) ?? false,
  };
  // 옵셔널 — 값이 없으면 키를 생략한다. "필드 부재 = 로컬 유지" 계약(_setFromCloud)
  // 을 지키려면 undefined 를 실어 보내면 안 된다.
  const lastSeenAt = asFinite(r.lastSeenAt);
  if (lastSeenAt !== undefined) state.lastSeenAt = lastSeenAt;
  const schemaVersion = asFinite(r.schemaVersion);
  if (schemaVersion !== undefined) state.schemaVersion = schemaVersion;
  const shopDaily = normalizeShopDaily(r.shopDaily);
  if (shopDaily !== undefined) state.shopDaily = shopDaily;
  const weeklyVariant = normalizeWeeklyVariant(r.weeklyVariant);
  if (weeklyVariant !== undefined) state.weeklyVariant = weeklyVariant;

  // heroStartLevel — 영웅 레벨의 기준점 (영웅 Lv = 챌린지 Lv - heroStartLevel + 1).
  // 값이 없는데 플레이 흔적이 있으면 legacy 저장본이므로 1 로 채운다. initialize 의
  // `hasPlayedUpHero ? 1 : curLevel` 판정과 같은 결론이며, 이걸 생략하면 복원한 기기의
  // heroStartLevel(신규 seed = 현재 챌린지 Lv)이 남아 영웅 Lv 가 1 로 주저앉는다.
  const heroStartLevel = asFinite(r.heroStartLevel);
  if (heroStartLevel !== undefined) {
    state.heroStartLevel = Math.max(1, Math.floor(heroStartLevel));
  } else if (hasUpHeroFootprint(state)) {
    state.heroStartLevel = 1;
  }
  // heroXp — 영웅 XP 풀 (Phase 2-A). 키가 있을 때만 싣고 [0, HERO_XP_CAP] 정수로 접는다.
  // 구 클라이언트 문서(키 없음)는 생략 → _setFromCloud 가 undefined 로 두고 ensureHeroXp
  // 가 progress.level 로 시드한다. 여기서 0 이나 레거시 공식으로 지어내면 두 기기의
  // 풀이 서로를 덮는다 (mergeCloudHeroXp 의 단조 병합 전제가 깨진다).
  const heroXp = asFinite(r.heroXp);
  if (heroXp !== undefined) state.heroXp = clampHeroXp(heroXp);
  return state;
}

/**
 * 클라우드 쓰기 직전 인코딩 — 맵 필드의 "빈 자리" 를 명시적 null/false 로 채운다.
 *
 * setDoc(merge: true) 는 중첩 맵을 키 단위로 병합한다. 장비를 해제해 hero.equipped
 * 에서 키가 사라지면 클라우드엔 예전 키가 그대로 남아, 복원한 기기에서 유령 장비가
 * 되살아난다 (인벤토리에도 있고 장착도 돼 있는 상태). 빈 슬롯을 null 로 실어 지운다.
 * shopDaily.coinPouchClaimed 도 같은 이유 — 날짜가 바뀌며 키가 빠지면 어제의 true 가
 * 남아 오늘 코인 주머니를 못 받는다. shopDaily.slotSpins 도 같다 — 키가 빠지면
 * 어제 굴린 횟수가 남아 오늘 굴림틀이 상한에 막힌다.
 * 디코드(normalizeUpHeroState)는 null 슬롯/false/0 을 정상 처리한다.
 *
 * export 는 테스트용 — 런타임 호출자는 이 모듈 안(syncToCloud/uploadLocalData)뿐이다.
 */
export function encodeUpHeroForCloud(state: CloudUpHeroState): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...state };
  if (state.hero) {
    const equipped: Record<string, unknown> = {};
    for (const slot of EQUIP_SLOTS) equipped[slot] = state.hero.equipped?.[slot] ?? null;
    payload.hero = { ...state.hero, equipped };
  }
  if (state.shopDaily) {
    payload.shopDaily = { coinPouchClaimed: false, slotSpins: 0, ...state.shopDaily };
  }
  return payload;
}

// --- SyncManager ---

let unsubscribe: Unsubscribe | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSyncData: Record<string, unknown> = {};
let currentUid: string | null = null;

// 클라우드에서 로컬로 업데이트할 때 루프 방지 플래그
let isUpdatingFromCloud = false;

// 디바운스 중인 로컬 write 존재 여부
// Firestore의 hasPendingWrites보다 먼저 true가 되어, 디바운스 대기 중에 도착한
// stale cloud snapshot이 로컬 변경을 덮어쓰는 race condition을 방지
let hasLocalPendingWrite = false;

// flushSync 실패 시 재시도 타이머 — 네트워크 복구 후 자동으로 다시 시도해서
// 실패한 write 때문에 클라우드 snapshot이 영원히 suppress되는 상황을 방지한다.
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
const MAX_RETRY_ATTEMPTS = 6;
function computeRetryDelay(attempt: number): number {
  // 1s → 2s → 4s → 8s → 16s → 30s (cap)
  return Math.min(30_000, 1_000 * 2 ** attempt);
}

// 앱 시작 시 Auth 확인 완료 전까지 클라우드 동기화 차단
let isSyncReady = false;

export function setSyncReady(ready: boolean): void {
  isSyncReady = ready;
}
export function isCloudUpdate(): boolean {
  return isUpdatingFromCloud;
}

// Firestore 모듈 캐시 (동적 import 1회만)
let _firestoreMod: typeof import("firebase/firestore") | null = null;
async function getFirestoreMod() {
  if (!_firestoreMod) {
    _firestoreMod = await import("firebase/firestore");
  }
  return _firestoreMod;
}

// 리스너 시작: Firestore 문서 변경 감지 → 콜백 호출
//   retention 인자 (트랙 2-1): 문서에 retention 필드가 없거나 null 이면 null 을
//   전달한다. null 은 "필드 부재 = 로컬 유지" 신호 (iOS cloudRetention ?? retention
//   폴백과 동일). 존재하면 normalizeRetentionState 관용 디코드를 거친 값.
//   uphero 인자도 같은 계약 — 채택 여부는 SyncProvider 가 판단한다 (한 방향 병합).
export async function startListener(
  uid: string,
  onCloudUpdate: (
    progress: UserProgress,
    daily: DailyState,
    retention: RetentionState | null,
    uphero: CloudUpHeroState | null,
  ) => void,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  stopListener();
  currentUid = uid;

  const { db } = await getFirebase();
  const { doc, onSnapshot } = await getFirestoreMod();

  const docRef = doc(db, "users", uid);
  unsubscribe = onSnapshot(docRef, (snapshot) => {
    const data = snapshot.data();
    if (!data) return;
    if (snapshot.metadata.hasPendingWrites) return;
    if (isUpdatingFromCloud) return;
    // 디바운스 대기 중인 로컬 write가 있으면 stale cloud snapshot 무시
    // (flushSync 후 새 snapshot이 오면 정상 처리됨)
    if (hasLocalPendingWrite) return;

    // Phase 13 review #14 — onSnapshot 이전엔 data.progress 무검증 cast 로
    //   바로 local state 덮어씀. 손상된 Firestore snapshot 이 local 을 blow
    //   away 가능. getCloudData 와 동일한 isValidProgress 가드 추가.
    if (!isValidProgress(data.progress)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[sync] onSnapshot: invalid progress shape, skipping");
      }
      return;
    }

    isUpdatingFromCloud = true;
    Promise.resolve().then(() => {
      try {
        const progress = data.progress as UserProgress;
        const daily = hydrateDaily((data.daily as Record<string, unknown>) || {});
        // retention 손상은 progress 동기화를 막지 않는다: isValidProgress 와 달리
        // per-field 관용 디코드로 항상 사용 가능한 상태를 만든다.
        const retention = data.retention == null ? null : normalizeRetentionState(data.retention);
        const uphero = data.uphero == null ? null : normalizeUpHeroState(data.uphero);
        onCloudUpdate(progress, daily, retention, uphero);
      } finally {
        isUpdatingFromCloud = false;
      }
    });
  });
}

// 리스너 정지
export function stopListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  currentUid = null;
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempt = 0;
  pendingSyncData = {};
  hasLocalPendingWrite = false;
}

// 로컬 → 클라우드 동기화 (디바운스 300ms)
export function syncToCloud(key: string, value: unknown): void {
  if (!isFirebaseConfigured || !currentUid || isUpdatingFromCloud || !isSyncReady) return;

  if (key === "progress") {
    pendingSyncData.progress = value;
  } else if (key === "daily") {
    pendingSyncData.daily = dehydrateDaily(value as DailyState);
  } else if (key === "onboarding_complete") {
    pendingSyncData.onboardingComplete = value;
  } else if (key === "retention") {
    // uploadLocalData 와 동일한 lastCheckInDate 게이트: 체크인 기록이 없는 상태
    // (주간 리포트만 백필된 fresh retention 등)는 클라우드에 이득이 없고, merge 로
    // iOS 가 기록한 currentLightStreak/checkInDates 를 0/[] 로 덮는 위험만 있다.
    // 키를 아예 싣지 않아 클라우드 값을 보존한다 (P0 클로버 방어 2중선).
    if ((value as RetentionState | undefined)?.lastCheckInDate === undefined) return;
    // stripUndefined 필수: 옵셔널(lastCheckInDate 등)이 undefined 로 실려오면
    // Firestore JS SDK 가 throw 한다. 키 생략이 iOS Swift 의 nil 생략과 같은
    // 와이어 포맷을 만든다 (src/lib/retention.ts 참고).
    pendingSyncData.retention = stripUndefined(value);
  } else if (key === "uphero") {
    // 진행 중 던전 세션(currentSession)은 싣지 않는다 — normalizeUpHeroState 가 그
    // 필드를 읽지 않으므로 통과시키는 것만으로 빠진다 (CloudUpHeroState 주석 참고).
    const uphero = normalizeUpHeroState(value);
    // 흔적 없는 빈 상태는 올리지 않는다: merge 로 클라우드의 코인·인벤을 0/[] 로
    // 덮는 위험만 있고 이득이 없다 (retention 의 lastCheckInDate 게이트와 같은 방어선).
    // 아지트를 한 번도 안 연 세션에서 initialize 가 기본값을 저장하는 경로가 실제로 있다.
    if (!hasUpHeroFootprint(uphero)) return;
    pendingSyncData.uphero = encodeUpHeroForCloud(uphero);
  }

  // 로컬에 pending write가 있음을 표시 — 이 동안 stale cloud snapshot 무시
  hasLocalPendingWrite = true;

  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    flushSync();
  }, 300);
}

async function flushSync(): Promise<void> {
  if (!currentUid || Object.keys(pendingSyncData).length === 0) {
    hasLocalPendingWrite = false;
    return;
  }

  const { db } = await getFirebase();
  const { doc, setDoc, serverTimestamp } = await getFirestoreMod();

  const dataToSync = { ...pendingSyncData };
  const docRef = doc(db, "users", currentUid);
  let success = false;
  try {
    // stripUndefined: progress 는 원본 in-memory 객체가 그대로 실려오므로
    // (예: 일일 롤오버 DayRecord 의 옵셔널 필드) undefined 값 키가 남아 있으면
    // setDoc 전체가 throw → 같은 배치의 retention/daily 까지 클라우드에 못 간다.
    // meta 는 serverTimestamp 센티널이 재귀 복사에 깨지므로 밖에서 합친다.
    await setDoc(
      docRef,
      {
        ...stripUndefined(dataToSync),
        meta: {
          lastSyncedAt: serverTimestamp(),
          lastDeviceId: getDeviceId(),
        },
      },
      { merge: true },
    );
    success = true;
    markBackupSucceeded();
    for (const key of Object.keys(dataToSync)) {
      if (pendingSyncData[key] === dataToSync[key]) {
        delete pendingSyncData[key];
      }
    }
  } catch (error) {
    console.error("Failed to sync to cloud:", error);
  } finally {
    // 성공/실패 상관없이 플래그 정리
    // 새로 쌓인 pending write가 있으면 유지, 없으면 클리어
    hasLocalPendingWrite = Object.keys(pendingSyncData).length > 0;
  }

  if (success) {
    // 성공 — 재시도 카운터 리셋
    retryAttempt = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  } else if (hasLocalPendingWrite && currentUid) {
    // 실패 — 지수 backoff로 재시도 예약. 이렇게 해야 네트워크 복구 후
    // pending write가 eventually 성공해서 hasLocalPendingWrite가 내려가고,
    // 클라우드 snapshot suppression이 영구히 이어지지 않는다.
    if (retryAttempt < MAX_RETRY_ATTEMPTS) {
      const delay = computeRetryDelay(retryAttempt);
      retryAttempt += 1;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void flushSync();
      }, delay);
    } else {
      // 최대 재시도 소진 — 데이터 손실을 막기 위해 pending 데이터는 보존하되,
      // snapshot suppression은 해제해서 읽기 경로는 회복시킨다. 다음 로컬 write가
      // 들어오면 새 syncToCloud 호출이 다시 pending + 재시도를 킥오프한다.
      console.error(
        "Max sync retries exhausted; releasing snapshot suppression to avoid permanent read lock.",
      );
      hasLocalPendingWrite = false;
      retryAttempt = 0;
    }
  }
}

/**
 * 디바운스를 기다리지 않고 pending write 를 즉시 flush.
 * pagehide/visibilitychange(hidden) 훅용 — 체크인 직후 300ms 디바운스 창 안에서
 * 탭을 닫으면 write 가 유실되는 문제를 줄인다 (웹 Firestore JS 는 iOS 와 달리
 * 오프라인 영속이 기본 비활성이라 큐가 재시작을 못 넘긴다). best-effort:
 * 언로드 중 네트워크 완료는 보장되지 않지만 유실 창을 실질적으로 좁힌다.
 */
export function flushPendingSync(): void {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  if (Object.keys(pendingSyncData).length === 0) return;
  void flushSync();
}

// 로컬 데이터를 클라우드에 초기 업로드.
//   P1 — uploadLocalData 는 syncToCloud 디바운스를 우회하므로, 별도로
//   `hasLocalPendingWrite` 플래그를 잡았다 풀어야 startListener 의 첫
//   onSnapshot emit 이 stale 빈 doc 으로 로컬을 덮어쓰는 race 를 차단할 수 있다.
//   유저 피드백: "로그인 직후 0일차 됨".
export async function uploadLocalData(
  uid: string,
  progress: UserProgress,
  daily: DailyState,
  retention?: RetentionState,
  uphero?: CloudUpHeroState,
): Promise<void> {
  if (!isFirebaseConfigured) return;

  const { db } = await getFirebase();
  const { doc, setDoc, serverTimestamp } = await getFirestoreMod();

  // 트랙 2-0/2-1: retention 은 로컬에 체크인 기록(lastCheckInDate)이 있을 때만
  // 포함한다. 없으면 키 자체를 생략해 merge 가 iOS 가 기록한 클라우드 retention
  // 값을 보존한다 (fresh 상태 업로드가 iOS 불꽃 스트릭을 0 으로 덮는 것 방지).
  const includeRetention =
    retention !== undefined && retention.lastCheckInDate !== undefined;

  // Up Hero 도 같은 원리 — 흔적(코인/인벤/도감/던전/탐험권)이 없는 빈 상태면 키를
  // 생략해 클라우드의 영웅 데이터를 merge 로 덮지 않는다.
  const upheroPayload =
    uphero !== undefined && hasUpHeroFootprint(uphero)
      ? stripUndefined(encodeUpHeroForCloud(uphero))
      : null;

  hasLocalPendingWrite = true;
  try {
    const docRef = doc(db, "users", uid);
    // merge: true — iOS SyncManager 가 기록한 retention 등 다른 필드를 보존한다.
    // (merge 없는 setDoc 은 문서 전체 덮어쓰기 → iOS 불꽃 스트릭이 삭제되는 크로스 플랫폼 버그)
    // stripUndefined — progress 의 DayRecord 옵셔널 등 undefined 값 키가 있으면
    // Firestore JS SDK 가 throw 한다 (flushSync 와 동일 방어, meta 센티널은 제외).
    await setDoc(
      docRef,
      {
        // progress 는 통째로 올라간다 — pendingFullPacks 등 새 키는 allowlist 없이 그대로 실린다
        // (iOS Models/Game.swift UserProgress 가 lenient decode 로 미러).
        progress: stripUndefined(progress),
        daily: stripUndefined(dehydrateDaily(daily)),
        ...(includeRetention ? { retention: stripUndefined(retention) } : {}),
        ...(upheroPayload ? { uphero: upheroPayload } : {}),
        onboardingComplete: true,
        meta: {
          createdAt: serverTimestamp(),
          lastSyncedAt: serverTimestamp(),
          lastDeviceId: getDeviceId(),
        },
      },
      { merge: true }
    );
    markBackupSucceeded();
  } finally {
    hasLocalPendingWrite = false;
  }
}

// 클라우드 데이터 최소 검증.
//   Phase 14 code-review Medium #17 — 이전엔 `Array.isArray(unlockedCardIds)` 만
//   체크해 배열 요소가 string 이 아닐 때 (e.g. corrupted doc 이 number 나 null 혼입)
//   후속 `.map(id => CARDS[id])` 가 undefined 반환 → UI crash. 요소 type 까지 검증.
export function isValidProgress(data: unknown): data is UserProgress {
  if (!data || typeof data !== "object") return false;
  const p = data as Record<string, unknown>;
  if (typeof p.totalDaysCompleted !== "number") return false;
  if (!Array.isArray(p.unlockedCardIds)) return false;
  // 요소 샘플링: 전체 배열 iterate 는 보통 수 십 개 수준이라 full check O(N) 감수.
  for (const id of p.unlockedCardIds) {
    if (typeof id !== "string") return false;
  }
  return true;
}

/**
 * 클라우드 사용자 문서 로드 결과 — iOS SyncManager.CloudLoad 의 3상태 미러.
 *  - "notFound": 문서 없음 (진짜 신규 계정 → 로컬 업로드 가능)
 *  - "invalid": 문서는 있으나 progress 손상 (기존 데이터 보호 — 절대 덮어쓰기 금지,
 *    업로드하면 merge 라도 progress/daily/retention 이 로컬 값으로 덮인다)
 */
export type CloudDataResult =
  | {
      progress: UserProgress;
      daily: DailyState;
      retention: RetentionState | null;
      uphero: CloudUpHeroState | null;
    }
  | "notFound"
  | "invalid";

// 클라우드에 기존 데이터가 있는지 확인
//   retention / uphero: 필드 부재/null 이면 null (로컬 유지 신호), 존재하면 관용 디코드 값.
export async function getCloudData(uid: string): Promise<CloudDataResult> {
  if (!isFirebaseConfigured) return "notFound";

  const { db } = await getFirebase();
  const { doc, getDoc } = await getFirestoreMod();

  const docRef = doc(db, "users", uid);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return "notFound";

  const data = snapshot.data();
  if (!isValidProgress(data.progress)) {
    console.warn("Invalid cloud progress data, ignoring");
    return "invalid";
  }
  return {
    progress: data.progress as UserProgress,
    daily: hydrateDaily((data.daily as Record<string, unknown>) || {}),
    retention: data.retention == null ? null : normalizeRetentionState(data.retention),
    uphero: data.uphero == null ? null : normalizeUpHeroState(data.uphero),
  };
}

// 클라우드 데이터 삭제
export async function deleteCloudData(uid: string): Promise<void> {
  if (!isFirebaseConfigured) return;

  const { db } = await getFirebase();
  const { doc, deleteDoc } = await getFirestoreMod();

  const docRef = doc(db, "users", uid);
  await deleteDoc(docRef);
}

// 기기 ID (간단한 랜덤)
function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("upnext_device_id");
  if (!id) {
    id = Math.random().toString(36).substring(2, 10);
    localStorage.setItem("upnext_device_id", id);
  }
  return id;
}

/**
 * P3 — 마지막 클라우드 백업 성공 시각 (ms epoch).
 *
 * Settings / AuthSection 에서 "마지막 백업: N분 전" 표시용.
 * - flushSync 성공 / uploadLocalData 성공 시점에 갱신.
 * - 클라우드의 meta.lastSyncedAt 은 serverTimestamp 라 round-trip 후에야 읽을 수
 *   있으므로 로컬 시각으로 별도 저장 (사용자에게 보여줄 용도로는 충분).
 */
const LAST_BACKUP_KEY = "upnext_last_backup_at";

function markBackupSucceeded(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    /* storage full / private mode — silently ignore */
  }
}

export function getLastBackupAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
