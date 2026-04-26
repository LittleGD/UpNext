import type { ChallengeCard, Category } from "./card";

// === 언어 ===
export type Language = "ko" | "en" | "ja" | "zh";

// === 게임 모드 ===
// 하루에 선택하는 카드 수가 달라짐
export type GameMode = "normal" | "godlife" | "ultra";
// normal: 1장 | godlife(갓생): 2장 | ultra(초갓생): 3장

// === 챌린지 단계 ===
// daily → extra(추가 챌린지) → super(슈퍼 초갓생챌린지)
export type ChallengePhase = "daily" | "extra" | "super";

// 단계별 선택 카드 수 — 정확한 장수로 고정 (extra: 2장, super: 3장)
export const PHASE_MIN_CARDS: Record<ChallengePhase, number> = {
  daily: 0,
  extra: 2,
  super: 3,
};

// 단계별 최대 선택 카드 수 — min과 동일하게 고정
export const PHASE_MAX_CARDS: Record<ChallengePhase, number> = {
  daily: 0,
  extra: 2,
  super: 3,
};

// === 오늘의 상태 ===
// 하루 단위로 관리되는 게임 진행 상태
export interface DailyState {
  date: string;                    // 오늘 날짜 "2026-04-01"
  drawnCards: ChallengeCard[];     // 드로우된 6장
  selectedCards: ChallengeCard[];  // 유저가 고른 카드들
  completedIds: string[];          // 완료한 카드 ID 목록
  isDrawComplete: boolean;         // 오늘 드로우 했는지
  isSelectionComplete: boolean;    // 카드 선택 완료했는지
  rerollUsed: boolean;             // 오늘 리롤 사용했는지

  // === 추가 챌린지 시스템 ===
  challengePhase: ChallengePhase;  // 현재 진행 단계

  // Extra 챌린지 (2장+)
  extraDrawnCards: ChallengeCard[];
  extraSelectedCards: ChallengeCard[];
  extraCompletedIds: string[];
  extraDrawComplete: boolean;
  extraSelectionComplete: boolean;

  // Super 초갓생챌린지 (4장)
  superDrawnCards: ChallengeCard[];
  superSelectedCards: ChallengeCard[];
  superCompletedIds: string[];
  superDrawComplete: boolean;
  superSelectionComplete: boolean;

  // === 실패 패널티 ===
  hasPenalty: boolean;              // 어제 실패로 패널티 적용 여부
  penaltyCardId: string | null;    // 자동 선택된 잠긴 카드 ID

  // === 알림 ===
  extraNudgeScheduled: boolean;    // 추가 챌린지 넛지 알림 예약 여부 (하루 1회)
}

// === 하루 기록 ===
// 과거 데이터를 저장하는 단위
export interface DayRecord {
  date: string;
  selectedCardIds: string[];    // 선택했던 카드 ID들
  completedCardIds: string[];   // 완료한 카드 ID들
  wasFullClear: boolean;        // 선택한 카드를 모두 완료했는지
  mode: GameMode;               // 그날의 모드
  extraCompleted?: boolean;     // 추가 챌린지 완료 여부
  superCompleted?: boolean;     // 슈퍼 챌린지 완료 여부
  wasFailed?: boolean;          // 챌린지 실패 여부
}

// === 유저 진행도 ===
// 전체 게임 진행 상태
export interface UserProgress {
  currentStreak: number;           // 현재 연속일수
  longestStreak: number;           // 최장 연속일수
  totalDaysCompleted: number;      // 총 완료한 날 수
  unlockedCardIds: string[];       // 해금된 카드 ID 목록
  completionHistory: DayRecord[];  // 과거 기록들
  categoryCompletions: Record<Category, number>; // 카테고리별 완료 횟수
  mode: GameMode;                  // 현재 모드
  level: number;                   // 현재 레벨
  xp: number;                      // 현재 경험치 (레거시, 카드 XP용)
  daysTowardNextLevel: number;     // 다음 레벨까지 완료한 일수
  pendingPacks: number;            // 미개봉 카드팩 수 (레벨업 시 3장)
  pendingBonusCards: number;       // 추가/슈퍼 풀클리어로 적립된 랜덤 카드 1장 큐
  cardCompletions: Record<string, number>; // 카드별 완수 횟수
  extraChallengesCompleted: number;          // 추가 챌린지 완료 횟수
  superChallengesCompleted: number;          // 슈퍼 챌린지 완료 횟수
  equippedTitleId: string | null;          // 장착된 칭호 ID
  seenTitleIds: string[];                  // 확인한 칭호 ID 목록 (new 뱃지용)
  pendingMode?: GameMode | null;           // 다음 날 적용될 모드 (설정 변경 시)
  hasPendingPenalty: boolean;                // 다음 날 패널티 예약 (전날 실패 시)
  language: Language;                        // 언어 설정
  soundEnabled: boolean;                     // 사운드 on/off
  hapticEnabled: boolean;                    // 햅틱(진동) on/off
  notificationsEnabled: boolean;             // 알림 on/off
  notificationTime: string;                  // 알림 시간 "HH:MM"

  // === 미니게임 ===
  tickets: number;                           // 카드매치 티켓 (0~10, 상한 10)
  minigameRunsPlayed: number;                // 누적 런 수
  minigameBestMatches: number;               // 단일 런 최대 매치 수
  // Phase 12a — 카드매치 티켓 상점 구매 하루 cap. date 가 오늘이 아니면 reset.
  cardmatchShopDaily?: { date: string; bought: number };

  // === 패치 노트 ===
  lastSeenPatchVersion?: string;             // 마지막으로 확인한 패치 버전 (모달 중복 노출 방지)

  // === 컬렉션 완료 ===
  // 처음으로 모든 카드를 모은 시점 (ISO 날짜).
  //  - 첫 회 도달 시: 축하 모달 + 칭호 부여 + 1회성 큰 보너스
  //  - 이후 카드 업데이트로 신규 카드가 풀린 뒤 다시 모두 모으면 재설정 안 함
  //    (이 필드는 "최초 달성 기록"으로 영구 보존, 보상은 매번 환산)
  collectionCompletedAt?: string | null;
}

// === 미니게임 티켓 상한 ===
export const MINIGAME_TICKET_CAP = 10;

// Phase 12a — 카드매치 티켓 상점 하루 구매 cap. 탐험권 cap(4) 과 별도.
export const DAILY_CARDMATCH_TICKET_CAP = 2;

// === XP 보상 (등급별) ===
// 카드에 명시된 XP — 모든 지급이 이 값 그대로 (배율/풀클리어 보너스 없음)
export const XP_PER_RARITY: Record<string, number> = {
  normal: 10,
  rare: 25,
  unique: 50,
  legend: 100,
};

// === 특정 레벨까지 필요한 총 누적 XP ===
export function totalXPForLevel(level: number): number {
  return level * (80 + 20 * level);
}

// === 레벨업에 필요한 XP (totalXPForLevel 기준 파생) ===
// Level 0→1: 100, 1→2: 140, 2→3: 180, 3→4: 220, 4→5: 260, ...
export function xpToNextLevel(level: number): number {
  return totalXPForLevel(level + 1) - totalXPForLevel(level);
}

// === 누적 XP에서 레벨 계산 ===
export function getLevelFromXP(totalXP: number): number {
  let level = 0;
  while (totalXPForLevel(level + 1) <= totalXP) {
    level++;
  }
  return level;
}

// === 현재 레벨에서의 XP 진행도 ===
// 2026.04.18 hotfix — current 를 Math.max(0, …) 로 클램프.
//   배경: XP 커브 변경 (f5c13fa: level*(50+10L) → level*(80+20L)) 후, 구-커브
//   기준 cloud snapshot 이 normalize 없이 복원되면 totalXP < totalXPForLevel(level)
//   이 되어 `current` 가 음수 (-484/340 처럼) UI 노출. 정상 경로에서는
//   normalizeProgressXpLevel 이 이를 해결하지만, 새로운 write path 에서 누락 시
//   유저 눈에 음수가 보이는 것만은 반드시 막는다 (방어선).
export function getXPProgress(totalXP: number, level: number): { current: number; needed: number } {
  const xpAtCurrentLevel = totalXPForLevel(level);
  const needed = xpToNextLevel(level);
  const current = Math.max(0, totalXP - xpAtCurrentLevel);
  return { current, needed };
}

/**
 * 2026.04.18 hotfix — 기존 유저 XP 음수 (-484/340) 버그 수정.
 *
 * 원인: 2026 초 XP 커브 변경 (level*(50+10L) → level*(80+20L)) 으로 Lv.N floor
 *   이 상향됨 (예: Lv.6 660 → 1200). initialize() 는 migration 으로 floor 까지
 *   끌어올리지만, _setFromCloud 는 migration 없이 raw cloud snapshot 을
 *   그대로 덮어써 기존 유저의 Lv 를 유지한 채 xp 가 새-floor 보다 낮게 저장되어
 *   `current = totalXP − floor < 0` 으로 UI 음수 노출.
 *
 * 정책:
 *   1) **Grandfather level** — 유저가 이미 획득한 레벨은 강등하지 않음.
 *      xp < totalXPForLevel(level) 이면 xp 를 floor 까지 끌어올림.
 *   2) **Level 승급** — xp 가 다음 임계치를 넘으면 승급 + pendingPacks 적립.
 *   3) **음수 클램프** — xp < 0 은 0 으로 (과거 버그 흔적 방어).
 *
 * idempotent — 여러 번 호출해도 같은 결과. cloud↔local 왕복에 안전.
 */
export function normalizeProgressXpLevel(progress: UserProgress): {
  progress: UserProgress;
  levelsGained: number;
} {
  let level = Math.max(0, progress.level || 0);
  let xp = Math.max(0, progress.xp || 0);

  // 1) grandfather: 현재 레벨 floor 보다 xp 가 낮으면 floor 로 보정
  const floor = totalXPForLevel(level);
  if (xp < floor) xp = floor;

  // 2) xp 가 다음 임계치 이상이면 level 승급
  const correct = getLevelFromXP(xp);
  let levelsGained = 0;
  if (correct > level) {
    levelsGained = correct - level;
    level = correct;
  }

  if (xp === progress.xp && level === progress.level && levelsGained === 0) {
    return { progress, levelsGained: 0 };
  }
  return {
    progress: {
      ...progress,
      xp,
      level,
      pendingPacks: (progress.pendingPacks || 0) + levelsGained,
    },
    levelsGained,
  };
}

// === 칭호 시스템 ===
const LEVEL_TITLES_KO = ["입문자", "뉴비", "도전자", "실천가", "갓생러", "마스터", "레전드"] as const;
const LEVEL_TITLES_EN = ["Beginner", "Newbie", "Challenger", "Achiever", "Go-getter", "Master", "Legend"] as const;
const LEVEL_TITLES_JA = ["入門者", "ニュービー", "チャレンジャー", "実践者", "努力家", "マスター", "レジェンド"] as const;
const LEVEL_TITLES_ZH = ["入门者", "新手", "挑战者", "实践者", "奋斗者", "大师", "传奇"] as const;

export function getTitleForLevel(level: number, lang: Language = "ko"): string {
  const map: Record<Language, readonly string[]> = { ko: LEVEL_TITLES_KO, en: LEVEL_TITLES_EN, ja: LEVEL_TITLES_JA, zh: LEVEL_TITLES_ZH };
  const titles = map[lang];
  if (level <= 0) return titles[0];
  if (level <= 1) return titles[1];
  if (level <= 3) return titles[2];
  if (level <= 5) return titles[3];
  if (level <= 8) return titles[4];
  if (level <= 12) return titles[5];
  return titles[6];
}

// === 모드별 선택 카드 수 ===
export const MODE_CARD_COUNT: Record<GameMode, number> = {
  normal: 1,
  godlife: 2,
  ultra: 3,
};

// === 드로우 카드 수 ===
export const DRAW_COUNT = 6;
