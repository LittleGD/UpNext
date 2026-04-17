/**
 * Up Hero — trending 던전 이벤트 풀.
 * 각 option 의 outcomes 는 weight 기반 확률 분기.
 */

import type { DungeonEvent } from "./_types";

export const TRENDING_EVENTS: DungeonEvent[] = [
    {
      prompt: "반짝이는 포털이 열렸다.",
      options: [
        {
          label: "뛰어들기",
          outcomes: [
            {
              weight: 50,
              resultText: "예상치 못한 곳으로 왔다! 두 층 건너뛴다.",
              effects: [
                { kind: "skipFloors", count: 2 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 30,
              resultText: "차원의 균열에 휩쓸렸다.",
              effects: [
                { kind: "skipFloors", count: 1 },
                { kind: "damage", amount: 20 },
                { kind: "time", delta: -5 },
              ],
            },
            {
              weight: 20,
              resultText: "포털 깊숙이 들어가 막대한 보물을 가져왔다.",
              effects: [
                { kind: "skipFloors", count: 3 },
                { kind: "reward", coins: 40 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "조심스레 피하기",
          outcomes: [
            {
              weight: 80,
              resultText: "포털 가장자리의 반짝이를 수확했다.",
              effects: [
                { kind: "reward", coins: 20 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "포털 주변에서 차원 조각을 주웠다.",
              effects: [
                { kind: "reward", coins: 40, xp: 10 },
                { kind: "time", delta: -4 },
              ],
            },
          ],
        },
      ],
    },
    {
      prompt: "이상한 상자가 발광한다.",
      options: [
        {
          label: "열어보기",
          outcomes: [
            {
              weight: 50,
              resultText: "이상한 보물이 쏟아져 나왔다.",
              effects: [
                { kind: "reward", coins: 50, xp: 30 },
                { kind: "time", delta: -2 },
              ],
            },
            {
              weight: 30,
              resultText: "상자가 폭발했다!",
              effects: [
                { kind: "damage", amount: 20 },
                { kind: "time", delta: -3 },
              ],
            },
            {
              weight: 20,
              resultText: "초차원의 보물고였다.",
              effects: [
                { kind: "reward", coins: 100, xp: 50 },
                { kind: "time", delta: -3 },
              ],
            },
          ],
        },
        {
          label: "폭발 위험 감수하고 피하기",
          outcomes: [
            {
              weight: 100,
              resultText: "조심스레 지나쳤다.",
              effects: [{ kind: "time", delta: -2 }],
            },
          ],
        },
      ],
    },
];
