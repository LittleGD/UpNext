import type { TitleDefinition } from "@/types/title";
import type { Category } from "@/types/card";
import type { UserProgress, Language } from "@/types/game";

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

// === カテゴリ日本語ラベル ===
export const CATEGORY_LABELS_JA: Record<Category, string> = {
  fitness: "フィットネス",
  nutrition: "食事",
  mindfulness: "マインドフルネス",
  learning: "学習",
  social: "コミュニケーション",
  productivity: "生産性",
  wellness: "ウェルネス",
};

// === 카테고리 中文 라벨 ===
export const CATEGORY_LABELS_ZH: Record<Category, string> = {
  fitness: "运动",
  nutrition: "饮食",
  mindfulness: "正念",
  learning: "学习",
  social: "社交",
  productivity: "效率",
  wellness: "健康",
};

// === 카테고리 라벨 헬퍼 ===
export function categoryLabel(cat: Category, lang: Language): string {
  const map: Record<Language, Record<Category, string>> = {
    ko: CATEGORY_LABELS,
    en: CATEGORY_LABELS_EN,
    ja: CATEGORY_LABELS_JA,
    zh: CATEGORY_LABELS_ZH,
  };
  return map[lang]?.[cat] ?? CATEGORY_LABELS[cat];
}

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

const categoryTitleNamesJa: Record<Category, Record<string, string>> = {
  fitness: { normal: "フィットネス入門", rare: "フィットネス実践者", unique: "フィットネスマスター", legend: "フィットネスレジェンド" },
  nutrition: { normal: "食事管理入門", rare: "食事管理実践者", unique: "食事管理マスター", legend: "食事管理レジェンド" },
  mindfulness: { normal: "マインド修行者", rare: "マインド探求者", unique: "マインドマスター", legend: "マインドレジェンド" },
  learning: { normal: "学習入門", rare: "学習実践者", unique: "学習マスター", legend: "学習レジェンド" },
  social: { normal: "コミュニケーション入門", rare: "コミュニケーション実践者", unique: "コミュニケーションマスター", legend: "コミュニケーションレジェンド" },
  productivity: { normal: "整理入門", rare: "整理実践者", unique: "整理マスター", legend: "整理レジェンド" },
  wellness: { normal: "ウェルネス入門", rare: "ウェルネス実践者", unique: "ウェルネスマスター", legend: "ウェルネスレジェンド" },
};

const categoryTitleNamesZh: Record<Category, Record<string, string>> = {
  fitness: { normal: "运动入门", rare: "运动达人", unique: "运动大师", legend: "运动传奇" },
  nutrition: { normal: "饮食入门", rare: "饮食达人", unique: "饮食大师", legend: "饮食传奇" },
  mindfulness: { normal: "正念新手", rare: "正念探索者", unique: "正念大师", legend: "正念传奇" },
  learning: { normal: "学习入门", rare: "学习达人", unique: "学习大师", legend: "学习传奇" },
  social: { normal: "社交入门", rare: "社交达人", unique: "社交大师", legend: "社交传奇" },
  productivity: { normal: "效率入门", rare: "效率达人", unique: "效率大师", legend: "效率传奇" },
  wellness: { normal: "健康入门", rare: "健康达人", unique: "健康大师", legend: "健康传奇" },
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
    nameJa: categoryTitleNamesJa[cat][rarity],
    nameZh: categoryTitleNamesZh[cat][rarity],
    description: `${CATEGORY_LABELS[cat]} 챌린지 ${count}회 완수`,
    descriptionEn: `Complete ${CATEGORY_LABELS_EN[cat]} challenges ${count} times`,
    descriptionJa: `${CATEGORY_LABELS_JA[cat]}チャレンジを${count}回達成`,
    descriptionZh: `完成${CATEGORY_LABELS_ZH[cat]}挑战${count}次`,
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
    nameJa: "読書王",
    nameZh: "阅读达人",
    description: "책 한 페이지 읽기 15회 완수",
    descriptionEn: "Read One Page 15 times",
    descriptionJa: "本を1ページ読むを15回達成",
    descriptionZh: "完成【读一页书】15次",
    rarity: "rare",
    condition: { type: "card", cardId: "learning-001", count: 15 },
    icon: "BookOpen",
  },
  {
    id: "title-card-runner",
    name: "마라토너",
    nameEn: "Marathoner",
    nameJa: "マラソンランナー",
    nameZh: "马拉松健将",
    description: "5km 러닝 10회 완수",
    descriptionEn: "Complete 5K Run 10 times",
    descriptionJa: "5kmランニングを10回達成",
    descriptionZh: "完成【5公里跑步】10次",
    rarity: "legend",
    condition: { type: "card", cardId: "fitness-008", count: 10 },
    icon: "Trophy",
  },
  {
    id: "title-card-water",
    name: "수분 충전왕",
    nameEn: "Hydration Hero",
    nameJa: "水分補給の達人",
    nameZh: "补水达人",
    description: "물 8잔 마시기 20회 완수",
    descriptionEn: "Drink 8 Glasses of Water 20 times",
    descriptionJa: "水を8杯飲むを20回達成",
    descriptionZh: "完成【喝8杯水】20次",
    rarity: "unique",
    condition: { type: "card", cardId: "nutrition-001", count: 20 },
    icon: "Waves",
  },
  {
    id: "title-card-meditation",
    name: "명상 수행자",
    nameEn: "Zen Practitioner",
    nameJa: "瞑想の修行者",
    nameZh: "冥想修行者",
    description: "5분 명상 10회 완수",
    descriptionEn: "Complete 5-Min Meditation 10 times",
    descriptionJa: "5分瞑想を10回達成",
    descriptionZh: "完成【5分钟冥想】10次",
    rarity: "rare",
    condition: { type: "card", cardId: "mindfulness-003", count: 10 },
    icon: "Sparkle",
  },
  {
    id: "title-card-gratitude",
    name: "감사하는 사람",
    nameEn: "Grateful Soul",
    nameJa: "感謝の人",
    nameZh: "感恩的人",
    description: "감사일기 쓰기 20회 완수",
    descriptionEn: "Write a Gratitude Journal 20 times",
    descriptionJa: "感謝日記を書くを20回達成",
    descriptionZh: "完成【写感恩日记】20次",
    rarity: "unique",
    condition: { type: "card", cardId: "mindfulness-002", count: 20 },
    icon: "Note",
  },
  {
    id: "title-card-plank",
    name: "코어왕",
    nameEn: "Core King",
    nameJa: "体幹キング",
    nameZh: "核心力量王",
    description: "플랭크 2분 버티기 15회 완수",
    descriptionEn: "Complete 2-Min Plank Hold 15 times",
    descriptionJa: "プランク2分キープを15回達成",
    descriptionZh: "完成【平板支撑2分钟】15次",
    rarity: "unique",
    condition: { type: "card", cardId: "fitness-007", count: 15 },
    icon: "Clock",
  },
  {
    id: "title-card-detox",
    name: "디지털 해방자",
    nameEn: "Digital Liberator",
    nameJa: "デジタル解放者",
    nameZh: "数字解放者",
    description: "디지털 디톡스 1시간 10회 완수",
    descriptionEn: "Complete 1-Hour Digital Detox 10 times",
    descriptionJa: "デジタルデトックス1時間を10回達成",
    descriptionZh: "完成【1小时数字排毒】10次",
    rarity: "legend",
    condition: { type: "card", cardId: "mindfulness-004", count: 10 },
    icon: "ZapOff",
  },
  {
    id: "title-card-early",
    name: "얼리버드",
    nameEn: "Early Bird",
    nameJa: "早起き鳥",
    nameZh: "早睡达人",
    description: "12시 전에 잠들기 14회 완수",
    descriptionEn: "Sleep Before Midnight 14 times",
    descriptionJa: "12時前に寝るを14回達成",
    descriptionZh: "完成【12点前入睡】14次",
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
    nameJa: "人間ウォーターサーバー",
    nameZh: "行走的饮水机",
    description: "물 8잔 마시기 30회 완수",
    descriptionEn: "Drink 8 Glasses of Water 30 times",
    descriptionJa: "水を8杯飲むを30回達成",
    descriptionZh: "完成【喝8杯水】30次",
    rarity: "legend",
    condition: { type: "card", cardId: "nutrition-001", count: 30 },
    icon: "Waves",
  },
  {
    id: "title-fun-sloth",
    name: "낮잠의 신",
    nameEn: "Nap Lord",
    nameJa: "昼寝の神",
    nameZh: "午睡之神",
    description: "낮잠 20분 자기 10회 완수",
    descriptionEn: "Complete 20-Min Power Nap 10 times",
    descriptionJa: "20分パワーナップを10回達成",
    descriptionZh: "完成【午睡20分钟】10次",
    rarity: "rare",
    condition: { type: "card", cardId: "wellness-003", count: 10 },
    icon: "Bed",
  },
  {
    id: "title-fun-stairmaster",
    name: "엘리베이터 거부자",
    nameEn: "Elevator Denier",
    nameJa: "エレベーター拒否者",
    nameZh: "拒绝电梯",
    description: "계단으로 5층 오르기 20회 완수",
    descriptionEn: "Climb 5 Flights of Stairs 20 times",
    descriptionJa: "階段5階分のぼるを20回達成",
    descriptionZh: "完成【爬5层楼梯】20次",
    rarity: "unique",
    condition: { type: "card", cardId: "fitness-006", count: 20 },
    icon: "ArrowBigUpDash",
  },
  {
    id: "title-fun-sugarfree",
    name: "설탕과 이별한 자",
    nameEn: "Sugar-Free Champion",
    nameJa: "砂糖と別れた者",
    nameZh: "告别甜饮料",
    description: "설탕 음료 안 마시기 20회 완수",
    descriptionEn: "Skip Sugary Drinks 20 times",
    descriptionJa: "甘い飲み物を控えるを20回達成",
    descriptionZh: "完成【不喝含糖饮料】20次",
    rarity: "unique",
    condition: { type: "card", cardId: "nutrition-004", count: 20 },
    icon: "Cancel",
  },
  {
    id: "title-fun-chef",
    name: "백종원의 제자",
    nameEn: "Home Chef",
    nameJa: "おうちシェフ",
    nameZh: "居家大厨",
    description: "직접 요리해 먹기 15회 완수",
    descriptionEn: "Cook Your Own Meal 15 times",
    descriptionJa: "自炊するを15回達成",
    descriptionZh: "完成【自己做饭】15次",
    rarity: "rare",
    condition: { type: "card", cardId: "nutrition-005", count: 15 },
    icon: "Fire",
  },
  {
    id: "title-fun-desk",
    name: "정리의 달인",
    nameEn: "Tidy Master",
    nameJa: "整理の達人",
    nameZh: "整理大师",
    description: "책상 정리하기 25회 완수",
    descriptionEn: "Tidy Your Desk 25 times",
    descriptionJa: "デスクを整理するを25回達成",
    descriptionZh: "完成【整理桌面】25次",
    rarity: "unique",
    condition: { type: "card", cardId: "productivity-001", count: 25 },
    icon: "Sparkles",
  },
  {
    id: "title-fun-planner",
    name: "내일의 나에게 떠넘기기",
    nameEn: "Future Me's Problem",
    nameJa: "明日の自分に丸投げ",
    nameZh: "明天再说",
    description: "내일 할 일 3개 적기 20회 완수",
    descriptionEn: "Plan 3 Tasks for Tomorrow 20 times",
    descriptionJa: "明日のタスク3つ書くを20回達成",
    descriptionZh: "完成【列3件明天的任务】20次",
    rarity: "rare",
    condition: { type: "card", cardId: "productivity-002", count: 20 },
    icon: "ClipboardNote",
  },
  {
    id: "title-fun-breath",
    name: "숨쉬기 장인",
    nameEn: "Breathing Expert",
    nameJa: "呼吸の匠",
    nameZh: "呼吸大师",
    description: "3분 심호흡 30회 완수",
    descriptionEn: "Complete 3-Min Deep Breathing 30 times",
    descriptionJa: "3分深呼吸を30回達成",
    descriptionZh: "完成【3分钟深呼吸】30次",
    rarity: "unique",
    condition: { type: "card", cardId: "mindfulness-001", count: 30 },
    icon: "Wind",
  },
  {
    id: "title-fun-stretch",
    name: "고무인간",
    nameEn: "Rubber Human",
    nameJa: "ゴム人間",
    nameZh: "橡皮人",
    description: "5분 스트레칭 30회 완수",
    descriptionEn: "Complete 5-Min Stretch 30 times",
    descriptionJa: "5分ストレッチを30回達成",
    descriptionZh: "完成【5分钟拉伸】30次",
    rarity: "legend",
    condition: { type: "card", cardId: "fitness-002", count: 30 },
    icon: "HumanArmsUp",
  },
  {
    id: "title-fun-compliment",
    name: "칭찬 자판기",
    nameEn: "Compliment Machine",
    nameJa: "ほめ言葉自販機",
    nameZh: "夸夸机器",
    description: "칭찬 한마디 하기 25회 완수",
    descriptionEn: "Give a Compliment 25 times",
    descriptionJa: "ほめ言葉を贈るを25回達成",
    descriptionZh: "完成【夸夸别人】25次",
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
    nameJa: "着実なスタート",
    nameZh: "稳定起步",
    description: "3일 연속 챌린지 완료",
    descriptionEn: "Complete challenges 3 days in a row",
    descriptionJa: "3日連続チャレンジ達成",
    descriptionZh: "连续3天完成挑战",
    rarity: "normal",
    condition: { type: "streak", days: 3 },
    icon: "Zap",
  },
  {
    id: "title-streak-7",
    name: "일주일 챌린저",
    nameEn: "Week Warrior",
    nameJa: "1週間チャレンジャー",
    nameZh: "一周勇士",
    description: "7일 연속 챌린지 완료",
    descriptionEn: "Complete challenges 7 days in a row",
    descriptionJa: "7日連続チャレンジ達成",
    descriptionZh: "连续7天完成挑战",
    rarity: "rare",
    condition: { type: "streak", days: 7 },
    icon: "Zap",
  },
  {
    id: "title-streak-14",
    name: "2주 마라토너",
    nameEn: "Two-Week Marathoner",
    nameJa: "2週間マラソンランナー",
    nameZh: "两周马拉松",
    description: "14일 연속 챌린지 완료",
    descriptionEn: "Complete challenges 14 days in a row",
    descriptionJa: "14日連続チャレンジ達成",
    descriptionZh: "连续14天完成挑战",
    rarity: "unique",
    condition: { type: "streak", days: 14 },
    icon: "Zap",
  },
  {
    id: "title-streak-30",
    name: "30일 레전드",
    nameEn: "30-Day Legend",
    nameJa: "30日レジェンド",
    nameZh: "30天传奇",
    description: "30일 연속 챌린지 완료",
    descriptionEn: "Complete challenges 30 days in a row",
    descriptionJa: "30日連続チャレンジ達成",
    descriptionZh: "连续30天完成挑战",
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
