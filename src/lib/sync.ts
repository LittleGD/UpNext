"use client";

import { isFirebaseConfigured, getFirebase } from "@/lib/firebase";
import { ALL_CARDS } from "@/data/cards";
import type { DailyState, UserProgress } from "@/types/game";
import type { ChallengeCard } from "@/types/card";
import type { Unsubscribe } from "firebase/firestore";

// 카드 ID → ChallengeCard 매핑
function hydrateCards(ids: string[]): ChallengeCard[] {
  return ids
    .map((id) => ALL_CARDS.find((c) => c.id === id))
    .filter((c): c is ChallengeCard => c !== undefined);
}

// ChallengeCard[] → ID 배열
function dehydrateCards(cards: ChallengeCard[]): string[] {
  return cards.map((c) => c.id);
}

// Firestore 데이터 → DailyState (카드 ID 배열 → 풀 객체 복원)
export function hydrateDaily(data: Record<string, unknown>): DailyState {
  return {
    date: (data.date as string) || (() => { const d = new Date(); d.setHours(d.getHours() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })(),
    drawnCards: hydrateCards((data.drawnCardIds as string[]) || []),
    selectedCards: hydrateCards((data.selectedCardIds as string[]) || []),
    completedIds: (data.completedIds as string[]) || [],
    isDrawComplete: (data.isDrawComplete as boolean) || false,
    isSelectionComplete: (data.isSelectionComplete as boolean) || false,
    rerollUsed: (data.rerollUsed as boolean) || false,
    // 추가 챌린지 시스템
    challengePhase: (data.challengePhase as "daily" | "extra" | "super") || "daily",
    extraDrawnCards: hydrateCards((data.extraDrawnCardIds as string[]) || []),
    extraSelectedCards: hydrateCards((data.extraSelectedCardIds as string[]) || []),
    extraCompletedIds: (data.extraCompletedIds as string[]) || [],
    extraDrawComplete: (data.extraDrawComplete as boolean) || false,
    extraSelectionComplete: (data.extraSelectionComplete as boolean) || false,
    superDrawnCards: hydrateCards((data.superDrawnCardIds as string[]) || []),
    superSelectedCards: hydrateCards((data.superSelectedCardIds as string[]) || []),
    superCompletedIds: (data.superCompletedIds as string[]) || [],
    superDrawComplete: (data.superDrawComplete as boolean) || false,
    superSelectionComplete: (data.superSelectionComplete as boolean) || false,
    // 실패 패널티
    hasPenalty: (data.hasPenalty as boolean) || false,
    penaltyCardId: (data.penaltyCardId as string) || null,
  };
}

// DailyState → Firestore 저장 형식 (카드 ID만)
export function dehydrateDaily(daily: DailyState): Record<string, unknown> {
  return {
    date: daily.date,
    drawnCardIds: dehydrateCards(daily.drawnCards),
    selectedCardIds: dehydrateCards(daily.selectedCards),
    completedIds: daily.completedIds,
    isDrawComplete: daily.isDrawComplete,
    isSelectionComplete: daily.isSelectionComplete,
    rerollUsed: daily.rerollUsed,
    // 추가 챌린지 시스템
    challengePhase: daily.challengePhase,
    extraDrawnCardIds: dehydrateCards(daily.extraDrawnCards),
    extraSelectedCardIds: dehydrateCards(daily.extraSelectedCards),
    extraCompletedIds: daily.extraCompletedIds,
    extraDrawComplete: daily.extraDrawComplete,
    extraSelectionComplete: daily.extraSelectionComplete,
    superDrawnCardIds: dehydrateCards(daily.superDrawnCards),
    superSelectedCardIds: dehydrateCards(daily.superSelectedCards),
    superCompletedIds: daily.superCompletedIds,
    superDrawComplete: daily.superDrawComplete,
    superSelectionComplete: daily.superSelectionComplete,
    // 실패 패널티
    hasPenalty: daily.hasPenalty,
    penaltyCardId: daily.penaltyCardId,
  };
}

// --- SyncManager ---

let unsubscribe: Unsubscribe | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSyncData: Record<string, unknown> = {};
let currentUid: string | null = null;

// 클라우드에서 로컬로 업데이트할 때 루프 방지 플래그
let isUpdatingFromCloud = false;
let cloudUpdatePromise: Promise<void> | null = null;

export function isCloudUpdate(): boolean {
  return isUpdatingFromCloud;
}

// Firestore 모듈 캐시 (동적 import 1회만)
let _firestoreMod: typeof import("firebase/firestore") | null = null;
async function getFirestoreMod() {
  if (!_firestoreMod) {
    _firestoreMod = await import("firebase/firestore");
  }
  return _firestoreMod;
}

// 리스너 시작: Firestore 문서 변경 감지 → 콜백 호출
export async function startListener(
  uid: string,
  onCloudUpdate: (progress: UserProgress, daily: DailyState) => void,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  stopListener();
  currentUid = uid;

  const { db } = await getFirebase();
  const { doc, onSnapshot } = await getFirestoreMod();

  const docRef = doc(db, "users", uid);
  unsubscribe = onSnapshot(docRef, (snapshot) => {
    const data = snapshot.data();
    if (!data) return;
    if (snapshot.metadata.hasPendingWrites) return;
    if (isUpdatingFromCloud) return;

    isUpdatingFromCloud = true;
    cloudUpdatePromise = Promise.resolve().then(() => {
      try {
        const progress = data.progress as UserProgress;
        const daily = hydrateDaily((data.daily as Record<string, unknown>) || {});
        onCloudUpdate(progress, daily);
      } finally {
        isUpdatingFromCloud = false;
        cloudUpdatePromise = null;
      }
    });
  });
}

// 리스너 정지
export function stopListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  currentUid = null;
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  pendingSyncData = {};
}

// 로컬 → 클라우드 동기화 (디바운스 300ms)
export function syncToCloud(key: string, value: unknown): void {
  if (!isFirebaseConfigured || !currentUid || isUpdatingFromCloud) return;

  if (key === "progress") {
    pendingSyncData.progress = value;
  } else if (key === "daily") {
    pendingSyncData.daily = dehydrateDaily(value as DailyState);
  } else if (key === "onboarding_complete") {
    pendingSyncData.onboardingComplete = value;
  }

  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    flushSync();
  }, 300);
}

async function flushSync(): Promise<void> {
  if (!currentUid || Object.keys(pendingSyncData).length === 0) return;

  const { db } = await getFirebase();
  const { doc, setDoc, serverTimestamp } = await getFirestoreMod();

  const dataToSync = { ...pendingSyncData };
  const docRef = doc(db, "users", currentUid);
  try {
    await setDoc(
      docRef,
      {
        ...dataToSync,
        meta: {
          lastSyncedAt: serverTimestamp(),
          lastDeviceId: getDeviceId(),
        },
      },
      { merge: true },
    );
    for (const key of Object.keys(dataToSync)) {
      if (pendingSyncData[key] === dataToSync[key]) {
        delete pendingSyncData[key];
      }
    }
  } catch (error) {
    console.error("Failed to sync to cloud:", error);
  }
}

// 로컬 데이터를 클라우드에 초기 업로드
export async function uploadLocalData(
  uid: string,
  progress: UserProgress,
  daily: DailyState,
): Promise<void> {
  if (!isFirebaseConfigured) return;

  const { db } = await getFirebase();
  const { doc, setDoc, serverTimestamp } = await getFirestoreMod();

  const docRef = doc(db, "users", uid);
  await setDoc(docRef, {
    progress,
    daily: dehydrateDaily(daily),
    onboardingComplete: true,
    meta: {
      createdAt: serverTimestamp(),
      lastSyncedAt: serverTimestamp(),
      lastDeviceId: getDeviceId(),
    },
  });
}

// 클라우드 데이터 최소 검증
function isValidProgress(data: unknown): data is UserProgress {
  if (!data || typeof data !== "object") return false;
  const p = data as Record<string, unknown>;
  return typeof p.totalDaysCompleted === "number" && Array.isArray(p.unlockedCardIds);
}

// 클라우드에 기존 데이터가 있는지 확인
export async function getCloudData(
  uid: string,
): Promise<{ progress: UserProgress; daily: DailyState } | null> {
  if (!isFirebaseConfigured) return null;

  const { db } = await getFirebase();
  const { doc, getDoc } = await getFirestoreMod();

  const docRef = doc(db, "users", uid);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  if (!isValidProgress(data.progress)) {
    console.warn("Invalid cloud progress data, ignoring");
    return null;
  }
  return {
    progress: data.progress as UserProgress,
    daily: hydrateDaily((data.daily as Record<string, unknown>) || {}),
  };
}

// 클라우드 데이터 삭제
export async function deleteCloudData(uid: string): Promise<void> {
  if (!isFirebaseConfigured) return;

  const { db } = await getFirebase();
  const { doc, deleteDoc } = await getFirestoreMod();

  const docRef = doc(db, "users", uid);
  await deleteDoc(docRef);
}

// 기기 ID (간단한 랜덤)
function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("upnext_device_id");
  if (!id) {
    id = Math.random().toString(36).substring(2, 10);
    localStorage.setItem("upnext_device_id", id);
  }
  return id;
}
