/**
 * Up Hero — learning 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const LEARNING_EVENTS: DungeonEvent[] = [
    {
      prompt: "수수께끼 문이 나타났다.",
      options: [
        {
          label: "수수께끼 도전",
          outcomes: [
            {
              weight: 60,
              resultText: "정답을 맞혀 지혜를 얻었다!",
              effects: [
                { kind: "reward", xp: 50 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "풀다가 머리가 지끈거렸다.",
              effects: [
                { kind: "damage", amount: 5 },
                { kind: "reward", xp: 10 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 10,
              resultText: "최고 등급의 답을 제시했다. 문이 환하게 빛난다.",
              effects: [
                { kind: "reward", xp: 100, coins: 50 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "뒤로 돌아가기",
          outcomes: [
            {
              weight: 100,
              resultText: "다른 길을 찾는다.",
              effects: [{ kind: "time", delta: -10 }],
            },
          ],
        },
      ],
    },
    {
      prompt: "먼지 덮인 책을 발견했다.",
      options: [
        {
          label: "읽어보기",
          outcomes: [
            {
              weight: 65,
              resultText: "지식과 동전을 함께 얻었다.",
              effects: [
                { kind: "reward", xp: 30, coins: 10 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 25,
              resultText: "책의 저주가 영웅을 괴롭힌다.",
              effects: [
                { kind: "damage", amount: 10 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 10,
              resultText: "금서였다. 깊은 통찰이 열렸다.",
              effects: [
                { kind: "reward", xp: 60, coins: 30 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
        {
          label: "조심스레 덮기",
          outcomes: [
            {
              weight: 100,
              resultText: "건드리지 않고 지나간다.",
              effects: [{ kind: "time", delta: -1 }],
            },
          ],
        },
      ],
    },
];
