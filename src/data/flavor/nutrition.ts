/**
 * Up Hero — nutrition 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const NUTRITION_EVENTS: DungeonEvent[] = [
    {
      prompt: "맛있어 보이는 열매가 있다.",
      options: [
        {
          label: "먹어보기",
          outcomes: [
            {
              weight: 60,
              resultText: "달콤하다. HP 회복.",
              effects: [
                { kind: "heal", amount: 40 },
                { kind: "time", delta: -1 },
              ],
            },
            {
              weight: 30,
              resultText: "쓴맛이 돈다 — 독 열매였다.",
              effects: [
                { kind: "damage", amount: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 10,
              resultText: "진귀한 약재였다. 몸이 튼튼해진다.",
              effects: [
                { kind: "heal", amount: 60 },
                { kind: "reward", xp: 15 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "안 먹기",
          outcomes: [
            {
              weight: 100,
              resultText: "조심스레 지나친다.",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "맑은 샘물에서 물소리가 들린다.",
      options: [
        {
          label: "물을 마신다",
          outcomes: [
            {
              weight: 70,
              resultText: "시원한 물이 몸에 스며든다.",
              effects: [
                { kind: "heal", amount: 30 },
                { kind: "time", delta: -1 },
              ],
            },
            {
              weight: 20,
              resultText: "물속 정령이 축복을 내렸다.",
              effects: [
                { kind: "heal", amount: 50 },
                { kind: "reward", xp: 15 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 10,
              resultText: "오염된 물이었다.",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "마시지 않는다",
          outcomes: [
            {
              weight: 100,
              resultText: "목이 마르지만 참는다.",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "방치된 텃밭에 야생 약초가 자라있다.",
      options: [
        {
          label: "약초 채집",
          outcomes: [
            {
              weight: 60,
              resultText: "귀한 약초를 모았다.",
              effects: [
                { kind: "reward", coins: 25, xp: 10 },
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 25,
              resultText: "가시에 찔려 피를 흘렸다.",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "reward", coins: 10 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 15,
              resultText: "영약 재료를 발견!",
              effects: [
                { kind: "reward", coins: 60, xp: 25 },
                { kind: "heal", amount: 30 },
                { kind: "time", delta: -5 },
              ],
            },
          ],
        },
        {
          label: "눈길만 주고 지나간다",
          outcomes: [
            {
              weight: 100,
              resultText: "다음을 기약한다.",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "농부가 도움을 청한다.",
      options: [
        {
          label: "돕기",
          outcomes: [
            {
              weight: 60,
              resultText: "농부가 고맙다며 금화를 준다.",
              effects: [
                { kind: "reward", coins: 30 },
                { kind: "time", delta: -8 },
              ],
            },
            {
              weight: 30,
              resultText: "농부의 밭에서 큰 수확물을 얻었다.",
              effects: [
                { kind: "reward", coins: 50 },
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -10 },
              ],
            },
            {
              weight: 10,
              resultText: "일이 꼬였다. 장비에 상처가 났다.",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -12 },
              ],
            },
          ],
        },
        {
          label: "바쁘다",
          outcomes: [
            {
              weight: 100,
              resultText: "다음 길을 간다.",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
];
