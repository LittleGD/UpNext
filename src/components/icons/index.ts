// === 카테고리별 기본 아이콘 ===
export const CATEGORY_ICONS: Record<string, string> = {
  fitness: "Human",
  nutrition: "Leaf",
  mindfulness: "Wind",
  learning: "BookOpen",
  social: "MessageText",
  productivity: "Clipboard",
  wellness: "Heart",
};

// === 네비게이션 아이콘 ===
export const NAV_ICONS = {
  today: "Card",
  collection: "Archive",
  settings: "MoreHorizontal",
} as const;

// === UI 공통 아이콘 ===
export const UI_ICONS = {
  streak: "Zap",
  check: "Check",
  lock: "Lock",
  trophy: "Trophy",
  calendar: "Calendar",
  fire: "Fire",
  sparkle: "Sparkle",
  close: "Cancel",
  chevronRight: "ChevronRight",
  chevronLeft: "ChevronLeft",
} as const;
