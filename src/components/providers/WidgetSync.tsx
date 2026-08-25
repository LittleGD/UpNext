"use client";

/**
 * 네이티브 Widget + Live Activity 상태 동기화 Provider (Capacitor 공용).
 *
 * 게임 상태(streak, 오늘 챌린지, 레벨/XP 등)가 변할 때마다 native WidgetBridge로
 * payload를 push해서 홈화면·잠금화면 위젯을 다시 그리도록 함.
 *
 * 추가로 챌린지 시작/완료 시점에 Live Activity start/end도 자동 처리
 * (Android 플러그인은 { supported: false } — 호출은 유지, 실제로는 no-op).
 *
 * 이 파일이 마운트되는 시점은 layout.tsx의 클라이언트 트리 — Capacitor가 아닌
 * 환경에서는 isNative() 체크로 모든 작업이 no-op이 되어 비용 0.
 *
 * 페이로드 스키마는 iOS 네이티브 앱의 WidgetSync.swift / WidgetState.swift 와
 * 필드명 일치 (date/streak/todayCount/todayDone/xp/xpForNext/level/levelTitle/
 * mainChallengeTitle/tasks/updatedAt, + Android 전용 lang).
 */

import { useEffect, useRef } from "react";
import { useGameStore, getTodayString } from "@/store/useGameStore";
import { getXPProgress, getTitleForLevel, type UserProgress, type DailyState } from "@/types/game";
import type { ChallengeCard } from "@/types/card";
import { cardTitle } from "@/i18n";
import {
  pushWidgetState,
  startChallengeActivity,
  endChallengeActivity,
  type WidgetState,
} from "@/lib/widget";
import { isNative } from "@/lib/platform";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

/**
 * 현재 challengePhase 의 선택/완료/선택확정 슬라이스.
 * iOS WidgetSync.swift 의 phase switch (daily/extra/super) 미러.
 */
function phaseSlice(daily: DailyState): {
  selected: ChallengeCard[];
  completedIds: string[];
  selectionDone: boolean;
} {
  switch (daily.challengePhase) {
    case "extra":
      return {
        selected: daily.extraSelectedCards,
        completedIds: daily.extraCompletedIds,
        selectionDone: daily.extraSelectionComplete,
      };
    case "super":
      return {
        selected: daily.superSelectedCards,
        completedIds: daily.superCompletedIds,
        selectionDone: daily.superSelectionComplete,
      };
    default:
      return {
        selected: daily.selectedCards,
        completedIds: daily.completedIds,
        selectionDone: daily.isSelectionComplete,
      };
  }
}

/**
 * updatedAt 을 제외한 위젯 페이로드 빌드 — updatedAt 은 push 직전에 찍는다.
 * (매 빌드마다 시각이 바뀌면 lastSerialized 중복 제거가 무력화되기 때문.)
 */
function buildWidgetState(
  progress: UserProgress,
  daily: DailyState
): Omit<WidgetState, "updatedAt"> {
  const { current, needed } = getXPProgress(progress.xp, progress.level);
  const lang = progress.language;
  const { selected, completedIds } = phaseSlice(daily);
  const done = new Set(completedIds);

  // 메인 챌린지 = 현재 페이즈의 첫 미완료 카드. 없으면(미선택/풀클리어) 빈 문자열 —
  // 위젯 쪽이 lang 기반 자체 fallback 문구를 그린다 (iOS displayChallengeTitle 동일 패턴).
  const incomplete = selected.find((c) => !done.has(c.id));

  return {
    date: getTodayString(),
    streak: progress.currentStreak,
    todayCount: selected.length,
    todayDone: completedIds.length,
    xp: current,
    xpForNext: needed,
    level: progress.level,
    levelTitle: getTitleForLevel(progress.level, lang),
    // 카드 raw title 은 항상 한국어 — 인앱 언어로 해석해 push (iOS 와 동일 정책)
    mainChallengeTitle: incomplete ? cardTitle(incomplete, lang) : "",
    tasks: selected.map((c) => ({ title: cardTitle(c, lang), done: done.has(c.id) })),
    lang,
  };
}

export default function WidgetSync() {
  // 디바운스용 timer ref — 같은 frame에 여러 액션이 store를 갱신해도 1번만 push
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerialized = useRef<string>("");

  // 활성 Live Activity 추적용 — challenge id별 start 시각 기억해서 중복 start 방지
  const activeActivities = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isNative()) return;

    // 초기 push — 앱 시작 시 위젯이 stale 상태 안 되도록 한 번 동기화
    const initial = useGameStore.getState();
    const state = buildWidgetState(initial.progress, initial.daily);
    void pushWidgetState({ ...state, updatedAt: Date.now() });
    lastSerialized.current = JSON.stringify(state);

    // 구독 — 관련 필드 변할 때마다 디바운스 후 push
    const unsubscribe = useGameStore.subscribe((store) => {
      const next = buildWidgetState(store.progress, store.daily);
      const serialized = JSON.stringify(next);
      if (serialized === lastSerialized.current) return;
      lastSerialized.current = serialized;

      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        void pushWidgetState({ ...next, updatedAt: Date.now() });
      }, 250);
    });

    return () => {
      unsubscribe();
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, []);

  // === Live Activity 동기화 ===
  // 정책: 현재 페이즈의 선택이 확정됐고(selectionDone) 미완료 카드가 있으면
  //       그 첫 카드로 activity start. 완료되거나 selection에서 빠지면 end.
  //       동시 진행 카드가 여러 개여도 메인 카드 1개만 Live Activity로 노출 (UX 단순화).
  //       iOS WidgetSync.reconcileChallengeActivity 의 phase 분기 미러 —
  //       Android 브릿지는 { supported: false } 라 실질 no-op.
  useEffect(() => {
    if (!isNative()) return;

    const sync = (progress: UserProgress, daily: DailyState) => {
      const { selected, completedIds, selectionDone } = phaseSlice(daily);
      const done = new Set(completedIds);
      const incomplete = selectionDone ? selected.find((c) => !done.has(c.id)) : undefined;
      const currentId = incomplete?.id ?? null;

      // 새로 시작할 activity
      if (currentId && !activeActivities.current.has(currentId) && incomplete) {
        // 만료 시각: 카드 시작 시각 + 4h. selectedAt이 있으면 사용, 없으면 now.
        // (스키마에 startedAt이 없을 수 있어 보수적으로 now 기준)
        const expiresAt = Date.now() + FOUR_HOURS_MS;
        activeActivities.current.add(currentId);
        void startChallengeActivity(
          currentId,
          cardTitle(incomplete, progress.language),
          expiresAt
        );
      }

      // 더 이상 진행 중이 아닌 activity는 종료
      for (const id of Array.from(activeActivities.current)) {
        if (id !== currentId) {
          activeActivities.current.delete(id);
          void endChallengeActivity(id);
        }
      }
    };

    // 초기 1회
    const initial = useGameStore.getState();
    sync(initial.progress, initial.daily);

    // 구독
    const unsubscribe = useGameStore.subscribe((store) => {
      sync(store.progress, store.daily);
    });
    return () => unsubscribe();
  }, []);

  return null;
}
