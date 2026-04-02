import type { TitleDefinition } from "@/types/title";
import type { Category } from "@/types/card";
import type { UserProgress } from "@/types/game";

// === 카테고리 한글 라벨 ===
export const CATEGORY_LABELS: Record<Category, string> = {
  fitness: "운동",
  nutrition: "식단",
  mindfulness: "마음챙김",
  learning: "학습",
  social: "소통",
  productivity: "생산성",
  wellness: "건강",
};

// === 카테고리 영문 라벨 ===
export const CATEGORY_LABELS_EN: Record<Category, string> = {
  fitness: "Fitness",
  nutrition: "Nutrition",
  mindfulness: "Mindfulness",
  learning: "Learning",
  social: "Social",
  productivity: "Productivity",
  wellness: "Wellness",
};

// === 카테고리 아이콘 ===
export const CATEGORY_ICONS: Record<Category, string> = {
  fitness: "Human",
  nutrition: "Leaf",
  mindfulness: "Wind",
  learning: "BookOpen",
  social: "Mail",
  productivity: "ClipboardNote",
  wellness: "Heart",
};

// === 전체 칭호 목록 ===
const categories: Category[] = [
  "fitness", "nutrition", "mindfulness", "learning", "social", "productivity", "wellness",
];

const categoryTitleNames: Record<Category, Record<string, string>> = {
  fitness: { normal: "운동 입문자", rare: "운동 실천가", unique: "운동 마스터", legend: "운동 레전드" },
  nutrition: { normal: "식단 입문자", rare: "식단 실천가", unique: "식단 마스터", legend: "식단 레전드" },
  mindfulness: { normal: "마음 수련생", rare: "마음 탐험가", unique: "마음 마스터", legend: "마음 레전드" },
  learning: { normal: "학습 입문자", rare: "학습 실천가", unique: "학습 마스터", legend: "학습 레전드" },
  social: { normal: "소통 입문자", rare: "소통 실천가", unique: "소통 마스터", legend: "소통 레전드" },
  productivity: { normal: "정리 입문자", rare: "정리 실천가", unique: "정리 마스터", legend: "정리 레전드" },
  wellness: { normal: "건강 입문자", rare: "건강 실천가", unique: "건강 마스터", legend: "건강 레전드" },
};

const categoryTitleNamesEn: Record<Category, Record<string, string>> = {
  fitness: { normal: "Fitness Beginner", rare: "Fitness Achiever", unique: "Fitness Master", legend: "Fitness Legend" },
  nutrition: { normal: "Nutrition Beginner", rare: "Nutrition Achiever", unique: "Nutrition Master", legend: "Nutrition Legend" },
  mindfulness: { normal: "Mindfulness Beginner", rare: "Mindfulness Achiever", unique: "Mindfulness Master", legend: "Mindfulness Legend" },
  learning: { normal: "Learning Beginner", rare: "Learning Achiever", unique: "Learning Master", legend: "Learning Legend" },
  social: { normal: "Social Beginner", rare: "Social Achiever", unique: "Social Master", legend: "Social Legend" },
  productivity: { normal: "Productivity Beginner", rare: "Productivity Achiever", unique: "Productivity Master", legend: "Productivity Legend" },
  wellness: { normal: "Wellness Beginner", rare: "Wellness Achiever", unique: "Wellness Master", legend: "Wellness Legend" },
};

const categoryThresholds = [
  { rarity: "normal" as const, count: 7 },
  { rarity: "rare" as const, count: 15 },
  { rarity: "unique" as const, count: 30 },
  { rarity: "legend" as const, count: 50 },
];

// 카테고리별 칭호 (7 카테고리 x 4 등급 = 28개)
const categoryTitles: TitleDefinition[] = categories.flatMap((cat) =>
  categoryThresholds.map(({ rarity, count }) => ({
    id: `title-${cat}-${rarity}`,
    name: categoryTitleNames[cat][rarity],
    nameEn: categoryTitleNamesEn[cat][rarity],
    description: `${CATEGORY_LABELS[cat]} 챌린지 ${count}회 완수`,
    descriptionEn: `Complete ${CATEGORY_LABELS_EN[cat]} challenges ${count} times`,
    rarity,
    condition: { type: "category" as const, category: cat, count },
    icon: CATEGORY_ICONS[cat],
  }))
);

// 카드별 칭호
const cardTitles: TitleDefinition[] = [
  {
    id: "title-card-reading",
    name: "독서왕",
    nameEn: "Bookworm",
    description: "책 한 페이지 읽기 15회 완수",
    descriptionEn: "Read One Page 15 times",
    rarity: "rare",
    condition: { type: "card", cardId: "learning-001", count: 15 },
    icon: "BookOpen",
  },
  {
    id: "title-card-runner",
    name: "마라토너",
    nameEn: "Marathoner",
    description: "5km 러닝 10회 완수",
    descriptionEn: "Complete 5K Run 10 times",
    rarity: "legend",
    condition: { type: "card", cardId: "fitness-008", count: 10 },
    icon: "Trophy",
  },
  {
    id: "title-card-water",
    name: "수분 충전왕",
    nameEn: "Hydration Hero",
    description: "물 8잔 마시기 20회 완수",
    descriptionEn: "Drink 8 Glasses of Water 20 times",
    rarity: "unique",
    condition: { type: "card", cardId: "nutrition-001", count: 20 },
    icon: "Waves",
  },
  {
    id: "title-card-meditation",
    name: "명상 수행자",
    nameEn: "Zen Practitioner",
    description: "5분 명상 10회 완수",
    descriptionEn: "Complete 5-Min Meditation 10 times",
    rarity: "rare",
    condition: { type: "card", cardId: "mindfulness-003", count: 10 },
    icon: "Sparkle",
  },
  {
    id: "title-card-gratitude",
    name: "감사하는 사람",
    nameEn: "Grateful Soul",
    description: "감사일기 쓰기 20회 완수",
    descriptionEn: "Write a Gratitude Journal 20 times",
    rarity: "unique",
    condition: { type: "card", cardId: "mindfulness-002", count: 20 },
    icon: "Note",
  },
  {
    id: "title-card-plank",
    name: "코어왕",
    nameEn: "Core King",
    description: "플랭크 2분 버티기 15회 완수",
    descriptionEn: "Complete 2-Min Plank Hold 15 times",
    rarity: "unique",
    condition: { type: "card", cardId: "fitness-007", count: 15 },
    icon: "Clock",
  },
  {
    id: "title-card-detox",
    name: "디지털 해방자",
    nameEn: "Digital Liberator",
    description: "디지털 디톡스 1시간 10회 완수",
    descriptionEn: "Complete 1-Hour Digital Detox 10 times",
    rarity: "legend",
    condition: { type: "card", cardId: "mindfulness-004", count: 10 },
    icon: "ZapOff",
  },
  {
    id: "title-card-early",
    name: "얼리버드",
    nameEn: "Early Bird",
    description: "12시 전에 잠들기 14회 완수",
    descriptionEn: "Sleep Before Midnight 14 times",
    rarity: "rare",
    condition: { type: "card", cardId: "wellness-004", count: 14 },
    icon: "Moon",
  },
];

// 재밌는 특별 칭호
const funTitles: TitleDefinition[] = [
  {
    id: "title-fun-aquaman",
    name: "인간 정수기",
    nameEn: "Human Water Cooler",
    description: "물 8잔 마시기 30회 완수",
    descriptionEn: "Drink 8 Glasses of Water 30 times",
    rarity: "legend",
    condition: { type: "card", cardId: "nutrition-001", count: 30 },
    icon: "Waves",
  },
  {
    id: "title-fun-sloth",
    name: "낮잠의 신",
    nameEn: "Nap Lord",
    description: "낮잠 20분 자기 10회 완수",
    descriptionEn: "Complete 20-Min Power Nap 10 times",
    rarity: "rare",
    condition: { type: "card", cardId: "wellness-003", count: 10 },
    icon: "Bed",
  },
  {
    id: "title-fun-stairmaster",
    name: "엘리베이터 거부자",
    nameEn: "Elevator Denier",
    description: "계단으로 5층 오르기 20회 완수",
    descriptionEn: "Climb 5 Flights of Stairs 20 times",
    rarity: "unique",
    condition: { type: "card", cardId: "fitness-006", count: 20 },
    icon: "ArrowBigUpDash",
  },
  {
    id: "title-fun-sugarfree",
    name: "설탕과 이별한 자",
    nameEn: "Sugar-Free Champion",
    description: "설탕 음료 안 마시기 20회 완수",
    descriptionEn: "Skip Sugary Drinks 20 times",
    rarity: "unique",
    condition: { type: "card", cardId: "nutrition-004", count: 20 },
    icon: "Cancel",
  },
  {
    id: "title-fun-chef",
    name: "백종원의 제자",
    nameEn: "Home Chef",
    description: "직접 요리해 먹기 15회 완수",
    descriptionEn: "Cook Your Own Meal 15 times",
    rarity: "rare",
    condition: { type: "card", cardId: "nutrition-005", count: 15 },
    icon: "Fire",
  },
  {
    id: "title-fun-desk",
    name: "정리의 달인",
    nameEn: "Tidy Master",
    description: "책상 정리하기 25회 완수",
    descriptionEn: "Tidy Your Desk 25 times",
    rarity: "unique",
    condition: { type: "card", cardId: "productivity-001", count: 25 },
    icon: "Sparkles",
  },
  {
    id: "title-fun-planner",
    name: "내일의 나에게 떠넘기기",
    nameEn: "Future Me's Problem",
    description: "내일 할 일 3개 적기 20회 완수",
    descriptionEn: "Plan 3 Tasks for Tomorrow 20 times",
    rarity: "rare",
    condition: { type: "card", cardId: "productivity-002", count: 20 },
    icon: "ClipboardNote",
  },
  {
    id: "title-fun-breath",
    name: "숨쉬기 장인",
    nameEn: "Breathing Expert",
    description: "3분 심호흡 30회 완수",
    descriptionEn: "Complete 3-Min Deep Breathing 30 times",
    rarity: "unique",
    condition: { type: "card", cardId: "mindfulness-001", count: 30 },
    icon: "Wind",
  },
  {
    id: "title-fun-stretch",
    name: "고무인간",
    nameEn: "Rubber Human",
    description: "5분 스트레칭 30회 완수",
    descriptionEn: "Complete 5-Min Stretch 30 times",
    rarity: "legend",
    condition: { type: "card", cardId: "fitness-002", count: 30 },
    icon: "HumanArmsUp",
  },
  {
    id: "title-fun-compliment",
    name: "칭찬 자판기",
    nameEn: "Compliment Machine",
    description: "칭찬 한마디 하기 25회 완수",
    descriptionEn: "Give a Compliment 25 times",
    rarity: "unique",
    condition: { type: "card", cardId: "social-002", count: 25 },
    icon: "ThumbsUp",
  },
];

// 스트릭 칭호
const streakTitles: TitleDefinition[] = [
  {
    id: "title-streak-3",
    name: "꾸준한 시작",
    nameEn: "Steady Start",
    description: "3일 연속 챌린지 완료",
    descriptionEn: "Complete challenges 3 days in a row",
    rarity: "normal",
    condition: { type: "streak", days: 3 },
    icon: "Zap",
  },
  {
    id: "title-streak-7",
    name: "일주일 챌린저",
    nameEn: "Week Warrior",
    description: "7일 연속 챌린지 완료",
    descriptionEn: "Complete challenges 7 days in a row",
    rarity: "rare",
    condition: { type: "streak", days: 7 },
    icon: "Zap",
  },
  {
    id: "title-streak-14",
    name: "2주 마라토너",
    nameEn: "Two-Week Marathoner",
    description: "14일 연속 챌린지 완료",
    descriptionEn: "Complete challenges 14 days in a row",
    rarity: "unique",
    condition: { type: "streak", days: 14 },
    icon: "Zap",
  },
  {
    id: "title-streak-30",
    name: "30일 레전드",
    nameEn: "30-Day Legend",
    description: "30일 연속 챌린지 완료",
    descriptionEn: "Complete challenges 30 days in a row",
    rarity: "legend",
    condition: { type: "streak", days: 30 },
    icon: "Trophy",
  },
];

export const ALL_TITLES: TitleDefinition[] = [
  ...categoryTitles,
  ...cardTitles,
  ...funTitles,
  ...streakTitles,
];

// === 칭호 획득 여부 체크 ===
export function isTitleEarned(title: TitleDefinition, progress: UserProgress): boolean {
  const { condition } = title;
  switch (condition.type) {
    case "category":
      return (progress.categoryCompletions[condition.category] || 0) >= condition.count;
    case "card":
      return (progress.cardCompletions?.[condition.cardId] || 0) >= condition.count;
    case "streak":
      return (progress.longestStreak || 0) >= condition.days;
  }
}

// === 획득한 칭호 ID 목록 ===
export function getEarnedTitleIds(progress: UserProgress): string[] {
  return ALL_TITLES.filter((t) => isTitleEarned(t, progress)).map((t) => t.id);
}

// === 칭호별 진행도 (현재/목표) ===
export function getTitleProgress(title: TitleDefinition, progress: UserProgress): { current: number; target: number } {
  const { condition } = title;
  switch (condition.type) {
    case "category":
      return { current: progress.categoryCompletions[condition.category] || 0, target: condition.count };
    case "card":
      return { current: progress.cardCompletions?.[condition.cardId] || 0, target: condition.count };
    case "streak":
      return { current: progress.longestStreak || 0, target: condition.days };
  }
}
