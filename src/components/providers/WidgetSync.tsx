"use client";

/**
 * iOS Widget + Live Activity 상태 동기화 Provider.
 *
 * 게임 상태(streak, 오늘 챌린지, 레벨/XP 등)가 변할 때마다 native WidgetBridge로
 * payload를 push해서 홈화면·잠금화면 위젯 타임라인을 다시 그리도록 함.
 *
 * 추가로 daily 챌린지 시작/완료 시점에 Live Activity start/end도 자동 처리.
 *
 * 이 파일이 마운트되는 시점은 layout.tsx의 클라이언트 트리 — Capacitor가 아닌
 * 환경에서는 isIos() 체크로 모든 작업이 no-op이 되어 비용 0.
 */

import { useEffect, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import { getXPProgress, getTitleForLevel, type UserProgress, type DailyState } from "@/types/game";
import {
  pushWidgetState,
  startChallengeActivity,
  endChallengeActivity,
  type WidgetState,
} from "@/lib/widget";
import { isIos } from "@/lib/platform";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function buildWidgetState(progress: UserProgress, daily: DailyState): WidgetState {
  const { current, needed } = getXPProgress(progress.xp, progress.level);
  const todayCount = daily.selectedCards.length;
  const todayDone = daily.completedIds.length;

  // 메인 챌린지 = 첫 미완료 카드, 없으면 첫 카드
  const incomplete = daily.selectedCards.find((c) => !daily.completedIds.includes(c.id));
  const mainCard = incomplete ?? daily.selectedCards[0];

  return {
    streak: progress.currentStreak,
    todayCount,
    todayDone,
    xp: current,
    xpForNext: needed,
    level: progress.level,
    levelTitle: getTitleForLevel(progress.level, progress.language),
    mainChallengeTitle: mainCard?.title ?? "",
  };
}

export default function WidgetSync() {
  // 디바운스용 timer ref — 같은 frame에 여러 액션이 store를 갱신해도 1번만 push
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerialized = useRef<string>("");

  // 활성 Live Activity 추적용 — challenge id별 start 시각 기억해서 중복 start 방지
  const activeActivities = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isIos()) return;

    // 초기 push — 앱 시작 시 위젯이 stale 상태 안 되도록 한 번 동기화
    const initial = useGameStore.getState();
    const state = buildWidgetState(initial.progress, initial.daily);
    void pushWidgetState(state);
    lastSerialized.current = JSON.stringify(state);

    // 구독 — 관련 필드 변할 때마다 디바운스 후 push
    const unsubscribe = useGameStore.subscribe((store) => {
      const next = buildWidgetState(store.progress, store.daily);
      const serialized = JSON.stringify(next);
      if (serialized === lastSerialized.current) return;
      lastSerialized.current = serialized;

      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        void pushWidgetState(next);
      }, 250);
    });

    return () => {
      unsubscribe();
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, []);

  // === Live Activity 동기화 ===
  // 정책: daily.selectedCards에 들어 있고 completedIds에 없는 카드 = 진행 중 → activity start
  //       완료되거나 selection에서 제거되면 activity end.
  //       동시 진행 카드가 여러 개여도 메인 카드 1개만 Live Activity로 노출 (UX 단순화).
  useEffect(() => {
    if (!isIos()) return;

    const sync = (daily: DailyState) => {
      const incomplete = daily.selectedCards.find((c) => !daily.completedIds.includes(c.id));
      const currentId = incomplete?.id ?? null;

      // 새로 시작할 activity
      if (currentId && !activeActivities.current.has(currentId) && incomplete) {
        // 만료 시각: 카드 시작 시각 + 4h. selectedAt이 있으면 사용, 없으면 now.
        // (스키마에 startedAt이 없을 수 있어 보수적으로 now 기준)
        const expiresAt = Date.now() + FOUR_HOURS_MS;
        activeActivities.current.add(currentId);
        void startChallengeActivity(currentId, incomplete.title, expiresAt);
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
    sync(useGameStore.getState().daily);

    // 구독
    const unsubscribe = useGameStore.subscribe((store) => {
      sync(store.daily);
    });
    return () => unsubscribe();
  }, []);

  return null;
}
