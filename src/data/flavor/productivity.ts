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
