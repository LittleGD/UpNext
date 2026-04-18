/**
 * Up Hero — productivity 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const PRODUCTIVITY_EVENTS: DungeonEvent[] = [
    {
      prompt: "시간의 균열이 나타났다.",
      promptKey: "uphero.flavor.prd.0.prompt",
      options: [
        {
          label: "통과",
          labelKey: "uphero.flavor.prd.0.opt0.label",
          outcomes: [
            {
              weight: 55,
              resultText: "시간을 뛰어넘어 다음 층으로!",
              resultTextKey: "uphero.flavor.prd.0.opt0.out0.result",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "균열이 영웅을 긁었다.",
              resultTextKey: "uphero.flavor.prd.0.opt0.out1.result",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "damage", amount: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "깊은 균열에 빨려 들어가 두 층을 지났다.",
              resultTextKey: "uphero.flavor.prd.0.opt0.out2.result",
              effects: [
                { kind: "skipFloors", count: 2 },
                { kind: "damage", amount: 5 },
                { kind: "time", delta: -2 },
              ],
            },
          ],
        },
        {
          label: "조심스레 우회",
          labelKey: "uphero.flavor.prd.0.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "안전한 길로 돌아간다.",
              resultTextKey: "uphero.flavor.prd.0.opt1.out0.result",
              effects: [{ kind: "time", delta: -6 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "먼지 쌓인 서류 더미. 중요한 계약서가 숨어 있다는 소문이 있다.",
      promptKey: "uphero.flavor.prd.1.prompt",
      options: [
        {
          label: "서류 정리",
          labelKey: "uphero.flavor.prd.1.opt0.label",
          outcomes: [
            {
              weight: 55,
              resultText: "빠르게 훑어 중요 서류를 찾았다.",
              resultTextKey: "uphero.flavor.prd.1.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 30, xp: 15 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 25,
              resultText: "종이 베임이 반복되어 손이 욱신거린다.",
              resultTextKey: "uphero.flavor.prd.1.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "reward", coins: 10 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 20,
              resultText: "전임자의 비밀 장부를 발견했다.",
              resultTextKey: "uphero.flavor.prd.1.opt0.out2.result",
              effects: [
                { kind: "reward", coins: 80, xp: 30 },
                { kind: "time", delta: -6 },
              ],
            },
          ],
        },
        {
          label: "통째로 불태우기",
          labelKey: "uphero.flavor.prd.1.opt1.label",
          outcomes: [
            {
              weight: 60,
              resultText: "무의미한 짓을 했다.",
              resultTextKey: "uphero.flavor.prd.1.opt1.out0.result",
              effects: [{ kind: "time", delta: -2 }],
            },
            {
              weight: 40,
              resultText: "불 속에서 금속 보관함이 드러났다!",
              resultTextKey: "uphero.flavor.prd.1.opt1.out1.result",
              effects: [
                { kind: "reward", coins: 40 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "빈 일정표에 빈자리 3개가 보인다. 뭘 채울까?",
      promptKey: "uphero.flavor.prd.2.prompt",
      options: [
        {
          label: "수련 (XP)",
          labelKey: "uphero.flavor.prd.2.opt0.label",
          outcomes: [
            {
              weight: 80,
              resultText: "집중된 시간. 경험이 쌓인다.",
              resultTextKey: "uphero.flavor.prd.2.opt0.out0.result",
              effects: [
                { kind: "reward", xp: 45 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 20,
              resultText: "과로했다.",
              resultTextKey: "uphero.flavor.prd.2.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "reward", xp: 60 },
                { kind: "time", delta: -7 },
              ],
            },
          ],
        },
        {
          label: "휴식 (HP)",
          labelKey: "uphero.flavor.prd.2.opt1.label",
          outcomes: [
            {
              weight: 80,
              resultText: "충분한 휴식이 몸을 회복시켰다.",
              resultTextKey: "uphero.flavor.prd.2.opt1.out0.result",
              effects: [
                { kind: "heal", amount: 50 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 20,
              resultText: "지나친 휴식이 오히려 권태를 불렀다.",
              resultTextKey: "uphero.flavor.prd.2.opt1.out1.result",
              effects: [
                { kind: "heal", amount: 15 },
                { kind: "time", delta: -8 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "공장의 배관이 끊어졌다. 조각을 맞춰 연결해야 한다.",
      promptKey: "uphero.flavor.prd.3.prompt",
      options: [
        {
          label: "배관 연결",
          labelKey: "uphero.flavor.prd.3.opt0.label",
          effect: {
            kind: "startMinigame",
            minigame: "pipe_connect",
            difficulty: 2,
            successEffects: [
              { kind: "reward", xp: 70, coins: 30 },
              { kind: "time", delta: 5 },
            ],
            failEffects: [
              { kind: "damage", amount: 10 },
              { kind: "time", delta: -6 },
            ],
          },
          resultText: "조각을 돌려 본다...",
          resultTextKey: "uphero.flavor.prd.3.opt0.out0.result",
        },
        {
          label: "우회로 찾기",
          labelKey: "uphero.flavor.prd.3.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "시간이 걸리지만 안전.",
              resultTextKey: "uphero.flavor.prd.3.opt1.out0.result",
              effects: [{ kind: "time", delta: -8 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "고장난 시계를 발견했다.",
      promptKey: "uphero.flavor.prd.4.prompt",
      options: [
        {
          label: "고치기",
          labelKey: "uphero.flavor.prd.4.opt0.label",
          outcomes: [
            {
              weight: 60,
              resultText: "시계가 작동하며 숨겨진 보물이 드러났다.",
              resultTextKey: "uphero.flavor.prd.4.opt0.out0.result",
              effects: [
                { kind: "reward", coins: 40, xp: 20 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 30,
              resultText: "부품이 폭발했다!",
              resultTextKey: "uphero.flavor.prd.4.opt0.out1.result",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -8 },
              ],
            },
            {
              weight: 10,
              resultText: "시계가 시간을 되돌려주었다.",
              resultTextKey: "uphero.flavor.prd.4.opt0.out2.result",
              effects: [
                { kind: "time", delta: 10 },
                { kind: "reward", coins: 20 },
              ],
            },
          ],
        },
        {
          label: "놔두기",
          labelKey: "uphero.flavor.prd.4.opt1.label",
          outcomes: [
            {
              weight: 100,
              resultText: "다음 길을 간다.",
              resultTextKey: "uphero.flavor.prd.4.opt1.out0.result",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
];
