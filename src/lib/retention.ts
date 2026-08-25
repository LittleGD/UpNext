import type { Category } from "@/types/card";
import type { UserProgress } from "@/types/game";
import type { RetentionState, WeeklyReportSummary, CheckInResult } from "@/types/retention";
import { ALL_CARDS } from "@/data/cards";

/**
 * 불꽃 리텐션 엔진: iOS Retention.swift(RetentionEngine)의 1:1 포팅.
 *
 * 순수 함수만 있다. 스토어/Firestore 의존 금지, 입력 상태는 절대 변형하지 않고
 * 새 객체를 반환한다 (Swift 의 값 타입 semantics 를 그대로 재현).
 *
 * 날짜 연산은 전부 "YYYY-MM-DD" 문자열 + Date.UTC 기반이라 DST/타임존 변화에
 * 안전하다 (UTC 에는 DST 가 없어 하루가 항상 86,400,000ms).
 */

// === 상수 (iOS RetentionEngine 과 동일) ===
export const MAX_MONTHLY_SAVERS = 2;    // 방패 월 리필 개수
export const MAX_STORED_CHECK_INS = 420; // checkInDates 저장 상한 (약 60주)
export const MAX_WEEKLY_REPORTS = 12;   // 주간 리포트 저장 상한
export const RETENTION_MILESTONES = [7, 30, 100] as const; // 불꽃 마일스톤

// 관용 디코드용 카테고리 화이트리스트 (Category 유니온과 동일 순서)
const VALID_CATEGORIES: Category[] = [
  "fitness",
  "nutrition",
  "mindfulness",
  "learning",
  "social",
  "productivity",
  "wellness",
  "trending",
];

// ============================================================
// 데이 경계
// ============================================================

/**
 * 오늘 날짜를 "2026-04-01" 형식으로 반환.
 * 하루 기준: 새벽 1시 ~ 다음날 00:59 (절대시간 1시간 감산 후 로컬 날짜).
 *
 * getTodayString() (src/store/useGameStore.ts 상단)과 동일 로직의 중복 구현.
 * 이 파일은 순수 lib 이라 zustand 스토어 모듈 그래프를 끌고 오지 않기 위해
 * 의도적으로 복제했다. 한쪽을 바꾸면 반드시 다른 쪽도 같이 바꿀 것
 * (sync.ts hydrateDaily 의 인라인 폴백 포함 3곳).
 * (iOS 대응: AppClock.productDayString — addingTimeInterval(-3600) 과 동일하게
 *  절대시간 감산을 쓴다. 벽시계 감산(setHours)은 DST 전환 1시간 창에서 iOS 와
 *  날짜가 하루 어긋날 수 있어 금지.)
 */
export function retentionTodayString(): string {
  const d = new Date(Date.now() - 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================================================
// 날짜 헬퍼 (Date.UTC 기반, DST-안전)
// ============================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// "YYYY-MM-DD" 를 UTC 자정 ms 로 파싱. 형식 불일치나 존재하지 않는 날짜
// ("2026-02-30" 등, Date.UTC 는 조용히 3월로 넘겨버림)는 라운드트립 검증으로
// 거부해 null 반환 (iOS DateFormatter 의 nil 과 동일).
function parseDayUTC(day: string): number | null {
  const m = DAY_RE.exec(day);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return t;
}

function formatDayUTC(ms: number): string {
  const dt = new Date(ms);
  return `${String(dt.getUTCFullYear()).padStart(4, "0")}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** day 에 value 일을 더한 날짜. 파싱 실패 시 null (iOS addDays 와 동일). */
export function addDays(day: string, value: number): string | null {
  const t = parseDayUTC(day);
  if (t === null) return null;
  return formatDayUTC(t + value * MS_PER_DAY);
}

/** from 부터 to 까지의 일수 차이 (to - from). 파싱 실패 시 null. */
export function dayGap(from: string, to: string): number | null {
  const a = parseDayUTC(from);
  const b = parseDayUTC(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

/** "YYYY-MM-DD" 의 월 키 "YYYY-MM" (iOS monthKey 와 동일: prefix 7자). */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/**
 * day 가 속한 주의 시작(월요일) 날짜.
 * iOS 는 Calendar(firstWeekday=2)의 yearForWeekOfYear 를 쓰지만 결과는 동일:
 * 해당 날짜를 포함하는 주의 월요일. 파싱 실패 시 입력을 그대로 반환
 * (iOS weekId(for:) 폴백과 동일).
 */
export function weekStartOf(day: string): string {
  const t = parseDayUTC(day);
  if (t === null) return day;
  const dow = new Date(t).getUTCDay(); // 0=일요일
  const offset = (dow + 6) % 7;        // 월요일까지 뒤로 갈 일수
  return formatDayUTC(t - offset * MS_PER_DAY);
}

// 폐구간 [start, end] 포함 여부. "YYYY-MM-DD" 는 사전순 = 시간순이라 문자열 비교로 충분.
function isDayInRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

function appendUnique(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr : [...arr, value];
}

// ============================================================
// 상태 생성 / 관용 디코드
// ============================================================

/** 초기 리텐션 상태 (iOS RetentionState.fresh 와 동일). */
export function freshRetentionState(today: string = retentionTodayString()): RetentionState {
  return {
    currentLightStreak: 0,
    bestLightStreak: 0,
    streakSavers: MAX_MONTHLY_SAVERS,
    saverRefreshMonth: monthKey(today),
    checkInDates: [],
    usedSaverDates: [],
    weeklyReports: [],
  };
}

// 관용 디코드 프리미티브: 타입 불일치는 throw 대신 undefined (iOS 의 try? 대응)
function asInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) ? v : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// iOS [String].decode 와 동일: 원소 하나라도 문자열이 아니면 배열 전체 실패
function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.every((x): x is string => typeof x === "string") ? [...v] : undefined;
}

function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (VALID_CATEGORIES as string[]).includes(v);
}

// WeeklyReportSummary 1개 디코드. iOS 의 synthesized Codable 과 동일하게
// 필수 필드 누락/타입 불일치는 실패(undefined). 옵셔널 필드는 null/부재 허용.
function decodeWeeklyReport(v: unknown): WeeklyReportSummary | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const r = v as Record<string, unknown>;
  const weekStart = asString(r.weekStart);
  const weekEnd = asString(r.weekEnd);
  const generatedAt = asInt(r.generatedAt);
  const checkInCount = asInt(r.checkInCount);
  const completedCardCount = asInt(r.completedCardCount);
  const photoLogCount = asInt(r.photoLogCount);
  const usedSaver = typeof r.usedSaver === "boolean" ? r.usedSaver : undefined;
  if (
    weekStart === undefined || weekEnd === undefined || generatedAt === undefined ||
    checkInCount === undefined || completedCardCount === undefined ||
    photoLogCount === undefined || usedSaver === undefined
  ) {
    return undefined;
  }
  // 옵셔널: 값이 있는데 유효하지 않으면 원소 전체 실패 (iOS decodeIfPresent throw 대응)
  let topCategory: Category | undefined;
  if (r.topCategory !== undefined && r.topCategory !== null) {
    if (!isCategory(r.topCategory)) return undefined;
    topCategory = r.topCategory;
  }
  let highlightCardTitle: string | undefined;
  if (r.highlightCardTitle !== undefined && r.highlightCardTitle !== null) {
    if (typeof r.highlightCardTitle !== "string") return undefined;
    highlightCardTitle = r.highlightCardTitle;
  }
  const report: WeeklyReportSummary = {
    weekStart,
    weekEnd,
    generatedAt,
    checkInCount,
    completedCardCount,
    photoLogCount,
    usedSaver,
  };
  if (topCategory !== undefined) report.topCategory = topCategory;
  if (highlightCardTitle !== undefined) report.highlightCardTitle = highlightCardTitle;
  return report;
}

// iOS [WeeklyReportSummary].decode 와 동일: 원소 하나라도 깨지면 배열 전체 기본값
function decodeWeeklyReports(v: unknown): WeeklyReportSummary[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: WeeklyReportSummary[] = [];
  for (const item of v) {
    const report = decodeWeeklyReport(item);
    if (report === undefined) return undefined;
    out.push(report);
  }
  return out;
}

/**
 * 클라우드/로컬 스냅샷을 관용적으로 디코드.
 * iOS RetentionState.init(from:) 의 per-field try? 디코드와 동일:
 * 필드 하나가 깨져도 나머지는 살리고, 깨진 필드만 기본값으로 채운다.
 * (retention 손상이 앱 전체를 막지 않게 하는 방어선)
 */
export function normalizeRetentionState(
  raw: unknown,
  today: string = retentionTodayString()
): RetentionState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return freshRetentionState(today);
  }
  const r = raw as Record<string, unknown>;
  const state: RetentionState = {
    currentLightStreak: asInt(r.currentLightStreak) ?? 0,
    bestLightStreak: asInt(r.bestLightStreak) ?? 0,
    streakSavers: asInt(r.streakSavers) ?? MAX_MONTHLY_SAVERS,
    saverRefreshMonth: asString(r.saverRefreshMonth) ?? monthKey(today),
    checkInDates: asStringArray(r.checkInDates) ?? [],
    usedSaverDates: asStringArray(r.usedSaverDates) ?? [],
    weeklyReports: decodeWeeklyReports(r.weeklyReports) ?? [],
  };
  const lastCheckInDate = asString(r.lastCheckInDate);
  if (lastCheckInDate !== undefined) state.lastCheckInDate = lastCheckInDate;
  return state;
}

// ============================================================
// 체크인
// ============================================================

/**
 * 오늘 체크인 (iOS RetentionEngine.checkIn 과 동일).
 *  - 같은 날 재체크인: no-op (changed=false)
 *  - gap 1 (연속): 스트릭 +1
 *  - gap 2 + 방패 보유: 방패 1개 소비로 빠진 하루를 메우고 스트릭 +1
 *  - 그 외 (장기 공백, 시계 역행 등): 스트릭 1로 리셋
 * 월이 바뀌었으면 방패를 먼저 리필한 뒤 판정한다 (월경계에서 소비 가능).
 */
export function retentionCheckIn(
  input: RetentionState,
  today: string = retentionTodayString()
): CheckInResult {
  const refreshed = refreshMonthlySavers(input, today);
  if (refreshed.lastCheckInDate === today) {
    return { state: refreshed, changed: false, usedSaver: false };
  }

  const state: RetentionState = { ...refreshed };
  let usedSaver = false;
  const last = state.lastCheckInDate;
  const gap = last !== undefined ? dayGap(last, today) : null;
  const missed = last !== undefined ? addDays(last, 1) : null;

  if (last === undefined || gap === null) {
    state.currentLightStreak = 1;
  } else if (gap === 1) {
    state.currentLightStreak += 1;
  } else if (gap === 2 && state.streakSavers > 0 && missed !== null) {
    state.streakSavers -= 1;
    state.usedSaverDates = appendUnique(state.usedSaverDates, missed);
    state.currentLightStreak += 1;
    usedSaver = true;
  } else {
    state.currentLightStreak = 1;
  }

  state.bestLightStreak = Math.max(state.bestLightStreak, state.currentLightStreak);
  state.lastCheckInDate = today;
  state.checkInDates = appendUnique(state.checkInDates, today);
  if (state.checkInDates.length > MAX_STORED_CHECK_INS) {
    // 오래된 것부터 잘라 최근 420개만 유지 (iOS suffix 와 동일)
    state.checkInDates = state.checkInDates.slice(-MAX_STORED_CHECK_INS);
  }
  return { state, changed: true, usedSaver };
}

/** 월이 바뀌었으면 방패를 월 상한(2개)으로 리필 (iOS refreshMonthlySavers 와 동일). */
export function refreshMonthlySavers(input: RetentionState, today: string): RetentionState {
  const month = monthKey(today);
  if (input.saverRefreshMonth === month) return input;
  return { ...input, streakSavers: MAX_MONTHLY_SAVERS, saverRefreshMonth: month };
}

// ============================================================
// 주간 리포트
// ============================================================

/**
 * 직전 주들의 리포트를 생성/백필 (iOS generatePreviousWeekReport 와 동일).
 * 결주 후 복귀(2주+ 결주) 시 자리비운 모든 주의 회고를 한 번에 만든다.
 *
 * 범위: 오늘이 속한 주의 직전 MAX_WEEKLY_REPORTS 주까지 검사. 이미 존재하는
 * 주는 skip. 활동(완료/체크인/챌린지 사진 로그)이 0인 주도 skip: "사용 0일"
 * 리포트는 사용자에게 의미 없고 모달만 늘린다.
 *
 * @param photoLogDates 챌린지 사진 로그의 날짜("YYYY-MM-DD") 배열.
 *   스토어 의존 금지 원칙에 따라 호출자가 kind 필터링까지 마친 날짜만 주입한다
 *   (iOS 는 PhotoMeta.kind == .challengeLog 필터를 엔진 안에서 수행).
 */
export function generatePreviousWeekReport(
  input: RetentionState,
  progress: UserProgress,
  photoLogDates: string[],
  today: string = retentionTodayString()
): RetentionState {
  if (parseDayUTC(today) === null) return input;
  const thisWeekStart = weekStartOf(today);
  const existingWeeks = new Set(input.weeklyReports.map((r) => r.weekStart));
  const newReports: WeeklyReportSummary[] = [];

  for (let offset = 1; offset <= MAX_WEEKLY_REPORTS; offset++) {
    const weekStart = addDays(thisWeekStart, -7 * offset);
    if (weekStart === null) continue;
    if (existingWeeks.has(weekStart)) continue;
    const weekEnd = addDays(weekStart, 6);
    if (weekEnd === null) continue;
    const inRange = (day: string) => isDayInRange(day, weekStart, weekEnd);
    const hasActivity =
      progress.completionHistory.some((record) => inRange(record.date)) ||
      input.checkInDates.some(inRange) ||
      photoLogDates.some(inRange);
    if (!hasActivity) continue;
    newReports.push(buildReport(weekStart, weekEnd, progress, input, photoLogDates));
  }

  if (newReports.length === 0) return input;
  // 최신주가 앞에 오도록 정렬 + MAX_WEEKLY_REPORTS cap
  const merged = [...newReports, ...input.weeklyReports].sort((a, b) =>
    a.weekStart > b.weekStart ? -1 : a.weekStart < b.weekStart ? 1 : 0
  );
  return { ...input, weeklyReports: merged.slice(0, MAX_WEEKLY_REPORTS) };
}

// 카드 id -> 카드 lookup (lazy init, src/i18n/index.ts getCardMap 과 같은 패턴)
let _cardById: Map<string, (typeof ALL_CARDS)[number]> | null = null;
function getCardById() {
  if (!_cardById) {
    _cardById = new Map(ALL_CARDS.map((c) => [c.id, c]));
  }
  return _cardById;
}

/**
 * 한 주의 리포트 스냅샷 생성 (iOS buildReport 와 동일).
 *  - topCategory: 완료 수 desc, 동수면 category id asc 타이브레이크
 *  - highlightCardTitle: completedCardIds 역순으로 첫 해석 가능한 카드의
 *    한국어 원제(card.title). cardTitle(card, lang) 을 쓰지 않는 이유:
 *    iOS 도 card.title 스냅샷이라, 생성 시점 언어에 따라 클라우드 문서가
 *    달라지면 크로스 플랫폼 일관성이 깨진다. 표시 시점 번역은 UI 몫.
 */
export function buildReport(
  weekStart: string,
  weekEnd: string,
  progress: UserProgress,
  retention: RetentionState,
  photoLogDates: string[]
): WeeklyReportSummary {
  const inRange = (day: string) => isDayInRange(day, weekStart, weekEnd);
  const records = progress.completionHistory.filter((r) => inRange(r.date));
  const checkIns = retention.checkInDates.filter(inRange);
  const photoLogs = photoLogDates.filter(inRange);
  const saverUsed = retention.usedSaverDates.some(inRange);

  const cardById = getCardById();
  const categoryCounts = new Map<Category, number>();
  for (const record of records) {
    for (const id of record.completedCardIds) {
      const card = cardById.get(id);
      if (card) {
        categoryCounts.set(card.category, (categoryCounts.get(card.category) ?? 0) + 1);
      }
    }
  }
  const topCategory = [...categoryCounts.entries()].sort((a, b) => {
    if (a[1] === b[1]) return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    return b[1] - a[1];
  })[0]?.[0];

  let highlightCardTitle: string | undefined;
  const completedIds = records.flatMap((r) => r.completedCardIds);
  for (let i = completedIds.length - 1; i >= 0; i--) {
    const card = cardById.get(completedIds[i]);
    if (card) {
      highlightCardTitle = card.title;
      break;
    }
  }

  const report: WeeklyReportSummary = {
    weekStart,
    weekEnd,
    generatedAt: Date.now(),
    checkInCount: new Set(checkIns).size,
    completedCardCount: records.reduce((sum, r) => sum + r.completedCardIds.length, 0),
    photoLogCount: photoLogs.length,
    usedSaver: saverUsed,
  };
  if (topCategory !== undefined) report.topCategory = topCategory;
  if (highlightCardTitle !== undefined) report.highlightCardTitle = highlightCardTitle;
  return report;
}

// ============================================================
// Firestore 직렬화 헬퍼
// ============================================================

/**
 * undefined 값을 가진 키를 깊이 제거한 사본을 반환.
 * Firestore JS SDK 는 undefined 값에서 throw 하고, Swift Firestore.Encoder 는
 * nil 옵셔널을 생략한다. 웹에서 retention 을 setDoc/updateDoc 하기 전에
 * 반드시 이 헬퍼를 거쳐 iOS 와 같은 "키 생략" 와이어 포맷을 만든다.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}
