import { create } from "zustand";
import type { ChallengeCard, Rarity } from "@/types/card";
import type { DailyState, GameMode, UserProgress, DayRecord, Language, ChallengePhase } from "@/types/game";
import { MODE_CARD_COUNT, XP_PER_RARITY, totalXPForLevel, getLevelFromXP, normalizeProgressXpLevel, PHASE_MIN_CARDS, PHASE_MAX_CARDS, MINIGAME_TICKET_CAP } from "@/types/game";
import { ALL_CARDS, STARTER_CARD_IDS } from "@/data/cards";
import { drawCards, drawFromPool } from "@/lib/deck";
import {
  drawTierPack,
  rollPackTier,
  PACK_TIER_COUNT,
  COLLECTION_COMPENSATION_PER_TIER,
  COLLECTION_COMPENSATION_BONUS,
  COLLECTION_FIRST_CLEAR_BONUS,
  rollCompensationForLevels,
} from "@/data/packTier";
import { saveToStorage, loadFromStorage } from "@/lib/storage";
import { compareProgress } from "@/lib/progressCompare";
import { STARTER_PACKS } from "@/data/starterPacks";
import { scheduleChallengeReminder, cancelChallengeReminder, showChallengeStatus, hideChallengeStatus, showInstantNotify, scheduleExtraNudge, cancelExtraNudge } from "@/lib/notifications";
import { t } from "@/i18n";
import { useUpHeroStore } from "./useUpHeroStore";
import { SHOP_PRICES } from "@/types/uphero";

/**
 * Phase 13 review Critical #1 — `completionHistory` 는 매일 push 되므로 2-3 년
 *   사용자의 localStorage 를 잠식. 하루 1 entry 기준 365 일 × ~200 bytes =
 *   ~73 KB 상한. 365 이전 기록은 stats 계산에 쓰지 않으므로 안전.
 */
export const COMPLETION_HISTORY_CAP = 365;

// 오늘 날짜를 "2026-04-01" 형식으로 반환
// 하루 기준: 새벽 1시 ~ 다음날 00:59 (절대시간 1시간 감산 후 로컬 날짜)
// Phase 11a — useUpHeroStore 의 shopDaily reset 에서도 공용으로 쓰이므로 export.
// 트랙 2-1: src/lib/retention.ts 의 retentionTodayString() 이 동일 로직의 의도적
// 중복 구현 (순수 lib 이 스토어 모듈 그래프를 끌지 않기 위해). 데이 경계를
// 바꾸면 반드시 sync.ts hydrateDaily 인라인 폴백까지 3곳을 함께 수정할 것.
// iOS AppClock.productDayString 의 addingTimeInterval(-3600) 과 동일하게 절대시간
// 감산 사용 — 벽시계 감산(setHours)은 DST 전환 1시간 창에서 iOS 와 날짜가 어긋난다.
export function getTodayString(): string {
  const d = new Date(Date.now() - 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 초기 유저 진행도
function getInitialProgress(): UserProgress {
  return {
    currentStreak: 0,
    longestStreak: 0,
    totalDaysCompleted: 0,
    unlockedCardIds: [...STARTER_CARD_IDS],
    completionHistory: [],
    categoryCompletions: {
      fitness: 0,
      nutrition: 0,
      mindfulness: 0,
      learning: 0,
      social: 0,
      productivity: 0,
      wellness: 0,
      trending: 0,
    },
    mode: "normal",
    level: 0,
    xp: 0,
    daysTowardNextLevel: 0,
    pendingPacks: 0,
    pendingBonusCards: 0,
    cardCompletions: {},
    extraChallengesCompleted: 0,
    superChallengesCompleted: 0,
    equippedTitleId: null,
    seenTitleIds: [],
    hasPendingPenalty: false,
    language: "en",
    soundEnabled: true,
    hapticEnabled: true,
    notificationsEnabled: false,
    notificationTime: "09:00",
    // 미니게임
    tickets: 0,
    minigameRunsPlayed: 0,
    minigameBestMatches: 0,
  };
}

// 초기 일일 상태
function getInitialDailyState(): DailyState {
  return {
    date: getTodayString(),
    drawnCards: [],
    selectedCards: [],
    completedIds: [],
    isDrawComplete: false,
    isSelectionComplete: false,
    rerollUsed: false,
    // 추가 챌린지 시스템
    challengePhase: "daily",
    extraDrawnCards: [],
    extraSelectedCards: [],
    extraCompletedIds: [],
    extraDrawComplete: false,
    extraSelectionComplete: false,
    superDrawnCards: [],
    superSelectedCards: [],
    superCompletedIds: [],
    superDrawComplete: false,
    superSelectionComplete: false,
    // 실패 패널티
    hasPenalty: false,
    penaltyCardId: null,
    // 알림
    extraNudgeScheduled: false,
  };
}

/**
 * 오늘의 DailyState 진행 정도를 단일 정수로 환산한다.
 * _setFromCloud가 stale 클라우드 snapshot으로 로컬 진행을 덮어쓰는
 * 레이스 컨디션을 막기 위한 단조 비교용.
 *
 * 가중치 설계 — phase 간 100배 간격을 두어
 * daily 단계가 완전히 끝나야 extra, extra가 끝나야 super로 올라가는
 * 파이프라인 순서를 반영한다.
 * (daily max≈33, extra base=100, extra max≈1413, super base=10000)
 *
 * rerollUsed를 포함하는 이유: 리롤은 drawnCards를 통째로 교체하므로,
 * 클라우드가 리롤 전 상태를 보내면 교체된 카드가 사라질 수 있다.
 */
function dailyProgressScore(d: DailyState): number {
  let s = 0;
  // daily phase
  if (d.isDrawComplete) s += 1;
  if (d.rerollUsed) s += 1;
  s += (d.selectedCards?.length || 0) * 2;
  if (d.isSelectionComplete) s += 10;
  s += (d.completedIds?.length || 0) * 5;
  // extra phase
  if (d.extraDrawComplete) s += 100;
  s += (d.extraSelectedCards?.length || 0) * 2;
  if (d.extraSelectionComplete) s += 1000;
  s += (d.extraCompletedIds?.length || 0) * 50;
  // super phase
  if (d.superDrawComplete) s += 10000;
  s += (d.superSelectedCards?.length || 0) * 2;
  if (d.superSelectionComplete) s += 100000;
  s += (d.superCompletedIds?.length || 0) * 500;
  return s;
}

interface GameStore {
  // 상태
  daily: DailyState;
  progress: UserProgress;
  isLoaded: boolean;
  hasCompletedOnboarding: boolean;
  isOpeningPack: boolean;
  isLocalEmpty: boolean;
  // 컬렉션 100% 첫 달성 시 한 번만 토글되는 축하 모달 플래그.
  // CardPackOpener 닫힘 → 다음 프레임에 CollectionCelebration 마운트.
  collectionCelebration: boolean;

  // 액션
  initialize: () => void;
  drawDailyCards: () => void;
  rerollCards: (payment: "coins" | "ad") => boolean;
  selectCard: (card: ChallengeCard) => void;
  deselectCard: (cardId: string) => void;
  confirmSelection: () => void;
  completeChallenge: (cardId: string) => void;
  setMode: (mode: GameMode) => void;
  cancelPendingMode: () => void;
  checkDailyReset: () => void;
  completeOnboarding: () => void;
  selectStarterPack: (packId: string) => void;
  openCardPack: () => { cards: ChallengeCard[]; tier: Rarity };
  dismissPackOpener: () => void;
  dismissCollectionCelebration: () => void;
  setLanguage: (lang: Language) => void;
  toggleSound: () => void;
  toggleHaptic: () => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationTime: (time: string) => void;
  equipTitle: (titleId: string | null) => void;
  markTitlesSeen: (titleIds: string[]) => void;
  markPatchNotesSeen: (version: string) => void;
  markReviewPromptShown: () => void;
  _setFromCloud: (
    progress: UserProgress,
    daily: DailyState,
    options?: { force?: boolean },
  ) => void;

  /**
   * 트랙 2-1: 불꽃 체크인 결과를 progress 스트릭에 반영
   * (iOS GameStore.checkInToday 미러). 라이트 스트릭이 사용자에게 보이는
   * currentStreak/longestStreak 의 진실원이 되도록 두 값을 덮어쓴다.
   * useRetentionStore.checkInToday() 전용.
   */
  _applyLightStreak: (currentLightStreak: number, bestLightStreak: number) => void;

  /**
   * Phase 14 security — 로그아웃 시 in-memory state 초기화.
   * localStorage wipe 와 별개로 zustand 싱글톤도 초기값으로 되돌려, reload 가
   * 실패해도 이전 유저 데이터가 UI 에 드러나지 않도록 이중 방어.
   */
  resetForSignOut: () => void;

  // 추가 챌린지 시스템
  startExtraChallenge: () => void;
  startSuperChallenge: () => void;
  drawPhaseCards: () => void;
  selectPhaseCard: (card: ChallengeCard) => void;
  deselectPhaseCard: (cardId: string) => void;
  confirmPhaseSelection: () => void;
  completePhaseChallenge: (cardId: string) => void;

  // 미니게임
  spendTicket: () => boolean;  // true면 성공(차감됨), false면 티켓 부족
  grantMinigameRewards: (args: {
    unlockCardIds?: string[];   // 새로 언락할 카드 ID들 (1~2장)
    xpGainPerCard?: { cardId: string; amount: number }[]; // 중복 카드 XP 지급
    matchesThisRun: number;     // 이번 런 총 매치 수 (최고 기록 갱신용)
  }) => void;
}

// 이중 완료 방지용 락
const completingCardIds = new Set<string>();

export const useGameStore = create<GameStore>((set, get) => ({
  daily: getInitialDailyState(),
  progress: getInitialProgress(),
  isLoaded: false,
  hasCompletedOnboarding: false,
  isOpeningPack: false,
  isLocalEmpty: false,
  collectionCelebration: false,

  // 앱 시작 시 LocalStorage에서 데이터 복원
  initialize: () => {
    if (get().isLoaded) return;
    const savedOnboarding = loadFromStorage<boolean>("onboarding_complete");
    const savedProgress = loadFromStorage<UserProgress>("progress");
    const savedDaily = loadFromStorage<DailyState>("daily");
    const today = getTodayString();

    const progress = { ...getInitialProgress(), ...savedProgress } as UserProgress;
    // 신규 카테고리 idempotent 백필 — 기존 유저의 categoryCompletions 에 누락된 키가 있으면 0 으로 채움
    // (saved spread 가 nested object 까지 깊이 머지하지 않으므로 신규 키는 여기서 보강해야 한다)
    progress.categoryCompletions = {
      ...getInitialProgress().categoryCompletions,
      ...progress.categoryCompletions,
    };
    // 신규 카테고리(trending) starter 카드 idempotent 백필 —
    // 트렌드 카테고리는 "각국 트렌드 노출" 자체가 핵심 가치라서 starter pack 선택과 무관하게
    // unlockCondition 없는 11장이 모든 유저의 deck 에 항상 들어 있어야 한다.
    // (기존 카테고리는 pack 픽 결과를 존중하여 건드리지 않음 — curated 6장 UX 보존)
    const trendingStarterIds = ALL_CARDS.filter(
      (c) => c.category === "trending" && !c.unlockCondition
    ).map((c) => c.id);
    const missingTrendingStarters = trendingStarterIds.filter(
      (id) => !progress.unlockedCardIds.includes(id)
    );
    if (missingTrendingStarters.length > 0) {
      progress.unlockedCardIds = [...progress.unlockedCardIds, ...missingTrendingStarters];
    }
    // Phase 13 review C#1 — 기존 유저 completionHistory migration. 365 이전
    //   오래된 entry 절삭. 신규 cap 과 동일하게 유지. (migration idempotent)
    if (
      Array.isArray(progress.completionHistory) &&
      progress.completionHistory.length > COMPLETION_HISTORY_CAP
    ) {
      progress.completionHistory = progress.completionHistory.slice(
        -COMPLETION_HISTORY_CAP,
      );
    }
    let daily = { ...getInitialDailyState(), ...savedDaily } as DailyState;
    // 기존 저장 데이터에 새 필드가 없을 수 있으므로 배열 필드 보정
    daily.extraDrawnCards = daily.extraDrawnCards || [];
    daily.extraSelectedCards = daily.extraSelectedCards || [];
    daily.extraCompletedIds = daily.extraCompletedIds || [];
    daily.superDrawnCards = daily.superDrawnCards || [];
    daily.superSelectedCards = daily.superSelectedCards || [];
    daily.superCompletedIds = daily.superCompletedIds || [];
    daily.challengePhase = daily.challengePhase || "daily";

    // 날짜가 바뀌었으면 리셋
    if (daily.date !== today) {
      // 어제 기록 저장
      if (daily.isSelectionComplete && daily.selectedCards.length > 0) {
        const wasFullClear = daily.completedIds.length >= daily.selectedCards.length;
        const dailyFailed = !wasFullClear;
        const extraDone = daily.extraSelectionComplete && daily.extraCompletedIds.length >= daily.extraSelectedCards.length;
        const superDone = daily.superSelectionComplete && daily.superCompletedIds.length >= daily.superSelectedCards.length;
        // 옵셔널 필드는 조건부 스프레드로 키 자체를 생략한다 — `x || undefined` 로
        // undefined 값 키를 만들면 localStorage JSON 왕복 전의 in-memory progress 가
        // syncToCloud 로 그대로 실려가 Firestore setDoc 이 throw 한다 (sync.ts 의
        // stripUndefined 방어와 이중 안전장치, Swift 의 nil 생략 와이어 포맷과 동일).
        const record: DayRecord = {
          date: daily.date,
          selectedCardIds: daily.selectedCards.map((c) => c.id),
          completedCardIds: daily.completedIds,
          wasFullClear,
          mode: progress.mode,
          ...(extraDone ? { extraCompleted: true } : {}),
          ...(superDone ? { superCompleted: true } : {}),
          ...(dailyFailed ? { wasFailed: true } : {}),
        };
        // Phase 13 review C#1 — history 누적 cap. 최근 365 entry 만 유지.
        progress.completionHistory = [
          ...progress.completionHistory,
          record,
        ].slice(-COMPLETION_HISTORY_CAP);

        if (extraDone) {
          progress.extraChallengesCompleted = (progress.extraChallengesCompleted || 0) + 1;
        }
        if (superDone) {
          progress.superChallengesCompleted = (progress.superChallengesCompleted || 0) + 1;
        }

        // 실패 시 다음 날 패널티 예약
        if (dailyFailed) {
          progress.hasPendingPenalty = true;
        }

        // 스트릭 업데이트
        if (wasFullClear) {
          progress.currentStreak += 1;
          progress.totalDaysCompleted += 1;
          if (progress.currentStreak > progress.longestStreak) {
            progress.longestStreak = progress.currentStreak;
          }
        } else {
          progress.currentStreak = 0;
        }
      }

      // 패널티 소비 → 새 daily에 적용
      const applyPenalty = !!(progress.hasPendingPenalty);
      progress.hasPendingPenalty = false;

      daily = { ...getInitialDailyState(), date: today, hasPenalty: applyPenalty };

      // 일일 리셋 시 챌린지 알림 취소
      cancelChallengeReminder();
      hideChallengeStatus();

      // 예약된 모드 변경 적용
      if (progress.pendingMode) {
        progress.mode = progress.pendingMode;
        progress.pendingMode = null;
      }
    }

    // 2026.04.18 hotfix — XP/level normalize 공용 헬퍼로 위임.
    //   기존 inline 두 블록 (floor migration + level catch-up) 을 동일 로직의
    //   normalizeProgressXpLevel 로 통합. _setFromCloud 와 동일한 규칙 적용 →
    //   cloud↔local 양방향에서 음수 XP 재발 방지.
    Object.assign(progress, normalizeProgressXpLevel(progress).progress);

    const isOpeningPack = (progress.pendingPacks || 0) > 0 || (progress.pendingBonusCards || 0) > 0;
    const isLocalEmpty = !savedOnboarding && !savedProgress;
    set({ daily, progress, isLoaded: true, hasCompletedOnboarding: !!savedOnboarding, isOpeningPack, isLocalEmpty });

    // localStorage가 비어있으면 저장하지 않음 — SyncProvider가 클라우드 확인 후 처리
    if (!isLocalEmpty) {
      saveToStorage("progress", progress);
      saveToStorage("daily", daily);
    }
  },

  // 오늘의 6장 드로우
  drawDailyCards: () => {
    const { progress, daily: currentDaily } = get();
    const unlockedCards = ALL_CARDS.filter((card) =>
      progress.unlockedCardIds.includes(card.id)
    );
    const drawn = drawCards(unlockedCards);

    // 패널티: 6장 중 1장 랜덤 자동 선택 (잠금)
    let penaltyCardId: string | null = null;
    let selectedCards: ChallengeCard[] = [];
    if (currentDaily.hasPenalty && drawn.length > 0) {
      const randomIndex = Math.floor(Math.random() * drawn.length);
      const penaltyCard = drawn[randomIndex];
      penaltyCardId = penaltyCard.id;
      selectedCards = [penaltyCard];
    }

    const daily: DailyState = {
      ...currentDaily,
      drawnCards: drawn,
      selectedCards,
      penaltyCardId,
      isDrawComplete: true,
    };

    set({ daily });
    saveToStorage("daily", daily);
  },

  // 리롤 — 하루 1회, 선택된 카드 초기화 + 새로 6장 드로우.
  //
  // 유료화: 하루 1회 상한(rerollUsed)은 그대로 두고 결제 수단만 추가했다.
  //   - "coins": 갓생 코인 SHOP_PRICES.reroll 차감. 부족하면 아무것도 하지 않고 false.
  //   - "ad": 차감 없음. 리워드 광고를 끝까지 봤다는 보장은 호출부 책임
  //           (showRewardedAd 가 "rewarded" 를 준 경우에만 이 경로로 들어온다).
  // 광고가 유일한 경로가 되면 안 되므로 코인 경로는 항상 병존한다.
  rerollCards: (payment) => {
    const { daily, progress } = get();
    if (daily.rerollUsed || daily.isSelectionComplete) return false;

    // 결제 먼저 — 실패 시 드로우를 진행하지 않아야 "코인만 빠지고 카드는 그대로"
    // 또는 그 반대의 어긋난 상태가 생기지 않는다.
    if (payment === "coins") {
      const paid = useUpHeroStore.getState().spendCoins(SHOP_PRICES.reroll);
      if (!paid) return false;
    }

    const unlockedCards = ALL_CARDS.filter((card) =>
      progress.unlockedCardIds.includes(card.id)
    );
    const drawn = drawCards(unlockedCards);

    // 리롤 시에도 패널티 유지 — 새 6장에서 다시 랜덤 1장 잠금
    let penaltyCardId: string | null = null;
    let selectedCards: ChallengeCard[] = [];
    if (daily.hasPenalty && drawn.length > 0) {
      const randomIndex = Math.floor(Math.random() * drawn.length);
      const penaltyCard = drawn[randomIndex];
      penaltyCardId = penaltyCard.id;
      selectedCards = [penaltyCard];
    }

    const updated: DailyState = {
      ...daily,
      drawnCards: drawn,
      selectedCards,
      penaltyCardId,
      rerollUsed: true,
    };
    set({ daily: updated });
    saveToStorage("daily", updated);
    return true;
  },

  // 카드 선택
  selectCard: (card: ChallengeCard) => {
    const { daily, progress } = get();
    const maxCards = MODE_CARD_COUNT[progress.mode];
    if (daily.selectedCards.length >= maxCards) return;
    if (daily.selectedCards.some((c) => c.id === card.id)) return;

    const updated = {
      ...daily,
      selectedCards: [...daily.selectedCards, card],
    };
    set({ daily: updated });
    saveToStorage("daily", updated);
  },

  // 카드 선택 취소
  deselectCard: (cardId: string) => {
    const { daily } = get();
    if (daily.isSelectionComplete) return;
    if (daily.penaltyCardId === cardId) return; // 패널티 카드는 취소 불가

    const updated = {
      ...daily,
      selectedCards: daily.selectedCards.filter((c) => c.id !== cardId),
    };
    set({ daily: updated });
    saveToStorage("daily", updated);
  },

  // 선택 확정
  confirmSelection: () => {
    const { daily, progress } = get();
    const requiredCount = MODE_CARD_COUNT[progress.mode];
    if (daily.selectedCards.length !== requiredCount) return;

    const updated = { ...daily, isSelectionComplete: true };
    set({ daily: updated });
    saveToStorage("daily", updated);

    // 챌린지 알림 스케줄 + 상시 알림 표시
    if (progress.notificationsEnabled) {
      scheduleChallengeReminder(
        t("notif.challenge.reminder", progress.language),
        progress.language,
      );
      showChallengeStatus(updated.selectedCards.map((c) => ({
        name: c.title, completed: updated.completedIds.includes(c.id),
      })));
    }
  },

  // 챌린지 완료
  completeChallenge: (cardId: string) => {
    if (completingCardIds.has(cardId)) return;
    completingCardIds.add(cardId);

    const { daily, progress } = get();
    if (daily.completedIds.includes(cardId)) {
      completingCardIds.delete(cardId);
      return;
    }

    const card = daily.selectedCards.find((c) => c.id === cardId);
    if (!card) {
      completingCardIds.delete(cardId);
      return;
    }

    const updatedDaily = {
      ...daily,
      completedIds: [...daily.completedIds, cardId],
    };

    // 카테고리 완료 수 + 카드별 완료 수 증가
    const updatedProgress = {
      ...progress,
      categoryCompletions: {
        ...progress.categoryCompletions,
        [card.category]: progress.categoryCompletions[card.category] + 1,
      },
      cardCompletions: {
        ...(progress.cardCompletions || {}),
        [cardId]: ((progress.cardCompletions || {})[cardId] || 0) + 1,
      },
    };

    // XP 부여
    const xpGain = XP_PER_RARITY[card.rarity] || 10;
    updatedProgress.xp = (updatedProgress.xp || 0) + xpGain;
    updatedProgress.pendingPacks = updatedProgress.pendingPacks || 0;

    // 새로운 카드 해금 체크
    const newUnlocks = ALL_CARDS.filter(
      (c) =>
        !updatedProgress.unlockedCardIds.includes(c.id) &&
        c.unlockCondition &&
        updatedProgress.categoryCompletions[c.unlockCondition.category] >=
          c.unlockCondition.completions
    );

    if (newUnlocks.length > 0) {
      updatedProgress.unlockedCardIds = [
        ...updatedProgress.unlockedCardIds,
        ...newUnlocks.map((c) => c.id),
      ];
    }

    // 모든 카드 완료 여부 (알림 갱신에 사용)
    const allDone = updatedDaily.completedIds.length >= daily.selectedCards.length;

    // daily 풀클리어 → 다음 날 패널티 해제 (이미 false겠지만 안전 차원)
    // 그리고 "오늘 실패는 아님" 확정
    if (allDone) {
      // 추가 챌린지 넛지 1회 예약 (이미 예약된 상태면 건드리지 않음)
      // 이 플래그는 daily 상태의 일부 — 새벽 리셋 시 자동 초기화
      if (!updatedDaily.extraNudgeScheduled) {
        updatedDaily.extraNudgeScheduled = true;
      }
      // 미니게임 티켓 +1 (상한 10)
      updatedProgress.tickets = Math.min(
        MINIGAME_TICKET_CAP,
        (updatedProgress.tickets || 0) + 1,
      );
    }

    // XP 기반 레벨업 체크
    const prevLevel = updatedProgress.level;
    const newLevel = getLevelFromXP(updatedProgress.xp);
    if (newLevel > prevLevel) {
      const levelsGained = newLevel - prevLevel;
      updatedProgress.level = newLevel;
      // 컬렉션 100% 완료자: pendingPacks 증가 대신 즉시 환산 보상 (모달 무한 트리거 차단).
      if (updatedProgress.unlockedCardIds.length >= ALL_CARDS.length) {
        const comp = rollCompensationForLevels(levelsGained);
        updatedProgress.xp += comp.xp;
        if (comp.coins > 0) {
          try { useUpHeroStore.getState().addCoins(comp.coins); }
          catch (e) {
            if (process.env.NODE_ENV !== "production") console.warn("[useGameStore] level-up addCoins failed:", e);
          }
        }
      } else {
        updatedProgress.pendingPacks += levelsGained;
      }
      // Phase 12d — Lv30+ (전직 후) 레벨업마다 스킬 포인트 +1 지급.
      //   Lv31 부터 유효. prevLevel < 30, newLevel = 35 라면 35-30 = 5 포인트.
      try {
        if (newLevel > 30) {
          const pointsToGrant =
            prevLevel < 30
              ? newLevel - 30 // 첫 전직 구간 : Lv31 ~ newLevel 까지 total
              : levelsGained; // 이미 Lv30+ 였으면 획득한 level 만큼
          if (pointsToGrant > 0) {
            const heroStore = useUpHeroStore.getState();
            const curPoints = heroStore.hero.skillPoints ?? 0;
            heroStore.grantSkillPoints(pointsToGrant);
            void curPoints;
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useGameStore] grantSkillPoints failed:", e);
        }
      }
      // Phase 14 — 전직 전 튜토리얼 novice 스킬 자동 지급 (Lv5, Lv15).
      //   grantNoviceSkills 는 idempotent — requiredLevel 충족 & 미보유 만 추가.
      try {
        useUpHeroStore.getState().grantNoviceSkills(newLevel);
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useGameStore] grantNoviceSkills failed:", e);
        }
      }
    }

    const shouldOpenPack = updatedProgress.pendingPacks > (progress.pendingPacks || 0);
    set({ daily: updatedDaily, progress: updatedProgress, ...(shouldOpenPack && { isOpeningPack: true }) });
    saveToStorage("daily", updatedDaily);
    saveToStorage("progress", updatedProgress);
    setTimeout(() => completingCardIds.delete(cardId), 100);

    // Up Hero 탐험권 지급 — 해당 카테고리에 rarity 별 수량 (normal:1, rare:2, unique:3, legend:5)
    // 자동 전투 트리거 없음 — 사용자가 캠프에서 능동적으로 던전 진입
    try {
      useUpHeroStore.getState().grantExpeditionPass(card.category, card.rarity);
    } catch (e) {
      // store 가 아직 초기화 안 된 edge case — 무시 (다음 챌린지 완료 시 정상 작동)
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useGameStore] grantExpeditionPass failed:", e);
      }
    }

    // Phase 5c.1: Lv 30 도달 시 영웅 class 분화.
    // Bug 2026-04 — 자동 할당 → "추천 + 선택" UX 로 변경. proposeClassChoice 가
    //   pendingClassChoice 를 세팅하면 ClassChoiceModal 이 열리고, 유저가 8개
    //   중 하나를 고르면 confirmClassChoice 로 실제 분화가 이뤄진다.
    // 이전 레벨 < 30 & 새 레벨 >= 30 인 edge 에서만 시도.
    if (prevLevel < 30 && updatedProgress.level >= 30) {
      try {
        useUpHeroStore.getState().proposeClassChoice();
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useGameStore] proposeClassChoice failed:", e);
        }
      }
    }

    // 알림 갱신
    if (updatedProgress.notificationsEnabled) {
      if (allDone) {
        cancelChallengeReminder();
        hideChallengeStatus();

        // 1) 오늘의 챌린지 완료 축하 알림 (즉시)
        const lang = updatedProgress.language;
        showInstantNotify(
          t("notif.daily.complete.title", lang),
          t("notif.daily.complete.body", lang),
          "daily-complete",
          lang,
        );

        // 2) 2시간 뒤 "추가 챌린지, 하고 싶지 않아?" 넛지 (하루 1회)
        //    extra phase에 이미 들어갔거나 완료했으면 보내지 않음
        const alreadyInExtra = updatedDaily.challengePhase !== "daily";
        if (!updatedDaily.extraNudgeScheduled && !alreadyInExtra) {
          scheduleExtraNudge(
            t("notif.extra.nudge.title", lang),
            t("notif.extra.nudge.body", lang),
            undefined,
            lang,
          );
        }
      } else {
        showChallengeStatus(daily.selectedCards.map((c) => ({
          name: c.title, completed: updatedDaily.completedIds.includes(c.id),
        })));
      }
    }
  },

  // 모드 변경 (다음 날부터 적용)
  setMode: (mode: GameMode) => {
    const progress = { ...get().progress, pendingMode: mode };
    set({ progress });
    saveToStorage("progress", progress);
  },

  cancelPendingMode: () => {
    const progress = { ...get().progress, pendingMode: null };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 일일 리셋 체크
  checkDailyReset: () => {
    const { daily } = get();
    if (daily.date !== getTodayString()) {
      get().initialize();
    }
  },

  // 온보딩 완료 → 레벨 0→1 + 카드팩 1개 + 미니게임 체험 티켓 1장
  //
  // Phase 13 review Critical #1 — onboarding 에서 선택한 난이도가 day 1 에
  //   반영되지 않던 버그 수정. 이전엔 `setMode` 가 `pendingMode` 만 세팅하고
  //   `checkDailyReset` (자정 cross) 에서만 pendingMode → mode 이전되어,
  //   유저가 ultra (3장) 선택해도 첫 날은 normal (1장) 로 시작. 이제 온보딩
  //   완료 시점에 즉시 반영.
  completeOnboarding: () => {
    const cur = get().progress;
    const progress: UserProgress = {
      ...cur,
      level: 1,
      xp: totalXPForLevel(1), // 레벨 1에 맞는 XP 설정
      pendingPacks: (cur.pendingPacks || 0) + 1,
      tickets: Math.min(MINIGAME_TICKET_CAP, (cur.tickets || 0) + 1),
      // pendingMode 가 있으면 즉시 mode 로 이전 (day 1 에 반영).
      mode: cur.pendingMode ?? cur.mode,
      pendingMode: null,
    };
    // isLocalEmpty=false — 온보딩 완료 직후 Firebase auth listener 가 뒤늦게 fire
    // 하면서 cloudData 로 로컬을 덮어쓰는 race 를 차단. (SyncProvider 의
    // `isLocalEmpty && cloudData` 브랜치가 유저의 fresh 모드 선택을 지우는 버그.)
    set({ hasCompletedOnboarding: true, progress, isOpeningPack: true, isLocalEmpty: false });
    saveToStorage("onboarding_complete", true);
    saveToStorage("progress", progress);
  },

  /** 스타터 팩 선택. completeOnboarding() 전에 호출되어야 함 (unlockedCardIds 초기화 순서) */
  // 해당 팩의 카드 + 트렌드 starter(11장) 해금
  // (트렌드는 카테고리 노출이 핵심 가치라 pack 선택과 무관하게 항상 deck 에 들어감)
  selectStarterPack: (packId: string) => {
    const pack = STARTER_PACKS.find((p) => p.id === packId);
    if (!pack) return;

    const trendingStarterIds = ALL_CARDS.filter(
      (c) => c.category === "trending" && !c.unlockCondition
    ).map((c) => c.id);
    // pack.cardIds 에 trending 이 이미 있을 수 있으니 dedup
    const merged = Array.from(new Set([...pack.cardIds, ...trendingStarterIds]));

    const progress = {
      ...get().progress,
      unlockedCardIds: merged,
    };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 카드팩 오프너 닫기
  dismissPackOpener: () => {
    set({ isOpeningPack: false });
  },

  // 컬렉션 100% 첫 달성 축하 모달 닫기 (사용자가 확인 누름)
  dismissCollectionCelebration: () => {
    set({ collectionCelebration: false });
  },

  // 카드팩 열기
  // - 보너스 카드(pendingBonusCards) 우선 소진: 1장
  // - 레벨업 팩(pendingPacks): 등급 굴림 (normal 50% / rare 30% / unique 15% / legend 5%)
  //   → 등급별 2/3/4/5 장. 카드 등급은 우선 같은 tier, 부족 시 fallback (drawTierPack).
  // - 보너스 카드(pendingBonusCards): normal tier · 1 장 (기존 그대로)
  // - lockedCards.length === 0 (컬렉션 100% 상태) 인데 큐가 쌓여있으면:
  //   tier 별 환산 보상(XP + 영웅 코인) 으로 자동 전환. 첫 회면 축하 모달.
  // 둘 다 없으면 빈 결과
  openCardPack: () => {
    const { progress } = get();
    const pendingPacks = progress.pendingPacks || 0;
    const pendingBonusCards = progress.pendingBonusCards || 0;
    if (pendingPacks <= 0 && pendingBonusCards <= 0) {
      return { cards: [], tier: "normal" as Rarity };
    }

    const lockedCards = ALL_CARDS.filter(
      (c) => !progress.unlockedCardIds.includes(c.id)
    );

    // 해금할 카드가 없으면 — 큐를 환산 보상으로 변환.
    if (lockedCards.length === 0) {
      let xpGain = 0;
      let coinGain = 0;
      // 보너스 카드 큐 환산
      for (let i = 0; i < pendingBonusCards; i++) {
        xpGain += COLLECTION_COMPENSATION_BONUS.xp;
        coinGain += COLLECTION_COMPENSATION_BONUS.coins;
      }
      // 레벨업 팩 큐 환산 — 굴린 tier 기준
      for (let i = 0; i < pendingPacks; i++) {
        const t = rollPackTier();
        xpGain += COLLECTION_COMPENSATION_PER_TIER[t].xp;
        coinGain += COLLECTION_COMPENSATION_PER_TIER[t].coins;
      }

      // 첫 회 컬렉션 완료 보너스는 unlockedCardIds 가 마지막 카드를 채워 완료된
      // 직후 (정상 흐름에서) 부여되므로, 이 분기(이미 완료) 에서는 추가하지 않음.

      const updatedProgress = {
        ...progress,
        pendingPacks: 0,
        pendingBonusCards: 0,
        xp: progress.xp + xpGain,
      };
      set({ progress: updatedProgress });
      saveToStorage("progress", updatedProgress);

      // 영웅 코인 적립
      if (coinGain > 0) {
        try {
          useUpHeroStore.getState().addCoins(coinGain);
        } catch (e) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[useGameStore] addCoins failed:", e);
          }
        }
      }

      return { cards: [], tier: "normal" as Rarity };
    }

    const isBonus = pendingBonusCards > 0;
    let tier: Rarity;
    let newCards: ChallengeCard[];
    if (isBonus) {
      tier = "normal";
      newCards = drawFromPool(lockedCards, 1);
    } else {
      tier = rollPackTier();
      newCards = drawTierPack(lockedCards, tier, PACK_TIER_COUNT[tier]);
    }

    const newUnlockedIds = [
      ...progress.unlockedCardIds,
      ...newCards.map((c) => c.id),
    ];

    // 첫 컬렉션 완료 감지: 이번에 받은 카드로 풀 100% 채워짐 + 미달성 이력.
    const justCompleted =
      !progress.collectionCompletedAt &&
      newUnlockedIds.length >= ALL_CARDS.length;

    const updatedProgress: UserProgress = {
      ...progress,
      pendingPacks: isBonus ? pendingPacks : pendingPacks - 1,
      pendingBonusCards: isBonus ? pendingBonusCards - 1 : pendingBonusCards,
      unlockedCardIds: newUnlockedIds,
      ...(justCompleted && {
        collectionCompletedAt: new Date().toISOString(),
        xp: progress.xp + COLLECTION_FIRST_CLEAR_BONUS.xp,
      }),
    };

    set({ progress: updatedProgress, ...(justCompleted && { collectionCelebration: true }) });
    saveToStorage("progress", updatedProgress);

    if (justCompleted) {
      try {
        useUpHeroStore.getState().addCoins(COLLECTION_FIRST_CLEAR_BONUS.coins);
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useGameStore] first-clear addCoins failed:", e);
        }
      }
    }

    return { cards: newCards, tier };
  },

  // 언어 변경
  setLanguage: (lang: Language) => {
    const progress = { ...get().progress, language: lang };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 사운드 토글
  toggleSound: () => {
    const progress = { ...get().progress, soundEnabled: !get().progress.soundEnabled };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 햅틱 토글
  toggleHaptic: () => {
    const progress = { ...get().progress, hapticEnabled: !get().progress.hapticEnabled };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 알림 설정
  setNotificationsEnabled: (enabled: boolean) => {
    const progress = { ...get().progress, notificationsEnabled: enabled };
    set({ progress });
    saveToStorage("progress", progress);
  },

  setNotificationTime: (time: string) => {
    const progress = { ...get().progress, notificationTime: time };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 칭호 장착
  equipTitle: (titleId: string | null) => {
    const progress = { ...get().progress, equippedTitleId: titleId };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 칭호 확인 처리 (new 뱃지 제거용)
  markTitlesSeen: (titleIds: string[]) => {
    const current = get().progress.seenTitleIds || [];
    const merged = [...new Set([...current, ...titleIds])];
    if (merged.length === current.length) return;
    const progress = { ...get().progress, seenTitleIds: merged };
    set({ progress });
    saveToStorage("progress", progress);
  },

  markPatchNotesSeen: (version: string) => {
    if (get().progress.lastSeenPatchVersion === version) return;
    const progress = { ...get().progress, lastSeenPatchVersion: version };
    set({ progress });
    saveToStorage("progress", progress);
  },

  markReviewPromptShown: () => {
    if (get().progress.reviewPromptShownAt) return;
    const progress = { ...get().progress, reviewPromptShownAt: Date.now() };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 트랙 2-1: 불꽃 체크인의 라이트 스트릭으로 progress 스트릭 덮어쓰기.
  // saveToStorage 경유라 클라우드 동기화(iOS sync.syncProgress 대응)까지 수행.
  _applyLightStreak: (currentLightStreak: number, bestLightStreak: number) => {
    const progress = {
      ...get().progress,
      currentStreak: currentLightStreak,
      longestStreak: bestLightStreak,
    };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 클라우드 데이터로 로컬 상태 업데이트 (syncToCloud 트리거 안 함)
  // 1) 클라우드 daily.date가 오늘이 아니면 어제 데이터이므로 fresh daily로 교체.
  // 2) 로컬 daily가 클라우드보다 더 진행(draw/select/complete)된 경우
  //    daily는 로컬을 유지하고 progress만 업데이트한다.
  //    — 클라우드 리스너가 stale snapshot을 보내면서 로컬에서 막 뽑은 카드나
  //      진행 중인 챌린지를 덮어쓰는 레이스 컨디션 방지.
  // 3) [P0 데이터 손실 방어] startListener 의 onSnapshot race 등으로 클라우드가
  //    로컬보다 strictly behind 인 progress 를 들고 와도, compareProgress 가
  //    "aAhead"(로컬이 앞섬) 라면 적용 거부 — 로컬 보존. 정당한 클라우드 복원
  //    (로컬이 비거나 같거나 뒤처진 경우) 은 그대로 통과.
  // 4) options.force=true — MergeConflictDialog 등 사용자가 명시적으로 "클라우드
  //    덮어쓰기" 선택한 경로에서만 P0 가드를 우회. 자동 sync 경로는 force 없이 호출.
  _setFromCloud: (
    progress: UserProgress,
    daily: DailyState,
    options?: { force?: boolean },
  ) => {
    const today = getTodayString();
    const safeDailyState = daily.date === today
      ? daily
      : { ...getInitialDailyState(), date: today };

    // 2026.04.18 hotfix — 구-XP-커브 (level*(50+10L)) 기준 저장된 cloud snapshot
    //   이 raw 로 복원되면 새-커브 floor (level*(80+20L)) 보다 xp 가 낮아
    //   UI 에 `-N/XX XP` 음수 노출. initialize() 가 이미 쓰던 migration 과 동일
    //   규칙을 여기서도 적용해 cloud→local 경로에서 음수 재발을 차단.
    const normalized = normalizeProgressXpLevel(progress).progress;

    // P0 sanity guard — 로컬이 클라우드보다 strictly 앞선 케이스는 무시.
    //   유저 피드백 "로그인 후 0일차 됨" 의 race condition (uploadLocalData 직후
    //   stale onSnapshot emit 이 로컬을 빈 progress 로 덮어쓰는) 차단.
    //   compareProgress 결과:
    //     - "equal" / "bAhead" : 클라우드가 같거나 앞섬 → 정상 적용
    //     - "aAhead"           : 로컬이 strictly 앞섬 → 적용 거부 (로컬 보존)
    //     - "conflict"         : 둘 다 다른 축에서 앞섬 → 적용 (마지막-쓰기-승)
    //   force=true 시 가드 우회 — 사용자가 명시적으로 cloud 선택했을 때만.
    if (!options?.force) {
      const localProgress = get().progress;
      const cmp = compareProgress(localProgress, normalized);
      if (cmp === "aAhead") {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[useGameStore._setFromCloud] cloud progress strictly behind local — skipping to prevent data loss.",
            { localDays: localProgress.totalDaysCompleted, cloudDays: normalized.totalDaysCompleted },
          );
        }
        return;
      }
    }

    const localDaily = get().daily;
    // 로컬이 오늘이고, 클라우드 이상으로 진행됐으면 daily는 건드리지 않음
    // >= 비교: 동점 시에도 로컬을 유지하여 유저의 최근 액션(deselect 등)을 보존
    if (localDaily.date === today && dailyProgressScore(localDaily) >= dailyProgressScore(safeDailyState)) {
      set({ progress: normalized });
      if (typeof window !== "undefined") {
        localStorage.setItem("upnext_progress", JSON.stringify(normalized));
      }
      return;
    }

    set({ progress: normalized, daily: safeDailyState });
    // localStorage에 직접 저장 (saveToStorage를 거치면 syncToCloud가 다시 호출됨)
    if (typeof window !== "undefined") {
      localStorage.setItem("upnext_progress", JSON.stringify(normalized));
      localStorage.setItem("upnext_daily", JSON.stringify(safeDailyState));
    }
  },

  // ══════════════════════════════════════
  //  추가 챌린지 시스템
  // ══════════════════════════════════════

  startExtraChallenge: () => {
    const { daily, progress } = get();
    // 가드: daily 챌린지 완료 확인
    if (daily.completedIds.length < daily.selectedCards.length) return;
    const updated = { ...daily, challengePhase: "extra" as ChallengePhase };
    set({ daily: updated });
    saveToStorage("daily", updated);

    // 유저가 직접 추가 챌린지를 시작했으니 2시간 뒤 넛지 취소
    if (progress.notificationsEnabled) {
      cancelExtraNudge();
    }
  },

  startSuperChallenge: () => {
    const { daily } = get();
    // 가드: extra 챌린지 완료 확인
    if (daily.extraCompletedIds.length < daily.extraSelectedCards.length) return;
    const updated = { ...daily, challengePhase: "super" as ChallengePhase };
    set({ daily: updated });
    saveToStorage("daily", updated);
  },

  // phase에 맞는 배열에 6장 드로우
  drawPhaseCards: () => {
    const { daily, progress } = get();
    const phase = daily.challengePhase;

    // 이전 phase에서 선택된 카드 ID 수집 (중복 방지)
    const excludeIds = new Set<string>();
    daily.selectedCards.forEach((c) => excludeIds.add(c.id));
    if (phase === "super") {
      daily.extraSelectedCards.forEach((c) => excludeIds.add(c.id));
    }

    const unlockedCards = ALL_CARDS.filter((card) =>
      progress.unlockedCardIds.includes(card.id) && !excludeIds.has(card.id)
    );
    const drawn = drawCards(unlockedCards);

    let updated: DailyState;
    if (phase === "extra") {
      updated = { ...daily, extraDrawnCards: drawn, extraDrawComplete: true };
    } else if (phase === "super") {
      updated = { ...daily, superDrawnCards: drawn, superDrawComplete: true };
    } else {
      // daily fallback (기존 drawDailyCards와 동일)
      updated = { ...daily, drawnCards: drawn, isDrawComplete: true };
    }

    set({ daily: updated });
    saveToStorage("daily", updated);
  },

  // phase에 맞는 배열에 카드 선택 (extra/super: 최대 6장)
  selectPhaseCard: (card: ChallengeCard) => {
    const { daily } = get();
    const phase = daily.challengePhase;

    if (phase === "extra") {
      if (daily.extraSelectedCards.length >= PHASE_MAX_CARDS.extra) return;
      if (daily.extraSelectedCards.some((c) => c.id === card.id)) return;
      const updated = { ...daily, extraSelectedCards: [...daily.extraSelectedCards, card] };
      set({ daily: updated });
      saveToStorage("daily", updated);
    } else if (phase === "super") {
      if (daily.superSelectedCards.length >= PHASE_MAX_CARDS.super) return;
      if (daily.superSelectedCards.some((c) => c.id === card.id)) return;
      const updated = { ...daily, superSelectedCards: [...daily.superSelectedCards, card] };
      set({ daily: updated });
      saveToStorage("daily", updated);
    } else {
      // daily fallback
      get().selectCard(card);
    }
  },

  // phase에 맞는 배열에서 카드 선택 해제
  deselectPhaseCard: (cardId: string) => {
    const { daily } = get();
    const phase = daily.challengePhase;

    if (phase === "extra") {
      if (daily.extraSelectionComplete) return;
      const updated = { ...daily, extraSelectedCards: daily.extraSelectedCards.filter((c) => c.id !== cardId) };
      set({ daily: updated });
      saveToStorage("daily", updated);
    } else if (phase === "super") {
      if (daily.superSelectionComplete) return;
      const updated = { ...daily, superSelectedCards: daily.superSelectedCards.filter((c) => c.id !== cardId) };
      set({ daily: updated });
      saveToStorage("daily", updated);
    } else {
      get().deselectCard(cardId);
    }
  },

  // phase에 맞는 선택 확정 (최소 카드 수 체크)
  confirmPhaseSelection: () => {
    const { daily } = get();
    const phase = daily.challengePhase;
    const minCards = PHASE_MIN_CARDS[phase];

    if (phase === "extra") {
      if (daily.extraSelectedCards.length < minCards) return;
      const updated = { ...daily, extraSelectionComplete: true };
      set({ daily: updated });
      saveToStorage("daily", updated);
    } else if (phase === "super") {
      if (daily.superSelectedCards.length < minCards) return;
      const updated = { ...daily, superSelectionComplete: true };
      set({ daily: updated });
      saveToStorage("daily", updated);
    } else {
      get().confirmSelection();
    }
  },

  // phase에 맞는 챌린지 완료 (XP 배율 적용)
  completePhaseChallenge: (cardId: string) => {
    if (completingCardIds.has(cardId)) return;
    completingCardIds.add(cardId);

    const { daily, progress } = get();
    const phase = daily.challengePhase;

    // phase별 데이터 선택
    const selectedCards = phase === "extra" ? daily.extraSelectedCards
      : phase === "super" ? daily.superSelectedCards
      : daily.selectedCards;
    const completedIds = phase === "extra" ? daily.extraCompletedIds
      : phase === "super" ? daily.superCompletedIds
      : daily.completedIds;

    if (completedIds.includes(cardId)) {
      completingCardIds.delete(cardId);
      return;
    }

    const card = selectedCards.find((c) => c.id === cardId);
    if (!card) {
      completingCardIds.delete(cardId);
      return;
    }

    // daily phase는 기존 completeChallenge 사용
    if (phase === "daily") {
      completingCardIds.delete(cardId);
      get().completeChallenge(cardId);
      return;
    }

    const newCompletedIds = [...completedIds, cardId];
    const updatedDaily = phase === "extra"
      ? { ...daily, extraCompletedIds: newCompletedIds }
      : { ...daily, superCompletedIds: newCompletedIds };

    // 카테고리 + 카드 완료 수
    const updatedProgress = {
      ...progress,
      categoryCompletions: {
        ...progress.categoryCompletions,
        [card.category]: progress.categoryCompletions[card.category] + 1,
      },
      cardCompletions: {
        ...(progress.cardCompletions || {}),
        [cardId]: ((progress.cardCompletions || {})[cardId] || 0) + 1,
      },
    };

    // XP — 카드에 명시된 값 그대로 (배율/보너스 없음)
    const xpGain = XP_PER_RARITY[card.rarity] || 10;
    updatedProgress.xp = (updatedProgress.xp || 0) + xpGain;
    updatedProgress.pendingPacks = updatedProgress.pendingPacks || 0;
    updatedProgress.pendingBonusCards = updatedProgress.pendingBonusCards || 0;

    // 새 카드 해금 체크
    const newUnlocks = ALL_CARDS.filter(
      (c) =>
        !updatedProgress.unlockedCardIds.includes(c.id) &&
        c.unlockCondition &&
        updatedProgress.categoryCompletions[c.unlockCondition.category] >=
          c.unlockCondition.completions
    );
    if (newUnlocks.length > 0) {
      updatedProgress.unlockedCardIds = [
        ...updatedProgress.unlockedCardIds,
        ...newUnlocks.map((c) => c.id),
      ];
    }

    // 풀클리어 시 랜덤 카드 1장 적립 (실제 뽑기는 openCardPack에서 수행)
    const phaseFullClear = newCompletedIds.length >= selectedCards.length;
    if (phaseFullClear) {
      const hasLockedCards = ALL_CARDS.some(
        (c) => !updatedProgress.unlockedCardIds.includes(c.id)
      );
      if (hasLockedCards) {
        updatedProgress.pendingBonusCards += 1;
      } else {
        // 컬렉션 완료자 — 보너스 카드를 환산 보상으로 직접 지급.
        updatedProgress.xp += COLLECTION_COMPENSATION_BONUS.xp;
        try { useUpHeroStore.getState().addCoins(COLLECTION_COMPENSATION_BONUS.coins); }
        catch (e) {
          if (process.env.NODE_ENV !== "production") console.warn("[useGameStore] bonus-card addCoins failed:", e);
        }
      }
      // 미니게임 티켓 지급: phase 완주당 +1 (daily+extra+super = 3장, 상한 10)
      const ticketGain = 1;
      updatedProgress.tickets = Math.min(
        MINIGAME_TICKET_CAP,
        (updatedProgress.tickets || 0) + ticketGain,
      );
    }

    // 레벨업 체크
    const prevLevel = updatedProgress.level;
    const newLevel = getLevelFromXP(updatedProgress.xp);
    if (newLevel > prevLevel) {
      const levelsGained = newLevel - prevLevel;
      updatedProgress.level = newLevel;
      if (updatedProgress.unlockedCardIds.length >= ALL_CARDS.length) {
        const comp = rollCompensationForLevels(levelsGained);
        updatedProgress.xp += comp.xp;
        if (comp.coins > 0) {
          try { useUpHeroStore.getState().addCoins(comp.coins); }
          catch (e) {
            if (process.env.NODE_ENV !== "production") console.warn("[useGameStore] phase level-up addCoins failed:", e);
          }
        }
      } else {
        updatedProgress.pendingPacks += levelsGained;
      }
    }

    const shouldOpenPack =
      updatedProgress.pendingPacks > (progress.pendingPacks || 0) ||
      updatedProgress.pendingBonusCards > (progress.pendingBonusCards || 0);
    set({ daily: updatedDaily, progress: updatedProgress, ...(shouldOpenPack && { isOpeningPack: true }) });
    saveToStorage("daily", updatedDaily);
    saveToStorage("progress", updatedProgress);
    completingCardIds.delete(cardId);

    // Phase 12 bugfix — extra/super phase 에도 탐험권 지급.
    //   유저 제보: "사진 기록 후 탐험 티켓이 안 들어온다". 원인은 photo flow 가
    //   아니라 `completePhaseChallenge` 에 grantExpeditionPass 호출이 누락돼
    //   extra/super 챌린지 완료 시 pass 미지급. daily path 와 동작 일치.
    try {
      useUpHeroStore.getState().grantExpeditionPass(card.category, card.rarity);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[completePhaseChallenge] grantExpeditionPass failed:", e);
      }
    }

    // 알림: extra 풀클리어 → 축하 알림 + 넛지 취소
    if (phase === "extra" && phaseFullClear && updatedProgress.notificationsEnabled) {
      cancelExtraNudge();
      const lang = updatedProgress.language;
      showInstantNotify(
        t("notif.extra.complete.title", lang),
        t("notif.extra.complete.body", lang),
        "extra-complete",
        lang,
      );
    }
  },

  // === 미니게임 ===

  // 티켓 1장 소비 — 성공 시 true, 티켓 부족이면 false (차감 X)
  spendTicket: () => {
    const progress = get().progress;
    if ((progress.tickets || 0) < 1) return false;
    const updated = { ...progress, tickets: progress.tickets - 1 };
    set({ progress: updated });
    saveToStorage("progress", updated);
    return true;
  },

  // 미니게임 런 종료 보상 지급:
  //  - 미보유 카드 언락 (unlockedCardIds에 추가)
  //  - 중복 카드 XP 지급 (카드별 cardCompletions 증가 + XP → 레벨업 파이프라인)
  //  - 런 카운트 / 최고 매치 기록 갱신
  grantMinigameRewards: ({ unlockCardIds = [], xpGainPerCard = [], matchesThisRun }) => {
    const progress = get().progress;
    const updated: UserProgress = {
      ...progress,
      unlockedCardIds: [...progress.unlockedCardIds],
      cardCompletions: { ...(progress.cardCompletions || {}) },
      minigameRunsPlayed: (progress.minigameRunsPlayed || 0) + 1,
      minigameBestMatches: Math.max(
        progress.minigameBestMatches || 0,
        matchesThisRun,
      ),
    };

    // 새 카드 언락
    for (const id of unlockCardIds) {
      if (!updated.unlockedCardIds.includes(id)) {
        updated.unlockedCardIds.push(id);
      }
    }

    // 중복 카드 XP 지급 (레벨업 파이프라인 그대로 사용)
    // cardCompletions는 건드리지 않음 — 언락 임계치는 데일리 완료로만 달성
    let totalXpGain = 0;
    for (const { amount } of xpGainPerCard) {
      totalXpGain += amount;
    }
    if (totalXpGain > 0) {
      updated.xp = (updated.xp || 0) + totalXpGain;
      updated.pendingPacks = updated.pendingPacks || 0;
      const prevLevel = updated.level;
      const newLevel = getLevelFromXP(updated.xp);
      if (newLevel > prevLevel) {
        const levelsGained = newLevel - prevLevel;
        updated.level = newLevel;
        if (updated.unlockedCardIds.length >= ALL_CARDS.length) {
          const comp = rollCompensationForLevels(levelsGained);
          updated.xp += comp.xp;
          if (comp.coins > 0) {
            try { useUpHeroStore.getState().addCoins(comp.coins); }
            catch (e) {
              if (process.env.NODE_ENV !== "production") console.warn("[useGameStore] minigame addCoins failed:", e);
            }
          }
        } else {
          updated.pendingPacks += levelsGained;
        }
      }
    }

    const shouldOpenPack = (updated.pendingPacks || 0) > (progress.pendingPacks || 0);
    set({ progress: updated, ...(shouldOpenPack && { isOpeningPack: true }) });
    saveToStorage("progress", updated);
  },

  resetForSignOut: () => {
    completingCardIds.clear();
    set({
      daily: getInitialDailyState(),
      progress: getInitialProgress(),
      isLoaded: false,
      hasCompletedOnboarding: false,
      isOpeningPack: false,
      isLocalEmpty: false,
    });
  },
}));

