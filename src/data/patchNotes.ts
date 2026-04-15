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
    version: "2026.04.15",
    date: "2026-04-15",
    headline: {
      ko: "글로벌 트렌드 챌린지 + 3D 카드 뷰어",
      en: "Global Trend Challenges + 3D Card Viewer",
      ja: "グローバルトレンドチャレンジ + 3Dカードビューアー",
      zh: "全球趋势挑战 + 3D卡片查看器",
    },
    entries: {
      ko: [
        {
          icon: "Globe",
          title: "트렌딩 카테고리 신설",
          description: "한국·일본·중국·미국 Z세대 갓생 트렌드에서 엄선한 32장의 챌린지 카드. 75:25 러닝, 하루 한 줄 일기, 도파민 디톡스 등.",
        },
        {
          icon: "Card",
          title: "3D 카드 디테일 뷰어",
          description: "컬렉션과 카드뽑기에서 카드를 탭하면 포켓몬카드처럼 3D로 감상. 드래그 회전, 자이로센서 연동, 홀로그래픽 효과, 카테고리별 명언까지.",
        },
        {
          icon: "Zap",
          title: "자이로센서 기본 활성화",
          description: "카드 뷰어의 자이로가 이제 디폴트로 켜집니다. 기기를 기울여 카드를 자연스럽게 조작하세요.",
        },
        {
          icon: "Check",
          title: "버그 수정 및 성능 개선",
          description: "레벨업 숫자 롤링 애니메이션 수정, 자이로 60fps 리렌더 제거, Safe-area 패딩 개선, 미사용 코드 정리.",
        },
      ],
      en: [
        {
          icon: "Globe",
          title: "Trending Category",
          description: "32 challenge cards curated from Gen-Z wellness trends in Korea, Japan, China & the US. 75:25 Running, One-Line Journaling, Dopamine Detox, and more.",
        },
        {
          icon: "Card",
          title: "3D Card Detail Viewer",
          description: "Tap a card in Collection or Card Draw to view it in 3D — drag to rotate, gyroscope tilt, holographic effects, and category-themed quotes.",
        },
        {
          icon: "Zap",
          title: "Gyroscope Enabled by Default",
          description: "The card viewer gyroscope is now on by default. Tilt your device to naturally interact with cards.",
        },
        {
          icon: "Check",
          title: "Bug Fixes & Performance",
          description: "Level-up number rolling animation fix, gyro 60fps re-render elimination, safe-area padding improvements, dead code cleanup.",
        },
      ],
      ja: [
        {
          icon: "Globe",
          title: "トレンディングカテゴリ新設",
          description: "韓国・日本・中国・米国のZ世代ウェルネストレンドから厳選した32枚のチャレンジカード。75:25ランニング、一行日記、ドーパミンデトックスなど。",
        },
        {
          icon: "Card",
          title: "3Dカードビューアー",
          description: "コレクションやカードドローでカードをタップするとポケカのように3D鑑賞。ドラッグ回転、ジャイロセンサー連動、ホログラフィック効果、カテゴリ別名言も表示。",
        },
        {
          icon: "Zap",
          title: "ジャイロセンサーのデフォルト有効化",
          description: "カードビューアーのジャイロがデフォルトでオンに。デバイスを傾けて自然にカードを操作しよう。",
        },
        {
          icon: "Check",
          title: "バグ修正とパフォーマンス改善",
          description: "レベルアップ数字ローリングアニメーション修正、ジャイロ60fps再レンダリング除去、セーフエリアパディング改善、未使用コード整理。",
        },
      ],
      zh: [
        {
          icon: "Globe",
          title: "新增趋势类别",
          description: "精选韩国·日本·中国·美国Z世代健康趋势的32张挑战卡。75:25跑步、一行日记、多巴胺排毒等。",
        },
        {
          icon: "Card",
          title: "3D卡片查看器",
          description: "在收藏和抽卡中点击卡片即可3D鉴赏——拖拽旋转、陀螺仪联动、全息效果,还有分类名言。",
        },
        {
          icon: "Zap",
          title: "陀螺仪默认启用",
          description: "卡片查看器的陀螺仪现已默认开启。倾斜设备即可自然操控卡片。",
        },
        {
          icon: "Check",
          title: "修复与性能优化",
          description: "升级数字滚动动画修复、陀螺仪60fps重渲染消除、安全区域内边距改进、无用代码清理。",
        },
      ],
    },
  },
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
