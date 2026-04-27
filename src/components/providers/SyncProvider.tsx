"use client";

import { useEffect, useState } from "react";
import { isFirebaseConfigured, getFirebase } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { startListener, stopListener, uploadLocalData, getCloudData, setSyncReady } from "@/lib/sync";
import { compareProgress } from "@/lib/progressCompare";
import { saveToStorage } from "@/lib/storage";
import type { AuthUser } from "@/types/auth";
import type { UserProgress, DailyState } from "@/types/game";
import { AnimatePresence } from "framer-motion";
import MergeConflictDialog from "@/components/auth/MergeConflictDialog";
import PatchNotesModal from "@/components/PatchNotesModal";
import { LATEST_PATCH } from "@/data/patchNotes";

interface ConflictState {
  uid: string;
  localProgress: UserProgress;
  localDaily: DailyState;
  cloudProgress: UserProgress;
  cloudDaily: DailyState;
}

/**
 * requestIdleCallback 래퍼 — FCP/LCP 이후 idle 시점에 콜백 실행
 * → Firebase SDK 파싱이 초기 렌더를 방해하지 않도록 지연
 */
function whenIdle(fn: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(fn);
  } else {
    setTimeout(fn, 50);
  }
}

export default function SyncProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  // 패치 노트 모달: 초기 동기화(로컬/클라우드)가 끝나기 전까지는 lastSeenPatchVersion을
  // 신뢰할 수 없으므로 modal을 띄우지 않는다. syncSettled가 true가 되는 시점:
  // - Firebase 비사용: 즉시
  // - 로그인: 클라우드 페치 + merge 완료 후
  // - 로그아웃: auth listener null 브랜치 실행 후
  const [syncSettled, setSyncSettled] = useState(false);
  const [showPatchModal, setShowPatchModal] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
      setSyncSettled(true);
      return;
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;

    // Firebase 로딩을 idle 시점으로 지연 → TBT 감소
    whenIdle(async () => {
      if (cancelled) return;

      const { auth } = await getFirebase();
      const { onAuthStateChanged } = await import("firebase/auth");

      if (cancelled) return;

      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const user: AuthUser = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            email: firebaseUser.email,
          };
          setUser(user);

          try {
            const cloudData = await getCloudData(firebaseUser.uid);
            const store = useGameStore.getState();

            if (store.isLocalEmpty && cloudData && !store.hasCompletedOnboarding) {
              // 쿠키 삭제 후 복원 — 클라우드 데이터로 복원.
              //
              // `!hasCompletedOnboarding` 가드: isLocalEmpty 는 initialize() 시점의
              // 스냅샷이라 이후 유저가 온보딩을 끝내도 true 로 남아있을 수 있다.
              // Firebase auth listener 가 whenIdle 로 지연되어 fire 하는 동안 유저가
              // 온보딩을 완료하면, 여기서 fresh 로컬 선택(예: mode=godlife)을
              // 조용히 클라우드 값(prior mode=normal)으로 덮어쓰는 데이터 손실 발생.
              // 온보딩이 이미 완료된 상태면 로컬이 truth — 아래 compareProgress 로 합친다.
              useGameStore.getState()._setFromCloud(cloudData.progress, cloudData.daily);
              saveToStorage("progress", cloudData.progress);
              saveToStorage("daily", cloudData.daily);
              saveToStorage("onboarding_complete", true);
              useGameStore.setState({ hasCompletedOnboarding: true, isLocalEmpty: false });
            } else if (store.isLocalEmpty && !cloudData) {
              // 진짜 신규 유저 — 기본값 저장
              saveToStorage("progress", store.progress);
              saveToStorage("daily", store.daily);
              useGameStore.setState({ isLocalEmpty: false });
            } else if (!cloudData) {
              if (store.hasCompletedOnboarding) {
                await uploadLocalData(firebaseUser.uid, store.progress, store.daily);
              }
            } else {
              if (!store.hasCompletedOnboarding) {
                useGameStore.getState()._setFromCloud(cloudData.progress, cloudData.daily);
              } else {
                // 데일리 진행 + 미니게임 진행(runs/xp/unlocked) + 추가/슈퍼 챌린지를
                // 벡터 비교해서 "strictly ahead"인 쪽을 자동 채택, 서로 앞서는 필드가
                // 다르면 유저에게 병합 UI를 띄운다. totalDaysCompleted만 보던 기존 로직은
                // "같은 날짜지만 로컬에 미니게임 진행이 있는" 케이스에서 클라우드가 로컬을
                // 조용히 덮어쓰는 데이터 손실 버그를 일으켰다.
                const result = compareProgress(store.progress, cloudData.progress);
                if (result === "equal" || result === "bAhead") {
                  useGameStore.getState()._setFromCloud(cloudData.progress, cloudData.daily);
                } else if (result === "aAhead") {
                  await uploadLocalData(firebaseUser.uid, store.progress, store.daily);
                } else {
                  // 진짜 conflict — 양쪽이 서로 다른 축에서 앞서 있음
                  setConflict({
                    uid: firebaseUser.uid,
                    localProgress: store.progress,
                    localDaily: store.daily,
                    cloudProgress: cloudData.progress,
                    cloudDaily: cloudData.daily,
                  });
                  return;
                }
              }
            }
          } catch (error) {
            console.error("Sync initialization failed:", error);
          }

          setSyncReady(true);
          setSyncSettled(true);
          await startListener(firebaseUser.uid, (progress, daily) => {
            useGameStore.getState()._setFromCloud(progress, daily);
          });
        } else {
          const store = useGameStore.getState();
          if (store.isLocalEmpty) {
            saveToStorage("progress", store.progress);
            saveToStorage("daily", store.daily);
            useGameStore.setState({ isLocalEmpty: false });
          }
          setSyncReady(true);
          setSyncSettled(true);
          setUser(null);
          stopListener();
        }
      });
    });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [setUser]);

  // 패치 노트 트리거: 동기화 완료 + 온보딩 완료 + "돌아온 유저" + 버전 미확인.
  // hasCompletedOnboarding은 로컬 storage 기반이라 sync보다 먼저 hydrate되지만,
  // lastSeenPatchVersion은 클라우드 값이 로컬을 덮어쓸 수 있으므로 syncSettled 후에만 판단한다.
  // cloud sync가 lastSeenPatchVersion을 늦게 내려보내도 이 effect가 재실행돼서 modal을 닫는다.
  const lastSeenPatchVersion = useGameStore((s) => s.progress.lastSeenPatchVersion);
  const hasCompletedOnboarding = useGameStore((s) => s.hasCompletedOnboarding);
  const totalDaysCompleted = useGameStore((s) => s.progress.totalDaysCompleted);
  const completionHistoryLength = useGameStore((s) => s.progress.completionHistory?.length ?? 0);
  const minigameRunsPlayed = useGameStore((s) => s.progress.minigameRunsPlayed);
  // 카드 드로우/선택 진행 중에는 패치 모달을 띄우지 않는다.
  // 선택이 끝나면 isSelectionDone이 true로 바뀌면서 이 effect가 재실행돼 모달을 띄운다.
  const isSelectionDone = useGameStore((s) => {
    const d = s.daily;
    const phase = d.challengePhase || "daily";
    return phase === "daily" ? d.isSelectionComplete
      : phase === "extra" ? d.extraSelectionComplete
      : d.superSelectionComplete;
  });

  useEffect(() => {
    if (!syncSettled) return;
    if (conflict) return; // 병합 충돌 다이얼로그와 겹치지 않게
    if (!hasCompletedOnboarding) return;
    // 카드 드로우/선택 중에는 표시하지 않음 (extra/super phase 진입 시에도 닫힘)
    if (!isSelectionDone) {
      setShowPatchModal(false);
      return;
    }

    // cloud sync가 lastSeenPatchVersion을 최신으로 갱신했으면 modal을 즉시 닫음
    if (lastSeenPatchVersion === LATEST_PATCH.version) {
      setShowPatchModal(false);
      return;
    }

    // "돌아온 유저" 신호: 챌린지 완료/기록/미니게임 플레이 중 하나라도 있어야 함
    const hasActivity =
      (totalDaysCompleted ?? 0) > 0 ||
      completionHistoryLength > 0 ||
      (minigameRunsPlayed ?? 0) > 0;
    if (!hasActivity) return;

    // 기존 인트로/레벨업 모달과 겹치지 않도록 약간의 지연
    const timer = setTimeout(() => setShowPatchModal(true), 300);
    return () => clearTimeout(timer);
  }, [
    syncSettled,
    conflict,
    hasCompletedOnboarding,
    isSelectionDone,
    lastSeenPatchVersion,
    totalDaysCompleted,
    completionHistoryLength,
    minigameRunsPlayed,
  ]);

  const handleClosePatchModal = () => {
    useGameStore.getState().markPatchNotesSeen(LATEST_PATCH.version);
    setShowPatchModal(false);
  };

  // Phase 13 review Critical #3 — `checkDailyReset` 호출 훅 (이전엔 어느 곳에서도
  //   호출 안 됨). 앱을 켜둔 채 자정 (KST 01:00) 넘기면 daily.date 가 어제로 남아
  //   새 드로우 불가. 해결: (a) visibilitychange 시 resume 확인, (b) 60초 주기
  //   poll. 2 패턴 동시 사용 — 백그라운드 탭에서도 접근성.
  useEffect(() => {
    if (!syncSettled) return;
    const tick = () => useGameStore.getState().checkDailyReset();
    tick(); // 즉시 1회 (mount + syncSettled 직후)
    const intervalId = window.setInterval(tick, 60_000);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [syncSettled]);

  const handleChooseLocal = async () => {
    if (!conflict) return;
    await uploadLocalData(conflict.uid, conflict.localProgress, conflict.localDaily);
    setSyncReady(true);
    await startListener(conflict.uid, (progress, daily) => {
      useGameStore.getState()._setFromCloud(progress, daily);
    });
    setConflict(null);
    setSyncSettled(true);
  };

  const handleChooseCloud = async () => {
    if (!conflict) return;
    useGameStore.getState()._setFromCloud(conflict.cloudProgress, conflict.cloudDaily);
    setSyncReady(true);
    await startListener(conflict.uid, (progress, daily) => {
      useGameStore.getState()._setFromCloud(progress, daily);
    });
    setConflict(null);
    setSyncSettled(true);
  };

  return (
    <>
      {children}
      <AnimatePresence>
        {conflict && (
          <MergeConflictDialog
            localProgress={conflict.localProgress}
            cloudProgress={conflict.cloudProgress}
            onChooseLocal={handleChooseLocal}
            onChooseCloud={handleChooseCloud}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPatchModal && !conflict && (
          <PatchNotesModal patch={LATEST_PATCH} onClose={handleClosePatchModal} />
        )}
      </AnimatePresence>
    </>
  );
}
