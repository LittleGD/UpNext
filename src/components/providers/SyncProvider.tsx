"use client";

import { useEffect, useState } from "react";
import { isFirebaseConfigured, getFirebase } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { startListener, stopListener, uploadLocalData, getCloudData } from "@/lib/sync";
import type { AuthUser } from "@/types/auth";
import type { UserProgress, DailyState } from "@/types/game";
import { AnimatePresence } from "framer-motion";
import MergeConflictDialog from "@/components/auth/MergeConflictDialog";

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

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
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

            if (!cloudData) {
              if (store.hasCompletedOnboarding) {
                await uploadLocalData(firebaseUser.uid, store.progress, store.daily);
              }
            } else {
              const localDays = store.progress.totalDaysCompleted;
              const cloudDays = cloudData.progress.totalDaysCompleted;

              if (!store.hasCompletedOnboarding) {
                useGameStore.getState()._setFromCloud(cloudData.progress, cloudData.daily);
              } else if (localDays !== cloudDays && localDays > 0 && cloudDays > 0) {
                setConflict({
                  uid: firebaseUser.uid,
                  localProgress: store.progress,
                  localDaily: store.daily,
                  cloudProgress: cloudData.progress,
                  cloudDaily: cloudData.daily,
                });
                return;
              } else if (cloudDays >= localDays) {
                useGameStore.getState()._setFromCloud(cloudData.progress, cloudData.daily);
              } else {
                await uploadLocalData(firebaseUser.uid, store.progress, store.daily);
              }
            }
          } catch (error) {
            console.error("Sync initialization failed:", error);
          }

          await startListener(firebaseUser.uid, (progress, daily) => {
            useGameStore.getState()._setFromCloud(progress, daily);
          });
        } else {
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

  const handleChooseLocal = async () => {
    if (!conflict) return;
    await uploadLocalData(conflict.uid, conflict.localProgress, conflict.localDaily);
    await startListener(conflict.uid, (progress, daily) => {
      useGameStore.getState()._setFromCloud(progress, daily);
    });
    setConflict(null);
  };

  const handleChooseCloud = async () => {
    if (!conflict) return;
    useGameStore.getState()._setFromCloud(conflict.cloudProgress, conflict.cloudDaily);
    await startListener(conflict.uid, (progress, daily) => {
      useGameStore.getState()._setFromCloud(progress, daily);
    });
    setConflict(null);
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
    </>
  );
}
