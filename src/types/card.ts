// === 카드 등급 (Rarity) ===
// 카드의 희귀도를 나타냄. 게임에서 흔히 쓰는 티어 시스템
export type Rarity = "normal" | "rare" | "unique" | "legend";

// === 챌린지 카테고리 ===
// 각 챌린지가 어떤 영역에 속하는지 분류
export type Category =
  | "fitness"      // 운동/걷기
  | "nutrition"    // 식단/영양
  | "mindfulness"  // 명상/마음챙김
  | "learning"     // 학습/독서
  | "social"       // 소통/관계
  | "productivity" // 생산성/정리
  | "wellness";    // 건강/휴식

// === 인증 방식 ===
// 챌린지 완료를 어떻게 확인하는지
export type VerifyType = "self" | "count";

// === 챌린지 카드 ===
// 앱의 핵심 단위 - 하나의 챌린지를 나타내는 카드
export interface ChallengeCard {
  id: string;              // 고유 ID (예: "fitness-001")
  title: string;           // 카드 이름 (예: "1000보 걷기")
  description: string;     // 챌린지 설명
  category: Category;      // 어떤 카테고리인지
  rarity: Rarity;          // 등급
  icon: string;            // pixelarticons 아이콘 이름 (예: "Human")
  titleEn?: string;        // English title
  descriptionEn?: string;  // English description
  titleJa?: string;        // Japanese title
  descriptionJa?: string;  // Japanese description
  titleZh?: string;        // Chinese title
  descriptionZh?: string;  // Chinese description
  verifyType: VerifyType;  // 인증 방식
  target?: number;         // count 타입일 때 목표 수치
  hardcoreTarget?: number; // 초갓생모드에서의 상향된 목표
  unlockCondition?: {      // 이 카드를 해금하는 조건
    category: Category;    // 해당 카테고리에서
    completions: number;   // N번 완료하면 해금
  };
}
