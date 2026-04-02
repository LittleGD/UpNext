"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
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

export default function SyncProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
      return;
    }

    const unsub = onAuthStateChanged(auth!, async (firebaseUser) => {
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
              // 온보딩 전이면 클라우드 우선
              useGameStore.getState()._setFromCloud(cloudData.progress, cloudData.daily);
            } else if (localDays !== cloudDays && localDays > 0 && cloudDays > 0) {
              // 양쪽 다 데이터가 있고 다르면 → 충돌 다이얼로그
              setConflict({
                uid: firebaseUser.uid,
                localProgress: store.progress,
                localDaily: store.daily,
                cloudProgress: cloudData.progress,
                cloudDaily: cloudData.daily,
              });
              return; // 리스너는 충돌 해소 후 시작
            } else if (cloudDays >= localDays) {
              useGameStore.getState()._setFromCloud(cloudData.progress, cloudData.daily);
            } else {
              await uploadLocalData(firebaseUser.uid, store.progress, store.daily);
            }
          }
        } catch (error) {
          console.error("Sync initialization failed:", error);
        }

        startListener(firebaseUser.uid, (progress, daily) => {
          useGameStore.getState()._setFromCloud(progress, daily);
        });
      } else {
        setUser(null);
        stopListener();
      }
    });

    return () => unsub();
  }, [setUser]);

  const handleChooseLocal = async () => {
    if (!conflict) return;
    await uploadLocalData(conflict.uid, conflict.localProgress, conflict.localDaily);
    startListener(conflict.uid, (progress, daily) => {
      useGameStore.getState()._setFromCloud(progress, daily);
    });
    setConflict(null);
  };

  const handleChooseCloud = () => {
    if (!conflict) return;
    useGameStore.getState()._setFromCloud(conflict.cloudProgress, conflict.cloudDaily);
    startListener(conflict.uid, (progress, daily) => {
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
