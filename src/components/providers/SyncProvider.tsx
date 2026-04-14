"use client";

import { useEffect, useState } from "react";
import { isFirebaseConfigured, getFirebase } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { startListener, stopListener, uploadLocalData, getCloudData, setSyncReady } from "@/lib/sync";
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
 * 두 progress의 "플레이 성과" 단조 필드를 벡터로 비교한다.
 *
 * 반환값:
 * - "equal"    : 모든 필드가 동일 (merge 불필요, 한쪽을 그대로 쓰면 됨)
 * - "aAhead"   : a의 모든 필드가 b보다 크거나 같고 최소 1개는 엄격히 더 큼
 * - "bAhead"   : 그 반대
 * - "conflict" : 일부 필드는 a가 앞서고 다른 필드는 b가 앞섬 → 유저에게 선택 UI 노출
 *
 * 중요: tickets는 의도적으로 제외한다 (spend로 감소 가능 → 단조 비교 불가).
 * 데일리 진행 뿐 아니라 미니게임 진행(runs/xp/unlocked)도 포함해야 하며,
 * 이걸 빠뜨리면 같은 totalDaysCompleted에서 미니게임만 앞선 로컬이 클라우드로 덮여진다.
 */
type ProgressCompareResult = "equal" | "aAhead" | "bAhead" | "conflict";
function compareProgress(a: UserProgress, b: UserProgress): ProgressCompareResult {
  // 모든 필드는 단조 증가 해야 한다. tickets는 spend로 감소하므로 제외.
  // completionHistory 길이를 포함하면 "오늘 챌린지 완료했지만 아직 day-rollover가
  // 안 와서 totalDaysCompleted가 안 올라간" 프리-로그인 케이스도 잡을 수 있다.
  const fields: Array<(p: UserProgress) => number> = [
    (p) => p.totalDaysCompleted || 0,
    (p) => (p.completionHistory || []).length,
    (p) => p.minigameRunsPlayed || 0,
    (p) => p.minigameBestMatches || 0,
    (p) => p.xp || 0,
    (p) => (p.unlockedCardIds || []).length,
    (p) => p.extraChallengesCompleted || 0,
    (p) => p.superChallengesCompleted || 0,
  ];
  let aGteB = true;
  let bGteA = true;
  let anyDifference = false;
  for (const get of fields) {
    const va = get(a);
    const vb = get(b);
    if (va > vb) bGteA = false;
    else if (vb > va) aGteB = false;
    if (va !== vb) anyDifference = true;
  }
  if (!anyDifference) return "equal";
  if (aGteB && !bGteA) return "aAhead";
  if (bGteA && !aGteB) return "bAhead";
  return "conflict";
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

            if (store.isLocalEmpty && cloudData) {
              // 쿠키 삭제 후 복원 — 클라우드 데이터로 복원
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

  useEffect(() => {
    if (!syncSettled) return;
    if (conflict) return; // 병합 충돌 다이얼로그와 겹치지 않게
    if (!hasCompletedOnboarding) return;

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
    lastSeenPatchVersion,
    totalDaysCompleted,
    completionHistoryLength,
    minigameRunsPlayed,
  ]);

  const handleClosePatchModal = () => {
    useGameStore.getState().markPatchNotesSeen(LATEST_PATCH.version);
    setShowPatchModal(false);
  };

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
