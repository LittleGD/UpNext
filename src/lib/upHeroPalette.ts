/**
 * Up Hero — Game Boy 4색 팔레트.
 * UpNext accent (#cdf564) 를 가장 밝은 색으로 포함해 브랜드 일관성 유지.
 */

export const GB = {
  darkest: "#0a1f0a", // 깊은 숲 검은녹 (background)
  dark: "#2c4a2c", // 어두운 sage (secondary bg, borders)
  light: "#87b87a", // 차분한 라임 (text, inactive)
  lightest: "#cdf564", // UpNext accent (highlights, active)
} as const;

/**
 * 몬스터/적/위험 표기용 — 앱 토큰 `--accent-secondary (#FF4632)` 의
 * GB 4색 톤 대응 (붉은 오렌지). 게임 세계 안에선 이 값을, 앱 토큰 직접 참조가
 * 필요한 BossBanner 는 `var(--accent-secondary)` 로 통일.
 */
export const GB_ENEMY = "#e88b7a";

/** 경고 (중간 HP) — 앱 토큰 없음, GB 톤 */
export const GB_WARN = "#e8d88b";

/** 레전드 금색 — `--rarity-legend (#CDF564)` 의 GB 톤 대응 */
export const GB_LEGEND = "#e8b887";

/** 유니크 골드 */
export const GB_UNIQUE = "#cdb887";

/** 레어 시안 — `--rarity-rare (#9BF0E1)` 의 GB 톤 대응 */
export const GB_RARE = "#a5c8db";

/** 드롭 등급별 글로우 색 (RarityTexture 와 호환) */
export const GB_RARITY_GLOW: Record<string, string> = {
  normal: GB.light,
  rare: "#87b8cd", // 푸르스름한 라임
  unique: "#cdb887", // 골드
  legend: "#e8b887", // 붉은 골드
};

/** Tailwind className helper — GB 톤 스타일 합성 */
export const gbClass = {
  bg: "bg-[#0a1f0a]",
  bgAlt: "bg-[#2c4a2c]",
  text: "text-[#87b87a]",
  textHi: "text-[#cdf564]",
  textDim: "text-[#4a7a4a]",
  border: "border-[#2c4a2c]",
  borderHi: "border-[#87b87a]",
};

/**
 * 강한 ease-out — CSS 기본 easing 은 너무 약함.
 * Emil Kowalski의 디자인 엔지니어링 권장 커브.
 * UI 진입/탭 등 "리스폰시브" 해야할 때 사용.
 */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** 양방향 모션 (drawer, accordion) */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
/** iOS-like drawer curve */
export const EASE_DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";
