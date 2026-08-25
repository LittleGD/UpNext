import type { Category } from "./card";

// === 불꽃 리텐션 (iOS Retention.swift 1:1 포팅) ===
// 와이어 포맷 주의: 아래 필드명은 iOS Firestore.Encoder 출력과 바이트 단위로
// 동일해야 한다 (users/{uid}.retention). 같은 계정의 스트릭이 iOS 빌드 17과
// 웹/안드로이드 간 일관되려면 필드명, 옵셔널 생략 규칙을 바꾸면 안 된다.
// Swift 는 nil 옵셔널을 인코딩에서 생략하므로, 웹에서는 Firestore 쓰기 전에
// stripUndefined (src/lib/retention.ts) 로 undefined 키를 제거해야 한다.
// (Firestore JS SDK 는 undefined 값에서 throw)

// === 주간 리포트 요약 ===
// 월요일 시작 한 주의 회고 스냅샷. weekStart 가 고유 id 역할.
export interface WeeklyReportSummary {
  weekStart: string;           // "2026-05-04" (월요일)
  weekEnd: string;             // "2026-05-10" (일요일)
  generatedAt: number;         // 생성 시각 Unix ms
  checkInCount: number;        // 해당 주 체크인 일수 (중복 제거)
  completedCardCount: number;  // 해당 주 완료 카드 수
  topCategory?: Category;      // 가장 많이 완료한 카테고리 (없으면 필드 생략)
  highlightCardTitle?: string; // 인상적인 카드 제목 스냅샷 (한국어 원제, iOS 와 동일)
  photoLogCount: number;       // 해당 주 챌린지 사진 로그 수
  usedSaver: boolean;          // 해당 주에 방패(세이버) 사용 여부
}

// === 리텐션 상태 ===
// 라이트 스트릭(불꽃): 체크인 기반의 가벼운 연속 기록.
// progress.currentStreak(완료 기반)와 별개 축.
export interface RetentionState {
  currentLightStreak: number;   // 현재 불꽃 연속일수
  bestLightStreak: number;      // 최고 불꽃 기록
  lastCheckInDate?: string;     // 마지막 체크인 날짜 "YYYY-MM-DD" (없으면 필드 생략)
  streakSavers: number;         // 남은 방패 수 (월 2개 리필)
  saverRefreshMonth: string;    // 마지막 방패 리필 월 "YYYY-MM"
  checkInDates: string[];       // 체크인 날짜 목록 (최대 420, 초과 시 오래된 것부터 제거)
  usedSaverDates: string[];     // 방패로 메운 날짜 목록
  weeklyReports: WeeklyReportSummary[]; // 주간 리포트 (최신주 먼저, 최대 12)
}

// === 체크인 결과 ===
export interface CheckInResult {
  state: RetentionState; // 체크인 반영 후 상태 (입력은 불변)
  changed: boolean;      // 같은 날 재체크인이면 false (no-op)
  usedSaver: boolean;    // 이번 체크인에서 방패를 소비했는지
}
