/**
 * Up Hero — 던전별 분위기 텍스트 + 분기점 이벤트 풀.
 * 로그라이크 탐험 풍성함을 위해 매 세션마다 다른 텍스트 조합.
 */

import type { DungeonId, ChoiceOption } from "@/types/uphero";

/** 분위기 narrative — 매 floor 시작/중간에 랜덤 삽입 */
export const NARRATIVE_POOL: Record<DungeonId, string[]> = {
  fitness: [
    "차가운 바람이 바위 사이를 휘감는다.",
    "발 아래 돌이 흩어진다.",
    "멀리서 늑대 울음이 들린다.",
    "가파른 절벽을 올라간다.",
    "눈보라가 시야를 가린다.",
    "산악 새가 울며 지나간다.",
    "오래된 사람의 흔적을 발견한다.",
    "얼어붙은 폭포 옆을 지난다.",
    "숨을 고르며 앞으로 나아간다.",
    "발자국 소리가 골짜기에 울린다.",
  ],
  learning: [
    "먼지 쌓인 책장이 끝없이 이어진다.",
    "촛불이 흔들리며 그림자를 만든다.",
    "고대 문서의 향이 코를 찌른다.",
    "조용한 속삭임이 들린다.",
    "책 한 권이 스스로 넘어간다.",
    "잉크 냄새가 진해진다.",
    "어둠 속에서 눈동자가 반짝인다.",
    "종이 부스러기가 발걸음마다 밟힌다.",
    "천장 높이 쌓인 책이 위태롭다.",
    "멀리서 종이 울린다.",
  ],
  mindfulness: [
    "고요가 귓속을 채운다.",
    "향 냄새가 부드럽게 스민다.",
    "호흡 소리만이 들린다.",
    "빛 한 줄기가 바닥을 비춘다.",
    "마음이 잔잔해진다.",
    "작은 종소리가 맑게 퍼진다.",
    "눈을 감았다 뜨자 주변이 바뀌었다.",
    "영혼의 기운이 느껴진다.",
    "무언가가 지켜보는 듯하다.",
    "공기가 무겁게 눌러온다.",
  ],
  nutrition: [
    "황금빛 곡물이 바람에 흔들린다.",
    "풍성한 과일 향이 퍼진다.",
    "꿀벌이 주위를 맴돈다.",
    "익은 토마토가 발에 채인다.",
    "곡식 창고의 문이 삐걱인다.",
    "허수아비가 우뚝 서 있다.",
    "태양이 따뜻하게 내리쬔다.",
    "채소밭 너머 무엇인가 움직인다.",
    "잘 익은 열매가 길을 막는다.",
    "농부의 흔적이 보인다.",
  ],
  social: [
    "시끌벅적한 소리가 들린다.",
    "노래가 멀리서 울려 퍼진다.",
    "상인의 호객 소리.",
    "군중이 영웅을 쳐다본다.",
    "누군가 말을 걸려 한다.",
    "술잔 부딪히는 소리.",
    "광대의 웃음이 공허하다.",
    "낯선 이의 시선이 느껴진다.",
    "축제의 장막이 보인다.",
    "음유시인의 이야기가 들린다.",
  ],
  productivity: [
    "톱니바퀴 소리가 일정하게 들린다.",
    "시계 초침이 멈췄다 다시 간다.",
    "기계 증기가 뿜어져 나온다.",
    "황동 파이프가 복잡하게 얽혔다.",
    "진자가 규칙적으로 흔들린다.",
    "시간이 뒤틀린 듯 느껴진다.",
    "메트로놈 소리가 심장과 맞춰진다.",
    "기계 팔이 반복 작동한다.",
    "시계탑 종이 울린다.",
    "계기판이 붉게 깜빡인다.",
  ],
  wellness: [
    "따뜻한 김이 피어오른다.",
    "온천 물소리가 평화롭다.",
    "치유의 기운이 감돈다.",
    "부드러운 풀 위를 걷는다.",
    "허브 향기가 짙어진다.",
    "작은 시냇물이 흐른다.",
    "수정같은 물이 고였다.",
    "무언가 졸음이 온다.",
    "온화한 빛이 감싼다.",
    "꽃잎이 천천히 떨어진다.",
  ],
  trending: [
    "공간이 뒤틀린다.",
    "색이 계속 바뀐다.",
    "이해할 수 없는 문양이 떠다닌다.",
    "시간 감각이 흐려진다.",
    "네온 불빛이 깜빡인다.",
    "음향이 왜곡되어 들린다.",
    "벽이 거울처럼 반사한다.",
    "픽셀이 흩어지며 재조합된다.",
    "이상한 노래가 머릿속에 남는다.",
    "중력이 살짝 약해진다.",
  ],
};

/** 보물 상자 설명 풀 */
export const TREASURE_DESCRIPTIONS = [
  "오래된 나무 상자를 발견했다.",
  "반짝이는 동전이 흩어져 있다.",
  "작은 보석이 빛난다.",
  "버려진 배낭에서 금화가 떨어진다.",
  "이끼에 덮인 동전 더미.",
  "유물 조각이 눈에 띈다.",
];

/** 분기점 이벤트 풀 — 던전별 테마 */
export const EVENT_POOL: Record<DungeonId, Array<{ prompt: string; options: ChoiceOption[] }>> = {
  fitness: [
    {
      prompt: "가파른 절벽이 앞을 막는다.",
      options: [
        {
          label: "점프로 넘기 (위험)",
          effect: { kind: "skipFloors", count: 1 },
          resultText: "영웅이 도약해 절벽을 뛰어넘었다! 한 층 건너뛴다.",
        },
        {
          label: "돌아서 우회",
          effect: { kind: "nothing" },
          resultText: "안전하게 우회했다.",
        },
      ],
    },
    {
      prompt: "산악인의 시신 옆에 금괴가 있다.",
      options: [
        {
          label: "경례하고 가져가기",
          effect: { kind: "reward", coins: 50 },
          resultText: "고개를 숙인 뒤 금괴를 챙겼다.",
        },
        {
          label: "건드리지 않기",
          effect: { kind: "heal", amount: 30 },
          resultText: "경의를 표하자 몸이 가벼워졌다. HP 회복.",
        },
      ],
    },
    {
      prompt: "폭풍이 몰아친다.",
      options: [
        {
          label: "밀고 나가기",
          effect: { kind: "damage", amount: 20 },
          resultText: "바람에 맞아 상처 입었지만 전진했다.",
        },
        {
          label: "대피 (시간 소모)",
          effect: { kind: "nothing" },
          resultText: "동굴에서 폭풍이 지나가길 기다렸다.",
        },
      ],
    },
    {
      prompt: "두 갈래 등반 경로가 보인다.",
      options: [
        {
          label: "⬈ 가파른 직선 (보상 ↑)",
          effect: { kind: "reward", coins: 25, xp: 15 },
          resultText: "힘든 길이었지만 보물을 발견했다.",
        },
        {
          label: "⬊ 완만한 우회",
          effect: { kind: "heal", amount: 15 },
          resultText: "여유로운 걸음으로 기력을 회복했다.",
        },
      ],
    },
    {
      prompt: "바위 아래 깊은 크레바스.",
      options: [
        {
          label: "로프로 내려가기",
          effect: { kind: "reward", coins: 80 },
          resultText: "아래 숨겨진 동전 더미를 발견!",
        },
        {
          label: "줄이 끊어질까 두렵다",
          effect: { kind: "nothing" },
          resultText: "포기하고 다시 위로.",
        },
      ],
    },
  ],
  learning: [
    {
      prompt: "수수께끼 문이 나타났다.",
      options: [
        {
          label: "수수께끼 도전",
          effect: { kind: "reward", xp: 50 },
          resultText: "정답을 맞혀 지혜를 얻었다!",
        },
        {
          label: "뒤로 돌아가기",
          effect: { kind: "nothing" },
          resultText: "다른 길을 찾는다.",
        },
      ],
    },
    {
      prompt: "먼지 덮인 책을 발견했다.",
      options: [
        {
          label: "읽어보기",
          effect: { kind: "reward", xp: 30, coins: 10 },
          resultText: "지식과 동전을 함께 얻었다.",
        },
        {
          label: "조심스레 덮기",
          effect: { kind: "nothing" },
          resultText: "건드리지 않고 지나간다.",
        },
      ],
    },
  ],
  mindfulness: [
    {
      prompt: "명상의 샘이 있다.",
      options: [
        {
          label: "기도하기",
          effect: { kind: "heal", amount: 50 },
          resultText: "내면의 평화가 HP 를 회복시킨다.",
        },
        {
          label: "지나치기",
          effect: { kind: "nothing" },
          resultText: "고개 숙여 지나간다.",
        },
      ],
    },
    {
      prompt: "그림자가 말을 건다: 진실을 보고 싶은가?",
      options: [
        {
          label: "예",
          effect: { kind: "revealBoss" },
          resultText: "진실이 드러난다. 보스의 위치를 알게 되었다.",
        },
        {
          label: "아니오",
          effect: { kind: "reward", xp: 20 },
          resultText: "거절하자 그림자가 사라지며 지혜를 남겼다.",
        },
      ],
    },
  ],
  nutrition: [
    {
      prompt: "맛있어 보이는 열매가 있다.",
      options: [
        {
          label: "먹어보기",
          effect: { kind: "heal", amount: 40 },
          resultText: "달콤하다. HP 회복.",
        },
        {
          label: "안 먹기",
          effect: { kind: "nothing" },
          resultText: "조심스레 지나친다.",
        },
      ],
    },
    {
      prompt: "농부가 도움을 청한다.",
      options: [
        {
          label: "돕기",
          effect: { kind: "reward", coins: 30 },
          resultText: "농부가 고맙다며 금화를 준다.",
        },
        {
          label: "바쁘다",
          effect: { kind: "nothing" },
          resultText: "다음 길을 간다.",
        },
      ],
    },
  ],
  social: [
    {
      prompt: "수상한 상인이 나타났다.",
      options: [
        {
          label: "물건 구매 (80코인)",
          effect: { kind: "reward", coins: -80, xp: 50 },
          resultText: "희귀 지식을 얻었다!",
        },
        {
          label: "지나치기",
          effect: { kind: "nothing" },
          resultText: "지나친다.",
        },
      ],
    },
    {
      prompt: "음유시인이 노래한다.",
      options: [
        {
          label: "감상하기",
          effect: { kind: "heal", amount: 25 },
          resultText: "노래에 마음이 치유되었다.",
        },
        {
          label: "동전 주고 가기",
          effect: { kind: "reward", coins: -10, xp: 30 },
          resultText: "동전을 주고 축복을 받았다.",
        },
      ],
    },
  ],
  productivity: [
    {
      prompt: "시간의 균열이 나타났다.",
      options: [
        {
          label: "통과",
          effect: { kind: "skipFloors", count: 1 },
          resultText: "시간을 뛰어넘어 다음 층으로!",
        },
        {
          label: "조심스레 우회",
          effect: { kind: "nothing" },
          resultText: "안전한 길로 돌아간다.",
        },
      ],
    },
    {
      prompt: "고장난 시계를 발견했다.",
      options: [
        {
          label: "고치기",
          effect: { kind: "reward", coins: 40 },
          resultText: "시계가 작동하며 숨겨진 보물이 드러났다.",
        },
        {
          label: "놔두기",
          effect: { kind: "nothing" },
          resultText: "다음 길을 간다.",
        },
      ],
    },
  ],
  wellness: [
    {
      prompt: "따뜻한 온천이 기다린다.",
      options: [
        {
          label: "몸 담그기",
          effect: { kind: "heal", amount: 60 },
          resultText: "피로가 씻겨나간다. HP 대폭 회복.",
        },
        {
          label: "계속 가기",
          effect: { kind: "nothing" },
          resultText: "미련을 뒤로 하고 간다.",
        },
      ],
    },
    {
      prompt: "잠들고 싶은 유혹.",
      options: [
        {
          label: "잠들기 (위험)",
          effect: { kind: "damage", amount: 40 },
          resultText: "깨어나니 장비를 잃었다. HP 감소.",
        },
        {
          label: "깨어있기",
          effect: { kind: "reward", xp: 20 },
          resultText: "의지력으로 이겨냈다.",
        },
      ],
    },
  ],
  trending: [
    {
      prompt: "반짝이는 포털이 열렸다.",
      options: [
        {
          label: "뛰어들기",
          effect: { kind: "skipFloors", count: 2 },
          resultText: "예상치 못한 곳으로 왔다! 두 층 건너뛴다.",
        },
        {
          label: "조심스레 피하기",
          effect: { kind: "reward", coins: 20 },
          resultText: "포털 가장자리의 반짝이를 수확했다.",
        },
      ],
    },
    {
      prompt: "이상한 상자가 발광한다.",
      options: [
        {
          label: "열어보기",
          effect: { kind: "reward", coins: 50, xp: 30 },
          resultText: "이상한 보물이 쏟아져 나왔다.",
        },
        {
          label: "폭발 위험 감수하고 피하기",
          effect: { kind: "nothing" },
          resultText: "조심스레 지나쳤다.",
        },
      ],
    },
  ],
};

/** 랜덤 narrative 하나 선택 */
export function pickNarrative(dungeonId: DungeonId): string {
  const pool = NARRATIVE_POOL[dungeonId];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 랜덤 보물 설명 */
export function pickTreasureDescription(): string {
  return TREASURE_DESCRIPTIONS[Math.floor(Math.random() * TREASURE_DESCRIPTIONS.length)];
}

/**
 * 범용 이벤트 풀 — 던전 무관하게 적용 가능한 "갈림길" / "위험-보상" 패턴.
 * 각 던전 풀에 섞어서 variety 를 대폭 늘린다.
 */
export const UNIVERSAL_EVENTS: Array<{ prompt: string; options: ChoiceOption[] }> = [
  {
    prompt: "두 갈래 길이 나왔다.",
    options: [
      {
        label: "⟵ 어두운 샛길",
        effect: { kind: "reward", coins: 35 },
        resultText: "위험했지만 숨겨진 동전을 찾았다.",
      },
      {
        label: "⟶ 밝은 큰길",
        effect: { kind: "heal", amount: 20 },
        resultText: "안정적인 발걸음으로 체력을 회복.",
      },
    ],
  },
  {
    prompt: "미확인 상자가 놓여있다.",
    options: [
      {
        label: "열어보기 (함정?)",
        effect: { kind: "reward", coins: 60, xp: 20 },
        resultText: "다행히 함정은 없었다. 보상 획득!",
      },
      {
        label: "발로 밀어보기",
        effect: { kind: "damage", amount: 15 },
        resultText: "폭발! 파편에 맞아 피해.",
      },
      {
        label: "지나치기",
        effect: { kind: "nothing" },
        resultText: "아무 일 없이 지나간다.",
      },
    ],
  },
  {
    prompt: "부상당한 동료 모험가를 만났다.",
    options: [
      {
        label: "회복약 나눠주기",
        effect: { kind: "reward", xp: 40 },
        resultText: "고마움의 표시로 지혜를 전수받았다.",
      },
      {
        label: "조용히 지나치기",
        effect: { kind: "nothing" },
        resultText: "마음이 무겁다.",
      },
    ],
  },
  {
    prompt: "오래된 제단이 빛난다.",
    options: [
      {
        label: "코인을 바치기 (30)",
        effect: { kind: "reward", coins: -30, xp: 60 },
        resultText: "제단이 응답하며 경험치를 내려주었다.",
      },
      {
        label: "기도만 하기",
        effect: { kind: "heal", amount: 25 },
        resultText: "평온함이 몸을 감쌌다.",
      },
    ],
  },
];

/**
 * 랜덤 이벤트 — 던전 고유 이벤트 + 범용 이벤트 를 섞어서 더 풍부하게.
 */
export function pickEvent(
  dungeonId: DungeonId,
): { prompt: string; options: ChoiceOption[] } {
  // 60% 던전 고유, 40% 범용
  const useDungeon = Math.random() < 0.6;
  const pool = useDungeon ? EVENT_POOL[dungeonId] : UNIVERSAL_EVENTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 낮은 HP 전투 중 도망 선택지 — 전투 긴장감 강화용.
 */
export function buildRetreatChoice(currentFloor: number): {
  prompt: string;
  options: ChoiceOption[];
} {
  return {
    prompt: "영웅이 휘청인다. 더 싸우면 위험하다.",
    options: [
      {
        label: "⚔ 마지막 일격",
        effect: { kind: "nothing" },
        resultText: "이를 악물고 전투를 이어간다!",
      },
      {
        label: "🏳 후퇴 — 캠프로",
        effect: { kind: "damage", amount: 0 },
        resultText: `F${currentFloor} 에서 후퇴. 획득한 보상은 유지된다.`,
      },
    ],
  };
}
