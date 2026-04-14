import { create } from "zustand";
import type {
  MinigamePhase,
  MinigameTile,
  ActiveBuff,
  RewardDefinition,
  RewardEffectId,
  SkillEffectId,
  CurseEffectId,
  MinigameRunStats,
} from "@/types/minigame";
import {
  ROUND_CONFIGS,
  CATEGORY_FLASH_MS,
  ROUND1_PEEK_MS,
  ROUND_PEEK_MS_EXTENDED,
  ECHO_GHOST_MS,
  MISMATCH_REVEAL_MS,
  PEEK2_MS,
  COMPASS_HINT_MS,
} from "@/types/minigame";
import { generateBoard, getAdjacentIndices } from "@/lib/minigame/generateBoard";
import { drawRewardOffer } from "@/data/minigame";
import { useGameStore } from "@/store/useGameStore";
import { XP_PER_RARITY } from "@/types/game";
import { playSound, triggerHaptic } from "@/lib/sounds";

/**
 * 미니게임(카드매치) 런타임 상태 — 비영속.
 * 페이지 이탈 = 런 포기. 런 종료 시 부작용은 useGameStore.grantMinigameRewards() 로만.
 */

interface EchoGhost {
  idx: number;
  expiresAt: number;
}

export interface EffectToast {
  kind: "skill" | "curse";
  id: SkillEffectId | CurseEffectId;
  /** 표시 시점 ID — 같은 효과가 연달아 터져도 key로 구분되도록 */
  triggeredAt: number;
}

interface MinigameStore {
  phase: MinigamePhase;
  currentRound: 1 | 2 | 3;
  /** 이번 런에서 challenge 페어를 1쌍 이상 매치한 라운드 수 (0~3). runResult에서 픽 슬롯 수의 기준. */
  roundsCleared: number;
  chancesLeft: number;
  board: MinigameTile[];
  firstFlippedIdx: number | null;
  secondFlippedIdx: number | null;
  isResolving: boolean;
  matchedThisRound: MinigameTile[];
  matchedAllRun: MinigameTile[];
  activeBuffs: ActiveBuff[];
  rewardOffer: RewardDefinition[] | null;
  echoGhosts: EchoGhost[];
  categoryHintActive: boolean;
  compassHintIdxs: number[];
  peekHintIdxs: number[];
  zoomedTileIdx: number | null;
  skillPoolForRound: SkillEffectId[];
  runStats: MinigameRunStats;
  mulliganActive: boolean;
  wardedActive: boolean;
  appraisalBorderActive: boolean;
  doubleLootActive: boolean;
  duplicateStashActive: boolean;
  /** 라운드 내 연속 매치 성공 수 — chainAwaken 보상 트리거용 */
  chainStreak: number;
  /** chainAwaken: 이번 라운드에서 +1 chance 보너스를 이미 받았는지 */
  chainAwakenConsumed: boolean;
  /** firstHarvest: 이번 라운드 첫 매치 peek2 자동 발동 처리 여부 */
  firstHarvestTriggered: boolean;
  /** xpBloom: 보상 활성 라운드에서 매치된 tileId 집합 (런 전체 누적, pickRunReward에서 XP 1.5배 판정) */
  xpBoostTileIds: string[];
  exitConfirmOpen: boolean;
  lastEffectToast: EffectToast | null;
  /**
   * 티켓 "예약" 상태 — startRun에서 true, 런이 확정되면(finishRun/exitRun) commit 시점에만
   * 실제로 progress.tickets를 차감한다. 이렇게 해야 새로고침/크래시 시 티켓이 날아가지 않음.
   */
  ticketReserved: boolean;

  // 액션
  startRun: () => boolean;
  flipCard: (idx: number) => void;
  pickReward: (rewardId: RewardEffectId) => void;
  pickRunReward: (tileIds: string[]) => void;
  continueFromRoundResult: () => void;
  exitRun: () => void;
  requestExit: () => void;
  cancelExit: () => void;
}

const initialState = {
  phase: "idle" as MinigamePhase,
  currentRound: 1 as 1 | 2 | 3,
  roundsCleared: 0,
  chancesLeft: 0,
  board: [] as MinigameTile[],
  firstFlippedIdx: null as number | null,
  secondFlippedIdx: null as number | null,
  isResolving: false,
  matchedThisRound: [] as MinigameTile[],
  matchedAllRun: [] as MinigameTile[],
  activeBuffs: [] as ActiveBuff[],
  rewardOffer: null as RewardDefinition[] | null,
  echoGhosts: [] as EchoGhost[],
  categoryHintActive: false,
  compassHintIdxs: [] as number[],
  peekHintIdxs: [] as number[],
  zoomedTileIdx: null as number | null,
  skillPoolForRound: [] as SkillEffectId[],
  runStats: { totalMatches: 0, skillMatches: 0, curseMatches: 0 } as MinigameRunStats,
  mulliganActive: false,
  wardedActive: false,
  appraisalBorderActive: false,
  doubleLootActive: false,
  duplicateStashActive: false,
  chainStreak: 0,
  chainAwakenConsumed: false,
  firstHarvestTriggered: false,
  xpBoostTileIds: [] as string[],
  exitConfirmOpen: false,
  lastEffectToast: null as EffectToast | null,
  ticketReserved: false,
};

// 타이머 취소용 (모듈 스코프)
const timers: Record<string, ReturnType<typeof setTimeout> | null> = {
  categoryFlash: null,
  peek: null,
  mismatchReveal: null,
  peekHint: null,
  compassHint: null,
  echoSweep: null,
  matchDelay: null,
  roundEnd: null,
  effectToast: null,
};

const EFFECT_TOAST_MS = 4500;

function clearAllTimers() {
  for (const key of Object.keys(timers)) {
    if (timers[key]) {
      clearTimeout(timers[key] as ReturnType<typeof setTimeout>);
      timers[key] = null;
    }
  }
}

// 현재 활성(非consumed) 버프로부터 derived flag 재계산.
// beginRound에서 한 번 스냅샷하고 curse로 버프가 strip될 때마다 다시 호출 —
// 이렇게 해야 "저주가 doubleLoot/duplicateStash 등을 스트립했는데
// 라운드/런 끝까지 그 버프가 계속 적용되는" 버그가 재현되지 않음.
function computeBuffFlags(activeBuffs: ActiveBuff[], round: 1 | 2 | 3) {
  const hasRoundActive = (id: RewardEffectId) =>
    activeBuffs.some(
      (b) =>
        !b.consumed &&
        b.effectId === id &&
        (b.appliesInRound === "all" || b.appliesInRound === round),
    );
  const hasRunActive = (id: RewardEffectId) =>
    activeBuffs.some((b) => !b.consumed && b.effectId === id);
  return {
    wardedActive: hasRoundActive("warded"),
    appraisalBorderActive: hasRunActive("appraisal"),
    doubleLootActive: hasRunActive("doubleLoot"),
    duplicateStashActive: hasRunActive("duplicateStash"),
  };
}

export const useMinigameStore = create<MinigameStore>((set, get) => {
  // === 내부 헬퍼 ===
  function beginRound(round: 1 | 2 | 3, carriedBuffs: ActiveBuff[]) {
    clearAllTimers();

    const config = ROUND_CONFIGS[round];
    const progress = useGameStore.getState().progress;

    // 이번 라운드에 적용되는 활성 버프만 추림
    const activeThisRound = carriedBuffs.filter(
      (b) =>
        !b.consumed &&
        (b.appliesInRound === "all" || b.appliesInRound === round),
    );

    const { board, skillIdsInRound } = generateBoard({
      config,
      unlockedCardIds: progress.unlockedCardIds || [],
      activeBuffs: activeThisRound,
      currentRound: round,
    });

    const steelNerves = activeThisRound.some((b) => b.effectId === "steelNerves");
    const chances = config.chances + (steelNerves ? 1 : 0);

    // wideEye: 이번 라운드에 wideEye 버프가 활성이면 peek 시간 3s로 연장
    const wideEye = activeThisRound.some((b) => b.effectId === "wideEye");
    const peekMs = wideEye ? ROUND_PEEK_MS_EXTENDED : ROUND1_PEEK_MS;

    set({
      phase: "categoryFlash",
      currentRound: round,
      chancesLeft: chances,
      board,
      firstFlippedIdx: null,
      secondFlippedIdx: null,
      isResolving: false,
      matchedThisRound: [],
      activeBuffs: carriedBuffs,
      echoGhosts: [],
      categoryHintActive: true,
      compassHintIdxs: [],
      peekHintIdxs: [],
      zoomedTileIdx: null,
      skillPoolForRound: skillIdsInRound,
      mulliganActive: false,
      chainStreak: 0,
      chainAwakenConsumed: false,
      firstHarvestTriggered: false,
      ...computeBuffFlags(carriedBuffs, round),
    });

    // 카테고리 플래시 2.5초
    timers.categoryFlash = setTimeout(() => {
      set({ categoryHintActive: false });

      if (config.openingPeek) {
        // 모든 카드 peekMs 동안 공개 (wideEye 활성이면 3s, 아니면 1.5s)
        set({
          phase: "peek",
          board: get().board.map((t) => ({ ...t, isFaceUp: true })),
        });
        timers.peek = setTimeout(() => {
          set({
            board: get().board.map((t) =>
              t.isMatched ? t : { ...t, isFaceUp: false },
            ),
            phase: "playing",
          });
          applyRoundStartBuffs();
        }, peekMs);
      } else {
        set({ phase: "playing" });
        applyRoundStartBuffs();
      }
    }, CATEGORY_FLASH_MS);
  }

  function applyRoundStartBuffs() {
    // 플레이가 시작된 뒤(플립 가능 상태) 트리거해야 하는 round-scoped 버프 훅.
    // wideEye는 peek 시간 자체를 늘리므로 beginRound에서 처리됨.
    // 현재 이 타이밍에 의존하는 round-start 효과는 없음 — 향후 신규 보상 훅 삽입 지점.
  }

  /**
   * peek2 스킬과 firstHarvest 보상 양쪽에서 재사용되는 핵심 로직.
   * 뒷면 미매치 타일 중 2장을 임의로 골라 2초간 페이드인.
   */
  function triggerPeek2() {
    const s = get();
    const hidden = s.board
      .map((t, i) => (!t.isFaceUp && !t.isMatched ? i : -1))
      .filter((i) => i >= 0);
    const picks: number[] = [];
    const pool = [...hidden];
    for (let i = 0; i < 2 && pool.length > 0; i++) {
      const p = Math.floor(Math.random() * pool.length);
      picks.push(pool[p]);
      pool.splice(p, 1);
    }
    set({ peekHintIdxs: [...s.peekHintIdxs, ...picks] });
    if (timers.peekHint) clearTimeout(timers.peekHint);
    timers.peekHint = setTimeout(() => {
      set({ peekHintIdxs: [] });
    }, PEEK2_MS);
  }

  function checkRoundEnd() {
    const s = get();
    const unmatched = s.board.filter((t) => !t.isMatched);
    const allMatched = unmatched.length === 0;
    const outOfChances = s.chancesLeft <= 0;
    // 저주 페어만 남은 경우 — 유저가 저주를 강제 발동시키지 않도록 자동 종료.
    // (challenge/skill 페어는 전부 매치됐고 curse 페어만 남은 상태)
    const onlyCursesLeft =
      unmatched.length > 0 && unmatched.every((t) => t.kind === "curse");

    if (allMatched || outOfChances || onlyCursesLeft) {
      // 500ms 전환 애니메이션 윈도우 동안 더 이상 입력을 받지 않아야 함 —
      // phase는 시각적으로 playing을 유지해야 매치/미스 애니메이션이 자연스럽게
      // 끝날 수 있으므로, isResolving을 원자적으로 잠가 flipCard 가드에 걸리게 함.
      set({ isResolving: true });
      if (timers.roundEnd) clearTimeout(timers.roundEnd);
      timers.roundEnd = setTimeout(() => {
        const s2 = get();
        set({
          phase: "roundResult",
          matchedAllRun: [...s2.matchedAllRun, ...s2.matchedThisRound],
          matchedThisRound: [],
          isResolving: false,
        });
        if (allMatched || onlyCursesLeft) {
          // 저주만 남긴 경우도 "깔끔한 마무리"로 간주 — full clear 사운드.
          playSound("fullClear");
          triggerHaptic("fullClear");
        }
      }, 500);
    }
  }

  function showEffectToast(toast: EffectToast) {
    set({ lastEffectToast: toast });
    if (timers.effectToast) clearTimeout(timers.effectToast);
    timers.effectToast = setTimeout(() => {
      set({ lastEffectToast: null });
    }, EFFECT_TOAST_MS);
  }

  function applySkillEffect(skillId: SkillEffectId) {
    showEffectToast({ kind: "skill", id: skillId, triggeredAt: Date.now() });
    const s = get();
    switch (skillId) {
      case "chancesPlus2":
        set({ chancesLeft: s.chancesLeft + 2 });
        break;
      case "peek2":
        triggerPeek2();
        break;
      case "mulligan":
        set({ mulliganActive: true });
        break;
      case "compass": {
        const config = ROUND_CONFIGS[s.currentRound];
        const skillIdxs = s.board
          .map((t, i) =>
            t.kind === "skill" && t.skillId === skillId && t.isMatched ? i : -1,
          )
          .filter((i) => i >= 0);
        const hinted = new Set<number>();
        for (const sIdx of skillIdxs) {
          const adj = getAdjacentIndices(sIdx, config.rows, config.cols);
          for (const a of adj) {
            const t = s.board[a];
            if (t && !t.isFaceUp && !t.isMatched) hinted.add(a);
          }
        }
        set({ compassHintIdxs: Array.from(hinted) });
        if (timers.compassHint) clearTimeout(timers.compassHint);
        timers.compassHint = setTimeout(() => {
          set({ compassHintIdxs: [] });
        }, COMPASS_HINT_MS);
        break;
      }
    }
  }

  function applyCurseEffect() {
    showEffectToast({
      kind: "curse",
      id: "loseChanceAndStripBuff",
      triggeredAt: Date.now(),
    });
    const s = get();
    playSound("curseTrigger");
    triggerHaptic("curseTrigger");

    // Warded: 저주를 1회 무효화 — 실제 activeBuffs에서도 consumed 처리해야
    // 이후 computeBuffFlags 재계산과 정합이 맞음.
    if (s.wardedActive) {
      const wardedIdx = s.activeBuffs.findIndex(
        (b) =>
          !b.consumed &&
          b.effectId === "warded" &&
          (b.appliesInRound === "all" || b.appliesInRound === s.currentRound),
      );
      const newBuffs = [...s.activeBuffs];
      if (wardedIdx >= 0) {
        newBuffs[wardedIdx] = { ...newBuffs[wardedIdx], consumed: true };
      }
      set({
        activeBuffs: newBuffs,
        ...computeBuffFlags(newBuffs, s.currentRound),
      });
      return;
    }

    const chances = Math.max(0, s.chancesLeft - 1);
    const current = s.currentRound;
    const activeIdxs = s.activeBuffs
      .map((b, i) =>
        !b.consumed &&
        (b.appliesInRound === "all" || b.appliesInRound === current)
          ? i
          : -1,
      )
      .filter((i) => i >= 0);

    const newBuffs = [...s.activeBuffs];
    if (activeIdxs.length > 0) {
      const pick = activeIdxs[Math.floor(Math.random() * activeIdxs.length)];
      newBuffs[pick] = { ...newBuffs[pick], consumed: true };
    }

    // derived 버프 플래그를 새 activeBuffs로부터 재계산 —
    // 이렇게 해야 저주가 doubleLoot/duplicateStash 등을 실제로 무력화함.
    set({
      chancesLeft: chances,
      activeBuffs: newBuffs,
      ...computeBuffFlags(newBuffs, current),
    });
  }

  /**
   * 예약된 티켓을 실제로 차감한다. idempotent — 이미 commit됐으면 no-op.
   * finishRun / exitRun 같은 "런이 확정된" 지점에서만 호출.
   */
  function commitTicketSpend() {
    const s = get();
    if (!s.ticketReserved) return;
    // progress.tickets가 런 시작 후 다른 경로(데일리 완료 등)로 올랐을 수도 있음 —
    // spendTicket은 현재 값 기준으로 안전하게 차감한다.
    useGameStore.getState().spendTicket();
    set({ ticketReserved: false });
  }

  function finishRun() {
    const s = get();
    const fullMatched = [...s.matchedAllRun, ...s.matchedThisRound];
    // 런이 runResult 단계로 도달 = "이 런은 확정된 플레이" → 티켓 차감.
    commitTicketSpend();
    set({
      matchedAllRun: fullMatched,
      matchedThisRound: [],
      phase: "runResult",
    });
  }

  // === 공개 액션 ===
  return {
    ...initialState,

    startRun: () => {
      // 가용 티켓만 확인하고 실제 차감은 finishRun/exitRun에서 commit.
      // 이렇게 해야 새로고침/크래시 중 티켓이 날아가지 않는다.
      const tickets = useGameStore.getState().progress.tickets || 0;
      if (tickets < 1) return false;

      clearAllTimers();
      set({ ...initialState, ticketReserved: true });
      beginRound(1, []);
      return true;
    },

    flipCard: (idx) => {
      const state = get();
      if (state.phase !== "playing") return;
      if (state.isResolving) return;
      if (idx < 0 || idx >= state.board.length) return;

      const tile = state.board[idx];
      if (!tile) return;

      // 매치 완료 타일도 재탭으로 zoom 토글 허용 — 매치된 카드 상세 확인용.
      if (tile.isMatched) {
        set({ zoomedTileIdx: state.zoomedTileIdx === idx ? null : idx });
        return;
      }

      // 이미 face-up(unmatched) → zoom 토글
      if (tile.isFaceUp) {
        set({ zoomedTileIdx: state.zoomedTileIdx === idx ? null : idx });
        return;
      }

      playSound("cardFlip");
      triggerHaptic("cardFlip");

      const newBoard = [...state.board];
      newBoard[idx] = { ...tile, isFaceUp: true };

      if (state.firstFlippedIdx === null) {
        set({ board: newBoard, firstFlippedIdx: idx });
        return;
      }

      // 두 번째 플립 = 매치 판정
      const firstIdx = state.firstFlippedIdx;
      const firstTile = state.board[firstIdx];
      const isMatch = firstTile.pairKey === tile.pairKey;

      set({
        board: newBoard,
        secondFlippedIdx: idx,
        isResolving: true,
      });

      if (isMatch) {
        timers.matchDelay = setTimeout(() => {
          const s = get();
          const mb = [...s.board];
          mb[firstIdx] = { ...mb[firstIdx], isMatched: true };
          mb[idx] = { ...mb[idx], isMatched: true };
          const matchedTile = mb[idx];
          const firstTileMatched = mb[firstIdx];

          const newRunStats = { ...s.runStats };
          newRunStats.totalMatches += 1;

          // 이번 라운드 신규 보상 활성 여부 — 매치 직후 기준 스냅샷
          const isRoundActive = (id: RewardEffectId) =>
            s.activeBuffs.some(
              (b) =>
                !b.consumed &&
                b.effectId === id &&
                (b.appliesInRound === "all" || b.appliesInRound === s.currentRound),
            );
          const xpBloomActive = isRoundActive("xpBloom");
          const chainAwakenActive = isRoundActive("chainAwaken");
          const firstHarvestActive = isRoundActive("firstHarvest");

          let updatedChainStreak = s.chainStreak;
          let updatedChainAwakenConsumed = s.chainAwakenConsumed;
          let updatedFirstHarvestTriggered = s.firstHarvestTriggered;
          let bonusChances = 0;
          let updatedXpBoostTileIds = s.xpBoostTileIds;

          if (matchedTile.kind === "skill" && matchedTile.skillId) {
            newRunStats.skillMatches += 1;
            playSound("complete");
            triggerHaptic("complete");
            set({ board: mb });
            applySkillEffect(matchedTile.skillId);
          } else if (matchedTile.kind === "curse") {
            newRunStats.curseMatches += 1;
            set({ board: mb });
            applyCurseEffect();
          } else {
            playSound("matchPair");
            triggerHaptic("matchPair");
            set({ board: mb });
          }

          // chainAwaken / firstHarvest / xpBloom 은 curse를 제외한 "positive" 매치만 트리거
          if (matchedTile.kind === "challenge" || matchedTile.kind === "skill") {
            updatedChainStreak = s.chainStreak + 1;
            if (
              chainAwakenActive &&
              !updatedChainAwakenConsumed &&
              updatedChainStreak >= 3
            ) {
              bonusChances = 1;
              updatedChainAwakenConsumed = true;
            }
            if (firstHarvestActive && !updatedFirstHarvestTriggered) {
              updatedFirstHarvestTriggered = true;
              triggerPeek2();
            }
            if (xpBloomActive) {
              updatedXpBoostTileIds = [
                ...s.xpBoostTileIds,
                firstTileMatched.tileId,
                matchedTile.tileId,
              ];
            }
          }
          // curse 매치: streak/firstHarvest 영향 없음 (중립)

          const currentChances = get().chancesLeft;
          set({
            firstFlippedIdx: null,
            secondFlippedIdx: null,
            isResolving: false,
            matchedThisRound: [
              ...get().matchedThisRound,
              firstTileMatched,
              matchedTile,
            ],
            runStats: newRunStats,
            chainStreak: updatedChainStreak,
            chainAwakenConsumed: updatedChainAwakenConsumed,
            firstHarvestTriggered: updatedFirstHarvestTriggered,
            chancesLeft: currentChances + bonusChances,
            xpBoostTileIds: updatedXpBoostTileIds,
          });

          checkRoundEnd();
        }, 400);
      } else {
        timers.mismatchReveal = setTimeout(() => {
          const s = get();
          const mb = [...s.board];
          mb[firstIdx] = { ...mb[firstIdx], isFaceUp: false };
          mb[idx] = { ...mb[idx], isFaceUp: false };

          // 기회 차감 — mulligan 스킬만 체크 (luckyCharm 보상 제거됨)
          let chances = s.chancesLeft;
          let mulliganUsed = s.mulliganActive;

          if (s.mulliganActive) {
            mulliganUsed = false;
          } else {
            chances = Math.max(0, chances - 1);
            playSound("cancel");
            triggerHaptic("cancel");
          }

          const ghostMs = ECHO_GHOST_MS;
          const now = performance.now();
          const pruned = s.echoGhosts
            .filter((g) => g.expiresAt > now)
            .slice(-1);
          const newGhosts: EchoGhost[] = [
            ...pruned,
            { idx: firstIdx, expiresAt: now + ghostMs },
            { idx, expiresAt: now + ghostMs },
          ];

          set({
            board: mb,
            firstFlippedIdx: null,
            secondFlippedIdx: null,
            isResolving: false,
            chancesLeft: chances,
            mulliganActive: mulliganUsed,
            echoGhosts: newGhosts,
            chainStreak: 0, // 미매치 시 chainAwaken streak 리셋
          });

          if (timers.echoSweep) clearTimeout(timers.echoSweep);
          timers.echoSweep = setTimeout(() => {
            const current = get();
            const t2 = performance.now();
            set({
              echoGhosts: current.echoGhosts.filter((g) => g.expiresAt > t2),
            });
          }, ghostMs + 50);

          checkRoundEnd();
        }, MISMATCH_REVEAL_MS);
      }
    },

    pickReward: (rewardId) => {
      const state = get();
      if (state.phase !== "rewardDraft") return;
      if (!state.rewardOffer) return;
      const chosen = state.rewardOffer.find((r) => r.id === rewardId);
      if (!chosen) return;

      playSound("rewardChoose");
      triggerHaptic("rewardChoose");

      const nextRound = (state.currentRound + 1) as 1 | 2 | 3;
      const buff: ActiveBuff = {
        effectId: chosen.id,
        appliesInRound: chosen.scope === "run" ? "all" : nextRound,
        consumed: false,
      };

      const newBuffs = [...state.activeBuffs, buff];
      set({
        activeBuffs: newBuffs,
        rewardOffer: null,
      });

      if (nextRound > 3) {
        finishRun();
      } else {
        beginRound(nextRound, newBuffs);
      }
    },

    pickRunReward: (tileIds) => {
      const state = get();
      if (state.phase !== "runResult") return;

      // 신뢰 경계: UI에서 넘어온 tileIds는 검증한다.
      // - runResult의 현재 matchedAllRun 안에 있는 challenge 타일만 허용
      // - 동일 카드(cardId) 중복 제거 — 단일 매칭 풀에서 한 카드만 보상
      // - basePicks: 클리어한 라운드 1개당 1장 (1~3)
      // - Double Loot: +1 장 (×2 아님 — 풀클리어 ×2=6장은 경제 균형을 무너뜨리기 때문에
      //   flat +1 보너스로 교체했다. i18n의 desc도 "+1 장"으로 맞춤.)
      const basePicks = Math.max(1, state.roundsCleared);
      const maxPicks = basePicks + (state.doubleLootActive ? 1 : 0);
      const validTiles = new Map<string, (typeof state.matchedAllRun)[number]>();
      for (const tid of tileIds) {
        if (validTiles.size >= maxPicks) break;
        const tile = state.matchedAllRun.find((t) => t.tileId === tid);
        if (!tile || tile.kind !== "challenge" || !tile.card) continue;
        // 동일 카드가 여러 tileId로 들어왔을 때 중복 카운트 방지
        if ([...validTiles.values()].some((v) => v.card?.id === tile.card?.id)) continue;
        validTiles.set(tid, tile);
      }
      const picks = [...validTiles.values()];

      const unlockCardIds: string[] = [];
      const xpGainPerCard: { cardId: string; amount: number }[] = [];
      const progress = useGameStore.getState().progress;
      const unlockedSet = new Set(progress.unlockedCardIds || []);
      const dupMult = state.duplicateStashActive ? 1.5 : 1;
      // xpBloom: 해당 타일이 보상 활성 라운드에서 매치되었으면 ×1.5
      const bloomSet = new Set(state.xpBoostTileIds);

      for (const t of picks) {
        if (!t.card) continue;
        if (unlockedSet.has(t.card.id)) {
          const base = XP_PER_RARITY[t.card.rarity] ?? 10;
          const bloomMult = bloomSet.has(t.tileId) ? 1.5 : 1;
          xpGainPerCard.push({
            cardId: t.card.id,
            amount: Math.round(base * dupMult * bloomMult),
          });
        } else {
          unlockCardIds.push(t.card.id);
        }
      }

      useGameStore.getState().grantMinigameRewards({
        unlockCardIds,
        xpGainPerCard,
        matchesThisRun: state.runStats.totalMatches,
      });

      playSound(unlockCardIds.length > 0 ? "collect" : "xpGain");
      triggerHaptic("collect");

      set({ phase: "runComplete" });
    },

    continueFromRoundResult: () => {
      const state = get();
      if (state.phase !== "roundResult") return;

      // "실패한 라운드" 정의: 챌린지 카드(스킬/저주 제외)를 한 장도 매치하지 못한 라운드.
      // 적어도 1쌍이라도 성공했다면 다음 라운드/보상 드래프트로 진행 — 부분 성공 허용.
      const matchedChallenge = state.board.some(
        (t) => t.isMatched && t.kind === "challenge",
      );
      if (!matchedChallenge) {
        finishRun();
        return;
      }

      // 이 라운드는 "클리어" — roundsCleared 증가. runResult에서 픽 슬롯 수의 기준이 됨.
      set({ roundsCleared: state.roundsCleared + 1 });

      if (state.currentRound === 3) {
        finishRun();
        return;
      }

      const offer = drawRewardOffer(3);
      set({ phase: "rewardDraft", rewardOffer: offer });
    },

    exitRun: () => {
      // 유저가 명시적으로 런을 포기한 경우도 "확정된 플레이"로 간주 — 티켓 차감.
      // 이 플로우는 requestExit → 확인 프롬프트 → exitRun으로 오므로 유저 동의 있음.
      // (확인 프롬프트 i18n 카피: "티켓은 환불되지 않아요")
      commitTicketSpend();
      clearAllTimers();
      set({ ...initialState });
    },

    requestExit: () => {
      const state = get();
      if (state.phase === "idle") return;
      set({ exitConfirmOpen: true });
    },

    cancelExit: () => {
      set({ exitConfirmOpen: false });
    },
  };
});
