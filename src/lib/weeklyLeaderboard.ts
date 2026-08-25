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
 * Firestore composite indexes (필수, Phase 11c R2 추가):
 *   Collection group: "entries"
 *     1) score ASC, clearedAt ASC   — fetchMyRank 의 tie-break 쿼리
 *        (where score == X && where clearedAt < Y)
 *   firestore.indexes.json 에 등록 필요. 단일 필드 쿼리 (score desc only) 는
 *   Firestore 가 자동 index 생성.
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
 * Phase 14 code-review High #8 — client-side formula guard.
 *
 * Firestore rules 가 이미 score 상한을 강제하지만, rules rejection 은 네트워크
 * round-trip 소비 + UX 혼란 (업로드 실패 로그만 남음) 이라 *전송 전* 수학적으로
 * 불가능한 값을 거른다. rules 와 동일 공식:
 *   score ≤ floors×100 + 2000 (완주) + 440 (timeBonus cap, BASE_EXPEDITION_TIME 220 × 2)
 *           + heroLevel² × 2
 *
 * floors ∈ [0, 30], heroLevel ∈ [1, 500] 범위 외 값은 0 score 로 간주해 upload skip.
 * 유효 범위 안에 들면 score 를 formula 상한으로 clamp (tampered local state 방어).
 */
const WEEKLY_MAX_FLOORS = 30;
const WEEKLY_MAX_HERO_LEVEL = 500;
const WEEKLY_COMPLETION_BONUS = 2000;
const WEEKLY_TIME_BONUS_CAP = 440;

function maxScoreFor(floors: number, heroLevel: number): number {
  return (
    floors * 100 +
    WEEKLY_COMPLETION_BONUS +
    WEEKLY_TIME_BONUS_CAP +
    heroLevel * heroLevel * 2
  );
}

function sanitizeEntry(
  entry: Omit<WeeklyLeaderboardEntry, "uid">,
): Omit<WeeklyLeaderboardEntry, "uid"> | null {
  const floors = Math.floor(entry.floorsCleared);
  const heroLevel = Math.floor(entry.heroLevel);
  if (!Number.isFinite(floors) || floors < 0 || floors > WEEKLY_MAX_FLOORS) return null;
  if (
    !Number.isFinite(heroLevel) ||
    heroLevel < 1 ||
    heroLevel > WEEKLY_MAX_HERO_LEVEL
  )
    return null;
  if (!Number.isFinite(entry.score) || entry.score < 0) return null;
  if (!Number.isFinite(entry.clearedAt) || entry.clearedAt < 1_704_067_200_000)
    return null;
  const cap = maxScoreFor(floors, heroLevel);
  const score = Math.min(Math.floor(entry.score), cap);
  return {
    ...entry,
    floorsCleared: floors,
    heroLevel,
    score,
  };
}

/**
 * Phase 11c R2 — Firestore read 결과의 runtime type guard. corrupted / 구버전 /
 *   악의적 doc 을 UI 진입 전에 거른다. CLASS_META[classType] 같은 후속 접근 크래시 방지.
 */
function isValidEntry(data: unknown): data is WeeklyLeaderboardEntry {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  // Phase 11c R3 — classType 은 undefined / null / string 모두 허용 (legacy doc
  //   호환). Firestore 는 missing 필드를 undefined 로 반환하므로 == null 로 체크.
  const classTypeOk =
    d.classType == null || typeof d.classType === "string";
  return (
    typeof d.uid === "string" &&
    typeof d.displayName === "string" &&
    typeof d.score === "number" &&
    typeof d.floorsCleared === "number" &&
    typeof d.heroLevel === "number" &&
    typeof d.clearedAt === "number" &&
    classTypeOk
  );
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
  // Phase 14 High #8 — formula 검증은 네트워크 전에. rule rejection 은 billed read
  //   + 혼란스러운 failed UX 를 남기므로 불가능한 score 는 여기서 reject.
  const sanitized = sanitizeEntry(entry);
  if (!sanitized) {
    if (process.env.NODE_ENV !== "production") {
       
      console.warn("[weeklyLeaderboard] entry failed local validation:", entry);
    }
    return "error";
  }
  try {
    const { auth, db } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return "no-auth";
    // Phase 11c R4 보안 — displayName 40자 cap. firestore rule 에서도 검증하지만
    //   client 측에서 먼저 잘라 rule rejection 없이 upload.
    //   Firebase Auth 는 displayName 길이 제한이 없어 악성 profile 가능.
    const safeDisplayName = (sanitized.displayName ?? "익명 영웅").slice(0, 40);
    const safeEntry = { ...sanitized, displayName: safeDisplayName };
    const { doc, setDoc } = await import("firebase/firestore");
    const ref = doc(db, "weekly-leaderboard", weekId, "entries", user.uid);
    await setDoc(ref, { uid: user.uid, ...safeEntry }, { merge: false });
    // Phase 11c R3 — 업로드 성공 시 해당 weekId cache invalidate.
    for (const key of topCache.keys()) {
      if (key.startsWith(`${weekId}:`)) topCache.delete(key);
    }
    myRankCache.delete(weekId);
    return "ok";
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
       
      console.warn("[weeklyLeaderboard] upload failed:", e);
    }
    return "error";
  }
}

/**
 * Phase 11c R3 — 리더보드 read 캐시.
 *   모달을 여닫을 때마다 Firestore 재조회하던 걸 30s TTL 로 묶어 billed reads 절감.
 *   weekId + limit 조합을 키로. 유저가 rank drift 확인을 위해 연속 탭해도 cache hit.
 *   TTL 30s 면 새 업로드 직후 반영에 약간 delay — 허용 범위 (tradeoff).
 */
const CACHE_TTL_MS = 30_000;
const topCache = new Map<
  string,
  { entries: WeeklyLeaderboardEntry[]; fetchedAt: number }
>();
const myRankCache = new Map<
  string,
  { data: { rank: number; entry: WeeklyLeaderboardEntry } | null; fetchedAt: number }
>();

/** Dev / test 환경에서 cache invalidate 가 필요할 때 호출 */
export function clearLeaderboardCache(): void {
  topCache.clear();
  myRankCache.clear();
}

/**
 * 이번 주 상위 N 명 조회. orderBy(score desc), limit.
 * 익명 유저도 read 가능 (Firestore rules read: if true).
 * Phase 11c R3 — 30s TTL cache.
 */
export async function fetchWeeklyTop(
  weekId: string,
  limit = 100,
): Promise<WeeklyLeaderboardEntry[]> {
  if (!isFirebaseConfigured) return [];
  const cacheKey = `${weekId}:${limit}`;
  const cached = topCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.entries;
  }
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
    // Phase 11c R2 — runtime validation 으로 corrupted doc 필터링.
    // Phase 11c R3 — classType undefined (legacy doc) → null 로 정규화.
    const entries = snap.docs
      .map((d) => d.data())
      .filter(isValidEntry)
      .map((e) => ({ ...e, classType: e.classType ?? null }));
    topCache.set(cacheKey, { entries, fetchedAt: Date.now() });
    return entries;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
       
      console.warn("[weeklyLeaderboard] fetchTop failed:", e);
    }
    return [];
  }
}

/**
 * 내 순위 조회 — top 100 밖일 때 사용.
 *
 * Phase 11c R1 — 이전 구현은 전체 entries 를 getDocs 로 읽어 비용 O(N).
 *   지금은 `count()` aggregation 으로 변경: `score > myScore` 인 doc 수만 서버에서
 *   집계해 내려옴 (1 회 billed read, 1000 docs 당 1 회). 수만 ~ 수십만 유저까지
 *   감당 가능. 단, tie-break (동점자) 는 clearedAt 이 빠른 쪽 우선 (Firestore
 *   count 는 compound where 2 개까지 지원하므로 `score == myScore && clearedAt <` 추가).
 */
export async function fetchMyRank(
  weekId: string,
): Promise<{ rank: number; entry: WeeklyLeaderboardEntry } | null> {
  if (!isFirebaseConfigured) return null;
  const cached = myRankCache.get(weekId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const { auth, db } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return null;
    const {
      collection,
      query,
      where,
      doc,
      getDoc,
      getCountFromServer,
    } = await import("firebase/firestore");
    // 내 entry 먼저 확인
    const myDocRef = doc(db, "weekly-leaderboard", weekId, "entries", user.uid);
    const myDoc = await getDoc(myDocRef);
    if (!myDoc.exists()) return null;
    const myData = myDoc.data();
    if (!isValidEntry(myData)) return null;
    // Phase 11c R3 — classType undefined → null 정규화 (legacy doc 호환).
    const myEntry: WeeklyLeaderboardEntry = {
      ...myData,
      classType: myData.classType ?? null,
    };

    // score > myScore 인 doc 수 집계 (count aggregation).
    const col = collection(db, "weekly-leaderboard", weekId, "entries");
    const higherQ = query(col, where("score", ">", myEntry.score));
    const higherSnap = await getCountFromServer(higherQ);
    const higherCount = higherSnap.data().count;

    // 동점 tie-break: 같은 점수 중 clearedAt 이 내 것보다 먼저인 (더 빨리 클리어한) 유저 수.
    const tieQ = query(
      col,
      where("score", "==", myEntry.score),
      where("clearedAt", "<", myEntry.clearedAt),
    );
    const tieSnap = await getCountFromServer(tieQ);
    const tieCount = tieSnap.data().count;

    const rank = higherCount + tieCount + 1;
    const result = { rank, entry: myEntry };
    myRankCache.set(weekId, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
       
      console.warn("[weeklyLeaderboard] fetchMyRank failed:", e);
    }
    // Phase 11c R3 — failed-precondition (composite index 미배포) 시에도 cache 에
    //   null 저장하지 않음 (index 배포 후 즉시 재시도 가능).
    return null;
  }
}

/**
 * 현재 로그인된 유저의 displayName. 없으면 fallback.
 *
 * Phase 13 review #13 — fallback 을 caller 에서 결정 (i18n 된 string 전달).
 *   이전엔 하드코딩 "익명 영웅" 반환해 EN/JA/ZH 유저도 리더보드에 한국어 노출.
 *   legacy 호출자 호환 위해 `anonymousFallback` 미지정 시 "익명 영웅" 유지.
 */
export async function getDisplayName(
  anonymousFallback = "익명 영웅",
): Promise<string> {
  if (!isFirebaseConfigured) return anonymousFallback;
  try {
    const { auth } = await getFirebase();
    return auth.currentUser?.displayName ?? anonymousFallback;
  } catch {
    return anonymousFallback;
  }
}
