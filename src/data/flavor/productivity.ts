/**
 * Up Hero — productivity 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const PRODUCTIVITY_EVENTS: DungeonEvent[] = [
    {
      prompt: "시간의 균열이 나타났다.",
      options: [
        {
          label: "통과",
          outcomes: [
            {
              weight: 55,
              resultText: "시간을 뛰어넘어 다음 층으로!",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "균열이 영웅을 긁었다.",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "damage", amount: 15 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "깊은 균열에 빨려 들어가 두 층을 지났다.",
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
          outcomes: [
            {
              weight: 100,
              resultText: "안전한 길로 돌아간다.",
              effects: [{ kind: "time", delta: -6 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "먼지 쌓인 서류 더미. 중요한 계약서가 숨어 있다는 소문이 있다.",
      options: [
        {
          label: "서류 정리",
          outcomes: [
            {
              weight: 55,
              resultText: "빠르게 훑어 중요 서류를 찾았다.",
              effects: [
                { kind: "reward", coins: 30, xp: 15 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 25,
              resultText: "종이 베임이 반복되어 손이 욱신거린다.",
              effects: [
                { kind: "damage", amount: 8 },
                { kind: "reward", coins: 10 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 20,
              resultText: "전임자의 비밀 장부를 발견했다.",
              effects: [
                { kind: "reward", coins: 80, xp: 30 },
                { kind: "time", delta: -6 },
              ],
            },
          ],
        },
        {
          label: "통째로 불태우기",
          outcomes: [
            {
              weight: 60,
              resultText: "무의미한 짓을 했다.",
              effects: [{ kind: "time", delta: -2 }],
            },
            {
              weight: 40,
              resultText: "불 속에서 금속 보관함이 드러났다!",
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
      options: [
        {
          label: "수련 (XP)",
          outcomes: [
            {
              weight: 80,
              resultText: "집중된 시간. 경험이 쌓인다.",
              effects: [
                { kind: "reward", xp: 45 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 20,
              resultText: "과로했다.",
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
          outcomes: [
            {
              weight: 80,
              resultText: "충분한 휴식이 몸을 회복시켰다.",
              effects: [
                { kind: "heal", amount: 50 },
                { kind: "time", delta: -6 },
              ],
            },
            {
              weight: 20,
              resultText: "지나친 휴식이 오히려 권태를 불렀다.",
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
      options: [
        {
          label: "배관 연결",
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
        },
        {
          label: "우회로 찾기",
          outcomes: [
            {
              weight: 100,
              resultText: "시간이 걸리지만 안전.",
              effects: [{ kind: "time", delta: -8 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "고장난 시계를 발견했다.",
      options: [
        {
          label: "고치기",
          outcomes: [
            {
              weight: 60,
              resultText: "시계가 작동하며 숨겨진 보물이 드러났다.",
              effects: [
                { kind: "reward", coins: 40, xp: 20 },
                { kind: "time", delta: -4 },
              ],
            },
            {
              weight: 30,
              resultText: "부품이 폭발했다!",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -8 },
              ],
            },
            {
              weight: 10,
              resultText: "시계가 시간을 되돌려주었다.",
              effects: [
                { kind: "time", delta: 10 },
                { kind: "reward", coins: 20 },
              ],
            },
          ],
        },
        {
          label: "놔두기",
          outcomes: [
            {
              weight: 100,
              resultText: "다음 길을 간다.",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
];
