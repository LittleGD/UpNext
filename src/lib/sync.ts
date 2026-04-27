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
    // 추가 챌린지 넛지 (1일 1회 스케줄 여부)
    extraNudgeScheduled: (data.extraNudgeScheduled as boolean) || false,
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
    // 추가 챌린지 넛지 (1일 1회 스케줄 여부)
    extraNudgeScheduled: daily.extraNudgeScheduled,
  };
}

// --- SyncManager ---

let unsubscribe: Unsubscribe | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSyncData: Record<string, unknown> = {};
let currentUid: string | null = null;

// 클라우드에서 로컬로 업데이트할 때 루프 방지 플래그
let isUpdatingFromCloud = false;

// 디바운스 중인 로컬 write 존재 여부
// Firestore의 hasPendingWrites보다 먼저 true가 되어, 디바운스 대기 중에 도착한
// stale cloud snapshot이 로컬 변경을 덮어쓰는 race condition을 방지
let hasLocalPendingWrite = false;

// flushSync 실패 시 재시도 타이머 — 네트워크 복구 후 자동으로 다시 시도해서
// 실패한 write 때문에 클라우드 snapshot이 영원히 suppress되는 상황을 방지한다.
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
const MAX_RETRY_ATTEMPTS = 6;
function computeRetryDelay(attempt: number): number {
  // 1s → 2s → 4s → 8s → 16s → 30s (cap)
  return Math.min(30_000, 1_000 * 2 ** attempt);
}

// 앱 시작 시 Auth 확인 완료 전까지 클라우드 동기화 차단
let isSyncReady = false;

export function setSyncReady(ready: boolean): void {
  isSyncReady = ready;
}
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
    // 디바운스 대기 중인 로컬 write가 있으면 stale cloud snapshot 무시
    // (flushSync 후 새 snapshot이 오면 정상 처리됨)
    if (hasLocalPendingWrite) return;

    // Phase 13 review #14 — onSnapshot 이전엔 data.progress 무검증 cast 로
    //   바로 local state 덮어씀. 손상된 Firestore snapshot 이 local 을 blow
    //   away 가능. getCloudData 와 동일한 isValidProgress 가드 추가.
    if (!isValidProgress(data.progress)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[sync] onSnapshot: invalid progress shape, skipping");
      }
      return;
    }

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
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempt = 0;
  pendingSyncData = {};
  hasLocalPendingWrite = false;
}

// 로컬 → 클라우드 동기화 (디바운스 300ms)
export function syncToCloud(key: string, value: unknown): void {
  if (!isFirebaseConfigured || !currentUid || isUpdatingFromCloud || !isSyncReady) return;

  if (key === "progress") {
    pendingSyncData.progress = value;
  } else if (key === "daily") {
    pendingSyncData.daily = dehydrateDaily(value as DailyState);
  } else if (key === "onboarding_complete") {
    pendingSyncData.onboardingComplete = value;
  }

  // 로컬에 pending write가 있음을 표시 — 이 동안 stale cloud snapshot 무시
  hasLocalPendingWrite = true;

  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    flushSync();
  }, 300);
}

async function flushSync(): Promise<void> {
  if (!currentUid || Object.keys(pendingSyncData).length === 0) {
    hasLocalPendingWrite = false;
    return;
  }

  const { db } = await getFirebase();
  const { doc, setDoc, serverTimestamp } = await getFirestoreMod();

  const dataToSync = { ...pendingSyncData };
  const docRef = doc(db, "users", currentUid);
  let success = false;
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
    success = true;
    markBackupSucceeded();
    for (const key of Object.keys(dataToSync)) {
      if (pendingSyncData[key] === dataToSync[key]) {
        delete pendingSyncData[key];
      }
    }
  } catch (error) {
    console.error("Failed to sync to cloud:", error);
  } finally {
    // 성공/실패 상관없이 플래그 정리
    // 새로 쌓인 pending write가 있으면 유지, 없으면 클리어
    hasLocalPendingWrite = Object.keys(pendingSyncData).length > 0;
  }

  if (success) {
    // 성공 — 재시도 카운터 리셋
    retryAttempt = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  } else if (hasLocalPendingWrite && currentUid) {
    // 실패 — 지수 backoff로 재시도 예약. 이렇게 해야 네트워크 복구 후
    // pending write가 eventually 성공해서 hasLocalPendingWrite가 내려가고,
    // 클라우드 snapshot suppression이 영구히 이어지지 않는다.
    if (retryAttempt < MAX_RETRY_ATTEMPTS) {
      const delay = computeRetryDelay(retryAttempt);
      retryAttempt += 1;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void flushSync();
      }, delay);
    } else {
      // 최대 재시도 소진 — 데이터 손실을 막기 위해 pending 데이터는 보존하되,
      // snapshot suppression은 해제해서 읽기 경로는 회복시킨다. 다음 로컬 write가
      // 들어오면 새 syncToCloud 호출이 다시 pending + 재시도를 킥오프한다.
      console.error(
        "Max sync retries exhausted; releasing snapshot suppression to avoid permanent read lock.",
      );
      hasLocalPendingWrite = false;
      retryAttempt = 0;
    }
  }
}

// 로컬 데이터를 클라우드에 초기 업로드.
//   P1 — uploadLocalData 는 syncToCloud 디바운스를 우회하므로, 별도로
//   `hasLocalPendingWrite` 플래그를 잡았다 풀어야 startListener 의 첫
//   onSnapshot emit 이 stale 빈 doc 으로 로컬을 덮어쓰는 race 를 차단할 수 있다.
//   유저 피드백: "로그인 직후 0일차 됨".
export async function uploadLocalData(
  uid: string,
  progress: UserProgress,
  daily: DailyState,
): Promise<void> {
  if (!isFirebaseConfigured) return;

  const { db } = await getFirebase();
  const { doc, setDoc, serverTimestamp } = await getFirestoreMod();

  hasLocalPendingWrite = true;
  try {
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
    markBackupSucceeded();
  } finally {
    hasLocalPendingWrite = false;
  }
}

// 클라우드 데이터 최소 검증.
//   Phase 14 code-review Medium #17 — 이전엔 `Array.isArray(unlockedCardIds)` 만
//   체크해 배열 요소가 string 이 아닐 때 (e.g. corrupted doc 이 number 나 null 혼입)
//   후속 `.map(id => CARDS[id])` 가 undefined 반환 → UI crash. 요소 type 까지 검증.
function isValidProgress(data: unknown): data is UserProgress {
  if (!data || typeof data !== "object") return false;
  const p = data as Record<string, unknown>;
  if (typeof p.totalDaysCompleted !== "number") return false;
  if (!Array.isArray(p.unlockedCardIds)) return false;
  // 요소 샘플링: 전체 배열 iterate 는 보통 수 십 개 수준이라 full check O(N) 감수.
  for (const id of p.unlockedCardIds) {
    if (typeof id !== "string") return false;
  }
  return true;
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

/**
 * P3 — 마지막 클라우드 백업 성공 시각 (ms epoch).
 *
 * Settings / AuthSection 에서 "마지막 백업: N분 전" 표시용.
 * - flushSync 성공 / uploadLocalData 성공 시점에 갱신.
 * - 클라우드의 meta.lastSyncedAt 은 serverTimestamp 라 round-trip 후에야 읽을 수
 *   있으므로 로컬 시각으로 별도 저장 (사용자에게 보여줄 용도로는 충분).
 */
const LAST_BACKUP_KEY = "upnext_last_backup_at";

function markBackupSucceeded(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    /* storage full / private mode — silently ignore */
  }
}

export function getLastBackupAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
