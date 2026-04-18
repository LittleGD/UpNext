/**
 * Up Hero — Phase 11c: 주간 악몽 던전 Firestore 리더보드.
 *
 * Firestore 경로: `weekly-leaderboard/{weekId}/entries/{uid}`
 *   { uid, displayName, score, floorsCleared, heroLevel, classType, clearedAt }
 *
 * Firestore rules (별도 설정 필요):
 *   match /weekly-leaderboard/{weekId}/entries/{uid} {
 *     allow read: if true;
 *     allow write: if request.auth != null && request.auth.uid == uid;
 *   }
 *
 * 사용:
 *   uploadWeeklyScore(...)  — 세션 clear 시 호출. 익명 유저 (uid 없음) 는 skip.
 *   fetchWeeklyTop(...)     — Leaderboard modal 에서 호출. top 100.
 *   fetchMyRank(...)        — 내 순위 조회 (top 100 밖일 때 "당신: #N").
 */

"use client";

import { getFirebase, isFirebaseConfigured } from "@/lib/firebase";
import type { ClassType } from "@/types/uphero";

export interface WeeklyLeaderboardEntry {
  uid: string;
  displayName: string;
  score: number;
  floorsCleared: number;
  heroLevel: number;
  classType: ClassType | null;
  clearedAt: number; // timestamp ms
}

/**
 * 세션 종료 직후 Firestore 에 업로드.
 *   - 로그인 안 돼있으면 skip (로컬 기록만 유지, store 의 bestScore).
 *   - Firestore 미구성 (isFirebaseConfigured=false) 환경에선 skip.
 *   - 이미 이번 주 기록보다 낮으면 skip (best 유지).
 *     호출처에서 local bestScore 와 비교 후 최고 기록일 때만 호출 권장.
 */
export async function uploadWeeklyScore(
  weekId: string,
  entry: Omit<WeeklyLeaderboardEntry, "uid">,
): Promise<"ok" | "no-auth" | "no-firebase" | "error"> {
  if (!isFirebaseConfigured) return "no-firebase";
  try {
    const { auth, db } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return "no-auth";
    const { doc, setDoc } = await import("firebase/firestore");
    const ref = doc(db, "weekly-leaderboard", weekId, "entries", user.uid);
    await setDoc(ref, { uid: user.uid, ...entry }, { merge: false });
    return "ok";
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[weeklyLeaderboard] upload failed:", e);
    }
    return "error";
  }
}

/**
 * 이번 주 상위 N 명 조회. orderBy(score desc), limit.
 * 익명 유저도 read 가능 (Firestore rules read: if true).
 */
export async function fetchWeeklyTop(
  weekId: string,
  limit = 100,
): Promise<WeeklyLeaderboardEntry[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const { db } = await getFirebase();
    const {
      collection,
      query,
      orderBy,
      limit: fsLimit,
      getDocs,
    } = await import("firebase/firestore");
    const col = collection(db, "weekly-leaderboard", weekId, "entries");
    const q = query(col, orderBy("score", "desc"), fsLimit(limit));
    const snap = await getDocs(q);
    return snap.docs.map(
      (d) => d.data() as unknown as WeeklyLeaderboardEntry,
    );
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[weeklyLeaderboard] fetchTop failed:", e);
    }
    return [];
  }
}

/**
 * 내 순위 조회 — top 100 밖일 때 사용. 전체 entries 스캔 (> 100 만 명 까진 감당 가능).
 * 더 많아지면 Cloud Function + aggregation 필요.
 */
export async function fetchMyRank(
  weekId: string,
): Promise<{ rank: number; entry: WeeklyLeaderboardEntry } | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const { auth, db } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return null;
    const { collection, query, orderBy, getDocs, doc, getDoc } = await import(
      "firebase/firestore"
    );
    // 내 entry 먼저 확인
    const myDocRef = doc(db, "weekly-leaderboard", weekId, "entries", user.uid);
    const myDoc = await getDoc(myDocRef);
    if (!myDoc.exists()) return null;
    const myEntry = myDoc.data() as unknown as WeeklyLeaderboardEntry;

    // score > myScore 인 entry 수 + 1 = 내 랭크
    // 단순 구현: 전체 entries 가져와서 sort 후 index 찾음. 대규모에선 비효율.
    const col = collection(db, "weekly-leaderboard", weekId, "entries");
    const q = query(col, orderBy("score", "desc"));
    const snap = await getDocs(q);
    const rank = snap.docs.findIndex((d) => d.id === user.uid) + 1;
    return { rank, entry: myEntry };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[weeklyLeaderboard] fetchMyRank failed:", e);
    }
    return null;
  }
}

/** 현재 로그인된 유저의 displayName. 없으면 "익명 영웅". */
export async function getDisplayName(): Promise<string> {
  if (!isFirebaseConfigured) return "익명 영웅";
  try {
    const { auth } = await getFirebase();
    return auth.currentUser?.displayName ?? "익명 영웅";
  } catch {
    return "익명 영웅";
  }
}
