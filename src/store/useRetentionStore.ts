"use client";

import { create } from "zustand";
import type { RetentionState, CheckInResult } from "@/types/retention";
import {
  freshRetentionState,
  normalizeRetentionState,
  retentionCheckIn,
  refreshMonthlySavers,
  generatePreviousWeekReport,
} from "@/lib/retention";
import { saveToStorage, loadFromStorage } from "@/lib/storage";
import { getTodayString, useGameStore } from "@/store/useGameStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useDuoStore } from "@/store/useDuoStore";
import { playSound, triggerHaptic } from "@/lib/sounds";

/**
 * 불꽃 리텐션 스토어 (트랙 2-1) - iOS GameStore 의 retention 파트 포팅.
 *
 * 순수 계산은 전부 src/lib/retention.ts 엔진에 위임하고, 이 스토어는
 * 영속(localStorage 키 upnext_retention)과 다른 스토어 배선만 담당한다.
 *
 * 배선 (SyncProvider 소유):
 *   - 부트스트랩 각 분기에서 _setFromCloud / uploadLocalData 에 retention 전달
 *   - 60초 틱 + visibilitychange 에서 reconcileForToday()
 *   - onSnapshot 리스너의 cloud retention 수신 시 _setFromCloud
 *
 * 와이어 주의: saveToStorage("retention", ...) 는 storage.ts 를 거쳐
 * sync.ts syncToCloud("retention") 으로 라우팅된다. Firestore 쓰기 직전
 * stripUndefined 는 sync.ts 가 수행 (Swift 의 nil 생략과 동일한 키 생략).
 */

const STORAGE_KEY = "retention"; // 실제 localStorage 키: upnext_retention

/**
 * 챌린지 사진 로그 날짜 배열 주입용 헬퍼.
 * 웹 PhotoMeta 에는 iOS 의 kind 필드가 없다. 웹 캡처 플로우는 챌린지 완료
 * 인증 사진만 생성하므로 photoMetas 전체가 챌린지 로그다
 * (iOS 는 kind == .challengeLog 필터를 엔진 내부에서 수행).
 */
function getPhotoLogDates(): string[] {
  const growth = useGrowthStore.getState();
  if (!growth.isLoaded) growth.initialize();
  return useGrowthStore.getState().photoMetas.map((m) => m.date);
}

interface RetentionStore {
  retention: RetentionState;
  isLoaded: boolean;

  /** 앱 시작 시 localStorage 복원. 없으면 fresh (저장은 하지 않음: 익명
   *  fresh 상태가 클라우드의 iOS retention 을 덮어쓰지 않게). */
  initialize: () => void;

  /**
   * 오늘 체크인 (iOS GameStore.checkInToday 미러).
   *  - 엔진 retentionCheckIn 호출 후 저장 + 클라우드 동기화
   *  - progress.currentStreak/longestStreak 를 라이트 스트릭으로 덮어쓰기
   *  - changed 일 때만 듀오 publishCheckIn + confirm 사운드/햅틱
   * 반환값으로 UI 가 방패 소비/마일스톤 토스트를 띄울 수 있다.
   */
  checkInToday: () => CheckInResult;

  /**
   * 앱 진입/포그라운드 복귀/60초 틱마다 오늘 기준 정리
   * (iOS reconcileForToday 의 retention 파트):
   *  - 월 세이버 리필
   *  - 주간 리포트 백필 (progress.completionHistory + 사진 로그 날짜 주입)
   * 변경이 있을 때만 저장한다. 데일리 롤오버 자체는 useGameStore.checkDailyReset
   * 담당이므로, 호출측은 checkDailyReset 다음에 이걸 불러야 어제 기록이
   * 리포트에 반영된다 (SyncProvider tick 순서 고정).
   */
  reconcileForToday: () => void;

  /** 클라우드 데이터로 로컬 상태 교체 (syncToCloud 트리거 안 함).
   *  호출측(sync.ts)이 normalizeRetentionState 로 관용 디코드를 마친 값을 준다. */
  _setFromCloud: (state: RetentionState) => void;

  /** 로그아웃/계정삭제 시 in-memory 초기화 (useGameStore.resetForSignOut 패턴). */
  resetForSignOut: () => void;
}

export const useRetentionStore = create<RetentionStore>((set, get) => ({
  retention: freshRetentionState(),
  isLoaded: false,

  initialize: () => {
    if (get().isLoaded) return;
    const saved = loadFromStorage<unknown>(STORAGE_KEY);
    const today = getTodayString();
    // 로컬 저장분도 관용 디코드: 필드 단위 손상은 기본값으로 메꾼다
    // (iOS LocalProgressCache 디코드와 동일 방어선).
    const retention =
      saved === null ? freshRetentionState(today) : normalizeRetentionState(saved, today);
    set({ retention, isLoaded: true });
  },

  checkInToday: () => {
    if (!get().isLoaded) get().initialize();
    const today = getTodayString();
    const result = retentionCheckIn(get().retention, today);

    // 같은 날 재체크인(no-op)이어도 저장/동기화는 수행한다: 월경계 방패 리필이
    // result.state 에 반영됐을 수 있다 (iOS 도 sync.syncRetention 무조건 호출).
    set({ retention: result.state });
    saveToStorage(STORAGE_KEY, result.state);

    // iOS GameStore.checkInToday 미러: 라이트 스트릭이 progress 스트릭의
    // 진실원이 된다 (표시용 currentStreak/longestStreak 덮어쓰기 + 클라우드 동기화).
    useGameStore
      .getState()
      ._applyLightStreak(result.state.currentLightStreak, result.state.bestLightStreak);

    const settings = useGameStore.getState().progress;
    if (result.changed) {
      // 듀오 불꽃에 발행 (fire-and-forget, 익명/비듀오면 스토어가 알아서 no-op)
      useDuoStore.getState().publishCheckIn(today);
      if (settings.soundEnabled ?? true) playSound("confirm");
      if (settings.hapticEnabled ?? true) triggerHaptic("confirm");
    } else {
      // iOS Haptics.play(.selection) 대응: 소리 없이 가벼운 진동만
      if (settings.hapticEnabled ?? true) triggerHaptic("select");
    }
    return result;
  },

  reconcileForToday: () => {
    if (!get().isLoaded) get().initialize();
    // 게임 스토어가 아직 로드 전이면 빈 completionHistory 로 리포트를 만들어
    // 완료 수가 0 으로 굳는다 (주 단위 skip 이라 재생성 안 됨). 로드 후로 미룬다.
    if (!useGameStore.getState().isLoaded) return;

    const today = getTodayString();
    let retention = get().retention;
    let changed = false;

    // 엔진 함수들은 변경이 없으면 입력 객체를 그대로 반환하므로 참조 비교로 충분.
    const refreshed = refreshMonthlySavers(retention, today);
    if (refreshed !== retention) {
      retention = refreshed;
      changed = true;
    }

    const reported = generatePreviousWeekReport(
      retention,
      useGameStore.getState().progress,
      getPhotoLogDates(),
      today,
    );
    if (reported !== retention) {
      retention = reported;
      changed = true;
    }

    if (!changed) return;
    set({ retention });
    saveToStorage(STORAGE_KEY, retention);
  },

  _setFromCloud: (state) => {
    set({ retention: state, isLoaded: true });
    // localStorage 직접 저장: saveToStorage 를 거치면 syncToCloud 가 다시
    // 호출되어 echo 루프가 된다 (useGameStore._setFromCloud 와 동일 패턴).
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("upnext_retention", JSON.stringify(state));
      } catch {
        // storage full / private mode: 메모리 상태만 유지
      }
    }
  },

  resetForSignOut: () => {
    set({ retention: freshRetentionState(), isLoaded: false });
  },
}));
