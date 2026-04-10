import type { ChallengeCard, Rarity } from "./card";

// === 미니게임 phase ===
// 런 전체의 큰 상태 머신
export type MinigamePhase =
  | "idle"           // 홈 화면 (티켓 수, 시작 버튼)
  | "categoryFlash"  // 라운드 시작 시 카테고리 힌트 2.5초
  | "peek"           // Round 1만: 모든 카드 공개 1.5초
  | "playing"        // 플립 가능 (+ zoomedTileIdx로 재탭 확대)
  | "roundResult"    // 라운드 종료 전환 화면
  | "rewardDraft"    // 3개 보상 중 1개 선택
  | "runResult"      // 매치된 카드 풀에서 1~2장 선택
  | "runComplete";   // 최종 요약

// === 타일 종류 ===
export type MinigameTileKind = "challenge" | "skill" | "curse";

// === 스킬/저주/보상 효과 ID ===
export type SkillEffectId = "chancesPlus2" | "peek2" | "mulligan" | "compass";
export type CurseEffectId = "loseChanceAndStripBuff";
export type RewardEffectId =
  | "steelNerves"
  | "luckyCharm"
  | "scoutsEye"
  | "rareSurge"
  | "duplicateStash"
  | "warded"
  | "compass"
  | "dualEcho"
  | "skillAmp"
  | "doubleLoot";

// === 보드 타일 ===
// 그리드에 배치되는 카드 하나 = 정상 챌린지 카드, 스킬 카드, 저주 카드 셋 중 하나
export interface MinigameTile {
  tileId: string;                 // 고유 ID (uuid-like)
  pairKey: string;                // 같은 값을 공유하는 2장이 페어 — challenge면 card.id, skill/curse면 effectId
  kind: MinigameTileKind;
  isFaceUp: boolean;
  isMatched: boolean;
  card?: ChallengeCard;           // kind=challenge일 때만
  skillId?: SkillEffectId;        // kind=skill일 때만
  curseId?: CurseEffectId;        // kind=curse일 때만
}

// === 보상 정의 ===
// tier는 메인 앱의 rarity 시스템을 재사용한다.
// 기존 매핑: common→rare / uncommon→unique / rare→legend (normal은 사용 안 함)
export type RewardTier = Extract<Rarity, "rare" | "unique" | "legend">;

export interface RewardDefinition {
  id: RewardEffectId;
  tier: RewardTier;
  nameKey: string;                // i18n key
  descKey: string;
  scope: "round" | "run";         // 라운드 한정 vs 런 전체 지속
}

// === 활성 버프 ===
// 유저가 보상을 픽하면 activeBuffs에 쌓이고, 라운드/런 스코프에 맞게 소비됨
export interface ActiveBuff {
  effectId: RewardEffectId;
  appliesInRound: 1 | 2 | 3 | "all";  // "all" = run 스코프
  consumed: boolean;
}

// === 라운드 설정 ===
export interface RoundConfig {
  rows: number;
  cols: number;
  normalPairs: number;
  skillPairs: number;
  cursePairs: number;
  chances: number;
  openingPeek: boolean;            // Round 1만 true — 모든 카드 일괄 공개
}

export const ROUND_CONFIGS: Record<1 | 2 | 3, RoundConfig> = {
  1: { rows: 4, cols: 4, normalPairs: 7, skillPairs: 1, cursePairs: 0, chances: 4, openingPeek: true },
  2: { rows: 4, cols: 5, normalPairs: 8, skillPairs: 1, cursePairs: 1, chances: 4, openingPeek: false },
  3: { rows: 6, cols: 4, normalPairs: 9, skillPairs: 2, cursePairs: 1, chances: 4, openingPeek: false },
};

// === 타이밍 상수 ===
export const CATEGORY_FLASH_MS = 2500;    // 라운드 시작 카테고리 힌트 노출
export const ROUND1_PEEK_MS = 1500;        // Round 1 모든 카드 공개
export const ECHO_GHOST_MS = 700;          // 실패 카드 잔상
export const ECHO_GHOST_MS_DUAL = 1500;    // Dual Echo 보상 적용 시
export const MISMATCH_REVEAL_MS = 800;     // 불일치 시 카드 공개 유지 시간
export const PEEK2_MS = 2000;              // peek2 스킬 공개 시간
export const COMPASS_HINT_MS = 2500;       // compass 스킬 인접 공개 시간
export const SCOUTS_EYE_MS = 2000;         // Scout's Eye 보상 공개 시간

// === 런 스탯 ===
export interface MinigameRunStats {
  totalMatches: number;
  skillMatches: number;
  curseMatches: number;
}

// 카테고리 아이콘은 src/components/icons/index.ts의 CATEGORY_ICONS 재사용
