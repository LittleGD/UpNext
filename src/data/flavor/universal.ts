/**
 * Up Hero — 범용 이벤트 풀 (던전 무관).
 * 기본 EVENT_POOL 과 40% 섞여서 variety 증가.
 */

import type { DungeonEvent } from "./_types";

export const UNIVERSAL_EVENTS: DungeonEvent[] = [
  {
    prompt: "두 갈래 길이 나왔다.",
    promptKey: "uphero.flavor.uni.0.prompt",
    options: [
      {
        label: "⟵ 어두운 샛길",
        labelKey: "uphero.flavor.uni.0.opt0.label",
        outcomes: [
          {
            weight: 60,
            resultText: "위험했지만 숨겨진 동전을 찾았다.",
            resultTextKey: "uphero.flavor.uni.0.opt0.out0.result",
            effects: [
              { kind: "reward", coins: 35 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 30,
            resultText: "어둠 속에 도사린 것에게 기습당했다.",
            resultTextKey: "uphero.flavor.uni.0.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 15 },
              { kind: "time", delta: -5 },
            ],
          },
          {
            weight: 10,
            resultText: "버려진 보물 주머니를 발견했다!",
            resultTextKey: "uphero.flavor.uni.0.opt0.out2.result",
            effects: [
              { kind: "reward", coins: 80, xp: 10 },
              { kind: "time", delta: -4 },
            ],
          },
        ],
      },
      {
        label: "⟶ 밝은 큰길",
        labelKey: "uphero.flavor.uni.0.opt1.label",
        outcomes: [
          {
            weight: 80,
            resultText: "안정적인 발걸음으로 체력을 회복.",
            resultTextKey: "uphero.flavor.uni.0.opt1.out0.result",
            effects: [
              { kind: "heal", amount: 20 },
              { kind: "time", delta: -4 },
            ],
          },
          {
            weight: 20,
            resultText: "길에서 여행자를 만나 유용한 지식을 얻었다.",
            resultTextKey: "uphero.flavor.uni.0.opt1.out1.result",
            effects: [
              { kind: "heal", amount: 30 },
              { kind: "reward", xp: 10 },
              { kind: "time", delta: -5 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "미확인 상자가 놓여있다.",
    promptKey: "uphero.flavor.uni.1.prompt",
    options: [
      {
        label: "열어보기 (함정?)",
        labelKey: "uphero.flavor.uni.1.opt0.label",
        outcomes: [
          {
            weight: 50,
            resultText: "다행히 함정은 없었다. 보상 획득!",
            resultTextKey: "uphero.flavor.uni.1.opt0.out0.result",
            effects: [
              { kind: "reward", coins: 60, xp: 20 },
              { kind: "time", delta: -2 },
            ],
          },
          {
            weight: 30,
            resultText: "함정이었다! 파편에 맞아 피해.",
            resultTextKey: "uphero.flavor.uni.1.opt0.out1.result",
            effects: [
              { kind: "damage", amount: 15 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 20,
            resultText: "금상자였다! 예상 이상의 보상.",
            resultTextKey: "uphero.flavor.uni.1.opt0.out2.result",
            effects: [
              { kind: "reward", coins: 120, xp: 30 },
              { kind: "time", delta: -3 },
            ],
          },
        ],
      },
      {
        label: "발로 밀어보기",
        labelKey: "uphero.flavor.uni.1.opt1.label",
        outcomes: [
          {
            weight: 40,
            resultText: "폭발! 파편에 맞아 피해.",
            resultTextKey: "uphero.flavor.uni.1.opt1.out0.result",
            effects: [
              { kind: "damage", amount: 15 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 40,
            resultText: "발로 밀다 동전 몇 개가 굴러 나왔다.",
            resultTextKey: "uphero.flavor.uni.1.opt1.out1.result",
            effects: [
              { kind: "reward", coins: 20 },
              { kind: "time", delta: -2 },
            ],
          },
          {
            weight: 20,
            resultText: "큰 폭발! 파편에 맞았지만 금화도 함께 터져나왔다.",
            resultTextKey: "uphero.flavor.uni.1.opt1.out2.result",
            effects: [
              { kind: "damage", amount: 30 },
              { kind: "reward", coins: 40 },
              { kind: "time", delta: -4 },
            ],
          },
        ],
      },
      {
        label: "지나치기",
        labelKey: "uphero.flavor.uni.1.opt2.label",
        outcomes: [
          {
            weight: 100,
            resultText: "아무 일 없이 지나간다.",
            resultTextKey: "uphero.flavor.uni.1.opt2.out0.result",
            effects: [{ kind: "time", delta: -1 }],
          },
        ],
      },
    ],
  },
  {
    prompt: "부상당한 동료 모험가를 만났다.",
    promptKey: "uphero.flavor.uni.2.prompt",
    options: [
      {
        label: "회복약 나눠주기",
        labelKey: "uphero.flavor.uni.2.opt0.label",
        outcomes: [
          {
            weight: 60,
            resultText: "고마움의 표시로 지혜를 전수받았다.",
            resultTextKey: "uphero.flavor.uni.2.opt0.out0.result",
            effects: [
              { kind: "reward", xp: 40 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 25,
            resultText: "동료가 자신의 보물 지도를 넘겨주었다.",
            resultTextKey: "uphero.flavor.uni.2.opt0.out1.result",
            effects: [
              { kind: "reward", xp: 40, coins: 30 },
              { kind: "time", delta: -4 },
            ],
          },
          {
            weight: 15,
            resultText: "함정이었다. 동료가 정체를 드러냈다.",
            resultTextKey: "uphero.flavor.uni.2.opt0.out2.result",
            effects: [
              { kind: "damage", amount: 15 },
              { kind: "reward", xp: 10 },
              { kind: "time", delta: -5 },
            ],
          },
        ],
      },
      {
        label: "조용히 지나치기",
        labelKey: "uphero.flavor.uni.2.opt1.label",
        outcomes: [
          {
            weight: 80,
            resultText: "마음이 무겁다.",
            resultTextKey: "uphero.flavor.uni.2.opt1.out0.result",
            effects: [{ kind: "time", delta: -2 }],
          },
          {
            weight: 20,
            resultText: "죄책감이 집중을 흐트러뜨렸다.",
            resultTextKey: "uphero.flavor.uni.2.opt1.out1.result",
            effects: [
              { kind: "damage", amount: 5 },
              { kind: "time", delta: -3 },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "떠돌이 상인이 이상한 물약을 내놓는다.",
    promptKey: "uphero.flavor.uni.3.prompt",
    options: [
      {
        label: "물약 마시기 (20 코인)",
        labelKey: "uphero.flavor.uni.3.opt0.label",
        outcomes: [
          {
            weight: 50,
            resultText: "달콤한 약이었다. 활력이 차오른다.",
            resultTextKey: "uphero.flavor.uni.3.opt0.out0.result",
            effects: [
              { kind: "reward", coins: -20 },
              { kind: "heal", amount: 40 },
              { kind: "time", delta: -2 },
            ],
          },
          {
            weight: 30,
            resultText: "쓴맛에 몸이 움찔. 효과는 희미했다.",
            resultTextKey: "uphero.flavor.uni.3.opt0.out1.result",
            effects: [
              { kind: "reward", coins: -20 },
              { kind: "heal", amount: 10 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 20,
            resultText: "영약이었다! 몸 전체가 가벼워진다.",
            resultTextKey: "uphero.flavor.uni.3.opt0.out2.result",
            effects: [
              { kind: "reward", coins: -20, xp: 30 },
              { kind: "heal", amount: 60 },
              { kind: "time", delta: -2 },
            ],
          },
        ],
      },
      {
        label: "사양한다",
        labelKey: "uphero.flavor.uni.3.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "상인이 아쉬워하며 떠났다.",
            resultTextKey: "uphero.flavor.uni.3.opt1.out0.result",
            effects: [{ kind: "time", delta: -1 }],
          },
        ],
      },
    ],
  },
  {
    prompt: "길에 작은 동물이 다쳐 쓰러져 있다.",
    promptKey: "uphero.flavor.uni.4.prompt",
    options: [
      {
        label: "치료해주기",
        labelKey: "uphero.flavor.uni.4.opt0.label",
        outcomes: [
          {
            weight: 55,
            resultText: "동물이 고마워하며 숨겨진 보물을 안내했다.",
            resultTextKey: "uphero.flavor.uni.4.opt0.out0.result",
            effects: [
              { kind: "reward", coins: 30, xp: 15 },
              { kind: "time", delta: -5 },
            ],
          },
          {
            weight: 30,
            resultText: "시간을 써 돌봤지만 그저 사라졌다.",
            resultTextKey: "uphero.flavor.uni.4.opt0.out1.result",
            effects: [{ kind: "time", delta: -6 }],
          },
          {
            weight: 15,
            resultText: "동물이 요정으로 변했다! 축복을 내려주었다.",
            resultTextKey: "uphero.flavor.uni.4.opt0.out2.result",
            effects: [
              { kind: "reward", xp: 50 },
              { kind: "heal", amount: 30 },
              { kind: "time", delta: -4 },
            ],
          },
        ],
      },
      {
        label: "지나치기",
        labelKey: "uphero.flavor.uni.4.opt1.label",
        outcomes: [
          {
            weight: 100,
            resultText: "마음이 편치 않다.",
            resultTextKey: "uphero.flavor.uni.4.opt1.out0.result",
            effects: [{ kind: "time", delta: -1 }],
          },
        ],
      },
    ],
  },
  {
    prompt: "오래된 제단이 빛난다.",
    promptKey: "uphero.flavor.uni.5.prompt",
    options: [
      {
        label: "코인 30 바치기",
        labelKey: "uphero.flavor.uni.5.opt0.label",
        outcomes: [
          {
            weight: 60,
            resultText: "제단이 응답하며 경험치를 내려주었다.",
            resultTextKey: "uphero.flavor.uni.5.opt0.out0.result",
            effects: [
              { kind: "reward", coins: -30, xp: 60 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 25,
            resultText: "제단의 정령이 큰 축복을 내렸다.",
            resultTextKey: "uphero.flavor.uni.5.opt0.out1.result",
            effects: [
              { kind: "reward", coins: -30, xp: 100 },
              { kind: "heal", amount: 20 },
              { kind: "time", delta: -4 },
            ],
          },
          {
            weight: 15,
            resultText: "잘못된 기도였다 — 제단이 분노했다.",
            resultTextKey: "uphero.flavor.uni.5.opt0.out2.result",
            effects: [
              { kind: "reward", coins: -30 },
              { kind: "damage", amount: 10 },
              { kind: "time", delta: -5 },
            ],
          },
        ],
      },
      {
        label: "기도만 하기",
        labelKey: "uphero.flavor.uni.5.opt1.label",
        outcomes: [
          {
            weight: 75,
            resultText: "평온함이 몸을 감쌌다.",
            resultTextKey: "uphero.flavor.uni.5.opt1.out0.result",
            effects: [
              { kind: "heal", amount: 25 },
              { kind: "time", delta: -3 },
            ],
          },
          {
            weight: 25,
            resultText: "진심 어린 기도에 제단이 작게 응답했다.",
            resultTextKey: "uphero.flavor.uni.5.opt1.out1.result",
            effects: [
              { kind: "heal", amount: 40 },
              { kind: "reward", xp: 15 },
              { kind: "time", delta: -4 },
            ],
          },
        ],
      },
    ],
  },
];
