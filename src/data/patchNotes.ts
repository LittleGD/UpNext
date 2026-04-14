import type { Language } from "@/types/game";

// 패치 노트 한 항목 — 4개 언어 동일 구조 유지
export interface PatchNoteEntry {
  icon?: string;      // pixelarticons 이름 (선택)
  title: string;
  description: string;
}

export interface PatchNote {
  version: string;              // "2026.04.14" — lastSeenPatchVersion 비교 키
  date: string;                 // 배포일 "2026-04-14"
  headline: Record<Language, string>;     // 상단 하이라이트 한 줄
  entries: Record<Language, PatchNoteEntry[]>;  // 변경 항목들
}

// 최신 순으로 맨 앞에 쌓기 — LATEST_PATCH는 항상 PATCH_NOTES[0]
export const PATCH_NOTES: PatchNote[] = [
  {
    version: "2026.04.14",
    date: "2026-04-14",
    headline: {
      ko: "새로운 챌린지 카드 28장 추가",
      en: "28 new challenge cards added",
      ja: "新しいチャレンジカードを28枚追加",
      zh: "新增28张挑战卡",
    },
    entries: {
      ko: [
        {
          icon: "Trophy",
          title: "카드매치 미니게임",
          description: "티켓을 소모해 3라운드 카드매치 런을 돌리고 보상 카드를 획득하세요.",
        },
        {
          icon: "Sparkle",
          title: "챌린지 카드 확장",
          description: "운동/식단/마음챙김/학습/소통/생산성/건강 7개 카테고리 × 4등급, 총 28장 추가.",
        },
        {
          icon: "Check",
          title: "클라우드 sync 안정화",
          description: "기기 간 진행도 충돌 처리 개선, 재시도 백오프로 네트워크 복구 후 자동 재동기화.",
        },
      ],
      en: [
        {
          icon: "Trophy",
          title: "Card Match Minigame",
          description: "Spend tickets to run a 3-round card match and earn reward cards.",
        },
        {
          icon: "Sparkle",
          title: "Challenge Card Expansion",
          description: "28 new cards across 7 categories × 4 rarities (Fitness, Nutrition, Mindfulness, Learning, Social, Productivity, Wellness).",
        },
        {
          icon: "Check",
          title: "Cloud Sync Hardening",
          description: "Better cross-device progress conflict handling and auto-retry with exponential backoff after network recovery.",
        },
      ],
      ja: [
        {
          icon: "Trophy",
          title: "カードマッチミニゲーム",
          description: "チケットを使って3ラウンドのカードマッチを回し、報酬カードを獲得しよう。",
        },
        {
          icon: "Sparkle",
          title: "チャレンジカード拡張",
          description: "運動・食事・マインドフルネス・学習・交流・生産性・ウェルネスの7カテゴリ×4レアリティ、計28枚を追加。",
        },
        {
          icon: "Check",
          title: "クラウド同期の安定化",
          description: "デバイス間の進行度コンフリクト処理を改善、指数バックオフでネットワーク復旧後に自動再同期。",
        },
      ],
      zh: [
        {
          icon: "Trophy",
          title: "卡片匹配小游戏",
          description: "使用门票进行3轮卡片匹配,获取奖励卡。",
        },
        {
          icon: "Sparkle",
          title: "挑战卡扩充",
          description: "运动/饮食/正念/学习/社交/生产力/健康 7个类别 × 4个稀有度,共新增28张卡。",
        },
        {
          icon: "Check",
          title: "云同步稳定化",
          description: "改进多设备进度冲突处理,网络恢复后以指数退避自动重试同步。",
        },
      ],
    },
  },
];

export const LATEST_PATCH: PatchNote = PATCH_NOTES[0];
