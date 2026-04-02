import { create } from "zustand";
import type { ChallengeCard, Category } from "@/types/card";
import type { DailyState, GameMode, UserProgress, DayRecord, Language } from "@/types/game";
import { MODE_CARD_COUNT, XP_PER_RARITY, FULL_CLEAR_BONUS_XP, xpToNextLevel, totalXPForLevel, getLevelFromXP, getXPProgress } from "@/types/game";
import { ALL_CARDS, STARTER_CARD_IDS } from "@/data/cards";
import { drawCards, drawFromPool } from "@/lib/deck";
import { saveToStorage, loadFromStorage } from "@/lib/storage";
import { STARTER_PACKS } from "@/data/starterPacks";

// 오늘 날짜를 "2026-04-01" 형식으로 반환 (로컬 타임존 기준)
function getTodayString(): string {
  const d = new Date();
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
    },
    mode: "normal",
    level: 0,
    xp: 0,
    daysTowardNextLevel: 0,
    pendingPacks: 0,
    cardCompletions: {},
    equippedTitleId: null,
    seenTitleIds: [],
    language: "en",
    soundEnabled: true,
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
  };
}

interface GameStore {
  // 상태
  daily: DailyState;
  progress: UserProgress;
  isLoaded: boolean;
  hasCompletedOnboarding: boolean;
  isOpeningPack: boolean;

  // 액션
  initialize: () => void;
  drawDailyCards: () => void;
  rerollCards: () => void;
  selectCard: (card: ChallengeCard) => void;
  deselectCard: (cardId: string) => void;
  confirmSelection: () => void;
  completeChallenge: (cardId: string) => void;
  setMode: (mode: GameMode) => void;
  checkDailyReset: () => void;
  completeOnboarding: () => void;
  selectStarterPack: (packId: string) => void;
  openCardPack: () => ChallengeCard[];
  dismissPackOpener: () => void;
  setLanguage: (lang: Language) => void;
  toggleSound: () => void;
  equipTitle: (titleId: string | null) => void;
  markTitlesSeen: (titleIds: string[]) => void;
  _setFromCloud: (progress: UserProgress, daily: DailyState) => void;
}

// 이중 완료 방지용 락
const completingCardIds = new Set<string>();

export const useGameStore = create<GameStore>((set, get) => ({
  daily: getInitialDailyState(),
  progress: getInitialProgress(),
  isLoaded: false,
  hasCompletedOnboarding: false,
  isOpeningPack: false,

  // 앱 시작 시 LocalStorage에서 데이터 복원
  initialize: () => {
    const savedOnboarding = loadFromStorage<boolean>("onboarding_complete");
    const savedProgress = loadFromStorage<UserProgress>("progress");
    const savedDaily = loadFromStorage<DailyState>("daily");
    const today = getTodayString();

    const progress = { ...getInitialProgress(), ...savedProgress } as UserProgress;
    let daily = savedDaily || getInitialDailyState();

    // 날짜가 바뀌었으면 리셋
    if (daily.date !== today) {
      // 어제 기록 저장
      if (daily.isSelectionComplete && daily.selectedCards.length > 0) {
        const record: DayRecord = {
          date: daily.date,
          selectedCardIds: daily.selectedCards.map((c) => c.id),
          completedCardIds: daily.completedIds,
          wasFullClear: daily.completedIds.length >= daily.selectedCards.length,
          mode: progress.mode,
        };
        progress.completionHistory.push(record);

        // 스트릭 업데이트
        if (record.wasFullClear) {
          progress.currentStreak += 1;
          progress.totalDaysCompleted += 1;
          if (progress.currentStreak > progress.longestStreak) {
            progress.longestStreak = progress.currentStreak;
          }
        } else {
          progress.currentStreak = 0;
        }
      }

      daily = { ...getInitialDailyState(), date: today };

      // 예약된 모드 변경 적용
      if (progress.pendingMode) {
        progress.mode = progress.pendingMode;
        progress.pendingMode = null;
      }
    }

    // XP 기반 레벨 마이그레이션: 기존 레벨에 맞게 XP 보정
    const expectedXP = totalXPForLevel(progress.level);
    if ((progress.xp || 0) < expectedXP) {
      progress.xp = expectedXP;
    }

    const isOpeningPack = (progress.pendingPacks || 0) > 0;
    set({ daily, progress, isLoaded: true, hasCompletedOnboarding: !!savedOnboarding, isOpeningPack });
    saveToStorage("progress", progress);
    saveToStorage("daily", daily);
  },

  // 오늘의 6장 드로우
  drawDailyCards: () => {
    const { progress } = get();
    const unlockedCards = ALL_CARDS.filter((card) =>
      progress.unlockedCardIds.includes(card.id)
    );
    const drawn = drawCards(unlockedCards);

    const daily: DailyState = {
      ...get().daily,
      drawnCards: drawn,
      isDrawComplete: true,
    };

    set({ daily });
    saveToStorage("daily", daily);
  },

  // 리롤 — 하루 1회, 선택된 카드 초기화 + 새로 6장 드로우
  rerollCards: () => {
    const { daily, progress } = get();
    if (daily.rerollUsed || daily.isSelectionComplete) return;

    const unlockedCards = ALL_CARDS.filter((card) =>
      progress.unlockedCardIds.includes(card.id)
    );
    const drawn = drawCards(unlockedCards);

    const updated: DailyState = {
      ...daily,
      drawnCards: drawn,
      selectedCards: [],
      rerollUsed: true,
    };
    set({ daily: updated });
    saveToStorage("daily", updated);
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

    // 모든 카드 완료 시 스트릭 + 풀클리어 보너스 XP
    if (updatedDaily.completedIds.length >= daily.selectedCards.length) {
      updatedProgress.currentStreak += 1;
      updatedProgress.totalDaysCompleted += 1;
      if (updatedProgress.currentStreak > updatedProgress.longestStreak) {
        updatedProgress.longestStreak = updatedProgress.currentStreak;
      }
      // 풀클리어 보너스
      updatedProgress.xp += FULL_CLEAR_BONUS_XP;
    }

    // XP 기반 레벨업 체크
    const prevLevel = updatedProgress.level;
    const newLevel = getLevelFromXP(updatedProgress.xp);
    if (newLevel > prevLevel) {
      const levelsGained = newLevel - prevLevel;
      updatedProgress.level = newLevel;
      updatedProgress.pendingPacks += levelsGained;
    }

    const shouldOpenPack = updatedProgress.pendingPacks > (progress.pendingPacks || 0);
    set({ daily: updatedDaily, progress: updatedProgress, ...(shouldOpenPack && { isOpeningPack: true }) });
    saveToStorage("daily", updatedDaily);
    saveToStorage("progress", updatedProgress);
    completingCardIds.delete(cardId);
  },

  // 모드 변경 (다음 날부터 적용)
  setMode: (mode: GameMode) => {
    const progress = { ...get().progress, pendingMode: mode };
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

  // 온보딩 완료 → 레벨 0→1 + 카드팩 1개 부여
  completeOnboarding: () => {
    const progress = {
      ...get().progress,
      level: 1,
      xp: totalXPForLevel(1), // 레벨 1에 맞는 XP 설정
      pendingPacks: (get().progress.pendingPacks || 0) + 1,
    };
    set({ hasCompletedOnboarding: true, progress, isOpeningPack: true });
    saveToStorage("onboarding_complete", true);
    saveToStorage("progress", progress);
  },

  // 스타터 팩 선택 → 해당 팩의 카드만 해금
  selectStarterPack: (packId: string) => {
    const pack = STARTER_PACKS.find((p) => p.id === packId);
    if (!pack) return;

    const progress = {
      ...get().progress,
      unlockedCardIds: [...pack.cardIds],
    };
    set({ progress });
    saveToStorage("progress", progress);
  },

  // 카드팩 오프너 닫기
  dismissPackOpener: () => {
    set({ isOpeningPack: false });
  },

  // 카드팩 열기 → 3장 등급 가중치 랜덤 해금 (중복 없음)
  openCardPack: () => {
    const { progress } = get();
    if ((progress.pendingPacks || 0) <= 0) return [];

    const lockedCards = ALL_CARDS.filter(
      (c) => !progress.unlockedCardIds.includes(c.id)
    );

    const newCards = drawFromPool(lockedCards, 3);

    const updatedProgress = {
      ...progress,
      pendingPacks: progress.pendingPacks - 1,
      unlockedCardIds: [
        ...progress.unlockedCardIds,
        ...newCards.map((c) => c.id),
      ],
    };

    set({ progress: updatedProgress });
    saveToStorage("progress", updatedProgress);
    return newCards;
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

  // 클라우드 데이터로 로컬 상태 업데이트 (syncToCloud 트리거 안 함)
  _setFromCloud: (progress: UserProgress, daily: DailyState) => {
    set({ progress, daily });
    // localStorage에 직접 저장 (saveToStorage를 거치면 syncToCloud가 다시 호출됨)
    if (typeof window !== "undefined") {
      localStorage.setItem("upnext_progress", JSON.stringify(progress));
      localStorage.setItem("upnext_daily", JSON.stringify(daily));
    }
  },
}));
