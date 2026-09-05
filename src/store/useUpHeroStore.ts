/**
 * Up Hero store — zustand.
 *
 * 영속 데이터 (localStorage "uphero"): hero, inventory, coins, passes, dungeons, codex, cosmetics.
 * currentSession 도 저장 (resume 용).
 *
 * Phase 2-A (Track A) — 영웅 XP/레벨은 이 스토어의 `heroXp` 풀이 source of truth 다.
 *   계정 XP(useGameStore.progress)와 완전히 분리됐다: 던전 정산과 방치 보상은
 *   heroXp 에만 더하고, 챌린지 완료는 영웅에게 아무것도 주지 않는다.
 *   스킬 포인트는 레벨에서 파생(`deriveSkillPoints`)하며 별도 지급 카운터가 없다.
 */

import { create } from "zustand";
import { saveToStorage, loadFromStorage } from "@/lib/storage";
import { rng } from "@/lib/upHeroRng";
import {
  createDefaultHero,
  computeHeroForLevel,
  CLASS_BY_DUNGEON,
  PASS_GRANT_BY_RARITY,
  PASS_CAP_PER_CATEGORY,
  SHOP_PRICES,
  SELL_PRICE,
  MAX_ENHANCE_LEVEL,
  ENHANCE_GUARD_MAX,
  enhanceOutcomeRates,
  DAILY_PASS_PURCHASE_CAP,
  COIN_POUCH_MIN,
  COIN_POUCH_MAX,
  WELCOME_GRANT_COINS,
  enhanceSuccessRate,
  enhanceCost,
  getISOWeekId,
  computeWeeklyScore,
  type UpHeroState,
  type DungeonId,
  type DungeonProgress,
  type ClassType,
  type Equipment,
  type EquipSlot,
  type CombatSession,
  type CardBuff,
  type HeroBaseStats,
  type Monster,
  type Hero,
  getEffectiveHeroLevel,
  heroTotalXPForLevel,
  heroLevelFromXP,
  resolveHeroLevel,
  skillPointsTotalForLevel,
  clampHeroXp,
} from "@/types/uphero";
import { pickWeeklyAffix } from "@/data/weeklyAffixes";
import type { Category } from "@/types/card";
import type { Rarity } from "@/types/card";
import { DAILY_CARDMATCH_TICKET_CAP } from "@/types/game";
import {
  createSession as buildSession,
  tickSession as stepSession,
  resolveChoice as applyChoice,
  abandonSession as abandon,
  canSpinSlot,
} from "@/lib/upHeroCombat";
import { SLOT_EVENT } from "@/data/flavor/slot";
import { drawBuffCards } from "@/lib/buffDraw";
import {
  SLOT_DAILY_SPIN_CAP,
  normalizeSlotBlankStreak,
  nextSlotBlankStreak,
  normalizeSlotSpins,
  type SlotOutcomeId,
} from "@/lib/upHeroSlot";
import {
  calculateKeptDrops,
  calculateBossesDefeated,
  calculateCodexDelta,
  calculateDungeonProgress,
  computeWeeklyClearReward,
  resolveStartFloor,
} from "@/lib/sessionReward";
import { calculateIdleReward, detectClockRewind } from "@/lib/idleAccrual";
import {
  classXpMult,
  classCoinMult,
  findLastEncounterIndex,
  computeMonsterHp,
  resolveMinigame as applyResolveMinigame,
  normalizeSessionForLoad,
} from "@/lib/upHeroCombat";
import {
  findSkillById,
  canFireSkill,
  fireSkill,
  CLASS_SKILL_TREES,
  NOVICE_SKILLS,
} from "@/lib/classSkills";
import {
  PHOTO_TALISMAN_RITUAL_COST,
  buildPhotoTalisman,
  findBoundPhotoTalisman,
  isPhotoBound,
  rebuildPhotoTalismanWithLevel,
  rebindPhotoTalismanCost,
  rollPhotoRarity,
} from "@/lib/photoTalisman";
import { useGrowthStore } from "./useGrowthStore";
import { getCardBuff } from "@/data/cardBuffs";
import { ALL_CARDS } from "@/data/cards";
import { ALL_MONSTER_TEMPLATES } from "@/data/upHeroMonsters";
import { findTemplateByLegacyId } from "@/data/upHeroEquipment";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { useGameStore, getTodayString } from "./useGameStore";
import { t } from "@/i18n";
import type { Language } from "@/types/game";
import type { CloudUpHeroState } from "@/lib/sync";

/**
 * Phase 5a.3 / 5b.2 / 9d / 11a / 11c — 저장 스키마 현재 버전.
 *
 * v1: codex.monsters/bosses 를 monster.name 기반으로 전환 (legacy 는 instance ID)
 * v2: codex.equipment 를 template baseName 기반으로 전환 (legacy 는 instance ID)
 * v3: heroStartLevel seed — 영웅 레벨을 챌린지 레벨과 분리.
 * v4: shopDaily seed — 상점 하루 탐험권 구매 cap.
 * v5: ngPlusLevel seed (0) + weeklyVariant 는 initialize 에서 이번 주 id 로 갱신.
 *     기존 유저도 F30 처음 처치 시점부터 NG+ 자연 해금.
 * v6: (Phase 2-A, Track A) heroXp seed — 영웅 XP 풀을 계정 XP 에서 분리.
 *     `heroXp === undefined` 이면 `heroTotalXPForLevel(레거시 영웅 Lv)` 로 시드
 *     (Lv47 → 39,031). progress.level 을 읽을 수 없으면 미시드로 두고
 *     `ensureHeroXp` 가 나중에 채운다 (0 으로 시드하는 경로 없음).
 *     hero.skillPoints 는 레벨 파생값으로 재계산 (`reconcileSkillPoints`).
 *
 * 마이그레이션 순서(공통 규칙): v1/v2 코덱스 → [E, <7 예정] 장비 수리 →
 *   [C] normalizeSessionForLoad → heroStartLevel seed → [A] heroXp seed →
 *   shopDaily/weeklyVariant/dungeons 백필 → set → [A] reconcile → 안전망 → persist.
 */
const CURRENT_SCHEMA_VERSION = 6;

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

/**
 * Phase 15 — 탐험권 사용 정책.
 *
 * 탐험권은 `passes: Partial<Record<DungeonId, number>>` 로 **카테고리별** 저장되지만,
 * UI (홈 PrimaryCTA 의 `×N` 총합 badge) 에서는 **총합만** 노출된다. 상점에서는
 * 카테고리별로 구매해야 한다. 이 불일치로 유저가 "A 카테고리에 구매한 탐험권을
 * B 카테고리에서 쓰려 하면 disabled" 라는 혼란을 반복 보고 (2026-04 피드백).
 *
 * 정책 결정: **소비는 모든 카테고리에서 호환**. 목표 던전 카테고리에 잔고가 있으면
 * 거기서 먼저 차감, 없으면 다른 카테고리에서 1장 폴백 소비. 총 잔고가 0 이면 불가.
 *
 * 저장 구조는 유지 (마이그레이션 불필요). 홈/던전 UI 의 disable 기준도 총합으로 통일.
 *
 * @returns 소비 후 passes 객체, 잔고 0 이면 null.
 */
function consumeAnyPass(
  passes: Partial<Record<DungeonId, number>>,
  preferDungeon: DungeonId,
): Partial<Record<DungeonId, number>> | null {
  const preferCount = passes[preferDungeon] ?? 0;
  if (preferCount >= 1) {
    return { ...passes, [preferDungeon]: preferCount - 1 };
  }
  // 폴백 — 다른 카테고리에서 찾아 1장 소비. insertion order 순회로 결정적.
  for (const [dId, count] of Object.entries(passes)) {
    if ((count ?? 0) >= 1) {
      return { ...passes, [dId as DungeonId]: (count ?? 0) - 1 };
    }
  }
  return null;
}

function totalPassCount(passes: Partial<Record<DungeonId, number>>): number {
  let total = 0;
  for (const count of Object.values(passes)) total += count ?? 0;
  return total;
}

interface UpHeroActions {
  initialize(): void;

  /**
   * 클라우드 데이터로 로컬 상태 교체 (syncToCloud 트리거 안 함).
   *   호출측(SyncProvider)이 normalizeUpHeroState 로 관용 디코드를 마친 값을 준다.
   *   페이로드에 없는 키는 건드리지 않는다 — currentSession 은 동기화 대상이 아니므로
   *   진행 중 던전이 있으면 그대로 살아남는다.
   *   병합 규칙(로컬에 흔적이 없을 때만 채택)은 SyncProvider 소유.
   */
  _setFromCloud(state: CloudUpHeroState): void;

  /** Phase 14 security — 로그아웃 시 in-memory state 초기화 (reload fallback). */
  resetForSignOut(): void;

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
  /**
   * 굴림틀 "한 번 더" — 결과 모달의 CTA. 활성 세션에 굴림틀 choice 엔트리를 다시
   * 꽂고 즉시 0번(당긴다)으로 해소한다. 상한·잔액 게이트(`canSpinSlot`)에 막히면
   * 아무 일도 하지 않는다. iOS `UpHeroStore.spinSlotAgain` 1:1.
   */
  spinSlotAgain(): void;
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
   *
   * Bug 2026-04 — classType 인자를 주면 추천 로직을 우회하고 해당 class 로
   *   즉시 분화 (ClassChoiceModal 의 사용자 선택 경로). 인자 없음 = 기존 자동
   *   분화 (init 안전망 / legacy fallback).
   */
  assignClass(classType?: ClassType): ClassType | null;

  /**
   * Bug 2026-04 — Lv30 도달 시 "추천 + 선택" UX 의 proposal step.
   *   추천 classType 을 계산해 pendingClassChoice 에 저장. assignClass 는
   *   호출하지 않음 — 실제 분화는 confirmClassChoice 에서.
   *   이미 분화된 영웅 / 이미 proposal pending / 카테고리 완료 기록 전무 →
   *   모두 no-op 반환.
   */
  proposeClassChoice(): ClassType | null;

  /**
   * Bug 2026-04 — ClassChoiceModal 에서 유저가 고른 class 확정.
   *   assignClass 를 위임 호출 + pendingClassChoice 를 null 로 clear.
   *   성공 시 pendingClassAwaken 이 세팅되어 기존 연출 modal 이 이어받음.
   */
  confirmClassChoice(classType: ClassType): void;

  /** Phase 5c.1 — ClassAwakenModal 닫을 때 호출. pendingClassAwaken null 로. */
  acknowledgeClassAwaken(): void;

  /** 아지트 첫 진입 튜토리얼을 읽음으로 기록 (persist). 재호출은 no-op. */
  markCampTutorialSeen(): void;

  /** Phase 6b — 자동 스킬 발동 on/off 토글. 기본 true. */
  toggleAutoSkill(): void;
  /** Phase 12a — 영웅 이름 변경 (최대 16자, 공백만 입력은 무시). */
  renameHero(name: string): void;
  /**
   * Phase 2-A — 영웅 XP 풀 시드 보장. `heroXp` 가 아직 undefined 이고 progress.level
   *   을 읽을 수 있으면 (useGameStore 로드됨 → 그 값, 아니면 localStorage "progress")
   *   `heroTotalXPForLevel(레거시 영웅 Lv)` 로 시드하고 persist + 마일스톤 정리.
   *   이미 시드됐거나 progress 를 못 읽으면 no-op. initialize 끝 / acknowledgeSessionEnd
   *   맨 앞 / _setFromCloud 뒤(microtask) / UpHeroGame 효과에서 호출한다.
   */
  ensureHeroXp(): void;
  /**
   * Phase 2-A — 클라우드 heroXp 단조 병합: `heroXp = max(local ?? -1, cloud)`.
   *   cloud 가 없거나 비유한이면 no-op (절대 지어내지 않는다). 흔적 게이트와 무관하게
   *   SyncProvider.adoptCloudUpHero 가 매 스냅샷마다 호출한다.
   *   hydrate 전(isLoaded=false)엔 in-memory 를 건드리지 않고 저장본 레코드에만
   *   병합한다 — 기본값을 persist 해 로컬 흔적(코인·인벤·영웅)을 지우면 안 된다.
   */
  mergeCloudHeroXp(cloudHeroXp: number | undefined): void;
  /**
   * Phase 2-A — hero.skillPoints 를 파생값으로 재계산해 캐시한다
   *   (`skillPointsTotalForLevel(영웅 Lv) - Σ pointCost(learnedSkills)`, 0 미만 없음).
   *   값이 바뀔 때만 set + persist. 멱등.
   */
  reconcileSkillPoints(): void;
  /**
   * Phase 2-A — HeroLevelUpOverlay 닫힘. pendingHeroLevelUp 을 null 로 내리고,
   *   그 레벨업이 Lv30 을 넘겼는데 아직 전직 전이면 여기서 전직을 제안한다
   *   (오버레이 → ClassChoiceModal 순서 보장).
   */
  acknowledgeHeroLevelUp(): void;
  /**
   * Phase 14 — 전직 전 튜토리얼 novice 스킬 레벨별 자동 지급.
   *   currentLevel 기준으로 아직 learned 가 아닌 novice skill 중 requiredLevel
   *   충족 된 것들을 모두 learnedSkills 에 추가. idempotent (이미 있으면 skip).
   */
  grantNoviceSkills(currentLevel: number): void;
  /** Phase 12d — 스킬 해금 (skill points 소모). */
  learnSkill(skillId: string): "ok" | "no-points" | "already" | "not-found" | "level" | "class";
  /** Phase 12d — 전투 중 수동 스킬 발동. 자원 + 쿨다운 체크 후 apply. */
  fireSkillManual(skillId: string): "ok" | "no-session" | "cooldown" | "resource" | "locked" | "no-monster" | "no-target";
  /** Phase 12e — 미니게임 결과 해소. success 에 따라 effects 적용 + status=active. */
  resolveMinigame(success: boolean): void;

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
    /** i18n key — renderer 가 t(errorKey, errorParams) 로 표시. */
    errorKey?: string;
    errorParams?: Record<string, string | number>;
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
    errorKey?: string;
    errorParams?: Record<string, string | number>;
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
   * 외부 시스템(메인 게임 컬렉션 완료 보상 등) 에서 코인을 +N 적립.
   * Up Hero 의 idle reward 와 동일하게 state.coins + n + persist 만 수행.
   * 토스트는 호출자 책임 (showInstantNotify 등).
   */
  addCoins(n: number): void;

  /**
   * 외부 시스템(데일리 리롤 유료화 등) 에서 코인을 -N 차감.
   * 잔액이 모자라면 아무것도 하지 않고 false 를 반환한다 (부분 차감 없음).
   * @returns 차감 성공 여부
   */
  spendCoins(n: number): boolean;

  /**
   * 시작 선물 수령 — pendingWelcomeGrant 예약분을 실제 코인으로 지급하고
   * welcomeGrantClaimed 를 확정 persist. 예약이 없으면 no-op.
   * 오버레이의 "받기" 버튼이 호출한다.
   * @returns 지급된 코인 (예약이 없었으면 0)
   */
  claimWelcomeGrant(): number;

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
   * 데일리 코인 주머니 수령 — 하루 1회, [COIN_POUCH_MIN, COIN_POUCH_MAX] 균등 랜덤.
   * @param multiplier 롤링된 코인에 곱할 배수. 1 = 기본 무료 수령,
   *   2 = 리워드 광고를 끝까지 본 경우 (광고 성공 판정은 호출부 책임).
   *   기본값 1 — 기존 호출부는 시그니처 변경 없이 그대로 동작한다.
   * @returns
   *   - { ok: true, coins }  — 수령 성공. coins = 배수까지 적용된 최종 지급액
   *   - { ok: false }        — 오늘 이미 수령함 (UI 는 disabled 상태로 먼저 막아야 함)
   */
  claimCoinPouch(multiplier?: 1 | 2): { ok: true; coins: number } | { ok: false };

  /**
   * Phase 15 — 하락방지권 1장 구매. 코인이 모자라거나 보유 상한
   * (ENHANCE_GUARD_MAX) 에 닿았으면 false 로 아무것도 바꾸지 않는다.
   *
   * 소실방지권에는 대응하는 구매 액션이 **없다**. 드롭 전용이라 상점 경로를 아예
   * 만들지 않는 것이 그 규칙의 유일하게 확실한 집행 방법이다.
   */
  purchaseDownGuard(): boolean;

  /**
   * Phase 15 — 방지권 지급. 보스 처치 드롭 · 던전 이벤트(보물상자) · 슬롯머신이
   * 쓰는 유일한 입구다. 음수·비정수는 무시하고, 상한을 넘는 만큼은 버린다.
   * @returns 실제로 늘어난 개수 (상한에 걸려 일부만 들어갔을 수 있다).
   */
  grantEnhanceGuards(grant: { destroy?: number; down?: number }): {
    destroy: number;
    down: number;
  };

  /**
   * Phase 15 — 슬롯머신 "다음 N 전투 능력치 +X%" 버프 부여.
   * 이미 버프가 있으면 더 좋은 쪽(pct 우선, 같으면 battlesLeft 큰 쪽)으로 갱신한다.
   * 겹쳐 쌓지 않는 이유: 슬롯을 연타해 배율을 무한히 부풀리는 구멍을 막기 위해서다.
   */
  grantCombatBuff(pct: number, battles: number): void;

  /**
   * Phase 11a — 장비 +N 강화 (기존 2→1 합성 대체).
   * 단일 아이템 + 코인 → 확률적으로 enhanceLevel +1. 최대 +10.
   * 실패 시 enhanceOutcomeRates(rarity, level) 로 소실 / 하락 / 유지 3분기.
   * 성공률 / 코인 비용 공식은 types/uphero.ts 의 enhanceSuccessRate / enhanceCost 참고.
   *
   * @param guards 이번 시도에 걸 방지권 (기본 둘 다 false).
   *   **소모 계약**: 방지권은 그 결과가 **실제로 나서 막아낸 순간에만** 1장 소모된다.
   *   성공했거나, 실패했지만 그냥 유지로 끝났으면 소모하지 않는다. 보유가 0 이면
   *   true 를 넘겨도 무시된다 (조용히 진행 — UI 가 먼저 토글을 막는 게 정상 경로).
   *   소실과 하락은 배타적이라 한 번의 시도에서 두 종류가 동시에 소모되는 일은 없다.
   *
   * UI 는 이 반환값 기반으로 Ritual overlay + Result modal 분기.
   */
  enhanceItem(id: string, guards?: EnhanceGuardArm): EnhanceResult;
}

/** Phase 15 — 이번 강화 시도에 걸 방지권. UI 토글이 그대로 매핑된다. */
export interface EnhanceGuardArm {
  /** 소실방지권을 걸지 (보유 0 이면 무시) */
  destroy?: boolean;
  /** 하락방지권을 걸지 (보유 0 이면 무시) */
  down?: boolean;
}

/** Phase 11a — 강화 결과 discriminated union. UI 는 이 타입 기반 분기. */
export type EnhanceResult =
  | { ok: true; reason: "success"; newItem: Equipment; prevLevel: number }
  /** 실패했지만 아무 일도 없었다. 방지권도 소모되지 않았다. */
  | { ok: false; reason: "keep"; item: Equipment }
  /**
   * 실패로 강화 단계가 1 내려갔다. prevLevel 은 내려가기 **전** 레벨이라
   * UI 가 "+7 → +6" 을 그릴 수 있다. item 은 내려간 뒤의 아이템이다.
   */
  | { ok: false; reason: "down"; item: Equipment; prevLevel: number }
  /**
   * 방지권이 결과를 막아냈다. guard 가 무엇을 막았는지 말해준다 —
   * "소실될 뻔했다" 와 "하락할 뻔했다" 는 연출이 달라야 한다.
   * 이 분기에서만 해당 방지권이 1장 소모된다.
   */
  | { ok: false; reason: "guarded"; item: Equipment; guard: "destroy" | "down" }
  | { ok: false; reason: "destroyed"; lostItemName: string; lostBaseId?: string }
  | { ok: false; reason: "coin"; cost: number }
  | { ok: false; reason: "maxed" }
  | { ok: false; reason: "not-found" };

type UpHeroStore = UpHeroState & UpHeroActions;

/**
 * Phase 13 review Critical #2 — session.log persist cap.
 *   F30 NG+ 세션 log 가 500+ entry 로 growing. JSON.stringify / parse 비용 ↑.
 *   저장 시점에 최근 N entry 만 유지. tail 쪽에 victory/sessionEnd/choiceResult
 *   가 몰려 있으므로 tail-preserving slice 가 의미 보존성 높음.
 *   화면 표시 동안에는 in-memory log 가 full 로 유지됨 (persist 시에만 절삭).
 */
export const SESSION_LOG_PERSIST_CAP = 400;

/**
 * Phase 15 — 방지권 개수를 [0, ENHANCE_GUARD_MAX] 정수로 교정.
 * 저장본/클라우드에서 올 수 있는 undefined·음수·소수·NaN·상한 초과를 한 곳에서 막는다.
 */
function clampGuards(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(ENHANCE_GUARD_MAX, Math.floor(n)));
}

/**
 * Phase 15 — 전투 버프를 정규화. 만료(battlesLeft ≤ 0)거나 값이 깨졌으면
 * undefined 로 접는다 — 껍데기를 남기면 UI 가 "버프 있음" 으로 오인한다.
 *
 * **pct 는 퍼센트 포인트다 (10 = +10%).** 세션 층위(`sessionStats`)가
 * `1 + pct/100` 으로 곱하므로 상태·와이어·세션이 전부 같은 단위여야 한다.
 * 예전 이 자리의 상한은 `Math.min(1, pct)` 였는데, 그러면 슬롯이 주는 pct=10 이
 * 탐험을 넘길 때 1 로 접혀 다음 탐험에서 +10% 가 아니라 **+1%** 로 먹었다
 * (`grantCombatBuff` → `completeSession` → 다음 `createSession` 경로).
 * 상한 100 은 바로 아래 주석이 원래 의도했던 "배율 2배(+100%)" 와 같은 값이다.
 */
function normalizeCombatBuff(raw: unknown): UpHeroState["combatBuff"] {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as { pct?: unknown; battlesLeft?: unknown };
  const pct = typeof r.pct === "number" && Number.isFinite(r.pct) ? r.pct : 0;
  const left =
    typeof r.battlesLeft === "number" && Number.isFinite(r.battlesLeft)
      ? Math.floor(r.battlesLeft)
      : 0;
  if (pct <= 0 || left <= 0) return undefined;
  // 상한: 배율 2배(+100% = pct 100) / 20 전투. 손상된 값이 전투 밸런스를 뒤집지 않게.
  return { pct: Math.min(100, pct), battlesLeft: Math.min(20, left) };
}

/**
 * 저장할 state 추출 — 함수는 제외. pendingDungeon 은 transient (persist 안 함).
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
    lastSeenAt,
    heroStartLevel,
    heroXp,
    shopDaily,
    ngPlusLevel,
    weeklyVariant,
    schemaVersion,
    hasSeenCampTutorial,
    welcomeGrantClaimed,
    destroyGuards,
    downGuards,
    combatBuff,
    slotBlankStreak,
  } = s;
  // Phase 13 review C#2 — session.log tail-slice 로 persist payload 감축.
  const trimmedSession =
    currentSession && currentSession.log.length > SESSION_LOG_PERSIST_CAP
      ? {
          ...currentSession,
          log: currentSession.log.slice(-SESSION_LOG_PERSIST_CAP),
        }
      : currentSession;
  return {
    hero,
    inventory,
    coins,
    passes,
    dungeons,
    currentSession: trimmedSession,
    codex,
    cosmetics,
    lastIdleAccrualAt,
    lastSeenAt,
    heroStartLevel,
    heroXp,
    shopDaily,
    ngPlusLevel,
    weeklyVariant,
    schemaVersion,
    hasSeenCampTutorial,
    welcomeGrantClaimed,
    destroyGuards,
    downGuards,
    combatBuff,
    slotBlankStreak,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * Phase 2-A (Track A) — 영웅 XP 풀 / 스킬 포인트 파생 순수 헬퍼 (테스트용 export)
 * ═══════════════════════════════════════════════════════════════════════ */

/** 저장본/클라우드의 heroXp 를 읽는다 — 숫자가 아니면 undefined(미시드), 숫자면 clamp. */
export function normalizeHeroXp(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? clampHeroXp(v) : undefined;
}

/** learnedSkills 가 소모한 스킬 포인트 합 (findSkillById 로 해석되는 것만; novice/T1 은 0). */
export function spentSkillPoints(hero: Pick<Hero, "learnedSkills">): number {
  let spent = 0;
  for (const id of hero.learnedSkills ?? []) {
    spent += findSkillById(id)?.pointCost ?? 0;
  }
  return spent;
}

/** 남은 스킬 포인트 = max(0, 레벨 누적 SP - 소모 SP). 별도 카운터 없이 항상 재계산. */
export function deriveSkillPoints(
  hero: Pick<Hero, "learnedSkills">,
  level: number,
): number {
  return Math.max(0, skillPointsTotalForLevel(level) - spentSkillPoints(hero));
}

/** 정산: 풀에 XP 를 더하고 (상한 clamp) 전후 레벨을 돌려준다. */
export function settleHeroXp(
  prevXp: number,
  gain: number,
): { heroXp: number; prevLevel: number; newLevel: number } {
  const before = clampHeroXp(prevXp);
  const safeGain = Number.isFinite(gain) ? Math.max(0, Math.floor(gain)) : 0;
  const heroXp = clampHeroXp(before + safeGain);
  return {
    heroXp,
    prevLevel: heroLevelFromXP(before),
    newLevel: heroLevelFromXP(heroXp),
  };
}

/**
 * 시드에 쓸 계정 레벨. useGameStore 가 로드됐으면 그 값, 아니면 localStorage 의
 * "progress" (useGameStore.initialize 가 읽을 바로 그 저장본). 둘 다 없으면 undefined
 * — 그 기기는 진행이 전무하므로 시드를 미룬다 (0 으로 시드하지 않는다).
 */
function readSeedGameLevel(): number | undefined {
  const gs = useGameStore.getState();
  if (gs.isLoaded) return gs.progress.level ?? 1;
  const saved = loadFromStorage<{ level?: number }>("progress");
  const level = saved?.level;
  return typeof level === "number" && Number.isFinite(level) ? level : undefined;
}

/** 스토어 상태 기준 영웅 레벨 — 시드 전엔 레거시 공식 폴백 (resolveHeroLevel). */
function heroLevelOf(
  state: Pick<UpHeroState, "heroXp" | "heroStartLevel">,
): number {
  if (state.heroXp !== undefined) return heroLevelFromXP(state.heroXp);
  const gameLevel = readSeedGameLevel() ?? 1;
  return resolveHeroLevel(undefined, gameLevel, state.heroStartLevel);
}

/**
 * 굴림틀 1회 굴림이 이번 선택 해소로 일어났는지 — 새로 붙은 로그 엔트리 중
 * `slot` 페이로드를 가진 choiceResult 를 찾는다. 잔액/상한 게이트에 막힌 선택은
 * slot 페이로드가 없어 null 이고, 그 경우 스트릭은 건드리지 않는다.
 */
function findNewSlotSpin(
  prev: CombatSession,
  next: CombatSession,
): { outcome: SlotOutcomeId } | null {
  for (let i = prev.log.length; i < next.log.length; i += 1) {
    const e = next.log[i];
    if (e.type === "choiceResult" && e.slot) return e.slot;
  }
  return null;
}

/**
 * 오늘 기준 `shopDaily`. 날짜(`getTodayString`, 새벽 1시 경계)가 바뀌었으면 모든
 * 일일 카운터(passesBought / coinPouchClaimed / slotSpins)가 비어 있는 새 객체다.
 * 탐험권 구매·코인 주머니·굴림틀이 전부 이 하나를 읽어 롤오버 규칙을 한 곳에 둔다.
 */
export function currentShopDaily(
  shopDaily: UpHeroState["shopDaily"],
): NonNullable<UpHeroState["shopDaily"]> {
  const today = getTodayString();
  return shopDaily && shopDaily.date === today
    ? shopDaily
    : { date: today, passesBought: 0 };
}

/**
 * 오늘 굴림틀을 돌린 횟수 (`shopDaily.slotSpins`, 날짜 롤오버·레거시 부재 = 0).
 * 전투 레이어(`canSpinSlot`)에 넘기는 스냅샷이자 UI 가 "남은 횟수" 를 셈하는 근거.
 * 세션이 아니라 여기 두어 하루에 탐험을 몇 번 하든 합산된다.
 */
export function slotSpinsToday(shopDaily: UpHeroState["shopDaily"]): number {
  return normalizeSlotSpins(currentShopDaily(shopDaily).slotSpins);
}

/** 오늘 남은 굴림 횟수. `SLOT_DAILY_SPIN_CAP - slotSpinsToday`, 0 미만은 0. */
export function slotSpinsLeft(shopDaily: UpHeroState["shopDaily"]): number {
  return Math.max(0, SLOT_DAILY_SPIN_CAP - slotSpinsToday(shopDaily));
}

export const useUpHeroStore = create<UpHeroStore>((set, get) => {
  /**
   * Phase 2-A — 영웅 레벨 마일스톤 단일 진입점 (정산 / 방치 / 시드 / 병합 뒤).
   *   - reconcileSkillPoints + grantNoviceSkills(new) 는 **무조건** (prev == new 여도;
   *     첫 부트스트랩의 Lv1 novice 지급과 소급 지급이 여기 걸려 있다).
   *   - new > prev 면 pendingHeroLevelUp 세팅 → HeroLevelUpOverlay.
   *   - Lv30 이상인데 전직 전이면 전직 제안. 단 이번 호출이 30 을 **넘긴** 레벨업이면
   *     오버레이가 닫힌 뒤(acknowledgeHeroLevelUp)로 미룬다 — 오버레이와 ClassChoiceModal
   *     이 동시에 뜨지 않게.
   */
  const applyHeroLevelMilestones = (prevLevel: number, newLevel: number): void => {
    get().reconcileSkillPoints();
    get().grantNoviceSkills(newLevel);
    const leveledUp = newLevel > prevLevel;
    if (leveledUp) {
      set({ pendingHeroLevelUp: { from: prevLevel, to: newLevel } });
    }
    const crossed30 = leveledUp && prevLevel < 30 && newLevel >= 30;
    if (newLevel >= 30 && get().hero.classType === null && !crossed30) {
      get().proposeClassChoice();
    }
  };

  return {
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
  lastSeenAt: Date.now(),
  // Phase 9d — 초기값 undefined. initialize 에서 seed.
  heroStartLevel: undefined,
  // Phase 2-A — 영웅 XP 풀. undefined = 미시드. initialize/ensureHeroXp 에서 seed.
  heroXp: undefined,
  pendingHeroLevelUp: null,
  // Phase 11a — 초기값 undefined. initialize 에서 오늘 날짜로 seed.
  shopDaily: undefined,
  // Phase 11c — 초기 0 (미해금). F30 보스 처치 시 +1.
  ngPlusLevel: 0,
  // Phase 15 — 방지권 2종. 소실방지권은 드롭/이벤트/슬롯으로만, 하락방지권은 상점으로도.
  destroyGuards: 0,
  downGuards: 0,
  // Phase 15 — 슬롯머신 전투 버프. 없으면 undefined (껍데기를 남기지 않는다).
  combatBuff: undefined,
  // 굴림틀 pity 스트릭 — 탐험을 넘어 영속. 0 = 연속 꽝 없음.
  slotBlankStreak: 0,
  // Phase 11c — 초기 undefined. initialize 에서 이번 주 id 로 seed/갱신.
  weeklyVariant: undefined,
  idleReward: null,
  pendingClassAwaken: null,
  pendingClassChoice: null,
  // 아지트 첫 진입 튜토리얼 — 최초 false. 유저가 완료/Skip 누르면 true persist.
  hasSeenCampTutorial: false,
  // 시작 선물 — 최초 false. initialize 에서 pendingWelcomeGrant 예약 후 수령 시 true persist.
  welcomeGrantClaimed: false,
  pendingWelcomeGrant: null,
  isLoaded: false,

  initialize() {
    if (get().isLoaded) return;
    const saved = loadFromStorage<Partial<UpHeroState>>(STORAGE_KEY);
    // 이전 버전 Hero 에 name/baseStats.crit 등 신규 필드가 없을 수 있어 default 와 deep merge.
    // baseStats 는 nested 객체라 별도 spread 로 crit 필드 포함시킨다.
    // 신규 유저(saved.hero 없음): 현재 언어 기준으로 이름 배정.
    // Up Hero 는 app 진입 경로상 useGameStore 가 먼저 로드되지만, 혹시 모를
    // race 를 대비해 localStorage 에서 progress.language 를 직접 읽어 폴백.
    const savedProgress = loadFromStorage<{ language?: Language }>("progress");
    const langForDefault =
      savedProgress?.language ??
      useGameStore.getState().progress.language ??
      "en";
    const defaults = createDefaultHero(langForDefault);
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
    // Phase 14 security — clock rewind guard.
    //   user 가 시스템 시계를 되돌려 idle reward 를 반복 수령하는 공격 방지.
    //   lastSeenAt / lastIdleAt 중 하나라도 현재보다 "미래" 면 rewind 로 판정 →
    //   이번 hydrate 에서는 reward 지급 skip 하고 두 timestamp 를 now 로 재동기화.
    const clockRewound = detectClockRewind(now, saved?.lastSeenAt, lastIdleAt);
    const gameStore = useGameStore.getState();
    const curLevel = gameStore.progress.level ?? 1;
    // Phase 2-A — 시드에 쓸 계정 레벨 한 곳. useGameStore 가 로드됐으면 그 값, 아니면
    //   localStorage "progress" (initialize 가 곧 읽을 바로 그 저장본). 둘 다 없으면
    //   undefined. heroStartLevel 시드와 heroXp 시드가 같은 값을 봐야 한다 — 로드 전
    //   기본값(level 0)으로 heroStartLevel 을 굳히면 Lv47 계정의 첫 영웅이 Lv48 로 뜬다.
    const seedGameLevel = gameStore.isLoaded ? curLevel : readSeedGameLevel();

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
      heroStartLevel = hasPlayedUpHero ? 1 : (seedGameLevel ?? curLevel);
    }

    // Phase 2-A (Track A, v6) — heroXp seed. 저장본에 있으면 clamp 해서 그대로,
    //   없으면(레거시 v5 이하) 레거시 영웅 Lv 를 곡선으로 옮긴다: Lv47 → 39,031.
    //   progress.level 소스는 useGameStore 가 로드됐으면 그 값, 아니면 localStorage
    //   "progress". 둘 다 없으면 미시드로 두고 ensureHeroXp 가 나중에 채운다 —
    //   0 으로 시드하면 Lv47 영웅이 Lv1 로 주저앉으므로 절대 하지 않는다.
    let heroXp = normalizeHeroXp(saved?.heroXp);
    if (heroXp === undefined && seedGameLevel !== undefined) {
      heroXp = heroTotalXPForLevel(
        getEffectiveHeroLevel(seedGameLevel, heroStartLevel),
      );
    }
    // 영웅 레벨 — 이후 로직 (idle 스케일 등) 에서 사용. 시드 전엔 레거시 공식 폴백.
    const heroLevel = resolveHeroLevel(
      heroXp,
      seedGameLevel ?? curLevel,
      heroStartLevel,
    );

    // idle accrual 도 heroLevel 기준으로 — 챌린지 Lv 41 에 영웅 Lv 1 유저가
    // Lv 41 수준의 idle reward 를 받으면 "영웅 Lv 1 인데 거대 보상" 이 부자연.
    // Phase 2-A — 방치 XP 는 영웅 XP 풀로 간다. 풀이 아직 미시드면 이번 hydrate 에선
    //   지급하지 않고 lastIdleAccrualAt 도 건드리지 않는다 (다음 시드된 init 에 누적).
    const rawIdleReward =
      clockRewound || heroXp === undefined
        ? null
        : calculateIdleReward(now - lastIdleAt, heroLevel);
    const heroClass = mergedHero.classType;
    const idleReward = rawIdleReward
      ? {
          ...rawIdleReward,
          xp: Math.round(rawIdleReward.xp * classXpMult(heroClass)),
          coins: Math.round(rawIdleReward.coins * classCoinMult(heroClass)),
        }
      : null;

    // 지급 — heroXp 증가 + coins 증가 (둘 다 Up Hero store). 계정 XP 는 불변.
    let coins = saved?.coins ?? 0;
    const heroLevelBeforeIdle = heroLevel;
    if (idleReward && heroXp !== undefined) {
      heroXp = clampHeroXp(heroXp + idleReward.xp);
      coins = coins + idleReward.coins;
    }
    const heroLevelAfterIdle = resolveHeroLevel(
      heroXp,
      seedGameLevel ?? curLevel,
      heroStartLevel,
    );

    // Phase 5c-fix #2: lastIdleAccrualAt 는 reward 가 실제로 지급됐을 때만
    // now 로 갱신. 5분 미만 reload 시에는 기존 timestamp 유지 → 누적 보전.
    // (이전: reward 유무 무관 now 로 갱신 → 잦은 reload 시 누적 손실 발생)
    // Phase 14 security: clock rewind 검출 시에도 now 로 강제 재동기화 —
    //   이후 합법적인 offline 누적 window 를 clock rewind 시점부터 다시 시작.
    const newLastIdleAt = idleReward || clockRewound ? now : lastIdleAt;

    // Phase 11a — shopDaily seed. date 가 오늘과 다르면 passesBought=0 리셋
    //   (coinPouchClaimed·slotSpins 도 함께 비워진다). 같은 날이면 굴림틀 횟수만
    //   손상 값 방어로 [0,100] 정수로 접는다 — 레거시 저장본(필드 없음)은 0.
    const dailyBase = currentShopDaily(saved?.shopDaily);
    const shopDaily = { ...dailyBase, slotSpins: normalizeSlotSpins(dailyBase.slotSpins) };

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

    // Backfill: 기존 데이터에 bestFloorReached 가 없으면 floorReached 로 초기화.
    const dungeonsBackfilled: Partial<Record<DungeonId, DungeonProgress>> = {};
    for (const [id, prog] of Object.entries(saved?.dungeons ?? {})) {
      if (!prog) continue;
      dungeonsBackfilled[id as DungeonId] = {
        ...prog,
        bestFloorReached: prog.bestFloorReached ?? prog.floorReached ?? 0,
      };
    }

    set({
      hero: mergedHero,
      inventory: saved?.inventory ?? [],
      coins,
      passes: saved?.passes ?? {},
      dungeons: dungeonsBackfilled,
      // Phase 16 (Track C) — 고아 pendingMinigame / 깨진 대기 상태를 로드 시 교정
      //   (순수, 멱등, 스키마 버전 게이트 없음). 공통 규칙 3단계.
      currentSession: saved?.currentSession
        ? normalizeSessionForLoad(saved.currentSession)
        : null,
      pendingDungeon: null, // transient, 재시작 시 항상 null
      codex,
      cosmetics: saved?.cosmetics ?? {},
      lastIdleAccrualAt: newLastIdleAt,
      lastSeenAt: now,
      heroStartLevel,
      heroXp,
      pendingHeroLevelUp: null, // transient
      shopDaily,
      ngPlusLevel: saved?.ngPlusLevel ?? 0,
      // Phase 15 — 필드가 없는 기존 저장본은 0 (미보유). 음수·소수·상한 초과 저장본도
      //   여기서 교정한다. 0 으로 읽히는 것 자체는 기존 강화 진행에 영향이 없다 —
      //   방지권은 순수 추가 기능이고, 미보유면 예전과 똑같이 동작한다.
      destroyGuards: clampGuards(saved?.destroyGuards),
      downGuards: clampGuards(saved?.downGuards),
      combatBuff: normalizeCombatBuff(saved?.combatBuff),
      // 굴림틀 pity 스트릭 — 필드가 없는 기존 저장본은 0. 손상 값은 [0,1000] 정수로.
      slotBlankStreak: normalizeSlotBlankStreak(saved?.slotBlankStreak),
      weeklyVariant,
      idleReward,
      pendingClassAwaken: null, // transient
      pendingClassChoice: null, // transient
      schemaVersion: CURRENT_SCHEMA_VERSION,
      // 아지트 튜토리얼 노출 여부 — saved 에 있으면 복원, 없으면 default(false).
      // Hotfix: 이전 버전에선 이 필드가 restore 누락되어 return 유저에게도 매 로드마다
      // 튜토리얼이 다시 뜨는 버그가 있었음.
      hasSeenCampTutorial: saved?.hasSeenCampTutorial ?? false,
      // 시작 선물 — 플래그가 없으면 "아직 안 받음" 으로 간주해 예약한다.
      //   기존 유저도 플래그가 없으므로 1회 받게 된다 (의도된 소급 지급).
      //   여기서는 코인을 더하지 않고 예약만 한다. 실제 지급은 오버레이의
      //   claimWelcomeGrant() 시점 — 연출을 못 본 채 플래그만 소모되는 걸 막는다.
      welcomeGrantClaimed: saved?.welcomeGrantClaimed ?? false,
      pendingWelcomeGrant: saved?.welcomeGrantClaimed ? null : WELCOME_GRANT_COINS,
      isLoaded: true,
    });

    // migration 이 실제로 실행됐거나 idle reward 가 지급됐으면 즉시 persist.
    // (schemaVersion / coins / lastIdleAccrualAt 모두 영속화 대상.)
    // Phase 14 security: clock rewind 재동기화된 timestamp 도 즉시 persist —
    //   새 rewind 감지 기준점을 영속화해 두지 않으면 다음 hydrate 에서 무시됨.
    if (needsMigration || idleReward || clockRewound) {
      saveToStorage(STORAGE_KEY, pickPersisted(get()));
    }

    // Phase 2-A — 마일스톤 정리 (공통 규칙 8단계):
    //   reconcileSkillPoints (SP 파생 캐시 재계산) → 기존 class-choice 안전망
    //   (Lv30+ 인데 classType null → 전직 제안; 이 hydrate 의 방치 XP 로 30 을
    //   넘겼으면 오버레이 뒤로 미룸) → grantNoviceSkills(heroLevel) 소급 지급.
    //   전부 applyHeroLevelMilestones 한 곳에서. 방치 XP 로 레벨이 올랐으면
    //   pendingHeroLevelUp 도 여기서 예약된다 (IdleRewardToast 닫힌 뒤 표시).
    applyHeroLevelMilestones(heroLevelBeforeIdle, heroLevelAfterIdle);

    // 공통 규칙: initialize 끝에서 한 번 더 — 위에서 progress 를 못 읽어 미시드로
    //   남았어도 여기서 읽을 수 있게 됐다면 즉시 채운다 (멱등).
    get().ensureHeroXp();
  },

  ensureHeroXp() {
    const state = get();
    if (state.heroXp !== undefined) return;
    const seedGameLevel = readSeedGameLevel();
    if (seedGameLevel === undefined) return;
    // 클라우드 값이 있었다면 mergeCloudHeroXp / _setFromCloud 가 이미 heroXp 를
    //   채웠으므로 여기까지 오지 않는다 — 레거시 공식은 마지막 폴백이다.
    const level = getEffectiveHeroLevel(seedGameLevel, state.heroStartLevel);
    const heroXp = heroTotalXPForLevel(level);
    set({ heroXp });
    saveToStorage(STORAGE_KEY, pickPersisted(get()));
    applyHeroLevelMilestones(level, level);
  },

  mergeCloudHeroXp(cloudHeroXp) {
    const cloud = normalizeHeroXp(cloudHeroXp);
    if (cloud === undefined) return;
    const state = get();
    if (!state.isLoaded) {
      // 아직 hydrate 전 (아지트를 안 거친 라우트에서 로그인/리스너 스냅샷이 먼저 온
      //   경우: /settings, /collection, /minigame). 이때 in-memory 는 기본값이라
      //   pickPersisted(get()) 로 persist 하면 저장본의 코인·인벤·영웅이 기본값으로
      //   덮여 흔적이 사라지고, 바로 뒤의 adoptCloudUpHero 흔적 게이트가 뚫려
      //   "로컬 흔적 우선" 계약이 깨진다. 저장본 레코드에만 heroXp 를 병합한다 —
      //   heroXp 단독 레코드는 흔적이 아니므로 게이트는 그대로고, initialize 가
      //   normalizeHeroXp(saved?.heroXp) 로 읽어 간다. 마일스톤 정리도 initialize 몫.
      const saved = loadFromStorage<Record<string, unknown>>(STORAGE_KEY);
      const localSaved = normalizeHeroXp(saved?.heroXp) ?? -1;
      if (cloud <= localSaved) return;
      saveToStorage(STORAGE_KEY, { ...(saved ?? {}), heroXp: cloud });
      return;
    }
    const local = state.heroXp ?? -1;
    if (cloud <= local) return;
    set({ heroXp: cloud });
    saveToStorage(STORAGE_KEY, pickPersisted(get()));
    // 레벨이 바뀌었을 수 있다 — SP 캐시/novice/전직 안전망만 정리한다. 다른 기기가
    //   이미 본 레벨업이라 오버레이는 띄우지 않는다 (prev == new 로 호출).
    const level = heroLevelFromXP(cloud);
    applyHeroLevelMilestones(level, level);
  },

  reconcileSkillPoints() {
    const state = get();
    const derived = deriveSkillPoints(state.hero, heroLevelOf(state));
    if (state.hero.skillPoints === derived) return;
    const newHero = { ...state.hero, skillPoints: derived };
    set({ hero: newHero });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hero: newHero }));
  },

  acknowledgeHeroLevelUp() {
    const state = get();
    const pending = state.pendingHeroLevelUp;
    if (!pending) return;
    set({ pendingHeroLevelUp: null });
    // 이번 레벨업이 Lv30 을 넘겼고 아직 전직 전이면 이제 전직을 제안한다
    //   (applyHeroLevelMilestones 가 오버레이 뒤로 미뤄둔 몫).
    if (pending.from < 30 && pending.to >= 30 && state.hero.classType === null) {
      get().proposeClassChoice();
    }
  },

  acknowledgeIdleReward() {
    if (!get().idleReward) return;
    set({ idleReward: null });
    // persist 할 필요 없음 — idleReward 는 transient.
  },

  assignClass(pickedClassType) {
    const state = get();
    if (state.hero.classType) return null; // 이미 분화됨

    let classType: ClassType | null = pickedClassType ?? null;
    if (!classType) {
      // Phase 5c-fix #6: DUNGEON_LIST 의 canonical 순서로 순회해 tie 에서
      // 결정적 결과 보장. 이전엔 Object.entries 순서 의존 → 같은 완료 수
      // 일 때 어느 class 가 뽑히는지 불확실. 이제 fitness > learning >
      // mindfulness > nutrition > social > productivity > wellness > trending
      // 순으로 우선.
      const progress = useGameStore.getState().progress;
      const completions =
        progress.categoryCompletions ?? ({} as Record<Category, number>);
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
      classType = CLASS_BY_DUNGEON[bestCategory] ?? null;
    }
    if (!classType) return null;

    // Phase 12d — 전직 시 해당 클래스의 T1 스킬 자동 해금.
    // Bug 2026-04 — 전직 시 novice 스킬 (초급힐링/초급집중/초급방어) 을 포함해
    //   learnedSkills 를 완전 초기화. 이전엔 기존 배열이 merge 되어 novice 스킬이
    //   전직 후에도 SkillBar 에 계속 노출됨 → 유저 피드백: "전직해도 이전 스킬이
    //   그대로 쓰임".  노비스 단계는 전직과 함께 완전히 종료.
    const t1Skill = CLASS_SKILL_TREES[classType].find((s) => s.tier === 1);
    const learnedSkills = t1Skill ? [t1Skill.id] : [];
    const newHero = {
      ...state.hero,
      classType,
      learnedSkills,
      skillPoints: state.hero.skillPoints ?? 0,
    };
    // 진행 중 세션이 있으면 session.hero snapshot 도 동기화 — 전직 직후
    //   시작된 배틀에서 novice 스킬이 여전히 보이는 회귀 방지.
    const prevSession = state.currentSession;
    const newSession = prevSession
      ? {
          ...prevSession,
          hero: {
            ...prevSession.hero,
            classType,
            learnedSkills: [...learnedSkills],
          },
        }
      : prevSession;
    set({
      hero: newHero,
      currentSession: newSession,
      pendingClassAwaken: classType,
    });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({
        ...state,
        hero: newHero,
        currentSession: newSession,
      }),
    );
    return classType;
  },

  proposeClassChoice() {
    const state = get();
    if (state.hero.classType) return null; // 이미 분화됨 → proposal 불필요
    if (state.pendingClassChoice) return state.pendingClassChoice.recommended;

    // 추천 classType = 가장 많이 완료한 카테고리 (기존 assignClass 로직과 동일).
    const progress = useGameStore.getState().progress;
    const completions =
      progress.categoryCompletions ?? ({} as Record<Category, number>);
    let bestCategory: DungeonId | null = null;
    let bestCount = 0;
    for (const dungeon of DUNGEON_LIST) {
      const count = completions[dungeon.id as Category] ?? 0;
      if (count > bestCount) {
        bestCategory = dungeon.id;
        bestCount = count;
      }
    }
    if (!bestCategory || bestCount === 0) return null;
    const recommended = CLASS_BY_DUNGEON[bestCategory];
    if (!recommended) return null;

    set({ pendingClassChoice: { recommended } });
    // 영속 필요 없음 — 다음 init 에서 heroLevel>=30 & classType null 이면 재제안
    // (init 안전망 경로가 proposeClassChoice 로 라우팅되므로 natural restore).
    return recommended;
  },

  confirmClassChoice(classType: ClassType) {
    const state = get();
    if (state.hero.classType) return; // 이미 분화 — 중복 확정 방지
    if (!state.pendingClassChoice) return; // modal 띄운 적 없는데 호출됨 → no-op
    // pendingClassChoice 를 먼저 null 로 내려두면 이후 assignClass 가 실패해도
    // modal 이 무한 재표출되지 않음. 실패 시 재제안은 init/레벨업 경로가 담당.
    set({ pendingClassChoice: null });
    get().assignClass(classType);
  },

  /**
   * Phase 14 — 전직 전 영웅용 novice 스킬 자동 지급.
   *   레벨업 hook 에서 매번 호출. 이미 learned 인 skill 은 skip → idempotent.
   */
  grantNoviceSkills(currentLevel: number) {
    if (currentLevel < 1) return;
    const state = get();
    // Bug 2026-04 — 전직 이후엔 novice 단계 종료. classType 이 세팅된 영웅은
    //   레벨업 훅/초기화/소급 호출 경로 모두에서 novice 스킬 재지급을 막는다.
    //   이 가드가 없으면 `assignClass()` 가 learnedSkills 를 비워도 다음 init
    //   (또는 novice 지급 레벨 재진입) 에서 novice_heal 등이 다시 추가되어
    //   전직 후에도 초급힐링이 계속 쓸 수 있는 회귀 발생.
    if (state.hero.classType) return;
    const learned = state.hero.learnedSkills ?? [];
    const toAdd = NOVICE_SKILLS.filter(
      (sk) => currentLevel >= sk.requiredLevel && !learned.includes(sk.id),
    ).map((sk) => sk.id);
    if (toAdd.length === 0) return;
    const newHero = {
      ...state.hero,
      learnedSkills: [...learned, ...toAdd],
    };
    // 진행 중 세션이 있으면 session.hero 에도 소급 반영 — 안 하면
    //   "hero 엔 novice_focus 가 생겼는데 현재 던전에선 안 보임" 회귀.
    //   session.hero 는 snapshot 이라 init 이후에도 자동 갱신되지 않음.
    const prevSession = state.currentSession;
    const newSession = prevSession
      ? {
          ...prevSession,
          hero: {
            ...prevSession.hero,
            learnedSkills: [
              ...(prevSession.hero.learnedSkills ?? []),
              ...toAdd.filter(
                (id) => !(prevSession.hero.learnedSkills ?? []).includes(id),
              ),
            ],
          },
        }
      : prevSession;
    set({ hero: newHero, currentSession: newSession });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, hero: newHero, currentSession: newSession }),
    );
  },

  acknowledgeClassAwaken() {
    if (!get().pendingClassAwaken) return;
    set({ pendingClassAwaken: null });
  },

  /**
   * 아지트 첫 진입 튜토리얼 완료 체크.
   *   CampTutorialOverlay 의 마지막 CTA / Skip 에서 호출.
   *   한번 true 가 되면 store persist 되어 다시 뜨지 않음.
   */
  markCampTutorialSeen() {
    const state = get();
    if (state.hasSeenCampTutorial) return;
    set({ hasSeenCampTutorial: true });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hasSeenCampTutorial: true }));
  },

  toggleAutoSkill() {
    const state = get();
    // undefined (legacy) 도 true 로 간주 → 첫 토글 시 false
    const current = state.hero.autoSkillEnabled ?? true;
    const newHero = { ...state.hero, autoSkillEnabled: !current };
    set({ hero: newHero });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hero: newHero }));
  },

  /**
   * Phase 12a — 영웅 이름 변경. 길이 cap 16자, 공백만 입력은 무시.
   *   기본값 "갓생 영웅" 은 hero 생성 시 자동 배정된 이름 (기존 로직 유지).
   */
  renameHero(name: string) {
    const trimmed = name.trim().slice(0, 16);
    if (trimmed.length === 0) return;
    const state = get();
    const newHero = { ...state.hero, name: trimmed };
    set({ hero: newHero });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hero: newHero }));
  },

  /**
   * Phase 12d — 스킬트리 해금.
   *   - 해당 skill 이 hero.classType 와 일치해야 함
   *   - hero level ≥ skill.requiredLevel (Phase 2-A: heroXp 풀 기준)
   *   - 남은 SP(파생) ≥ skill.pointCost
   *   - 아직 learned 에 없어야 함
   *   성공 시 learnedSkills 에 추가. SP 는 pointCost 합에서 다시 파생돼 캐시된다 —
   *   pointCost 가 유일한 소비 경로다 (Track F 의 리스펙은 learnedSkills 리셋만으로 복원).
   */
  learnSkill(skillId) {
    const state = get();
    const cls = state.hero.classType;
    if (!cls) return "class";
    const skill = findSkillById(skillId);
    if (!skill) return "not-found";
    if (skill.class !== cls) return "class";
    const heroLevel = heroLevelOf(state);
    if (heroLevel < skill.requiredLevel) return "level";
    const learned = state.hero.learnedSkills ?? [];
    if (learned.includes(skillId)) return "already";
    const points = deriveSkillPoints(state.hero, heroLevel);
    if (points < skill.pointCost) return "no-points";
    const learnedSkills = [...learned, skillId];
    const newHero = {
      ...state.hero,
      learnedSkills,
      skillPoints: deriveSkillPoints({ learnedSkills }, heroLevel),
    };
    set({ hero: newHero });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, hero: newHero }));
    return "ok";
  },

  /**
   * Phase 12d — 전투 중 수동 스킬 발동. 자원/쿨다운 체크 후 apply.
   */
  resolveMinigame(success) {
    // Phase 12 R3 — persist 누락 수정. 기존 set 만 수행 → 미니게임 완료 직후 ~1200ms
    //   (첫 tick 전) 에 새로고침 시 reward 손실 + 미니게임 재플레이 edge case.
    const state = get();
    const session = state.currentSession;
    if (!session || session.status !== "awaitingMinigame") return;
    const next = applyResolveMinigame(session, success);
    set({ currentSession: next });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, currentSession: next }),
    );
  },

  fireSkillManual(skillId) {
    const state = get();
    const session = state.currentSession;
    if (!session || session.status !== "active") return "no-session";
    // 마지막 encounter 의 monster (전투 중 아니면 null — chrono 시간 되감기 같은
    // non-combat 스킬 발동 허용).
    const encounterIdx = findLastEncounterIndex(session.log);
    const monster =
      encounterIdx >= 0
        ? ((session.log[encounterIdx] as { type: "encounter"; monster: Monster }).monster)
        : null;
    // Phase 15 code-review High — 몬스터가 이미 죽었는데 (HP ≤ 0) victory 커밋이
    //   다음 tick 에서 이뤄지기 전의 찰나에 스킬을 쏘면 "skill" 엔트리가 죽은
    //   몬스터 위에 쌓여, 다음 tick 에서 이미 죽은 상대로 전투 round 를 한 번 더
    //   돌리거나 (log 오염) 보스 처치 보상 전에 의도치 않은 연출이 삽입될 수 있다.
    //   활성 encounter 가 있고 monsterHp ≤ 0 이면 발동 거부.
    if (monster && encounterIdx >= 0) {
      const hpNow = computeMonsterHp(session.log, encounterIdx, monster);
      if (hpNow <= 0) return "no-target";
    }
    const check = canFireSkill(session, skillId);
    if (!check.ok) {
      if (check.reason === "locked") return "locked";
      if (check.reason === "cooldown") return "cooldown";
      if (check.reason === "resource") return "resource";
    }
    // 세션 deep copy (immutable)
    const next: CombatSession = {
      ...session,
      log: [...session.log],
      hero: { ...session.hero },
      rewards: { ...session.rewards, drops: [...session.rewards.drops] },
    };
    const ok = fireSkill(next, skillId, monster);
    if (!ok) return "cooldown";
    set({ currentSession: next });
    return "ok";
  },

  bindPhotoAsTalisman(photoId) {
    const state = get();
    const photo = useGrowthStore
      .getState()
      .photoMetas.find((p) => p.id === photoId);
    if (!photo) return { ok: false, errorKey: "uphero.photo.error.photoNotFound" };
    if (isPhotoBound(photoId, state.inventory, state.hero.equipped)) {
      return { ok: false, errorKey: "uphero.photo.error.alreadyBound" };
    }
    if (state.coins < PHOTO_TALISMAN_RITUAL_COST) {
      return {
        ok: false,
        errorKey: "uphero.photo.error.coinInsufficient",
        errorParams: { cost: PHOTO_TALISMAN_RITUAL_COST },
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
    const found = findBoundPhotoTalisman(photoId, state.inventory, state.hero.equipped);
    if (!found) {
      return {
        ok: false,
        reason: "not-bound",
        errorKey: "uphero.photo.error.notBound",
      };
    }
    const current = found.item;
    const curLevel = current.enhanceLevel ?? 0;
    if (curLevel >= MAX_ENHANCE_LEVEL) {
      return { ok: false, reason: "maxed", errorKey: "uphero.photo.error.maxEnhance" };
    }

    const cost = rebindPhotoTalismanCost(curLevel);
    if (state.coins < cost) {
      return {
        ok: false,
        reason: "coin",
        errorKey: "uphero.photo.error.coinInsufficient",
        errorParams: { cost },
      };
    }

    const newLevel = curLevel + 1;
    const newItem = rebuildPhotoTalismanWithLevel(current, newLevel);
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
    // Phase 12a — defense: dungeonId/rarity 가 유효하지 않은 경우 silent no-op.
    //   이전엔 `PASS_GRANT_BY_RARITY[undefined]` → undefined → NaN 으로 persistence
    //   실패 가능성. 유저가 "탐험권이 안 들어와" 라 보고한 edge case 대응.
    const grant = PASS_GRANT_BY_RARITY[rarity];
    if (!dungeonId || typeof grant !== "number" || Number.isNaN(grant)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[grantExpeditionPass] invalid input", { dungeonId, rarity });
      }
      return;
    }
    const current = get().passes[dungeonId] ?? 0;
    const next = Math.min(PASS_CAP_PER_CATEGORY, current + grant);
    const passes = { ...get().passes, [dungeonId]: next };
    set({ passes });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...get(), passes }));
  },

  prepareBuffDraw(dungeonId) {
    const state = get();
    // Phase 15 — 총합 기준으로 소비 가능 여부 판정 (카테고리 상호 호환).
    if (totalPassCount(state.passes) < 1) return "no-pass";
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
    // Phase 15 — 카테고리 호환 소비. 목표 던전에 잔고가 있으면 거기서, 없으면 폴백.
    const updatedPasses = consumeAnyPass(state.passes, dungeonId);
    if (updatedPasses === null) {
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
    // Phase 2-A: 영웅 레벨은 heroXp 풀에서 (시드 전엔 레거시 공식 폴백).
    const progress = state.dungeons[dungeonId];
    // Phase 16 (Track C, 피드백 19/26) — 미처치 보스층이 floorReached 이하에
    //   있으면 거기서 시작 (createSession 이 보스를 바로 스폰).
    const startFloor = resolveStartFloor(progress);
    const heroLvl = heroLevelOf(state);
    const leveledHero = computeHeroForLevel(state.hero, heroLvl);
    const session: CombatSession = buildSession(
      dungeonId,
      leveledHero,
      startFloor,
      buffs,
      // Phase 11c — NG+ 스냅샷 전달. weekly variant 는 별도 action 으로만 진입.
      // heroLevel 전달 — 초보자 버프 판정 용 (Lv<5 + 층≤10).
      {
        ngPlusLevel: state.ngPlusLevel ?? 0,
        heroLevel: heroLvl,
        // 굴림틀 전투 버프는 탐험을 건너 이어진다. 세션 안에서는 session.combatBuff
        //   가 유일한 진실이고, 정산 때 남은 횟수를 다시 여기로 적어 넣는다.
        combatBuff: state.combatBuff,
      },
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
    // Phase 15 — 카테고리 호환 소비 (prepareBuffDraw / confirmDungeon 과 동일 정책).
    const updatedPasses = consumeAnyPass(state.passes, dungeonId);
    if (updatedPasses === null) return false;
    const progress = state.dungeons[dungeonId];
    const startFloor = resolveStartFloor(progress);
    // Phase 5a.1: level 기반 성장 반영. Phase 2-A: heroXp 풀 기준 영웅 레벨.
    const heroLvl = heroLevelOf(state);
    const leveledHero = computeHeroForLevel(state.hero, heroLvl);
    const session = buildSession(dungeonId, leveledHero, startFloor, undefined, {
      ngPlusLevel: state.ngPlusLevel ?? 0,
      heroLevel: heroLvl,
      combatBuff: state.combatBuff,
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

    // Phase 2-A: heroXp 풀 기준 영웅 레벨.
    const heroLvl = heroLevelOf(state);
    const leveledHero = computeHeroForLevel(state.hero, heroLvl);

    // 주간 던전은 F30 고정 시작 (짧은 도전 run). ngPlusLevel 은 영향 X —
    // weekly affix 자체가 별도 난이도 소스.
    const session = buildSession(dungeonId, leveledHero, 30, undefined, {
      ngPlusLevel: 0,
      isWeeklyVariant: true,
      weeklyAffixId: state.weeklyVariant.affixId,
      heroLevel: heroLvl,
      combatBuff: state.combatBuff,
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
    // 굴림틀 이벤트 등장 게이트가 오늘 횟수(shopDaily.slotSpins)를 읽는다 —
    //   상한에 닿은 날은 굴림틀이 후보에서 빠진다.
    const next = stepSession(state.currentSession, {
      slotSpinsToday: slotSpinsToday(state.shopDaily),
    });
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
    // 굴림틀 pity — 상태 스트릭을 롤 입력으로 넘기고, 굴림이 실제로 일어났으면
    //   결과로 상태를 갱신한다 (보상 0 / 꽝 +1). 세션은 스트릭을 갖지 않는다.
    //   여기서 바로 persist 되므로 스트릭은 탐험 종료를 기다리지 않고 클라우드로 나간다.
    //   오늘 굴림 횟수(shopDaily.slotSpins)도 같은 seam — 스냅샷을 넘기고, 굴림이
    //   실제로 일어났으면 +1. 세션은 두 카운터 어느 쪽도 갖지 않는다.
    const streak = normalizeSlotBlankStreak(state.slotBlankStreak);
    const spinsToday = slotSpinsToday(state.shopDaily);
    const next = applyChoice(state.currentSession, optionIndex, {
      slotBlankStreak: streak,
      slotSpinsToday: spinsToday,
    });
    const spin = findNewSlotSpin(state.currentSession, next);
    const newState = spin
      ? {
          currentSession: next,
          slotBlankStreak: nextSlotBlankStreak(streak, spin.outcome),
          shopDaily: { ...currentShopDaily(state.shopDaily), slotSpins: spinsToday + 1 },
        }
      : { currentSession: next };
    set(newState);
    // Phase 12 R3 — persist 추가. 선택 직후 새로고침 시 reward/effects 손실 방지.
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, ...newState }));
  },

  spinSlotAgain() {
    const state = get();
    const s = state.currentSession;
    // 결과 모달이 떠 있는 동안 세션은 active 로 돌아와 있다(tick 은 뷰가 멈춘다).
    //   상한·런 수입 게이트는 여기서 한 번, applyChoice 의 spinSlot 분기에서 또 한 번.
    if (!s || s.status !== "active" || !canSpinSlot(s, slotSpinsToday(state.shopDaily))) return;
    const armed: CombatSession = {
      ...s,
      log: [
        ...s.log,
        {
          type: "choice",
          prompt: SLOT_EVENT.prompt,
          promptKey: SLOT_EVENT.promptKey,
          options: SLOT_EVENT.options,
          timestamp: Date.now(),
        },
      ],
      status: "awaitingChoice",
      pendingChoiceIndex: s.log.length,
    };
    set({ currentSession: armed });
    // 스트릭 입력·갱신·persist 는 전부 resolveChoice 가 맡는다 — 규칙을 두 곳에 두지 않는다.
    get().resolveChoice(0);
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
    // Phase 2-A — 정산 전에 풀 시드를 보장한다 (공통 규칙: "acknowledgeSessionEnd 맨 앞").
    //   여기서도 시드하지 못하면(progress 가 어디에도 없음) 이번 정산은 heroXp 를
    //   쓰지 않는다 — undefined 를 0 + gain 으로 굳히면 레거시 레벨을 영영 잃는다.
    get().ensureHeroXp();
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

    // 5. Phase 2-A (Track A) — 세션 XP 를 **영웅 XP 풀** 에 정산한다. 계정
    //    XP(useGameStore.progress)는 건드리지 않는다 (피드백 32: 완전 분리).
    //    미시드(ensureHeroXp 도 실패)면 settled = null → heroXp 를 쓰지 않는다.
    const settled =
      state.heroXp === undefined
        ? null
        : settleHeroXp(state.heroXp, session.rewards.xp);
    // 주간 점수/리더보드에 쓰는 영웅 레벨 — 정산 후 풀 기준.
    const heroLv = settled ? settled.newLevel : heroLevelOf(state);

    // Phase 11c — weekly variant 세션이었으면 clearedDungeons / bestScore 업데이트.
    //   F30 까지 도달 안 했어도 점수는 산출 (floorsCleared 기반).
    //   최고 점수 경신 시 Firestore 업로드 (로그인 유저만, 비동기).
    let newWeeklyVariant = state.weeklyVariant;
    // Phase 16 (Track C, 피드백 30) — 주간 악몽 보상. 파생값이라 저장 필드 없음.
    //   SessionResultModal 이 같은 함수로 미리 보여준다. 상태 커밋 전에 계산해야
    //   clearedDungeons 갱신 전의 "첫 클리어 / 7→8" 판정이 맞다.
    const weeklyReward =
      session.isWeeklyVariant && state.weeklyVariant
        ? computeWeeklyClearReward(session, state.weeklyVariant)
        : null;
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
            // Phase 13 review #13 — 익명 fallback 을 현재 언어로 i18n.
            //   리더보드는 전세계 유저가 공유하므로 유저 각자의 앱 언어에 맞는
            //   익명 라벨이 저장 → EN 유저가 업로드하면 "Anonymous Hero" 로 저장.
            const lang = useGameStore.getState().progress.language;
            const anon = t("uphero.leaderboard.anonymous", lang);
            const displayName = await mod.getDisplayName(anon);
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
    // Track C: 주간 보상 (weeklyReward) 합산. Track A 는 이 앞에 settleHeroXp,
    //   Track E 는 splitDropsByCap 을 끼운다 (공통 규칙 병합 순서).
    const newCoins =
      state.coins + session.rewards.coins + (weeklyReward?.coins ?? 0);
    const newInventory = [...state.inventory, ...keptDrops];
    // 탐험 중 모은 방지권 정산. 보스 드롭·보물상자·굴림틀이 session.rewards 에
    //   쌓아둔 것을 여기서 한 번에 합산한다. 상한 초과분은 조용히 잘린다.
    const newDestroyGuards = Math.min(
      ENHANCE_GUARD_MAX,
      clampGuards(state.destroyGuards) +
        (session.rewards.destroyGuards ?? 0) +
        (weeklyReward?.destroyGuards ?? 0),
    );
    const newDownGuards = Math.min(
      ENHANCE_GUARD_MAX,
      clampGuards(state.downGuards) +
        (session.rewards.downGuards ?? 0) +
        (weeklyReward?.downGuards ?? 0),
    );
    // 전투 버프 잔여 횟수를 세션에서 되받는다. 전투마다 닳는 곳은 전투 로직
    //   한 곳뿐이고 (upHeroCombat.consumeCombatBuff), 여기서는 결과만 옮긴다.
    const newCombatBuff = normalizeCombatBuff(session.combatBuff);
    const newState = {
      coins: newCoins,
      inventory: newInventory,
      dungeons,
      codex,
      ngPlusLevel: newNgPlusLevel,
      weeklyVariant: newWeeklyVariant,
      destroyGuards: newDestroyGuards,
      downGuards: newDownGuards,
      combatBuff: newCombatBuff,
      // Phase 2-A — 정산된 영웅 XP 풀 (미시드면 키를 싣지 않아 undefined 유지).
      ...(settled ? { heroXp: settled.heroXp } : {}),
      currentSession: null,
    };
    set(newState);
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, ...newState }));
    // Phase 2-A — 레벨 마일스톤 (SP 재계산 · novice · 레벨업 오버레이 · 전직 제안).
    //   persist 뒤에 호출 — 마일스톤이 hero 를 바꾸면 각자 다시 persist 한다.
    if (settled) applyHeroLevelMilestones(settled.prevLevel, settled.newLevel);
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
    // Phase 12a — 하루 2장 cap 추가. date 가 오늘이 아니면 자동 reset.
    const state = get();
    if (state.coins < SHOP_PRICES.ticket) return false;
    const gameStore = useGameStore.getState();
    const MAX_TICKETS = 10;
    if ((gameStore.progress.tickets ?? 0) >= MAX_TICKETS) return false;

    const today = getTodayString();
    const prevDaily = gameStore.progress.cardmatchShopDaily;
    const curDaily =
      prevDaily && prevDaily.date === today
        ? prevDaily
        : { date: today, bought: 0 };
    if (curDaily.bought >= DAILY_CARDMATCH_TICKET_CAP) return false;

    const newCoins = state.coins - SHOP_PRICES.ticket;
    const newTickets = Math.min(MAX_TICKETS, (gameStore.progress.tickets ?? 0) + 1);
    const newProgress = {
      ...gameStore.progress,
      tickets: newTickets,
      cardmatchShopDaily: { date: today, bought: curDaily.bought + 1 },
    };
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
    const gameStore = useGameStore.getState();
    // 컬렉션 100% 상태에서는 팩을 팔지 않는다 — 환급 케이스를 새로 만들지 않기 위해.
    if (gameStore.progress.unlockedCardIds.length >= ALL_CARDS.length) return false;
    const newCoins = state.coins - price;

    const newProgress = { ...gameStore.progress };
    if (size === "full") {
      // 풀 카드팩은 레벨업 팩(pendingPacks) 이 아니라 별도 큐 — 항상 5장, rare+ 보장.
      newProgress.pendingFullPacks = (newProgress.pendingFullPacks ?? 0) + 1;
    } else {
      newProgress.pendingBonusCards = (newProgress.pendingBonusCards ?? 0) + 1;
    }
    useGameStore.setState({ progress: newProgress, isOpeningPack: true });
    saveToStorage("progress", newProgress);

    set({ coins: newCoins });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, coins: newCoins }));
    return true;
  },

  purchaseDownGuard() {
    const state = get();
    const price = SHOP_PRICES.downGuard;
    if (state.coins < price) return false;
    const cur = clampGuards(state.downGuards);
    // 상한에서 구매를 막는다 — 코인만 빼가고 개수가 안 오르는 결제는 없어야 한다.
    if (cur >= ENHANCE_GUARD_MAX) return false;
    const newCoins = state.coins - price;
    const next = cur + 1;
    set({ coins: newCoins, downGuards: next });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, coins: newCoins, downGuards: next }),
    );
    return true;
  },

  grantEnhanceGuards({ destroy = 0, down = 0 }) {
    const state = get();
    const wantDestroy = Number.isFinite(destroy) ? Math.max(0, Math.floor(destroy)) : 0;
    const wantDown = Number.isFinite(down) ? Math.max(0, Math.floor(down)) : 0;
    if (wantDestroy === 0 && wantDown === 0) return { destroy: 0, down: 0 };
    const curDestroy = clampGuards(state.destroyGuards);
    const curDown = clampGuards(state.downGuards);
    // 상한을 넘는 만큼은 버린다. 지급 실패가 아니라 "가득 찼다" 이므로 조용히 자른다.
    const nextDestroy = Math.min(ENHANCE_GUARD_MAX, curDestroy + wantDestroy);
    const nextDown = Math.min(ENHANCE_GUARD_MAX, curDown + wantDown);
    set({ destroyGuards: nextDestroy, downGuards: nextDown });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, destroyGuards: nextDestroy, downGuards: nextDown }),
    );
    return { destroy: nextDestroy - curDestroy, down: nextDown - curDown };
  },

  grantCombatBuff(pct, battles) {
    const state = get();
    const next = normalizeCombatBuff({ pct, battlesLeft: battles });
    if (!next) return;
    const cur = normalizeCombatBuff(state.combatBuff);
    // 겹치지 않는다 — 더 좋은 쪽만 남긴다 (pct 우선, 같으면 남은 전투 수).
    if (cur) {
      const curBetter =
        cur.pct > next.pct ||
        (cur.pct === next.pct && cur.battlesLeft >= next.battlesLeft);
      if (curBetter) return;
    }
    set({ combatBuff: next });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, combatBuff: next }));
  },

  addCoins(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    const state = get();
    const newCoins = state.coins + Math.floor(n);
    set({ coins: newCoins });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, coins: newCoins }));
  },

  spendCoins(n) {
    if (!Number.isFinite(n) || n <= 0) return false;
    const cost = Math.floor(n);
    const state = get();
    // 부분 차감 없음 — 잔액이 모자라면 상태를 건드리지 않고 실패로 끝낸다.
    if (state.coins < cost) return false;
    const newCoins = state.coins - cost;
    set({ coins: newCoins });
    saveToStorage(STORAGE_KEY, pickPersisted({ ...state, coins: newCoins }));
    return true;
  },

  claimWelcomeGrant() {
    const state = get();
    const amount = state.pendingWelcomeGrant;
    // 이미 받았거나 예약이 없으면 no-op. 오버레이가 중복 마운트돼도 안전.
    if (!amount || state.welcomeGrantClaimed) {
      if (state.pendingWelcomeGrant !== null) set({ pendingWelcomeGrant: null });
      return 0;
    }
    const newCoins = state.coins + amount;
    set({ coins: newCoins, welcomeGrantClaimed: true, pendingWelcomeGrant: null });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, coins: newCoins, welcomeGrantClaimed: true }),
    );
    return amount;
  },

  purchasePass(dungeonId) {
    // Phase 11a — 갓생 상점에서 탐험권 1장 구매. 고정 80 코인, 하루 2장 cap.
    const state = get();
    const price = SHOP_PRICES.expeditionPass;
    if (state.coins < price) return "no-coin";

    // daily reset 체크 — date 가 바뀌었으면 shopDaily 카운터가 0 으로 리셋돼
    //   새 cap 기준으로 판정 (currentShopDaily).
    const daily = currentShopDaily(state.shopDaily);
    if (daily.passesBought >= DAILY_PASS_PURCHASE_CAP) return "daily-cap";

    // 던전별 cap (PASS_CAP_PER_CATEGORY=20) 체크
    const currentPasses = state.passes[dungeonId] ?? 0;
    if (currentPasses >= PASS_CAP_PER_CATEGORY) return "pass-cap";

    const newPasses = { ...state.passes, [dungeonId]: currentPasses + 1 };
    const newCoins = state.coins - price;
    // 동일 날짜 내 coinPouchClaimed 등 인접 필드를 보존하려고 daily 를 spread.
    const newShopDaily = { ...daily, passesBought: daily.passesBought + 1 };

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

  claimCoinPouch(multiplier = 1) {
    const state = get();
    const daily = currentShopDaily(state.shopDaily);
    if (daily.coinPouchClaimed) return { ok: false };

    // [MIN, MAX] 균등 정수 랜덤 — inclusive 양 끝.
    // 배수는 광고 시청 보상(2배) 전용. 그 외 값이 들어오면 1 로 방어.
    const mult = multiplier === 2 ? 2 : 1;
    const rolled =
      (Math.floor(Math.random() * (COIN_POUCH_MAX - COIN_POUCH_MIN + 1)) +
        COIN_POUCH_MIN) *
      mult;
    const newCoins = state.coins + rolled;
    const newShopDaily = { ...daily, coinPouchClaimed: true };

    set({ coins: newCoins, shopDaily: newShopDaily });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({
        ...state,
        coins: newCoins,
        shopDaily: newShopDaily,
      }),
    );
    return { ok: true, coins: rolled };
  },

  enhanceItem(id, guards = {}) {
    const useDestroyGuard = guards.destroy === true;
    const useDownGuard = guards.down === true;
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
    const roll = rng();
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

    // 실패 — 코인은 어쨌든 차감. 실패의 결과는 소실 / 하락 / 유지 3분기다.
    //   확률은 enhanceOutcomeRates 단일 출처에서 온다 (UI 표기와 같은 값).
    //   currentLevel 0..2 는 셋 다 keep=1 이라 안전 구간이다.
    //
    // Phase 15 방지권 계약 — 여기가 그 계약의 유일한 집행 지점이다:
    //   1) 판정은 방지권 보유·장착 여부와 무관하게 원래 확률로 굴린다.
    //   2) 결과가 유지면 막을 것이 없으므로 **아무것도 소모하지 않는다**.
    //   3) 소실이 났고 소실방지권을 걸었고 보유가 1 이상일 때만 1장 태우고 지킨다.
    //   4) 하락도 같은 규칙으로 하락방지권이 막는다.
    // 소실과 하락은 배타적이므로 한 시도에서 두 종류가 같이 소모되지 않는다.
    const rates = enhanceOutcomeRates(item.rarity, curLevel);
    // 누적 구간 한 번의 롤로 3분기를 가른다 — 두 번 굴리면 두 표의 확률이
    // 조건부로 얽혀 UI 에 적어둔 숫자와 실제가 달라진다.
    const outcomeRoll = rng();
    const rolled: "destroy" | "down" | "keep" =
      outcomeRoll < rates.destroy
        ? "destroy"
        : outcomeRoll < rates.destroy + rates.down
          ? "down"
          : "keep";

    const heldDestroyGuards = clampGuards(state.destroyGuards);
    const heldDownGuards = clampGuards(state.downGuards);
    const guardedDestroy =
      rolled === "destroy" && useDestroyGuard && heldDestroyGuards > 0;
    const guardedDown = rolled === "down" && useDownGuard && heldDownGuards > 0;
    const nextDestroyGuards = guardedDestroy
      ? heldDestroyGuards - 1
      : heldDestroyGuards;
    const nextDownGuards = guardedDown ? heldDownGuards - 1 : heldDownGuards;
    const newCoins = state.coins - cost;

    // 실패 공통 — failStreak +1 (다음 시도에 pity 보너스 적용).
    //   Phase 14 code-review Medium #14 — pity 포뮬러는 streak 15~20 에서 이미
    //   100% 포화이므로 이 이상 값은 의미 없이 persisted 숫자만 증가. 100 cap
    //   으로 UI overflow / future type drift 방지.
    const nextStreak = Math.min(100, curStreak + 1);

    if (rolled === "keep" || guardedDestroy || guardedDown) {
      const newItem: Equipment = { ...item, enhanceFailStreak: nextStreak };
      const { inventory: newInventory, hero: newHero } = replaceItem(newItem);
      const patch = {
        coins: newCoins,
        inventory: newInventory,
        hero: newHero,
        destroyGuards: nextDestroyGuards,
        downGuards: nextDownGuards,
      };
      set(patch);
      saveToStorage(STORAGE_KEY, pickPersisted({ ...state, ...patch }));
      if (guardedDestroy) {
        return { ok: false, reason: "guarded", item: newItem, guard: "destroy" };
      }
      if (guardedDown) {
        return { ok: false, reason: "guarded", item: newItem, guard: "down" };
      }
      return { ok: false, reason: "keep", item: newItem };
    }

    if (rolled === "down") {
      // 하락 — 성공 경로의 정확한 역연산이어야 한다. 성공은 "새 레벨이 짝수일 때
      //   primary stat +1" 이었으므로, 없어지는 레벨(curLevel)이 짝수면 그때 붙은
      //   +1 을 같은 키에서 뺀다. 성공 직후에도 그 키가 여전히 최대값이라
      //   (증가시킨 키가 최대였고 +1 로 더 커졌다) pickPrimaryStatKey 는 같은 키를
      //   돌려준다 — 그래서 왕복이 닫힌다. 성공 규칙을 바꾸면 여기도 같이 바꿀 것.
      const newLevel = Math.max(0, curLevel - 1);
      const newStats: Equipment["stats"] = { ...item.stats };
      if (curLevel % 2 === 0 && curLevel > 0) {
        const primaryKey = pickPrimaryStatKey(item.stats);
        if (primaryKey) {
          // 0 미만으로는 내리지 않는다 — 손상된 저장본이 음수 스탯을 만들지 않게.
          newStats[primaryKey] = Math.max(0, (newStats[primaryKey] ?? 0) - 1);
        }
      }
      const baseName = stripEnhanceSuffix(item.name);
      const newItem: Equipment = {
        ...item,
        name: newLevel >= 1 ? `${baseName} +${newLevel}` : baseName,
        stats: newStats,
        enhanceLevel: newLevel,
        enhanceFailStreak: nextStreak,
      };
      const { inventory: newInventory, hero: newHero } = replaceItem(newItem);
      const patch = {
        coins: newCoins,
        inventory: newInventory,
        hero: newHero,
        destroyGuards: nextDestroyGuards,
        downGuards: nextDownGuards,
      };
      set(patch);
      saveToStorage(STORAGE_KEY, pickPersisted({ ...state, ...patch }));
      return { ok: false, reason: "down", item: newItem, prevLevel: curLevel };
    }

    // 소실 — inventory 혹은 equipped slot 에서 제거.
    const { inventory: newInventory, hero: newHero } = removeItem();
    const lostName = item.name;
    const lostBaseId = item.baseId;
    set({ inventory: newInventory, hero: newHero, coins: newCoins });
    saveToStorage(
      STORAGE_KEY,
      pickPersisted({ ...state, inventory: newInventory, hero: newHero, coins: newCoins }),
    );
    return { ok: false, reason: "destroyed", lostItemName: lostName, lostBaseId };
  },

  _setFromCloud: (state) => {
    set({
      ...state,
      // Phase 2-A — heroXp 는 spread 에 맡기지 않고 **명시적으로** 페이로드 값을 쓴다
      //   (없으면 undefined). 온보딩 레이스에서 로컬이 progress Lv1 기준 0 으로
      //   먼저 시드됐어도, 구 클라이언트 문서(키 없음)를 채택하는 순간 미시드로
      //   되돌려 아래 ensureHeroXp 가 클라우드 progress(Lv47) 로 다시 시드하게 한다.
      heroXp: normalizeHeroXp(state.heroXp),
      // Phase 15 — 방지권/버프는 클라우드에서 온 값도 로컬과 같은 계약으로 접는다.
      //   와이어는 만료된 버프를 {pct:0,battlesLeft:0} 껍데기로 실어 보내므로
      //   (merge 로 되살아나는 걸 막으려고) 여기서 undefined 로 되돌려야 한다.
      destroyGuards: clampGuards(state.destroyGuards),
      downGuards: clampGuards(state.downGuards),
      combatBuff: normalizeCombatBuff(state.combatBuff),
      // 굴림틀 pity 스트릭 — 키가 없는 옛 문서는 0. 손상 값은 같은 계약으로 접는다.
      slotBlankStreak: normalizeSlotBlankStreak(state.slotBlankStreak),
      // 시작 선물은 계정 단위 1회 — 클라우드가 "이미 받음" 이면 로컬 예약을 거둔다.
      // (그대로 두면 오버레이가 떴다가 claimWelcomeGrant 가 0 을 반환해 빈손으로 닫힌다.)
      ...(state.welcomeGrantClaimed ? { pendingWelcomeGrant: null } : {}),
      isLoaded: true,
    });
    // localStorage 직접 저장: saveToStorage 를 거치면 syncToCloud 가 다시
    // 호출되어 echo 루프가 된다 (useRetentionStore._setFromCloud 와 동일 패턴).
    // pickPersisted 로 다시 뽑는 이유 — 동기화 대상이 아닌 currentSession 은
    // 로컬 값을 그대로 유지해야 하므로 페이로드가 아니라 병합 결과를 저장한다.
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("upnext_uphero", JSON.stringify(pickPersisted(get())));
      } catch {
        // storage full / private mode: 메모리 상태만 유지
      }
    }
    // Phase 2-A — 시드/SP 정리는 microtask 로 미룬다. 이 함수는 (1) 클라우드
    //   리스너 콜백 안(isUpdatingFromCloud=true) 이나 (2) 부트스트랩의 setSyncReady
    //   이전에 불리므로, 동기적으로 persist 하면 syncToCloud 가 조용히 버려 시드값이
    //   업로드되지 않는다. microtask 는 리스너의 finally / 동기 setSyncReady(true)
    //   뒤에 돌아 업로드 게이트를 통과한다 (두 번째 기기가 레거시 공식으로 재시드하는
    //   핑퐁 차단).
    queueMicrotask(() => {
      get().ensureHeroXp();
      get().reconcileSkillPoints();
    });
  },

  resetForSignOut: () => {
    const now = Date.now();
    set({
      hero: createDefaultHero(),
      inventory: [],
      coins: 0,
      passes: {},
      dungeons: {},
      currentSession: null,
      pendingDungeon: null,
      codex: { monsters: [], equipment: [], bosses: [] },
      cosmetics: {},
      lastIdleAccrualAt: now,
      lastSeenAt: now,
      heroStartLevel: undefined,
      heroXp: undefined,
      pendingHeroLevelUp: null,
      shopDaily: undefined,
      ngPlusLevel: 0,
      destroyGuards: 0,
      downGuards: 0,
      combatBuff: undefined,
      slotBlankStreak: 0,
      weeklyVariant: undefined,
      idleReward: null,
      pendingClassAwaken: null,
      pendingClassChoice: null,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      // 로그아웃 = 다른 계정으로 갈아탈 준비. 시작 선물도 계정 단위로 다시 판정한다.
      welcomeGrantClaimed: false,
      pendingWelcomeGrant: null,
      isLoaded: false,
    });
  },
  };
});

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
