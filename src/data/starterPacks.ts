export interface StarterPack {
  id: string;
  name: string;
  nameEn?: string;
  nameJa?: string;
  description: string;
  descriptionEn?: string;
  descriptionJa?: string;
  cardIds: string[];
  icon: string;
  color: string;
}

export const STARTER_PACKS: StarterPack[] = [
  {
    id: "body-mind",
    name: "바디 & 마인드",
    nameEn: "Body & Mind",
    nameJa: "ボディ&マインド",
    description: "운동과 마음챙김으로 시작하는 건강한 루틴",
    descriptionEn: "A healthy routine of fitness and mindfulness",
    descriptionJa: "フィットネスとマインドフルネスで始める健康ルーティン",
    icon: "Heart",
    color: "var(--accent-primary)",
    cardIds: [
      "fitness-001",    // 1000보 걷기
      "fitness-002",    // 5분 스트레칭
      "fitness-003",    // 5분 근력운동
      "mindfulness-001", // 3분 심호흡
      "mindfulness-002", // 감사일기 쓰기
      "wellness-001",   // 자세 바로잡기
    ],
  },
  {
    id: "smart-life",
    name: "스마트 라이프",
    nameEn: "Smart Life",
    nameJa: "スマートライフ",
    description: "학습과 생산성으로 시작하는 스마트한 루틴",
    descriptionEn: "A smart routine of learning and productivity",
    descriptionJa: "学習と生産性で始めるスマートなルーティン",
    icon: "Lightbulb",
    color: "var(--accent-cyan)",
    cardIds: [
      "learning-001",     // 책 한 페이지 읽기
      "learning-002",     // 경제뉴스 보기
      "nutrition-001",    // 물 8잔 마시기
      "nutrition-002",    // 단탄지 맞춰먹기
      "productivity-001", // 책상 정리하기
      "productivity-002", // 내일 할 일 3개 적기
    ],
  },
];
