import type { ChallengeCard, Category } from "./card";

// === 언어 ===
export type Language = "ko" | "en" | "ja" | "zh";

// === 게임 모드 ===
// 하루에 선택하는 카드 수가 달라짐
export type GameMode = "normal" | "godlife" | "ultra";
// normal: 1장 | godlife(갓생): 2장 | ultra(초갓생): 3장

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
}

// === 하루 기록 ===
// 과거 데이터를 저장하는 단위
export interface DayRecord {
  date: string;
  selectedCardIds: string[];    // 선택했던 카드 ID들
  completedCardIds: string[];   // 완료한 카드 ID들
  wasFullClear: boolean;        // 선택한 카드를 모두 완료했는지
  mode: GameMode;               // 그날의 모드
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
  pendingPacks: number;            // 미개봉 카드팩 수
  cardCompletions: Record<string, number>; // 카드별 완수 횟수
  equippedTitleId: string | null;          // 장착된 칭호 ID
  seenTitleIds: string[];                  // 확인한 칭호 ID 목록 (new 뱃지용)
  pendingMode?: GameMode | null;           // 다음 날 적용될 모드 (설정 변경 시)
  language: Language;                        // 언어 설정
  soundEnabled: boolean;                     // 사운드 on/off
}

// === XP 보상 (등급별) ===
export const XP_PER_RARITY: Record<string, number> = {
  normal: 10,
  rare: 25,
  unique: 50,
  legend: 100,
};

// === 일일 풀클리어 보너스 XP ===
export const FULL_CLEAR_BONUS_XP = 20;

// === 레벨업에 필요한 XP ===
// Level 1→2: 60, 2→3: 80, 3→4: 100, ...
export function xpToNextLevel(level: number): number {
  return 40 + level * 20;
}

// === 특정 레벨까지 필요한 총 누적 XP ===
export function totalXPForLevel(level: number): number {
  // sum of xpToNextLevel(l) for l=1..level = level*(50 + 10*level)
  return level * (50 + 10 * level);
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
export function getXPProgress(totalXP: number, level: number): { current: number; needed: number } {
  const xpAtCurrentLevel = totalXPForLevel(level);
  const needed = xpToNextLevel(level);
  const current = totalXP - xpAtCurrentLevel;
  return { current, needed };
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

// === 레거시 호환 ===
export function daysToNextLevel(level: number): number {
  return Math.min(level, 7);
}

// === 모드별 선택 카드 수 ===
export const MODE_CARD_COUNT: Record<GameMode, number> = {
  normal: 1,
  godlife: 2,
  ultra: 3,
};

// === 드로우 카드 수 ===
export const DRAW_COUNT = 6;
